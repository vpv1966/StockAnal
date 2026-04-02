// fyersApi.js — All Fyers API calls

const DATA = "https://api-t1.fyers.in/data";
const BASE = "https://api-t1.fyers.in";

export function toFyersSymbol(sym) {
  const s = sym.toUpperCase().trim();
  if (s.includes(":")) return s;
  return `NSE:${s}-EQ`;
}

export async function loadToken() {
  try {
    const r = await fetch("/token.json?t=" + Date.now());
    if (!r.ok) throw new Error("token.json not found — run get_token.py first");
    const data = await r.json();
    if (!data.access_token) throw new Error("No access_token in file");
    const generated = new Date(data.generated_at);
    const now = new Date();
    if (generated.toDateString() !== now.toDateString())
      throw new Error("Token expired — run get_token.py again");
    return data;
  } catch (e) {
    throw new Error(`Token: ${e.message}`);
  }
}

export async function fetchHistory(symbol, token, appId, days = 365) {
  const fyersSym = toFyersSymbol(symbol);
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);
  const fmt = d => d.toISOString().split("T")[0];
  const url = `${DATA}/history?symbol=${encodeURIComponent(fyersSym)}&resolution=D&date_format=1&range_from=${fmt(from)}&range_to=${fmt(to)}&cont_flag=1`;
  const r = await fetch(url, { headers: { Authorization: `${appId}:${token}` } });
  if (!r.ok) throw new Error(`History fetch failed: ${r.status}`);
  const data = await r.json();
  if (data.s !== "ok") throw new Error(`Fyers history error: ${data.message || data.s}`);
  return data.candles;
}

export async function fetchQuote(symbol, token, appId) {
  const fyersSym = toFyersSymbol(symbol);
  const url = `${DATA}/quotes?symbols=${encodeURIComponent(fyersSym)}`;
  const r = await fetch(url, { headers: { Authorization: `${appId}:${token}` } });
  if (!r.ok) throw new Error(`Quote fetch failed: ${r.status}`);
  const data = await r.json();
  if (data.s !== "ok") throw new Error(`Fyers quote error: ${data.message}`);
  return data.d?.[0]?.v || null;
}

// Fetch fundamentals from Screener.in (no auth needed, public)
export async function fetchFundamentals(symbol) {
  try {
    const url = `https://api.allorigins.win/get?url=${encodeURIComponent(`https://www.screener.in/api/company/search/?q=${symbol}&v=3`)}`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const j = await r.json();
    const results = JSON.parse(j.contents);
    if (!results?.length) return null;
    const slug = results[0].url;

    // Fetch company page
    const url2 = `https://api.allorigins.win/get?url=${encodeURIComponent(`https://www.screener.in${slug}`)}`;
    const r2 = await fetch(url2);
    if (!r2.ok) return null;
    const j2 = await r2.json();
    const html = j2.contents;

    // Parse key ratios from HTML
    const extract = (label) => {
      const re = new RegExp(`${label}[^<]*</span>[^<]*<span[^>]*>([0-9.,%-]+)`, 'i');
      const m = html.match(re);
      return m ? m[1].replace(/,/g, '') : null;
    };

    return {
      pe:       extract('P/E') || extract('Price to Earning'),
      pb:       extract('Price to Book'),
      roe:      extract('Return on equity') || extract('ROE'),
      de:       extract('Debt to equity') || extract('D/E'),
      promoter: extract('Promoter Holding') || extract('Promoter'),
      mcap:     extract('Market Cap'),
      eps:      extract('EPS'),
      divYield: extract('Dividend Yield'),
    };
  } catch { return null; }
}

export async function fetchPeerQuote(symbol, token, appId) {
  try {
    const q = await fetchQuote(symbol, token, appId);
    if (!q) return null;
    return {
      symbol:  symbol.replace("NSE:", "").replace("-EQ", ""),
      price:   +((q.lp || q.cmd?.lp || 0).toFixed(2)),
      chgPct:  +((q.chp || q.cmd?.chp || 0).toFixed(2)),
      high52:  +((q["52_high"] || q.cmd?.["52_high"] || 0).toFixed(2)),
      low52:   +((q["52_low"]  || q.cmd?.["52_low"]  || 0).toFixed(2)),
      rsi:     null,
    };
  } catch { return null; }
}

