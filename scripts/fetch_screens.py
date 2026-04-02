"""
Screener.in Screen Fetcher
Fetches all 4 custom screens and saves as JSON to public folder
Run: python3 scripts/fetch_screens.py
Or called automatically from get_token.py
"""

import requests
import json
import os
import re
import time
from datetime import datetime
from bs4 import BeautifulSoup

SCREENS = [
    {
        "id":    "set1",
        "name":  "Fundamental Core",
        "url":   "https://www.screener.in/screens/3363747/kishans-session-14dec2025/",
        "color": "green",
        "desc":  "Quality compounders — growth + profitability + balance sheet"
    },
    {
        "id":    "set2",
        "name":  "Weekly Pref 1",
        "url":   "https://www.screener.in/screens/3511214/kishan-chennai-tf-meetup-22feb2026/",
        "color": "amber",
        "desc":  "Near ATH breakout with volume confirmation"
    },
    {
        "id":    "set3",
        "name":  "PEAD",
        "url":   "https://www.screener.in/screens/3511456/kishan-pead-chennai-meetup-22feb2026/",
        "color": "blue",
        "desc":  "Post Earnings Announcement Drift plays"
    },
    {
        "id":    "set4",
        "name":  "Weekly Pref 2",
        "url":   "https://www.screener.in/screens/3570056/preference-2/",
        "color": "purple",
        "desc":  "Fallback — momentum + quality combined"
    },
]

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "public")

def parse_number(s):
    """Parse number string like '1,234.56' or '-' to float"""
    if not s or s.strip() in ('-', '', 'N/A', '--'):
        return None
    try:
        return float(s.replace(',', '').strip())
    except:
        return None

def fetch_screen(screen):
    """Fetch a Screener.in screen page and parse the stock table"""
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                      "AppleWebKit/537.36 (KHTML, like Gecko) "
                      "Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
    }

    print(f"  Fetching {screen['name']}...")
    r = requests.get(screen['url'], headers=headers, timeout=15)
    if not r.ok:
        raise Exception(f"HTTP {r.status_code}")

    soup = BeautifulSoup(r.text, 'html.parser')

    # Find results count
    count_el = soup.find(string=re.compile(r'\d+ results found'))
    total = 0
    if count_el:
        m = re.search(r'(\d+) results', count_el)
        if m: total = int(m.group(1))

    # Find the data table
    table = soup.find('table')
    if not table:
        raise Exception("No table found in page")

    # Parse headers
    headers_row = table.find('thead')
    if not headers_row:
        headers_row = table.find('tr')

    col_names = []
    for th in (headers_row.find_all('th') if headers_row else []):
        col_names.append(th.get_text(strip=True))

    # Parse rows
    stocks = []
    tbody = table.find('tbody')
    rows = tbody.find_all('tr') if tbody else table.find_all('tr')[1:]

    for row in rows:
        cells = row.find_all('td')
        if len(cells) < 3:
            continue

        stock = {}

        # S.No
        stock['sno'] = cells[0].get_text(strip=True)

        # Name + URL
        name_cell = cells[1]
        link = name_cell.find('a')
        stock['name']    = name_cell.get_text(strip=True)
        stock['url']     = f"https://www.screener.in{link['href']}" if link else ""
        # Extract NSE symbol from URL e.g. /company/RELIANCE/
        sym_match = re.search(r'/company/([^/]+)/', stock['url'])
        stock['symbol']  = sym_match.group(1) if sym_match else stock['name']

        # Numeric columns
        numeric_map = {
            2: 'cmp',
            3: 'pe',
            4: 'marketCap',
            5: 'divYield',
            6: 'npQtr',
            7: 'qtrProfitVar',
            8: 'salesQtr',
            9: 'qtrSalesVar',
            10: 'roce',
            11: 'athPrice',
        }
        for idx, key in numeric_map.items():
            if idx < len(cells):
                stock[key] = parse_number(cells[idx].get_text(strip=True))

        # Compute % from ATH
        if stock.get('cmp') and stock.get('athPrice') and stock['athPrice'] > 0:
            stock['pctFromATH'] = round(
                (stock['cmp'] - stock['athPrice']) / stock['athPrice'] * 100, 1)

        stocks.append(stock)

    return {
        "id":          screen['id'],
        "name":        screen['name'],
        "color":       screen['color'],
        "desc":        screen['desc'],
        "url":         screen['url'],
        "total":       total or len(stocks),
        "count":       len(stocks),
        "stocks":      stocks,
        "fetchedAt":   datetime.now().isoformat(),
        "columns":     col_names,
    }

def main():
    print("\n" + "="*52)
    print("  Screener.in Screen Fetcher")
    print("="*52)

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    results = []
    errors  = []

    for screen in SCREENS:
        try:
            data = fetch_screen(screen)
            results.append(data)
            print(f"  ✓ {screen['name']}: {data['count']} stocks")
            time.sleep(1)  # be polite
        except Exception as e:
            print(f"  ❌ {screen['name']}: {e}")
            errors.append({"id": screen['id'], "name": screen['name'], "error": str(e)})
            results.append({
                "id": screen['id'], "name": screen['name'],
                "color": screen['color'], "desc": screen['desc'],
                "url": screen['url'], "total": 0, "count": 0,
                "stocks": [], "error": str(e),
                "fetchedAt": datetime.now().isoformat(),
            })

    # Save combined file
    out_path = os.path.join(OUTPUT_DIR, "screens.json")
    with open(out_path, 'w') as f:
        json.dump({
            "screens":   results,
            "fetchedAt": datetime.now().isoformat(),
            "errors":    errors,
        }, f, indent=2)

    print(f"\n  ✅ Saved → public/screens.json")
    if errors:
        print(f"  ⚠ {len(errors)} screen(s) failed")
    print("="*52 + "\n")

if __name__ == "__main__":
    main()
