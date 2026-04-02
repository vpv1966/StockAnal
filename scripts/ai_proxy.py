#!/usr/bin/env python3
"""
AI Proxy Server — routes Anthropic API calls from War Room browser
Run: python3 scripts/ai_proxy.py
Port: 3001
"""
import os, json, urllib.request, urllib.error
from http.server import HTTPServer, BaseHTTPRequestHandler

def load_api_key():
    # 1. Environment variable
    key = os.environ.get("ANTHROPIC_API_KEY", "")
    if key: return key
    # 2. Try multiple .env locations
    script_dir = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        os.path.join(script_dir, "..", ".env"),
        os.path.expanduser("~/Desktop/war-room/.env"),
        os.path.join(os.getcwd(), ".env"),
    ]
    for env_path in candidates:
        env_path = os.path.normpath(env_path)
        if os.path.exists(env_path):
            print(f"  Reading .env from: {env_path}")
            with open(env_path) as f:
                for line in f:
                    line = line.strip()
                    if line.startswith("ANTHROPIC_API_KEY="):
                        val = line.split("=", 1)[1].strip().strip('"').strip("'")
                        if val and "your-key" not in val:
                            return val
    return ""

API_KEY = load_api_key()

class ProxyHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print(f"[AI Proxy] {fmt % args}")

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_POST(self):
        if self.path != "/ai":
            self.send_response(404)
            self.end_headers()
            return

        if not API_KEY:
            self.send_response(500)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({
                "error": "ANTHROPIC_API_KEY not set. Add to war-room/.env"
            }).encode())
            return

        length = int(self.headers.get("Content-Length", 0))
        body   = self.rfile.read(length)

        req = urllib.request.Request(
            "https://api.anthropic.com/v1/messages",
            data=body,
            headers={
                "Content-Type":      "application/json",
                "x-api-key":         API_KEY,
                "anthropic-version": "2023-06-01",
                "anthropic-beta":    "web-search-2025-03-05",
            },
            method="POST"
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                result = resp.read()
            self.send_response(200)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(result)
        except urllib.error.HTTPError as e:
            err_body = e.read()
            self.send_response(e.code)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(err_body)
        except Exception as e:
            self.send_response(500)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode())

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin",  "http://localhost:3000")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

if __name__ == "__main__":
    port = 3001
    print(f"\n{'='*52}")
    print(f"  AI Proxy Server — port {port}")
    print(f"{'='*52}")
    if API_KEY:
        print(f"  API key: {'*'*20}{API_KEY[-4:]}")
        print(f"  Ready — War Room AI Research enabled")
    else:
        print(f"  No API key found!")
        print(f"  Add to ~/Desktop/war-room/.env:")
        print(f"    ANTHROPIC_API_KEY=sk-ant-...")
    print(f"{'='*52}\n")
    HTTPServer(("localhost", port), ProxyHandler).serve_forever()