// Fetch Nifty50 index quote for market context
export async function fetchMarketContext(token, appId) {
  try {
    const url = `${DATA}/quotes?symbols=${encodeURIComponent("NSE:NIFTY50-INDEX,NSE:NIFTYBANK-INDEX")}`;
    const r = await fetch(url, { headers: { Authorization: `${appId}:${token}` } });
    if (!r.ok) return null;
    const data = await r.json();
    if (data.s !== "ok") return null;
    return data.d?.map(item => ({
      symbol: item.n?.replace("NSE:", "").replace("-INDEX", ""),
      price:  +((item.v?.lp || 0).toFixed(2)),
      chgPct: +((item.v?.chp || 0).toFixed(2)),
      high:   +((item.v?.high_price || 0).toFixed(2)),
      low:    +((item.v?.low_price  || 0).toFixed(2)),
    })) || null;
  } catch { return null; }
}

// ── NSE Data — circuit limits + fundamentals via quote-equity API ────────────
// NSE blocks direct browser requests — we route through allorigins proxy
const NSE_PROXY = (url) =>
  `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;

export async function fetchNSEQuote(symbol) {
  try {
    const url = `https://www.nseindia.com/api/quote-equity?symbol=${encodeURIComponent(symbol)}`;
    const r = await fetch(NSE_PROXY(url));
    if (!r.ok) return null;
    const j = await r.json();
    const d = JSON.parse(j.contents);
    if (!d || !d.priceInfo) return null;

    const pi    = d.priceInfo;
    const meta  = d.metadata || {};
    const info  = d.info || {};

    // Circuit limits
    const priceBand = pi.priceBand || "No Band";
    const bandPct   = priceBand === "No Band" ? null : parseFloat(priceBand);
    const prevClose = pi.previousClose || pi.close || 0;
    const upperCircuit = bandPct ? +(prevClose * (1 + bandPct/100)).toFixed(2) : null;
    const lowerCircuit = bandPct ? +(prevClose * (1 - bandPct/100)).toFixed(2) : null;

    // Fundamentals from NSE (more reliable than Screener scrape)
    const intrinsicData = d.intrinsicValue || {};
    const secInfo = d.securityInfo || {};

    return {
      // Circuit info
      priceBand,
      bandPct,
      upperCircuit,
      lowerCircuit,
      // Fundamentals
      pe:        meta.pdSymbolPe     || null,
      pb:        secInfo.pb          || null,
      eps:       meta.pdSectorPe     ? null : null, // NSE doesnt give EPS directly
      mcap:      meta.totalTradedVolume ? null : null,
      isFNO:     info.isFNOSec       || false,
      isIndex:   info.isIndexSec     || false,
      companyName: meta.companyName  || info.companyName || null,
      industry:  info.industry       || null,
      sector:    info.sector         || null,
      listingDate: info.listingDate  || null,
      faceValue: secInfo.faceValue   || null,
      issuedSize: secInfo.issuedSize || null,
    };
  } catch (e) {
    return null;
  }
}

// ── F&O Expiry Dates — last Thursday of each month ───────────────────────────
export function getFOExpiries(count = 3) {
  const expiries = [];
  const now = new Date();
  let yr = now.getFullYear();
  let mo = now.getMonth(); // 0-indexed

  for (let i = 0; i < count + 2; i++) {
    // Find last Thursday of this month
    const lastDay = new Date(yr, mo + 1, 0); // last day of month
    const dow = lastDay.getDay(); // 0=Sun, 4=Thu
    const diff = (dow >= 4) ? dow - 4 : dow + 3;
    const lastThursday = new Date(yr, mo, lastDay.getDate() - diff);
    expiries.push(new Date(lastThursday));
    mo++;
    if (mo > 11) { mo = 0; yr++; }
  }
  return expiries.filter(d => d >= new Date(now.getFullYear(), now.getMonth(), 1));
}

// Get previous month expiry date
export function getPrevMonthExpiry() {
  const now  = new Date();
  let yr = now.getFullYear();
  let mo = now.getMonth() - 1; // previous month
  if (mo < 0) { mo = 11; yr--; }
  const lastDay = new Date(yr, mo + 1, 0);
  const dow  = lastDay.getDay();
  const diff = (dow >= 4) ? dow - 4 : dow + 3;
  return new Date(yr, mo, lastDay.getDate() - diff);
}

// Find expiry candle H/L from our existing Fyers candles
export function getExpiryHL(candles, expiryDate) {
  if (!candles || !expiryDate) return null;
  const ts = Math.floor(expiryDate.getTime() / 1000);
  // Find candle closest to expiry date (within 3 days for holidays)
  for (let delta = 0; delta <= 3; delta++) {
    const target = ts - delta * 86400;
    const c = candles.find(c => {
      const d = c[0];
      return Math.abs(d - target) < 86400;
    });
    if (c) return { high: c[2], low: c[3], date: new Date(c[0]*1000).toLocaleDateString("en-IN") };
  }
  return null;
}

// Load circuit changes from the JSON file generated by get_token.py
export async function fetchCircuitChanges() {
  try {
    const r = await fetch("/circuit_changes.json?t=" + Date.now());
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}
