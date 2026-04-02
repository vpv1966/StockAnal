# ⚡ Stock War Room — Setup Guide

## What you have
- `src/App.js`          — Main React app (Bloomberg dark terminal UI)
- `src/indicators.js`   — All technical indicators computed from raw candles
- `src/fyersApi.js`     — Fyers API calls (history, quote, profile)
- `scripts/get_token.py`— Daily token generator (run once each morning)
- `public/index.html`   — HTML entry point

---

## One-time setup (10 minutes)

### 1. Install Node dependencies
```bash
npm install
```

### 2. Install Python dependencies
```bash
pip install pyotp requests
```

### 3. Set your credentials
Edit `scripts/get_token.py` lines 16–18, OR set environment variables:

**Option A — Edit directly (simpler):**
```python
CLIENT_ID = "YOUR_FYERS_CLIENT_ID"   # e.g. TK01234
PIN       = "YOUR_4_DIGIT_PIN"        # e.g. 1234
TOTP_KEY  = "YOUR_TOTP_SECRET_KEY"    # from Fyers Manage Account
```

**Option B — Environment variables:**
```bash
# Windows
set FYERS_CLIENT_ID=TK01234
set FYERS_PIN=1234
set FYERS_TOTP_KEY=ABCDEFGHIJ123456

# Mac/Linux
export FYERS_CLIENT_ID=TK01234
export FYERS_PIN=1234
export FYERS_TOTP_KEY=ABCDEFGHIJ123456
```

### 4. Enable TOTP on your Fyers account (if not done)
- Go to https://myaccount.fyers.in/ManageAccount
- Enable External 2FA / TOTP
- Save the TOTP Secret Key shown

---

## Daily usage

### Every morning — generate today's token (takes ~5 seconds)
```bash
python scripts/get_token.py
```
You'll see:
```
[09:15:02] Stock War Room — Fyers Token Generator
[09:15:03] Step 1: Sending OTP...
[09:15:03] Step 2: Verifying TOTP...
[09:15:04] Step 3: Verifying PIN...
[09:15:04] Step 4: Getting auth code...
[09:15:05] Step 5: Generating access token...
[09:15:05] ✅ Token saved to: public/token.json
```

### Start the app
```bash
npm start
```
Opens at http://localhost:3000

---

## Using the app
1. Type any NSE symbol in the search bar (e.g. SUNPHARMA)
2. Press Enter or click SCAN
3. Full dashboard loads with all indicators computed from live data
4. Click any stock tab in the nav to switch between scanned stocks
5. Scans are kept in memory for the session

## Supported symbols
Any NSE equity — SUNPHARMA, NTPC, TATAMOTORS, RELIANCE, TCS, CIPLA,
HDFCBANK, DRREDDY, LUPIN, MARUTI, BAJAJ-AUTO, TATAPOWER, etc.

Symbol format: just the NSE code (SUNPHARMA, not Sun Pharma)
The app automatically converts to Fyers format: NSE:SUNPHARMA-EQ

---

## What's computed from live data
All indicators are computed locally from 1 year of daily OHLCV candles:

**Price & Volume:** Close, Change%, 52W High/Low, Volume, Rel Volume, ATR, Liquidity
**Moving Averages:** EMA9, MA20, MA50, MA150, MA200
**Momentum:** RSI(14), MACD, ADX, Up/Down Ratio, TTM Squeeze
**Volatility:** Bollinger Bands, ATR, Upper Wick %
**Advanced:** CPR, Pivot/R1/R2/S1/S2, Ichimoku, Guppy MMA, RS Score
**Systems:** Stage Analysis (1-4), Minervini 8-criteria, Recommendation

---

## Fyers API credentials in this app
- App ID:    X5TB1VR28E-100
- Secret ID: 1MXHCJMJ9B
- API Docs:  https://myapi.fyers.in/docsv3

Token expires daily at midnight — run get_token.py each morning.
