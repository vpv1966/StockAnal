// IntradayPulse.js — Live Intraday Market Pulse
import { useState, useEffect, useRef, useCallback } from "react";

const T = {
  bg0:"#09090b",bg1:"#0f1014",bg2:"#16191f",bg3:"#1e2229",
  border:"#2a3240",borderHi:"#3d4d60",
  t0:"#f1f5f9",t1:"#cbd5e1",t2:"#94a3b8",t3:"#546070",
  amber:"#f59e0b",amberDim:"#78350f",
  green:"#22c55e",greenDim:"#14532d",
  red:"#ef4444",redDim:"#7f1d1d",
  blue:"#3b82f6",purple:"#a855f7",
};

const n2 = v => v!=null?Number(v).toLocaleString("en-IN",{maximumFractionDigits:2}):"—";
const n0 = v => v!=null?Math.round(Number(v)).toLocaleString("en-IN"):"—";

// ── Sector universe ───────────────────────────────────────────────────────────
const SECTORS = [
  { label:"IT",       sym:"NSE:NIFTYIT-INDEX",      stocks:["TCS","INFY","WIPRO","HCLTECH","TECHM","LTIM","MPHASIS","PERSISTENT","COFORGE","OFSS"] },
  { label:"BANK",     sym:"NSE:NIFTYBANK-INDEX",     stocks:["HDFCBANK","ICICIBANK","SBIN","KOTAKBANK","AXISBANK","INDUSINDBK","BANKBARODA","PNB","CANBK","FEDERALBNK"] },
  { label:"PHARMA",   sym:"NSE:NIFTYPHARMA-INDEX",   stocks:["SUNPHARMA","CIPLA","DRREDDY","LUPIN","DIVISLAB","AUROPHARMA","TORNTPHARM","ALKEM","ZYDUSLIFE","BIOCON"] },
  { label:"AUTO",     sym:"NSE:NIFTYAUTO-INDEX",     stocks:["MARUTI","TATAMOTORS","M&M","BAJAJ-AUTO","HEROMOTOCO","EICHERMOT","APOLLOTYRE","BALKRISIND","MOTHERSON","BOSCHLTD"] },
  { label:"FMCG",     sym:"NSE:NIFTYFMCG-INDEX",     stocks:["HINDUNILVR","ITC","NESTLEIND","BRITANNIA","DABUR","MARICO","COLPAL","GODREJCP","TATACONSUM","EMAMILTD"] },
  { label:"METAL",    sym:"NSE:NIFTYMETAL-INDEX",    stocks:["TATASTEEL","JSWSTEEL","HINDALCO","VEDL","SAIL","NMDC","COALINDIA","APLAPOLLO","RATNAMANI","WELSPUNLIV"] },
  { label:"REALTY",   sym:"NSE:NIFTYREALTY-INDEX",   stocks:["DLF","GODREJPROP","OBEROIRLTY","PRESTIGE","PHOENIXLTD","SOBHA","BRIGADE","MAHLIFE","LODHA","SUNTECK"] },
  { label:"ENERGY",   sym:"NSE:NIFTYENERGY-INDEX",   stocks:["RELIANCE","ONGC","NTPC","POWERGRID","TATAPOWER","ADANIGREEN","ADANIPOWER","CESC","TORNTPOWER","IGL"] },
  { label:"INFRA",    sym:"NSE:NIFTYINFRA-INDEX",    stocks:["LT","ADANIPORTS","ULTRACEMCO","GRASIM","AMBUJACEM","ACC","SIEMENS","ABB","BEL","HAL"] },
  { label:"FINANCE",  sym:"NSE:NIFTYFIN-INDEX",      stocks:["BAJFINANCE","BAJAJFINSV","HDFCLIFE","SBILIFE","MUTHOOTFIN","CHOLAFIN","SHRIRAMFIN","PFC","RECLTD","IRFC"] },
];

