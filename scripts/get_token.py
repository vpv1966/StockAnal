"""
Fyers Daily Token Generator — Stock War Room
Run once every morning before using the app.
Usage: python scripts/get_token.py
"""

import pyotp
import hashlib
import requests
import base64
import json
import os
import time
import webbrowser
from datetime import datetime
from urllib.parse import urlparse, parse_qs

# ── ENTER YOUR CREDENTIALS HERE (edit once, never touch again) ────────────────
CLIENT_ID = "XV09786"       # e.g. "XA12345"
PIN       = "2002"            # e.g. "1234"
TOTP_KEY  = "HSVOU3LUKADTL7JKTNEBG5XU46UT5GBB"       # long secret key from Fyers Manage Account
# ─────────────────────────────────────────────────────────────────────────────

APP_ID       = "X5TB1VR28E-100"
SECRET_ID    = "1MXHCJMJ9B"
REDIRECT_URI = "https://trade.fyers.in/api-login/redirect-uri/index.html"
TOKEN_FILE   = os.path.join(os.path.dirname(__file__), "..", "public", "token.json")

URL_SEND_OTP   = "https://api-t2.fyers.in/vagator/v2/send_login_otp_v2"
URL_VERIFY_OTP = "https://api-t2.fyers.in/vagator/v2/verify_otp"
URL_VERIFY_PIN = "https://api-t2.fyers.in/vagator/v2/verify_pin_v2"
URL_TOKEN      = "https://api-t1.fyers.in/api/v3/token"

def log(msg): print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")
def b64(s):   return base64.b64encode(str(s).encode()).decode()

def main():
    log("=" * 52)
    log("  Stock War Room — Fyers Token Generator")
    log("=" * 52)

    if "YOUR" in CLIENT_ID:
        log("❌  Open scripts/get_token.py and fill in:")
        log("    CLIENT_ID, PIN, TOTP_KEY at the top of the file")
        return

    headers = {"Content-Type": "application/json",
                "User-Agent": "Mozilla/5.0"}

    try:
        # Step 1 — Send OTP
        log("Step 1: Sending login OTP...")
        r1 = requests.post(URL_SEND_OTP, headers=headers,
                           json={"fy_id": b64(CLIENT_ID), "app_id": "2"})
        if not r1.ok: raise Exception(f"Step 1 ({r1.status_code}): {r1.text}")
        request_key = r1.json()["request_key"]
        log("  OTP sent ✓")
        time.sleep(2)

        # Step 2 — Verify TOTP
        log("Step 2: Verifying TOTP...")
        totp = pyotp.TOTP(TOTP_KEY).now()
        log(f"  Generated TOTP: {totp}")
        r2 = requests.post(URL_VERIFY_OTP, headers=headers,
                           json={"request_key": request_key, "otp": totp})
        if not r2.ok: raise Exception(f"Step 2 ({r2.status_code}): {r2.text}")
        request_key = r2.json()["request_key"]
        log("  TOTP verified ✓")

        # Step 3 — Verify PIN
        log("Step 3: Verifying PIN...")
        r3 = requests.post(URL_VERIFY_PIN, headers=headers,
                           json={"request_key": request_key,
                                 "identity_type": "pin",
                                 "identifier": b64(PIN)})
        if not r3.ok: raise Exception(f"Step 3 ({r3.status_code}): {r3.text}")
        log("  PIN verified ✓")

        # Step 4 — Open browser for auth_code
        log("Step 4: Opening Fyers login in browser...")
        auth_url = (
            f"https://api-t1.fyers.in/api/v3/generate-authcode"
            f"?client_id={APP_ID}"
            f"&redirect_uri={REDIRECT_URI}"
            f"&response_type=code"
            f"&state=warroom"
        )
        webbrowser.open(auth_url)
        log("")
        log("  Browser opened — log in with your Fyers credentials.")
        log("  After login the browser URL will look like:")
        log("  https://trade.fyers.in/...?auth_code=XXXXXXXX&state=...")
        log("")
        log("  Copy ONLY the auth_code value (the part after auth_code=)")
        log("  and paste it below.")
        log("")
        auth_code = input("  Paste auth_code here → ").strip()
        if not auth_code:
            raise Exception("No auth_code entered")
        log("  auth_code received ✓")

        # Step 5 — Exchange for access token using official SDK
        log("Step 5: Generating access token...")
        from fyers_apiv3 import fyersModel
        appSession = fyersModel.SessionModel(
            client_id    = APP_ID,
            secret_key   = SECRET_ID,
            redirect_uri = REDIRECT_URI,
            response_type= "code",
            grant_type   = "authorization_code"
        )
        appSession.set_token(auth_code)
        resp5 = appSession.generate_token()
        if not resp5.get("access_token"):
            raise Exception(f"Step 5 error: {resp5}")
        access_token = resp5["access_token"]
        log("  Access token generated ✓")

        # Save token.json
        os.makedirs(os.path.dirname(TOKEN_FILE), exist_ok=True)
        with open(TOKEN_FILE, "w") as f:
            json.dump({
                "access_token": access_token,
                "app_id":       APP_ID,
                "generated_at": datetime.now().isoformat()
            }, f, indent=2)

        log("=" * 52)
        log("  ✅  Token saved → public/token.json")
        log("  ✅  Now run:  npm start")
        log("=" * 52)

        # Also fetch Screener.in screens
        log("Step 6: Fetching Screener.in screens...")
        try:
            import subprocess, sys
            script = os.path.join(os.path.dirname(__file__), "fetch_screens.py")
            subprocess.run([sys.executable, script], check=True)
        except Exception as e:
            log(f"  ⚠ Screens fetch failed: {e} (run manually: python3 scripts/fetch_screens.py)")

    except Exception as e:
        log(f"❌  {e}")
        log("Troubleshooting:")
        log("  • CLIENT_ID = your Fyers login ID (e.g. XA12345)")
        log("  • PIN       = your 4-digit Fyers PIN")
        log("  • TOTP_KEY  = secret key from Fyers Manage Account")

if __name__ == "__main__":
    main()