// ── Fyers fetch helpers ───────────────────────────────────────────────────────
async function fyersFetch(path, tok, appId) {
  const r = await fetch(`https://api-t1.fyers.in${path}`, {
    headers:{ Authorization:`${appId}:${tok}` }
  });
  if (!r.ok) throw new Error(`${r.status}`);
  const d = await r.json();
  if (d.s!=="ok") throw new Error(d.message||d.s);
  return d;
}

async function fetchQuotes(symbols, tok, appId) {
  const sym = symbols.map(s=>s.includes(":")?s:`NSE:${s}-EQ`).join(",");
  const d = await fyersFetch(
    `/data/quotes?symbols=${encodeURIComponent(sym)}`, tok, appId);
  const map = {};
  (d.d||[]).forEach(item=>{ map[item.n]=item.v; });
  return map;
}

async function fetchDailyCandles(symbol, tok, appId) {
  const now  = new Date();
  const from = new Date(); from.setDate(from.getDate()-365);
  const fmt  = d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  const sym  = symbol.includes(":")?symbol:`NSE:${symbol}-EQ`;
  const url  = `/data/history?symbol=${encodeURIComponent(sym)}&resolution=D&date_format=1&range_from=${fmt(from)}&range_to=${fmt(now)}&cont_flag=1`;
  const d = await fyersFetch(url, tok, appId);
  return d.candles||[];
}

// ── Technical indicators ──────────────────────────────────────────────────────
function calcEMA(closes, n) {
  if (closes.length<n) return null;
  const k=2/(n+1); let e=closes.slice(0,n).reduce((a,b)=>a+b,0)/n;
  for(let i=n;i<closes.length;i++) e=closes[i]*k+e*(1-k);
  return e;
}
function calcSMA(arr, n) {
  return arr.length<n?null:arr.slice(-n).reduce((a,b)=>a+b,0)/n;
}

function analyzeStock(candles, price, chgPct) {
  if (!candles||candles.length<50) return null;
  const closes  = candles.map(c=>c[4]);
  const highs   = candles.map(c=>c[2]);
  const lows    = candles.map(c=>c[3]);
  const volumes = candles.map(c=>c[5]);
  const lastC   = candles[candles.length-1];

  // Use live price if available
  const livePrice = price || closes[closes.length-1];

  // EMAs
  const e9  = calcEMA(closes,9);
  const e21 = calcEMA(closes,21);
  const e50 = calcEMA(closes,50);
  const e200= calcEMA(closes,200);
  const volMA = calcSMA(volumes,50);
  const lastVol = volumes[volumes.length-1];

  // 1. EMA Alignment — Stage 2 (price > e21 > e50)
  const emaOk = e21&&e50&&livePrice>e21&&e21>e50;

  // 2. CPR position
  const H = Math.max(...candles.slice(-2,-1).map(c=>c[2]));
  const L = Math.min(...candles.slice(-2,-1).map(c=>c[3]));
  const C = closes[closes.length-2]||closes[closes.length-1];
  const P  = (H+L+C)/3;
  const BC = (H+L)/2;
  const TC = P+(P-BC);
  const cprOk = livePrice > Math.max(TC,BC);
  const cpr   = {pivot:+P.toFixed(1),bc:+Math.min(TC,BC).toFixed(1),tc:+Math.max(TC,BC).toFixed(1)};

  // 3. Ichimoku — above cloud
  const midN = (n) => {
    const sl = candles.slice(-n);
    return (Math.max(...sl.map(c=>c[2]))+Math.min(...sl.map(c=>c[3])))/2;
  };
  const tenkan  = candles.length>=9  ? midN(9)  : null;
  const kijun   = candles.length>=26 ? midN(26) : null;
  const senkouA = tenkan&&kijun ? (tenkan+kijun)/2 : null;
  const senkouB = candles.length>=52 ? midN(52) : null;
  const cloudTop= senkouA&&senkouB ? Math.max(senkouA,senkouB) : null;
  const cloudBot= senkouA&&senkouB ? Math.min(senkouA,senkouB) : null;
  const ichiOk  = cloudTop&&cloudBot && livePrice>cloudTop;

  // 4. Minervini grade
  const high52w = Math.max(...candles.slice(-252).map(c=>c[2]));
  const low52w  = Math.min(...candles.slice(-252).map(c=>c[3]));
  const pctFrom52wHigh = (livePrice-high52w)/high52w*100;
  const pctFrom52wLow  = (livePrice-low52w)/low52w*100;
  let minScore = 0;
  if (e50&&e200&&e50>e200)           minScore++;
  if (livePrice>e150&&e150)          minScore++;
  if (livePrice>e200)                minScore++;
  if (pctFrom52wLow>=30)             minScore++;
  if (pctFrom52wHigh>=-25)           minScore++;
  const e150 = calcEMA(closes,150);
  // Recalc properly
  let minerviniScore = 0;
  if (e50&&e200&&e50>e200)           minerviniScore++;
  if (e150&&livePrice>e150)          minerviniScore++;
  if (e200&&livePrice>e200)          minerviniScore++;
  if (pctFrom52wLow>=30)             minerviniScore++;
  if (pctFrom52wHigh>=-25)           minerviniScore++;
  const minerviniOk = minerviniScore >= 4;

  // 5. Mini Coil — low ATR relative to price (tight consolidation)
  const recentRange = candles.slice(-10).map(c=>c[2]-c[3]);
  const avgRange    = recentRange.reduce((a,b)=>a+b,0)/recentRange.length;
  const atrPct      = avgRange/livePrice*100;
  const miniCoilOk  = atrPct < 2.0; // tight range < 2% of price

  // 6. BBPT — Bollinger Band Pocket Pivot
  const bb20SMA  = calcSMA(closes,20);
  const bb20Std  = closes.slice(-20).reduce((a,v)=>a+Math.pow(v-(bb20SMA||0),2),0)/20;
  const bb20SD   = Math.sqrt(bb20Std);
  const bbUpper  = (bb20SMA||0)+2*bb20SD;
  const bbLower  = (bb20SMA||0)-2*bb20SD;
  const bbptOk   = livePrice>bb20SMA && lastVol>=(volMA||0)*1.5 &&
                   livePrice>(closes[closes.length-2]||0);

  // 7. JR KG — volume pattern (today's vol > highest down-day vol in last 10)
  const last10     = candles.slice(-11,-1);
  const downVols   = last10.filter(c=>c[4]<c[1]).map(c=>c[5]);
  const maxDownVol = downVols.length?Math.max(...downVols):0;
  const jrkgOk     = lastVol>maxDownVol && livePrice>(closes[closes.length-2]||0);

  const signals = [emaOk,cprOk,ichiOk,minerviniOk,miniCoilOk,bbptOk,jrkgOk];
  const score   = signals.filter(Boolean).length;

  return {
    score, signals,
    emaOk, cprOk, ichiOk, minerviniOk, miniCoilOk, bbptOk, jrkgOk,
    cpr, e9, e21, e50, e200,
    volRatio: volMA?+(lastVol/volMA).toFixed(1):null,
    pctFrom52wHigh:+pctFrom52wHigh.toFixed(1),
    minerviniScore,
    atrPct:+atrPct.toFixed(2),
    cloudTop:cloudTop?+cloudTop.toFixed(1):null,
  };
}

// ── Alert sound ───────────────────────────────────────────────────────────────
function playAlert() {
  try {
    const ctx = new (window.AudioContext||window.webkitAudioContext)();
    [523,659,784].forEach((freq,i)=>{
      const osc = ctx.createOscillator();
      const gain= ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value=freq;
      osc.type="sine";
      gain.gain.setValueAtTime(0.3,ctx.currentTime+i*0.15);
      gain.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+i*0.15+0.3);
      osc.start(ctx.currentTime+i*0.15);
      osc.stop(ctx.currentTime+i*0.15+0.3);
    });
  } catch {}
}

// ── Sector Bar ────────────────────────────────────────────────────────────────
function SectorBar({ sectors, topN }) {
  if (!sectors.length) return null;
  const maxAbs = Math.max(...sectors.map(s=>Math.abs(s.chg||0)))||1;
  return (
    <div style={{background:T.bg2,border:`0.5px solid ${T.border}`,
      borderRadius:8,padding:"10px 14px"}}>
      <div style={{fontSize:9,color:T.t2,fontWeight:600,
        letterSpacing:"1px",marginBottom:8}}>
        SECTOR PERFORMANCE TODAY — Top 5 highlighted
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:4}}>
        {sectors.map((s,i)=>{
          const isTop = i<topN;
          const col   = s.chg>=0?T.green:T.red;
          const w     = Math.abs(s.chg)/maxAbs*100;
          return (
            <div key={s.label} style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{fontFamily:"monospace",fontSize:9,
                width:55,color:isTop?T.t0:T.t3,fontWeight:isTop?600:400}}>
                {s.label}
              </div>
              <div style={{flex:1,height:12,background:T.bg3,
                borderRadius:2,overflow:"hidden"}}>
                <div style={{height:"100%",width:`${w}%`,
                  background:isTop?col:col+"66",borderRadius:2,
                  transition:"width 0.5s"}}/>
              </div>
              <div style={{fontFamily:"monospace",fontSize:9,width:50,
                textAlign:"right",color:isTop?col:T.t3,
                fontWeight:isTop?600:400}}>
                {s.chg>=0?"+":""}{s.chg?.toFixed(2)}%
              </div>
              {isTop&&<span style={{fontSize:8,padding:"1px 5px",
                borderRadius:2,background:col+"22",color:col,
                border:`0.5px solid ${col}`}}>TOP {i+1}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Stock Card ────────────────────────────────────────────────────────────────
function StockCard({ stock, onSelect }) {
  const {rawSym,name,sector,price,chg,analysis} = stock;
  const score = analysis?.score??0;
  const allGreen = score===7;
  const scoreColor = score>=6?T.green:score>=4?T.amber:T.blue;

  const SIGS = [
    {k:"emaOk",      l:"EMA ALIGN"},
    {k:"cprOk",      l:"ABOVE CPR"},
    {k:"ichiOk",     l:"ABOVE CLOUD"},
    {k:"minerviniOk",l:"MINERVINI"},
    {k:"miniCoilOk", l:"MINI COIL"},
    {k:"bbptOk",     l:"BBPT"},
    {k:"jrkgOk",     l:"JR KG"},
  ];

  return (
    <div onClick={()=>onSelect&&onSelect(rawSym)}
      style={{background:allGreen?"#0a1f0a":score>=5?"#12100a":T.bg2,
        border:`1px solid ${allGreen?T.green:score>=5?T.amber:T.border}`,
        borderRadius:8,padding:"10px 12px",cursor:"pointer",
        boxShadow:allGreen?`0 0 20px ${T.green}44`:score>=5?`0 0 10px ${T.amber}22`:"none",
        transition:"all 0.2s"}}
      onMouseEnter={e=>e.currentTarget.style.borderColor=scoreColor}
      onMouseLeave={e=>e.currentTarget.style.borderColor=allGreen?T.green:score>=5?T.amber:T.border}>

      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",
        alignItems:"flex-start",marginBottom:6}}>
        <div>
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
            <span style={{fontFamily:"monospace",fontSize:13,
              fontWeight:700,color:T.t0}}>{rawSym}</span>
            {allGreen&&(
              <span style={{fontSize:9,padding:"2px 6px",borderRadius:3,
                background:T.greenDim,color:T.green,
                border:`0.5px solid ${T.green}`,fontWeight:700,
                animation:"pulse 1s infinite"}}>
                🔥 ALL 7
              </span>
            )}
          </div>
          <div style={{fontSize:8,color:T.t3}}>{name} · {sector}</div>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontFamily:"monospace",fontSize:14,
            fontWeight:700,color:T.amber}}>
            ₹{n2(price)}
          </div>
          <div style={{fontFamily:"monospace",fontSize:10,
            color:chg>=0?T.green:T.red}}>
            {chg>=0?"+":""}{chg?.toFixed(2)}%
          </div>
          <div style={{fontFamily:"monospace",fontSize:11,
            fontWeight:600,color:scoreColor}}>
            {score}/7
          </div>
        </div>
      </div>

      {/* Score bar */}
      <div style={{height:4,background:T.bg3,borderRadius:2,
        overflow:"hidden",marginBottom:6}}>
        <div style={{height:"100%",width:`${(score/7)*100}%`,
          background:scoreColor,borderRadius:2,transition:"width 0.5s"}}/>
      </div>

      {/* Volume */}
      {analysis?.volRatio&&(
        <div style={{fontFamily:"monospace",fontSize:9,color:T.t2,marginBottom:6}}>
          Vol: <b style={{color:analysis.volRatio>=2?T.green:
            analysis.volRatio>=1?T.amber:T.red}}>
            {analysis.volRatio}x avg
          </b>
          {analysis.cpr&&(
            <span style={{marginLeft:8,color:T.t3}}>
              CPR: {analysis.cpr.bc}–{analysis.cpr.tc}
            </span>
          )}
        </div>
      )}

      {/* Signal chips */}
      <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
        {SIGS.map(({k,l})=>(
          <span key={k} style={{fontSize:7,padding:"2px 5px",borderRadius:2,
            background:analysis?.[k]?T.greenDim:T.bg3,
            color:analysis?.[k]?T.green:T.t3,
            border:`0.5px solid ${analysis?.[k]?T.green:T.border}`,
            fontWeight:analysis?.[k]?600:400}}>
            {l}
          </span>
        ))}
      </div>

      <div style={{marginTop:6,fontSize:8,color:T.t3,
        fontFamily:"monospace",textAlign:"right"}}>
        Click → Full Analysis ↗
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function IntradayPulse({ tokenData, onSelectStock }) {
  const [sectorData,  setSectorData]  = useState([]);
  const [stockData,   setStockData]   = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [loadingStep, setLoadingStep] = useState("");
  const [lastUpdate,  setLastUpdate]  = useState(null);
  const [countdown,   setCountdown]   = useState(0);
  const [alertedSyms, setAlertedSyms] = useState(new Set());
  const timerRef = useRef(null);
  const cdRef    = useRef(null);
  const tokenRef = useRef(null);

  useEffect(()=>{ if(tokenData) tokenRef.current=tokenData; },[tokenData]);

  const runScan = useCallback(async()=>{
    const td = tokenRef.current||tokenData;
    if (!td) return;
    setLoading(true);
    setStockData([]);

    try {
      // Step 1 — Fetch all sector quotes + candles for fallback
      setLoadingStep("Fetching sector performance...");
      const sectorSyms = SECTORS.map(s=>s.sym);
      const sectorQuotes = await fetchQuotes(sectorSyms, td.access_token, td.app_id);

      const sectors = await Promise.all(SECTORS.map(async s=>{
        const q     = sectorQuotes[s.sym];
        const price = q?.lp||0;
        let chg     = q?.chp||0;

        // If chg is 0 (holiday/after hours), compute from daily candles
        if (chg===0 && price>0) {
          try {
            const c = await fetchDailyCandles(s.sym, td.access_token, td.app_id);
            if (c.length>=2) {
              const last = c[c.length-1][4];
              const prev = c[c.length-2][4];
              chg = +((last-prev)/prev*100).toFixed(2);
            }
          } catch {}
        }
        return {...s, chg, price};
      }));
      sectors.sort((a,b)=>b.chg-a.chg);

      setSectorData(sectors);

      // Step 2 — Top 5 sectors, pick top 2 stocks each by % gain
      const top5 = sectors.slice(0,5);
      setLoadingStep(`Scanning stocks from top 5 sectors...`);

      // Fetch quotes for all stocks in top 5 sectors
      const allStockSyms = top5.flatMap(s=>s.stocks.map(sym=>`NSE:${sym}-EQ`));
      const stockQuotes  = await fetchQuotes(allStockSyms, td.access_token, td.app_id);

      // Pick top 2 per sector by % gain
      const topStocks = [];
      for (const sec of top5) {
        const ranked = sec.stocks
          .map(sym=>{
            const q     = stockQuotes[`NSE:${sym}-EQ`];
            const price = q?.lp||0;
            const chg   = q?.chp||0;
            // We'll fix chg later via candles if needed
            return { sym, chg, price, q };
          })
          .filter(s=>s.price>0)
          .sort((a,b)=>b.chg-a.chg)
          .slice(0,2);
        ranked.forEach(s=>topStocks.push({...s, sector:sec.label}));
      }

      // Step 3 — Fetch daily candles + analyze each stock
      const results = [];
      for (let i=0; i<topStocks.length; i++) {
        const s = topStocks[i];
        setLoadingStep(`Analyzing ${s.sym} (${i+1}/${topStocks.length})...`);
        try {
          const candles = await fetchDailyCandles(s.sym, td.access_token, td.app_id);

          // Fix chg from candles if live quote shows 0
          let chg = s.chg;
          if (chg===0 && candles.length>=2) {
            const last = candles[candles.length-1][4];
            const prev = candles[candles.length-2][4];
            chg = +((last-prev)/prev*100).toFixed(2);
          }

          const analysis = analyzeStock(candles, s.price||candles[candles.length-1]?.[4], chg);
          const livePrice = s.price||candles[candles.length-1]?.[4]||0;
          results.push({
            rawSym:   s.sym,
            name:     s.sym,
            sector:   s.sector,
            price:    livePrice,
            chg,
            analysis,
          });

          // Alert if 7/7
          if (analysis?.score===7 && !alertedSyms.has(s.sym)) {
            playAlert();
            setAlertedSyms(prev=>new Set([...prev,s.sym]));
          }
        } catch {}
        await new Promise(r=>setTimeout(r,300));
      }

      // Sort by score desc
      results.sort((a,b)=>(b.analysis?.score??0)-(a.analysis?.score??0));
      setStockData(results);
      setLastUpdate(new Date());
      setCountdown(900); // 15 min
    } catch(e) {
      setLoadingStep(`❌ ${e.message}`);
    } finally {
      setLoading(false);
      setLoadingStep("");
    }
  },[tokenData, alertedSyms]);

  // Auto-refresh every 15 min
  useEffect(()=>{
    if (!tokenData) return;
    runScan();
    timerRef.current = setInterval(runScan, 900000);
    cdRef.current    = setInterval(()=>setCountdown(c=>c>0?c-1:0),1000);
    return ()=>{ clearInterval(timerRef.current); clearInterval(cdRef.current); };
  },[tokenData]);

  const topN   = 5;
  const all7   = stockData.filter(s=>s.analysis?.score===7);
  const score5p = stockData.filter(s=>(s.analysis?.score??0)>=5);

  return (
    <div style={{height:"100%",overflowY:"auto",padding:"12px 16px",
      display:"flex",flexDirection:"column",gap:10}}>

      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0,flexWrap:"wrap"}}>
        <span style={{fontFamily:"monospace",fontSize:10,color:T.amber,
          fontWeight:600,letterSpacing:"1px"}}>⚡ INTRADAY PULSE</span>
        <span style={{fontSize:9,color:T.t3}}>
          Top 5 sectors · Top 10 stocks · 7 signals
        </span>
        {sectorData.length>0&&sectorData.every(s=>s.chg===0)&&(
          <span style={{fontSize:9,padding:"2px 8px",borderRadius:3,
            background:T.amberDim,color:T.amber,
            border:`0.5px solid ${T.amber}`,fontFamily:"monospace"}}>
            📅 MARKET CLOSED — showing last session data
          </span>
        )}
        {lastUpdate&&(
          <span style={{fontSize:9,color:T.t3,marginLeft:"auto"}}>
            {lastUpdate.toLocaleTimeString("en-IN")}
            {countdown>0&&` · next: ${Math.floor(countdown/60)}:${String(countdown%60).padStart(2,"0")}`}
          </span>
        )}
        <button onClick={runScan} disabled={loading||!tokenData}
          style={{fontFamily:"monospace",fontSize:9,padding:"4px 10px",
            background:T.bg3,border:`0.5px solid ${T.border}`,
            borderRadius:3,color:T.t1,cursor:"pointer",
            opacity:loading?0.5:1}}>
          {loading?"...":"↻ REFRESH"}
        </button>
      </div>

      {/* Loading */}
      {loading&&(
        <div style={{background:T.bg2,border:`0.5px solid ${T.border}`,
          borderRadius:6,padding:"8px 12px",flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{width:14,height:14,border:`2px solid ${T.border}`,
              borderTopColor:T.amber,borderRadius:"50%",
              animation:"spin 1s linear infinite"}}/>
            <span style={{fontFamily:"monospace",fontSize:10,color:T.amber}}>
              {loadingStep}
            </span>
          </div>
        </div>
      )}

      {!tokenData&&(
        <div style={{textAlign:"center",padding:"40px",color:T.t3,
          fontFamily:"monospace",fontSize:11}}>
          Token required — run get_token.py first
        </div>
      )}

      {/* 🔥 All 7 alert block */}
      {all7.length>0&&(
        <div style={{background:"#0a1f0a",border:`2px solid ${T.green}`,
          borderRadius:8,padding:"10px 14px",flexShrink:0,
          boxShadow:`0 0 24px ${T.green}44`}}>
          <div style={{fontFamily:"monospace",fontSize:11,fontWeight:700,
            color:T.green,marginBottom:6}}>
            🔥 ALL 7 SIGNALS ALIGNED — {all7.length} STOCK{all7.length>1?"S":""}
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {all7.map(s=>(
              <div key={s.rawSym}
                onClick={()=>onSelectStock&&onSelectStock(s.rawSym)}
                style={{fontFamily:"monospace",fontSize:11,fontWeight:600,
                  color:T.green,cursor:"pointer",padding:"4px 10px",
                  background:T.greenDim,borderRadius:4,
                  border:`0.5px solid ${T.green}`}}>
                {s.rawSym} ₹{n2(s.price)} +{s.chg?.toFixed(2)}%
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sector bar */}
      {sectorData.length>0&&(
        <SectorBar sectors={sectorData} topN={topN}/>
      )}

      {/* Stock cards */}
      {stockData.length>0&&(
        <>
          <div style={{fontSize:9,color:T.t2,fontWeight:600,
            letterSpacing:"1px",flexShrink:0}}>
            TOP STOCKS FROM LEADING SECTORS · {stockData.length} STOCKS · SORTED BY SIGNAL SCORE
          </div>
          <div style={{display:"grid",
            gridTemplateColumns:"repeat(2,1fr)",gap:10}}>
            {stockData.map(s=>(
              <StockCard key={s.rawSym} stock={s}
                onSelect={sym=>{
                  onSelectStock&&onSelectStock(sym);
                }}/>
            ))}
          </div>
        </>
      )}

      {/* Empty */}
      {!loading&&!stockData.length&&tokenData&&(
        <div style={{textAlign:"center",padding:"50px",flex:1}}>
          <div style={{fontSize:32,marginBottom:10}}>⚡</div>
          <div style={{fontSize:14,color:T.t1,marginBottom:6}}>
            Intraday Market Pulse
          </div>
          <div style={{fontSize:10,color:T.t2,lineHeight:2}}>
            Scans top 5 sectors + top 2 stocks each<br/>
            Applies 7 technical signals per stock<br/>
            🔥 Alert when all 7 align simultaneously<br/>
            Auto-refreshes every 15 minutes
          </div>
        </div>
      )}
    </div>
  );
}
