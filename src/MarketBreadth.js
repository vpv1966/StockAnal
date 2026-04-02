// MarketBreadth.js — Market Direction Dashboard for War Room
import { useState, useEffect, useCallback, useRef } from "react";

const T = {
  bg0:"#09090b",bg1:"#0f1014",bg2:"#16191f",bg3:"#1e2229",
  border:"#2a3240",borderHi:"#3d4d60",
  t0:"#f1f5f9",t1:"#cbd5e1",t2:"#94a3b8",t3:"#546070",
  amber:"#f59e0b",amberDim:"#78350f",
  green:"#22c55e",greenDim:"#14532d",
  red:"#ef4444",redDim:"#7f1d1d",
  blue:"#3b82f6",purple:"#a855f7",
};

const n2  = v => v!=null ? Number(v).toLocaleString("en-IN",{maximumFractionDigits:2}) : "—";
const n0  = v => v!=null ? Math.round(Number(v)).toLocaleString("en-IN") : "—";
const pct = (a,b) => a&&b ? ((a-b)/b*100).toFixed(2)+"%" : "—";

// ── Fyers API helper ──────────────────────────────────────────────────────────
async function fyersGet(path, token, appId) {
  const r = await fetch(`https://api-t1.fyers.in${path}`, {
    headers: { Authorization: `${appId}:${token}` }
  });
  if (!r.ok) throw new Error(`${r.status}`);
  const d = await r.json();
  if (d.s !== "ok") throw new Error(d.message || d.s);
  return d;
}

// ── Fetch live data from Fyers ────────────────────────────────────────────────
async function fetchLiveData(tokenData) {
  const { access_token: tok, app_id: appId } = tokenData;
  const symbols = [
    "NSE:NIFTY50-INDEX",
    "NSE:INDIAVIX-INDEX",
    "NSE:NIFTYIT-INDEX",
    "NSE:NIFTYBANK-INDEX",
    "NSE:NIFTYPHARMA-INDEX",
    "NSE:NIFTYAUTO-INDEX",
    "NSE:NIFTYFMCG-INDEX",
    "NSE:NIFTYREALTY-INDEX",
  ].join(",");

  const q = await fyersGet(
    `/data/quotes?symbols=${encodeURIComponent(symbols)}`,
    tok, appId
  );

  const bySymbol = {};
  (q.d || []).forEach(item => {
    bySymbol[item.n] = item.v;
  });

  return bySymbol;
}

// ── Fetch Nifty 50 daily candles for chart (1 year) ──────────────────────────
async function fetchNiftyCandles(tokenData) {
  const { access_token: tok, app_id: appId } = tokenData;
  const now  = new Date();
  const from = new Date(now);
  from.setFullYear(from.getFullYear() - 1);
  const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  const url  = `/data/history?symbol=${encodeURIComponent("NSE:NIFTY50-INDEX")}&resolution=D&date_format=1&range_from=${fmt(from)}&range_to=${fmt(now)}&cont_flag=1`;
  const d = await fyersGet(url, tok, appId);
  return d.candles || []; // [ts, o, h, l, c, v]
}

// ── Compute scores like Google Sheet ─────────────────────────────────────────
function computeScores(live, candles, fii, dii) {
  const nifty = live?.["NSE:NIFTY50-INDEX"];
  const vix   = live?.["NSE:INDIAVIX-INDEX"];
  const sp500 = null; // not available via Fyers — use sheet value
  const nasdaq= null;

  const price = nifty?.lp || 0;
  const prev  = nifty?.prev_close_price || 0;

  // Compute DMAs from candles
  const closes = candles.map(c => c[4]);
  const ma50  = closes.length >= 50  ? closes.slice(-50).reduce((a,b)=>a+b,0)/50   : null;
  const ma200 = closes.length >= 200 ? closes.slice(-200).reduce((a,b)=>a+b,0)/200 : null;

  // 1. Index Trend (0-3)
  let idx = 0;
  if (price && ma50  && price > ma50)  idx++;
  if (price && ma200 && price > ma200) idx++;
  if (price && prev  && price > prev && idx >= 1) idx++;
  idx = Math.min(idx, 3);

  // 2. Breadth proxy (0-3)
  const brd = idx;

  // 3. Institutional (0-3)
  let ins = 1;
  if (fii != null && dii != null) {
    if      (fii > 0 && dii > 0)  ins = 3;
    else if (dii > 0 && Math.abs(dii) > Math.abs(fii)) ins = 2;
    else if (fii < 0 && dii < 0)  ins = 0;
    else ins = 1;
  }

  // 4. Leadership (0-3)
  const ldr = Math.min(idx, 2);

  // 5. Price & Volume (0-3)
  let pv = 1;
  if (price && prev) {
    const chg = (price - prev) / prev * 100;
    pv = chg > 1.5 ? 3 : chg > 0 ? 2 : chg > -1 ? 1 : 0;
  }

  // 6. Volatility (0-3)
  const vixVal = vix?.lp || 0;
  const vol = vixVal < 14 ? 3 : vixVal < 18 ? 2 : vixVal < 22 ? 1 : 0;

  // 7. Global (0-3) — approximate from Nifty momentum
  let glb = 1; // default neutral

  const total = idx + brd + ins + ldr + pv + vol + glb;
  const status = total >= 15 ? "Uptrend — Bullish"
               : total >= 10 ? "Moderate — Selective"
               : total >=  6 ? "Under Pressure — Cautious"
               :               "Downtrend — Defensive";
  const action = total >= 15 ? "Aggressive" : total >= 10 ? "Moderate" : "Defensive";
  const color  = total >= 15 ? T.green : total >= 10 ? T.amber : T.red;

  return { idx, brd, ins, ldr, pv, vol, glb, total, status, action, color,
    price, prev, ma50, ma200, vixVal };
}

// ── Nifty 50 Line Chart ───────────────────────────────────────────────────────
function NiftyChart({ candles }) {
  if (!candles?.length) return (
    <div style={{height:200,display:"flex",alignItems:"center",
      justifyContent:"center",color:T.t3,fontFamily:"monospace",fontSize:10}}>
      Loading chart...
    </div>
  );

  const W = 900, H = 180, PAD = { t:10, r:10, b:24, l:50 };
  const recent = candles.slice(-120); // last ~6 months
  const closes = recent.map(c => c[4]);
  const highs  = recent.map(c => c[2]);
  const lows   = recent.map(c => c[3]);
  const dates  = recent.map(c => new Date(c[0]*1000));

  const minV = Math.min(...lows)  * 0.999;
  const maxV = Math.max(...highs) * 1.001;
  const range = maxV - minV || 1;

  const cW = (W - PAD.l - PAD.r) / recent.length;
  const px = i => PAD.l + i * cW + cW / 2;
  const py = v => PAD.t + (1 - (v - minV) / range) * (H - PAD.t - PAD.b);

  // MA lines
  const allCloses = candles.map(c => c[4]);
  const ma50pts  = recent.map((_, i) => {
    const globalIdx = candles.length - recent.length + i;
    if (globalIdx < 49) return null;
    const slice = allCloses.slice(globalIdx-49, globalIdx+1);
    return slice.reduce((a,b)=>a+b,0)/50;
  });
  const ma200pts = recent.map((_, i) => {
    const globalIdx = candles.length - recent.length + i;
    if (globalIdx < 199) return null;
    const slice = allCloses.slice(globalIdx-199, globalIdx+1);
    return slice.reduce((a,b)=>a+b,0)/200;
  });

  const linePoints = pts => pts.map((v,i) => v!=null?`${px(i)},${py(v)}`:null)
    .reduce((acc,pt,i) => {
      if (!pt) return acc + ' M';
      if (acc.endsWith('M') || acc === '') return acc + pt;
      return acc + ' ' + pt;
    }, '');

  const closeLine = closes.map((v,i) => `${i===0?'M':'L'}${px(i)},${py(v)}`).join(' ');

  // Month labels
  let lastMonth = -1;
  const labels = recent.map((c, i) => {
    const d = dates[i];
    if (d.getMonth() !== lastMonth) {
      lastMonth = d.getMonth();
      return { x: px(i), label: d.toLocaleDateString("en-IN",{month:"short"}) };
    }
    return null;
  }).filter(Boolean);

  const latestClose = closes[closes.length-1];
  const prevClose   = closes[closes.length-2];
  const dayChg      = latestClose && prevClose ? ((latestClose-prevClose)/prevClose*100) : 0;

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",
        alignItems:"center",marginBottom:6}}>
        <div style={{fontFamily:"monospace",fontSize:11,color:T.t2}}>
          NIFTY 50 — Daily · Last 6 months
        </div>
        <div style={{fontFamily:"monospace",fontSize:12,fontWeight:600,
          color:dayChg>=0?T.green:T.red}}>
          {n2(latestClose)} &nbsp;
          <span style={{fontSize:10}}>{dayChg>=0?"+":""}{dayChg.toFixed(2)}%</span>
        </div>
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`}
        style={{display:"block",overflow:"visible"}}>
        {/* Y grid lines */}
        {[0.25,0.5,0.75].map(f => {
          const v = minV + f*range;
          const y = py(v);
          return (
            <g key={f}>
              <line x1={PAD.l} y1={y} x2={W-PAD.r} y2={y}
                stroke={T.border} strokeWidth="0.5" strokeDasharray="4,3"/>
              <text x={PAD.l-4} y={y+3} textAnchor="end"
                fill={T.t3} fontSize="8">{n0(v)}</text>
            </g>
          );
        })}

        {/* MA200 line */}
        {ma200pts.some(v=>v!=null) && (
          <polyline points={ma200pts.filter(Boolean).map((v,i)=>{
            const idx = ma200pts.findIndex((x,j)=>j>=i&&x!=null);
            return `${px(idx)},${py(v)}`;
          }).join(' ')}
            fill="none" stroke={T.red} strokeWidth="1"
            strokeDasharray="4,2" opacity="0.7"/>
        )}

        {/* MA50 line */}
        {ma50pts.some(v=>v!=null) && (
          <polyline points={ma50pts.map((v,i)=>v!=null?`${px(i)},${py(v)}`:null)
            .filter(Boolean).join(' ')}
            fill="none" stroke={T.amber} strokeWidth="1"
            strokeDasharray="4,2" opacity="0.7"/>
        )}

        {/* Area fill */}
        <path d={`${closeLine} L${px(recent.length-1)},${H-PAD.b} L${px(0)},${H-PAD.b} Z`}
          fill={`url(#ngrad)`} opacity="0.15"/>
        <defs>
          <linearGradient id="ngrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={T.blue} stopOpacity="1"/>
            <stop offset="100%" stopColor={T.blue} stopOpacity="0"/>
          </linearGradient>
        </defs>

        {/* Close line */}
        <path d={closeLine} fill="none" stroke={T.blue} strokeWidth="1.5"/>

        {/* Current price dot */}
        <circle cx={px(recent.length-1)} cy={py(latestClose)} r="3"
          fill={T.blue} stroke={T.bg0} strokeWidth="1.5"/>

        {/* X axis labels */}
        {labels.map((l,i) => (
          <text key={i} x={l.x} y={H-6} textAnchor="middle"
            fill={T.t3} fontSize="8">{l.label}</text>
        ))}

        {/* MA Legend */}
        <g transform={`translate(${PAD.l},${H-8})`}>
          <line x1="0" y1="0" x2="16" y2="0" stroke={T.amber} strokeWidth="1.5" strokeDasharray="4,2"/>
          <text x="20" y="3" fill={T.t3} fontSize="8">50D MA</text>
          <line x1="60" y1="0" x2="76" y2="0" stroke={T.red} strokeWidth="1.5" strokeDasharray="4,2"/>
          <text x="80" y="3" fill={T.t3} fontSize="8">200D MA</text>
        </g>
      </svg>
    </div>
  );
}

// ── Score Hero ────────────────────────────────────────────────────────────────
function ScoreHero({ scores }) {
  if (!scores) return null;
  const { total, status, action, color } = scores;
  const pct = (total / 21 * 100).toFixed(0);
  return (
    <div style={{background:T.bg2,border:`1px solid ${color}33`,
      borderRadius:8,padding:"14px 16px",
      boxShadow:`0 0 20px ${color}11`}}>
      <div style={{display:"flex",alignItems:"flex-end",gap:12,marginBottom:8}}>
        <div style={{fontFamily:"monospace",fontSize:52,fontWeight:700,
          color,lineHeight:1}}>{total}</div>
        <div style={{paddingBottom:8}}>
          <div style={{fontSize:11,color:T.t2,marginBottom:2}}>/ 21 TOTAL SCORE</div>
          <div style={{fontSize:13,fontWeight:600,color}}>{status}</div>
        </div>
        <div style={{marginLeft:"auto",textAlign:"right"}}>
          <div style={{padding:"4px 14px",borderRadius:12,fontSize:11,fontWeight:600,
            background:color+"22",border:`0.5px solid ${color}`,color}}>
            {action}
          </div>
        </div>
      </div>
      {/* Score bar */}
      <div style={{height:6,background:T.bg3,borderRadius:3,overflow:"hidden"}}>
        <div style={{height:"100%",width:`${pct}%`,background:color,
          borderRadius:3,transition:"width 1s ease"}}/>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",
        fontSize:8,color:T.t3,marginTop:3}}>
        <span>0 — Defensive</span>
        <span>10 — Moderate</span>
        <span>21 — Bullish</span>
      </div>
    </div>
  );
}

// ── Category Row ──────────────────────────────────────────────────────────────
function CatRow({ name, score, max=3, detail }) {
  const color = score === 0 ? T.red : score === max ? T.green : T.amber;
  const label = score === 0 ? "Bearish ✗" : score === max ? "Bullish ✓" : "Neutral ~";
  return (
    <div style={{display:"flex",alignItems:"center",gap:10,padding:"6px 0",
      borderBottom:`0.5px solid ${T.border}`}}>
      <div style={{fontSize:10,color:T.t2,width:140,flexShrink:0}}>{name}</div>
      <div style={{display:"flex",gap:3}}>
        {Array.from({length:max},(_,i) => (
          <div key={i} style={{width:8,height:8,borderRadius:"50%",
            background:i<score?color:"rgba(255,255,255,0.08)"}}/>
        ))}
      </div>
      <div style={{fontFamily:"monospace",fontSize:10,color,width:65}}>{score}/{max} {label}</div>
      <div style={{fontFamily:"monospace",fontSize:9,color:T.t3,flex:1,
        overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{detail}</div>
    </div>
  );
}

// ── Sector Strip ──────────────────────────────────────────────────────────────
function SectorStrip({ live }) {
  const sectors = [
    { key:"NSE:NIFTYIT-INDEX",     label:"IT" },
    { key:"NSE:NIFTYBANK-INDEX",   label:"BANK" },
    { key:"NSE:NIFTYPHARMA-INDEX", label:"PHARMA" },
    { key:"NSE:NIFTYAUTO-INDEX",   label:"AUTO" },
    { key:"NSE:NIFTYFMCG-INDEX",   label:"FMCG" },
    { key:"NSE:NIFTYREALTY-INDEX", label:"REALTY" },
  ];
  return (
    <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:6}}>
      {sectors.map(({ key, label }) => {
        const v = live?.[key];
        const chg = v?.chp || 0;
        const ltp = v?.lp || 0;
        const col = chg > 0 ? T.green : chg < 0 ? T.red : T.t2;
        return (
          <div key={key} style={{background:T.bg2,
            border:`0.5px solid ${chg>1?T.green:chg<-1?T.red:T.border}`,
            borderRadius:6,padding:"7px 9px"}}>
            <div style={{fontSize:8,color:T.t2,marginBottom:2}}>{label}</div>
            <div style={{fontFamily:"monospace",fontSize:12,fontWeight:600,color:col}}>
              {chg>=0?"+":""}{chg.toFixed(2)}%
            </div>
            <div style={{fontFamily:"monospace",fontSize:9,color:T.t3}}>
              {n0(ltp)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── FII/DII Input ─────────────────────────────────────────────────────────────
function FiiInput({ fii, dii, onChange }) {
  return (
    <div style={{background:T.bg2,border:`0.5px solid ${T.border}`,
      borderRadius:6,padding:"8px 12px",display:"flex",
      alignItems:"center",gap:12}}>
      <div style={{fontSize:9,color:T.amber,fontWeight:600,letterSpacing:"1px"}}>
        FII / DII (₹ Cr)
      </div>
      <div style={{display:"flex",alignItems:"center",gap:6}}>
        <span style={{fontSize:9,color:T.t2}}>FII:</span>
        <input type="number" value={fii}
          onChange={e=>onChange("fii", e.target.value)}
          placeholder="e.g. -5340"
          style={{fontFamily:"monospace",fontSize:10,padding:"3px 6px",
            background:T.bg3,border:`0.5px solid ${T.border}`,
            borderRadius:3,color:fii>0?T.green:fii<0?T.red:T.t1,width:90}}/>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:6}}>
        <span style={{fontSize:9,color:T.t2}}>DII:</span>
        <input type="number" value={dii}
          onChange={e=>onChange("dii", e.target.value)}
          placeholder="e.g. 5334"
          style={{fontFamily:"monospace",fontSize:10,padding:"3px 6px",
            background:T.bg3,border:`0.5px solid ${T.border}`,
            borderRadius:3,color:dii>0?T.green:dii<0?T.red:T.t1,width:90}}/>
      </div>
      <div style={{fontSize:9,color:T.t3}}>Enter after market close</div>
      {/* Google Sheet URL */}
      <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:6}}>
        <span style={{fontSize:9,color:T.t2}}>Sheet URL:</span>
        <input type="text" placeholder="Paste Web App URL (optional)"
          id="sheet-url-input"
          style={{fontFamily:"monospace",fontSize:9,padding:"3px 6px",
            background:T.bg3,border:`0.5px solid ${T.border}`,
            borderRadius:3,color:T.t1,width:220}}/>
        <button onClick={()=>{
          const url = document.getElementById("sheet-url-input").value.trim();
          if(url) localStorage.setItem("marketBreadthSheetUrl", url);
        }}
          style={{fontFamily:"monospace",fontSize:9,padding:"3px 8px",
            background:T.blue,border:"none",borderRadius:3,
            color:"#fff",cursor:"pointer"}}>SAVE</button>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function MarketBreadth({ tokenData }) {
  const [mbTab, setMbTab] = useState("score");
  const [live,    setLive]    = useState(null);
  const [candles, setCandles] = useState([]);
  const [scores,  setScores]  = useState(null);
  const [fii,     setFii]     = useState("");
  const [dii,     setDii]     = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const timerRef = useRef(null);

  const loadData = useCallback(async() => {
    if (!tokenData) return;
    setLoading(true);
    setError(null);
    try {
      const [liveData, candleData] = await Promise.all([
        fetchLiveData(tokenData),
        fetchNiftyCandles(tokenData),
      ]);
      setLive(liveData);
      setCandles(candleData);
      const sc = computeScores(liveData, candleData,
        fii !== "" ? parseFloat(fii) : null,
        dii !== "" ? parseFloat(dii) : null);
      setScores(sc);
      setLastUpdate(new Date());
    } catch(e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [tokenData, fii, dii]);

  // Auto-load on mount
  useEffect(() => {
    if (tokenData) loadData();
    // Refresh every 5 min
    timerRef.current = setInterval(() => {
      if (tokenData) loadData();
    }, 300000);
    return () => clearInterval(timerRef.current);
  }, [tokenData]);

  // Recompute scores when FII/DII changes
  useEffect(() => {
    if (live && candles.length) {
      setScores(computeScores(live, candles,
        fii !== "" ? parseFloat(fii) : null,
        dii !== "" ? parseFloat(dii) : null));
    }
  }, [fii, dii]);

  const nifty = live?.["NSE:NIFTY50-INDEX"];
  const vix   = live?.["NSE:INDIAVIX-INDEX"];

  return (
    <div style={{height:"100%",overflowY:"auto",padding:"12px 16px",
      display:"flex",flexDirection:"column",gap:10}}>

      {/* Tab switcher */}
      <div style={{display:"flex",gap:4,flexShrink:0,marginBottom:2}}>
        {[["score","📊 Market Score"],["cpr","📐 CPR + Ichimoku"]].map(([k,l])=>(
          <button key={k} onClick={()=>setMbTab(k)}
            style={{fontFamily:"monospace",fontSize:10,padding:"5px 14px",
              borderRadius:4,cursor:"pointer",
              background:mbTab===k?T.amber:T.bg3,
              border:`0.5px solid ${mbTab===k?T.amber:T.border}`,
              color:mbTab===k?T.bg0:T.t1,fontWeight:mbTab===k?600:400}}>
            {l}
          </button>
        ))}
      </div>

      {mbTab==="cpr"&&<IndexCPRPanel tokenData={tokenData}/>}
      {mbTab==="score"&&<>

      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
        <div style={{fontFamily:"monospace",fontSize:10,color:T.amber,
          fontWeight:600,letterSpacing:"1px"}}>
          📊 MARKET BREADTH
        </div>
        <div style={{fontSize:9,color:T.t3}}>
          Fyers live · Score /21 · Updates every 5 min
        </div>
        {lastUpdate&&(
          <div style={{fontSize:9,color:T.t3,marginLeft:"auto"}}>
            Updated: {lastUpdate.toLocaleTimeString("en-IN")}
          </div>
        )}
        <button onClick={loadData} disabled={loading}
          style={{fontFamily:"monospace",fontSize:9,padding:"4px 10px",
            background:T.bg3,border:`0.5px solid ${T.border}`,
            borderRadius:3,color:T.t1,cursor:"pointer",opacity:loading?0.5:1}}>
          {loading?"...":"↻ REFRESH"}
        </button>
      </div>

      {error&&(
        <div style={{background:T.redDim,border:`0.5px solid ${T.red}`,
          borderRadius:4,padding:"6px 10px",fontSize:10,
          color:T.red,fontFamily:"monospace"}}>
          ❌ {error}
        </div>
      )}

      {!tokenData&&(
        <div style={{textAlign:"center",padding:"40px",color:T.t3,
          fontFamily:"monospace",fontSize:11}}>
          Run get_token.py first to load market data
        </div>
      )}

      {tokenData&&(
        <>
          {/* FII/DII input */}
          <FiiInput fii={fii} dii={dii}
            onChange={(k,v) => k==="fii" ? setFii(v) : setDii(v)}/>

          {/* Score hero */}
          <ScoreHero scores={scores}/>

          {/* 7 categories */}
          {scores&&(
            <div style={{background:T.bg2,border:`0.5px solid ${T.border}`,
              borderRadius:8,padding:"10px 14px"}}>
              <div style={{fontSize:9,color:T.t2,fontWeight:600,
                letterSpacing:"1px",marginBottom:8}}>SCORE BREAKDOWN</div>
              <CatRow name="Index Trend"     score={scores.idx} detail={`Nifty:${n0(scores.price)} | 50D:${n0(scores.ma50)} | 200D:${n0(scores.ma200)}`}/>
              <CatRow name="Market Breadth"  score={scores.brd} detail="Proxy from index trend"/>
              <CatRow name="Institutional"   score={scores.ins} detail={`FII:${fii||"—"} | DII:${dii||"—"} Cr`}/>
              <CatRow name="Leadership"      score={scores.ldr} detail="Proxy from index trend"/>
              <CatRow name="Price & Volume"  score={scores.pv}  detail={`Day chg: ${scores.price&&scores.prev?((scores.price-scores.prev)/scores.prev*100).toFixed(2)+"%":"—"}`}/>
              <CatRow name="Volatility"      score={scores.vol} detail={`VIX: ${scores.vixVal?.toFixed(2)||"—"} ${scores.vixVal>20?"⚠ HIGH FEAR":scores.vixVal>15?"Elevated":"Low Fear"}`}/>
              <CatRow name="Global Context"  score={scores.glb} detail="Based on Nifty momentum (update via Sheet URL for S&P/NQ)"/>
            </div>
          )}

          {/* Sector strip */}
          {live&&(
            <div style={{background:T.bg2,border:`0.5px solid ${T.border}`,
              borderRadius:8,padding:"10px 14px"}}>
              <div style={{fontSize:9,color:T.t2,fontWeight:600,
                letterSpacing:"1px",marginBottom:8}}>SECTOR PERFORMANCE (TODAY)</div>
              <SectorStrip live={live}/>
            </div>
          )}

          {/* Nifty 50 Chart */}
          <div style={{background:T.bg2,border:`0.5px solid ${T.border}`,
            borderRadius:8,padding:"12px 14px",flex:1}}>
            <NiftyChart candles={candles}/>
          </div>
        </>
      )}
      </>
      }
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CPR + ICHIMOKU TAB
// ═══════════════════════════════════════════════════════════════════════════

const INDICES = [
  { label:"NIFTY 50",   sym:"NSE:NIFTY50-INDEX",    gap:50  },
  { label:"BANK NIFTY", sym:"NSE:NIFTYBANK-INDEX",  gap:100 },
  { label:"MIDCAP",     sym:"NSE:MIDCPNIFTY-INDEX", gap:25  },
];

// ── CPR calculation ──────────────────────────────────────────────────────────
function calcCPR(candles, tf) {
  if (!candles || candles.length < 2) return null;

  const group = (c, tf) => {
    if (tf === "D") return c.map((_,i)=>[i]);
    if (tf === "W") {
      const groups = []; let cur = [];
      c.forEach((cd,i) => {
        const d = new Date(cd[0]*1000);
        cur.push(i);
        if (d.getDay() === 5 || i===c.length-1) { groups.push(cur); cur=[]; }
      });
      if (cur.length) groups.push(cur);
      return groups;
    }
    if (tf === "M") {
      const groups = []; let cur = []; let lastM = -1;
      c.forEach((cd,i) => {
        const m = new Date(cd[0]*1000).getMonth();
        if (m !== lastM && cur.length) { groups.push(cur); cur=[]; }
        cur.push(i); lastM = m;
      });
      if (cur.length) groups.push(cur);
      return groups;
    }
    return [];
  };

  const recent = candles.slice(-120);
  const groups = group(recent, tf);
  if (groups.length < 2) return null;

  // Use previous completed period for CPR
  const prev = groups[groups.length-2];
  const H = Math.max(...prev.map(i=>recent[i][2]));
  const L = Math.min(...prev.map(i=>recent[i][3]));
  const C = recent[prev[prev.length-1]][4];

  const P  = (H + L + C) / 3;
  const BC = (H + L) / 2;
  const TC = P + (P - BC);

  return {
    pivot: +P.toFixed(2),
    bc:    +Math.min(BC,TC).toFixed(2),
    tc:    +Math.max(BC,TC).toFixed(2),
    high:  +H.toFixed(2),
    low:   +L.toFixed(2),
  };
}

// ── Ichimoku calculation ──────────────────────────────────────────────────────
function calcIchimoku(candles) {
  if (!candles || candles.length < 52) return null;
  const recent = candles.slice(-120);

  const midpoint = (arr, n) => {
    const slice = arr.slice(-n);
    const h = Math.max(...slice.map(c=>c[2]));
    const l = Math.min(...slice.map(c=>c[3]));
    return (h+l)/2;
  };

  const last = recent.length-1;
  const tenkan  = midpoint(recent, 9);
  const kijun   = midpoint(recent, 26);
  const senkouA = (tenkan + kijun) / 2;
  const senkouB = midpoint(recent, 52);
  const chikou  = recent[last][4]; // current close plotted 26 periods back
  const price   = recent[last][4];

  // Cloud boundaries (current)
  const cloudTop = Math.max(senkouA, senkouB);
  const cloudBot = Math.min(senkouA, senkouB);
  const cloudBull= senkouA >= senkouB;

  // Signal
  const aboveCloud = price > cloudTop;
  const belowCloud = price < cloudBot;
  const inCloud    = !aboveCloud && !belowCloud;
  const tkCross    = tenkan > kijun; // bullish TK cross

  let signal, signalColor;
  if (aboveCloud && tkCross)        { signal="STRONG BULL"; signalColor=T.green; }
  else if (aboveCloud)              { signal="BULL";         signalColor=T.green; }
  else if (belowCloud && !tkCross)  { signal="STRONG BEAR"; signalColor=T.red; }
  else if (belowCloud)              { signal="BEAR";         signalColor=T.red; }
  else                              { signal="NEUTRAL";      signalColor=T.amber; }

  return {
    tenkan:+tenkan.toFixed(2), kijun:+kijun.toFixed(2),
    senkouA:+senkouA.toFixed(2), senkouB:+senkouB.toFixed(2),
    cloudTop:+cloudTop.toFixed(2), cloudBot:+cloudBot.toFixed(2),
    cloudBull, price:+price.toFixed(2),
    aboveCloud, belowCloud, inCloud, tkCross,
    signal, signalColor,
  };
}

// ── 5-day price + CPR line chart ──────────────────────────────────────────────
function PriceCPRChart({ candles, cpr, tf }) {
  if (!candles || candles.length < 10 || !cpr) return null;

  // Last 5 trading days of candles
  const recent = candles.slice(-25); // ~5 days of daily bars
  const closes = recent.map(c=>c[4]);
  const dates  = recent.map(c=>new Date(c[0]*1000));

  const allVals = [...closes, cpr.tc, cpr.bc, cpr.pivot];
  const minV = Math.min(...allVals)*0.997;
  const maxV = Math.max(...allVals)*1.003;
  const range = maxV-minV||1;

  const W=800, H=160, PL=55, PR=10, PT=10, PB=20;
  const cW = (W-PL-PR)/(recent.length-1||1);
  const px = i => PL + i*cW;
  const py = v => PT + (1-(v-minV)/range)*(H-PT-PB);

  const closePts = closes.map((v,i)=>`${px(i)},${py(v)}`).join(" ");

  // Day separators
  const dayLines = [];
  let lastDay = -1;
  dates.forEach((d,i) => {
    if (d.getDate() !== lastDay) {
      dayLines.push({x:px(i), label:`${d.getDate()}/${d.getMonth()+1}`});
      lastDay = d.getDate();
    }
  });

  const price = closes[closes.length-1];
  const priceColor = price > cpr.tc?T.green:price < cpr.bc?T.red:T.amber;

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",
        alignItems:"center",marginBottom:6}}>
        <div style={{fontFamily:"monospace",fontSize:10,color:T.t2}}>
          Price vs CPR ({tf}) — Last 25 candles
        </div>
        <div style={{display:"flex",gap:12,fontFamily:"monospace",fontSize:10}}>
          <span style={{color:T.purple}}>TC: {cpr.tc}</span>
          <span style={{color:T.amber}}>P: {cpr.pivot}</span>
          <span style={{color:T.blue}}>BC: {cpr.bc}</span>
          <span style={{fontWeight:700,color:priceColor}}>
            LTP: {price.toFixed(1)}
            {price>cpr.tc?" ▲ ABOVE TC":price<cpr.bc?" ▼ BELOW BC":" ~ IN CPR"}
          </span>
        </div>
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`}
        style={{display:"block",overflow:"visible"}}>

        {/* Y grid */}
        {[cpr.tc, cpr.pivot, cpr.bc].map((v,i)=>{
          const cols = [T.purple, T.amber, T.blue];
          const labs = ["TC","P","BC"];
          return (
            <g key={i}>
              <line x1={PL} y1={py(v)} x2={W-PR} y2={py(v)}
                stroke={cols[i]} strokeWidth="0.8" strokeDasharray="4,3" opacity="0.8"/>
              <text x={PL-4} y={py(v)+4} textAnchor="end"
                fill={cols[i]} fontSize="8" fontWeight="600">{labs[i]}</text>
              <text x={W-PR+2} y={py(v)+4} textAnchor="start"
                fill={cols[i]} fontSize="7">{v}</text>
            </g>
          );
        })}

        {/* CPR zone fill */}
        <rect x={PL} y={py(cpr.tc)} width={W-PL-PR}
          height={py(cpr.bc)-py(cpr.tc)}
          fill={T.amber} opacity="0.06"/>

        {/* Day separators */}
        {dayLines.map((d,i)=>(
          <g key={i}>
            <line x1={d.x} y1={PT} x2={d.x} y2={H-PB}
              stroke={T.border} strokeWidth="0.5" strokeDasharray="2,2"/>
            <text x={d.x} y={H-6} textAnchor="middle"
              fill={T.t3} fontSize="7">{d.label}</text>
          </g>
        ))}

        {/* Area under price line */}
        <path d={`M${px(0)},${py(closes[0])} ${closes.map((v,i)=>`L${px(i)},${py(v)}`).join(" ")} L${px(closes.length-1)},${H-PB} L${px(0)},${H-PB} Z`}
          fill={priceColor} opacity="0.05"/>

        {/* Price line */}
        <polyline points={closePts} fill="none"
          stroke={priceColor} strokeWidth="2" strokeLinejoin="round"/>

        {/* Current price dot */}
        <circle cx={px(closes.length-1)} cy={py(price)} r="3.5"
          fill={priceColor} stroke={T.bg0} strokeWidth="1.5"/>

      </svg>
    </div>
  );
}

// ── Ichimoku Cloud Chart ───────────────────────────────────────────────────────
function IchimokuChart({ candles, ichi }) {
  if (!candles || candles.length < 52 || !ichi) return null;

  const recent = candles.slice(-60);
  const closes = recent.map(c=>c[4]);

  // Compute tenkan/kijun series
  const midSeries = (arr, n) => arr.map((_,i) => {
    if (i < n-1) return null;
    const sl = arr.slice(i-n+1, i+1);
    return (Math.max(...sl.map(c=>c[2]))+Math.min(...sl.map(c=>c[3])))/2;
  });

  const tenkanS  = midSeries(recent, 9);
  const kijunS   = midSeries(recent, 26);
  // Senkou A/B shifted forward 26 — show current cloud
  const senkouAS = recent.map((_,i) => {
    if (!tenkanS[i]||!kijunS[i]) return null;
    return (tenkanS[i]+kijunS[i])/2;
  });
  const senkouBS = midSeries(recent, 52);

  const allVals = [...closes,
    ...tenkanS.filter(Boolean), ...kijunS.filter(Boolean),
    ...senkouAS.filter(Boolean), ...senkouBS.filter(Boolean)
  ];
  const minV = Math.min(...allVals)*0.997;
  const maxV = Math.max(...allVals)*1.003;
  const range= maxV-minV||1;

  const W=800, H=180, PL=55, PR=10, PT=10, PB=20;
  const cW = (W-PL-PR)/(recent.length-1||1);
  const px = i => PL+i*cW;
  const py = v => PT+(1-(v-minV)/range)*(H-PT-PB);

  const linePts = (arr) => arr.map((v,i)=>v!=null?`${px(i)},${py(v)}`:null);

  // Cloud path
  const cloudPath = () => {
    const pts = recent.map((_,i)=>({
      a:senkouAS[i], b:senkouBS[i], x:px(i)
    })).filter(p=>p.a&&p.b);
    if (!pts.length) return null;
    const top = pts.map(p=>`${p.x},${py(Math.max(p.a,p.b))}`).join(" ");
    const bot = [...pts].reverse().map(p=>`${p.x},${py(Math.min(p.a,p.b))}`).join(" ");
    return `M${top} L${bot} Z`;
  };

  const cp = cloudPath();
  const cloudColor = ichi.cloudBull ? T.green : T.red;

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",
        alignItems:"center",marginBottom:6}}>
        <div style={{fontFamily:"monospace",fontSize:10,color:T.t2}}>
          Ichimoku Cloud — Last 60 candles
        </div>
        <div style={{display:"flex",gap:10,fontFamily:"monospace",fontSize:10}}>
          <span style={{color:"#f97316"}}>T: {ichi.tenkan}</span>
          <span style={{color:"#06b6d4"}}>K: {ichi.kijun}</span>
          <span style={{color:T.green}}>SpA: {ichi.senkouA}</span>
          <span style={{color:T.red}}>SpB: {ichi.senkouB}</span>
        </div>
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`}
        style={{display:"block",overflow:"visible"}}>

        {/* Cloud */}
        {cp&&<path d={cp} fill={cloudColor} opacity="0.12"/>}

        {/* Senkou A */}
        <polyline points={linePts(senkouAS).filter(Boolean).join(" ")}
          fill="none" stroke={T.green} strokeWidth="1" opacity="0.6"/>
        {/* Senkou B */}
        <polyline points={linePts(senkouBS).filter(Boolean).join(" ")}
          fill="none" stroke={T.red} strokeWidth="1" opacity="0.6"/>
        {/* Kijun */}
        <polyline points={linePts(kijunS).filter(Boolean).join(" ")}
          fill="none" stroke="#06b6d4" strokeWidth="1.5" strokeDasharray="5,2"/>
        {/* Tenkan */}
        <polyline points={linePts(tenkanS).filter(Boolean).join(" ")}
          fill="none" stroke="#f97316" strokeWidth="1.5"/>

        {/* Price line */}
        <polyline points={closes.map((v,i)=>`${px(i)},${py(v)}`).join(" ")}
          fill="none" stroke={T.t0} strokeWidth="2"/>
        <circle cx={px(closes.length-1)} cy={py(closes[closes.length-1])} r="3"
          fill={T.t0} stroke={T.bg0} strokeWidth="1.5"/>

        {/* Cloud label */}
        <text x={W-PR-2} y={py((ichi.cloudTop+ichi.cloudBot)/2)+4}
          textAnchor="end" fill={cloudColor} fontSize="8" fontWeight="600">
          {ichi.cloudBull?"BULL CLOUD":"BEAR CLOUD"}
        </text>

        {/* Legend */}
        <g transform={`translate(${PL},${H-8})`}>
          <line x1="0" y1="0" x2="14" y2="0" stroke="#f97316" strokeWidth="1.5"/>
          <text x="17" y="3" fill={T.t3} fontSize="7">Tenkan</text>
          <line x1="55" y1="0" x2="69" y2="0" stroke="#06b6d4"
            strokeWidth="1.5" strokeDasharray="4,2"/>
          <text x="72" y="3" fill={T.t3} fontSize="7">Kijun</text>
          <line x1="110" y1="0" x2="124" y2="0" stroke={T.green} strokeWidth="1"/>
          <text x="127" y="3" fill={T.t3} fontSize="7">Senkou A</text>
          <line x1="175" y1="0" x2="189" y2="0" stroke={T.red} strokeWidth="1"/>
          <text x="192" y="3" fill={T.t3} fontSize="7">Senkou B</text>
        </g>
      </svg>
    </div>
  );
}

// ── Combined Signal Badge ─────────────────────────────────────────────────────
function CombinedSignal({ cpr, ichi, tf }) {
  if (!cpr || !ichi) return null;

  const price = ichi.price;
  const cprPos = price > cpr.tc ? "ABOVE" : price < cpr.bc ? "BELOW" : "IN";
  const cprColor = cprPos==="ABOVE"?T.green:cprPos==="BELOW"?T.red:T.amber;
  const cprSignal = cprPos==="ABOVE"?"Bullish":cprPos==="BELOW"?"Bearish":"Neutral";

  // Combined
  let combined, combinedColor;
  if (cprPos==="ABOVE" && ichi.aboveCloud && ichi.tkCross) {
    combined="🔥 STRONG BULL"; combinedColor=T.green;
  } else if (cprPos==="ABOVE" && (ichi.aboveCloud||ichi.tkCross)) {
    combined="🟢 BULLISH"; combinedColor=T.green;
  } else if (cprPos==="BELOW" && ichi.belowCloud && !ichi.tkCross) {
    combined="🔴 STRONG BEAR"; combinedColor=T.red;
  } else if (cprPos==="BELOW" || ichi.belowCloud) {
    combined="🟠 BEARISH"; combinedColor=T.red;
  } else {
    combined="🟡 NEUTRAL"; combinedColor=T.amber;
  }

  return (
    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:10}}>
      {/* Combined */}
      <div style={{background:combinedColor+"11",border:`1px solid ${combinedColor}`,
        borderRadius:8,padding:"10px 12px",textAlign:"center",
        boxShadow:`0 0 16px ${combinedColor}22`,gridColumn:"1"}}>
        <div style={{fontSize:8,color:T.t2,marginBottom:4,letterSpacing:"1px"}}>
          COMBINED SIGNAL ({tf})
        </div>
        <div style={{fontFamily:"monospace",fontSize:16,fontWeight:700,color:combinedColor}}>
          {combined}
        </div>
      </div>
      {/* CPR */}
      <div style={{background:T.bg2,border:`0.5px solid ${cprColor}`,
        borderRadius:8,padding:"10px 12px"}}>
        <div style={{fontSize:8,color:T.t2,marginBottom:4}}>CPR POSITION</div>
        <div style={{fontFamily:"monospace",fontSize:13,fontWeight:600,color:cprColor}}>
          {cprPos==="ABOVE"?"▲ Above TC":cprPos==="BELOW"?"▼ Below BC":"~ In CPR"}
        </div>
        <div style={{fontFamily:"monospace",fontSize:9,color:T.t2,marginTop:3}}>
          TC:{cpr.tc} · P:{cpr.pivot} · BC:{cpr.bc}
        </div>
        <div style={{fontSize:9,color:cprColor,marginTop:2}}>→ {cprSignal}</div>
      </div>
      {/* Ichimoku */}
      <div style={{background:T.bg2,border:`0.5px solid ${ichi.signalColor}`,
        borderRadius:8,padding:"10px 12px"}}>
        <div style={{fontSize:8,color:T.t2,marginBottom:4}}>ICHIMOKU</div>
        <div style={{fontFamily:"monospace",fontSize:13,fontWeight:600,
          color:ichi.signalColor}}>{ichi.signal}</div>
        <div style={{fontFamily:"monospace",fontSize:9,color:T.t2,marginTop:3}}>
          {ichi.aboveCloud?"Above cloud":ichi.belowCloud?"Below cloud":"In cloud"}
          {" · "}{ichi.tkCross?"T>K ✓":"T<K ✗"}
        </div>
        <div style={{fontSize:9,color:ichi.signalColor,marginTop:2}}>
          Cloud: {ichi.cloudBull?"Bullish ▲":"Bearish ▼"}
        </div>
      </div>
      {/* Key levels */}
      <div style={{background:T.bg2,border:`0.5px solid ${T.border}`,
        borderRadius:8,padding:"10px 12px"}}>
        <div style={{fontSize:8,color:T.t2,marginBottom:4}}>KEY LEVELS</div>
        {[
          {l:"Tenkan",v:ichi.tenkan,c:"#f97316"},
          {l:"Kijun", v:ichi.kijun, c:"#06b6d4"},
          {l:"Cloud Top",v:ichi.cloudTop,c:ichi.cloudBull?T.green:T.red},
          {l:"Cloud Bot",v:ichi.cloudBot,c:ichi.cloudBull?T.green:T.red},
        ].map(x=>(
          <div key={x.l} style={{display:"flex",justifyContent:"space-between",
            fontFamily:"monospace",fontSize:9,marginBottom:1}}>
            <span style={{color:T.t3}}>{x.l}</span>
            <span style={{color:x.c,fontWeight:500}}>{x.v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Index CPR + Ichimoku Panel ────────────────────────────────────────────────
export function IndexCPRPanel({ tokenData }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [activeTF,    setActiveTF]    = useState("D");
  const [data,        setData]        = useState({});
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState(null);

  const loadIndex = async (idx) => {
    const sym = INDICES[idx].sym;
    if (data[sym]) return; // already loaded
    if (!tokenData) return;
    setLoading(true);
    setError(null);
    try {
      const now  = new Date();
      const from = new Date(); from.setFullYear(from.getFullYear()-1);
      const fmt  = d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
      const url  = `https://api-t1.fyers.in/data/history?symbol=${encodeURIComponent(sym)}&resolution=D&date_format=1&range_from=${fmt(from)}&range_to=${fmt(now)}&cont_flag=1`;
      const r = await fetch(url, {
        headers:{Authorization:`${tokenData.app_id}:${tokenData.access_token}`}
      });
      if (!r.ok) throw new Error(`${r.status}`);
      const d = await r.json();
      if (d.s!=="ok") throw new Error(d.message||d.s);
      setData(prev=>({...prev,[sym]:d.candles||[]}));
    } catch(e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // Load on mount and index switch
  useState(()=>{ if(tokenData) loadIndex(0); });
  const handleIndexChange = (idx) => {
    setActiveIndex(idx);
    if (tokenData) loadIndex(idx);
  };

  const sym      = INDICES[activeIndex].sym;
  const candles  = data[sym] || [];
  const cpr      = calcCPR(candles, activeTF);
  const ichi     = calcIchimoku(candles);

  return (
    <div style={{padding:"12px 16px",display:"flex",flexDirection:"column",gap:10}}>

      {/* Index selector */}
      <div style={{display:"flex",gap:8,alignItems:"center",flexShrink:0}}>
        <span style={{fontFamily:"monospace",fontSize:10,color:T.amber,
          fontWeight:600,letterSpacing:"1px"}}>📐 CPR + ICHIMOKU</span>
        <div style={{display:"flex",gap:4}}>
          {INDICES.map((idx,i)=>(
            <button key={idx.sym} onClick={()=>handleIndexChange(i)}
              style={{fontFamily:"monospace",fontSize:10,padding:"5px 14px",
                borderRadius:4,cursor:"pointer",
                background:activeIndex===i?T.amber:T.bg3,
                border:`0.5px solid ${activeIndex===i?T.amber:T.border}`,
                color:activeIndex===i?T.bg0:T.t1,
                fontWeight:activeIndex===i?600:400}}>
              {idx.label}
            </button>
          ))}
        </div>
        {/* Timeframe toggle */}
        <div style={{display:"flex",gap:3,marginLeft:8}}>
          {["D","W","M"].map(tf=>(
            <button key={tf} onClick={()=>setActiveTF(tf)}
              style={{fontFamily:"monospace",fontSize:10,padding:"4px 12px",
                borderRadius:4,cursor:"pointer",
                background:activeTF===tf?T.blue:T.bg3,
                border:`0.5px solid ${activeTF===tf?T.blue:T.border}`,
                color:activeTF===tf?T.t0:T.t2,
                fontWeight:activeTF===tf?600:400}}>
              {tf==="D"?"Daily":tf==="W"?"Weekly":"Monthly"}
            </button>
          ))}
        </div>
        {loading&&(
          <div style={{width:16,height:16,border:`2px solid ${T.border}`,
            borderTopColor:T.amber,borderRadius:"50%",
            animation:"spin 1s linear infinite",marginLeft:8}}/>
        )}
      </div>

      {error&&(
        <div style={{background:T.redDim,border:`0.5px solid ${T.red}`,
          borderRadius:4,padding:"6px 10px",fontSize:10,
          color:T.red,fontFamily:"monospace"}}>❌ {error}</div>
      )}

      {!tokenData&&(
        <div style={{textAlign:"center",padding:"40px",color:T.t3,
          fontFamily:"monospace",fontSize:11}}>
          Token required — run get_token.py first
        </div>
      )}

      {candles.length>0&&(
        <>
          {/* Combined signal */}
          <CombinedSignal cpr={cpr} ichi={ichi} tf={activeTF}/>

          {/* Price + CPR chart */}
          <div style={{background:T.bg2,border:`0.5px solid ${T.border}`,
            borderRadius:8,padding:"12px 14px"}}>
            <PriceCPRChart candles={candles} cpr={cpr} tf={activeTF}/>
          </div>

          {/* Ichimoku chart */}
          <div style={{background:T.bg2,border:`0.5px solid ${T.border}`,
            borderRadius:8,padding:"12px 14px"}}>
            <IchimokuChart candles={candles} ichi={ichi}/>
          </div>
        </>
      )}

      {!loading&&candles.length===0&&tokenData&&(
        <div style={{textAlign:"center",padding:"40px",color:T.t3,
          fontFamily:"monospace",fontSize:11}}>
          Loading {INDICES[activeIndex].label} data...
        </div>
      )}
    </div>
  );
}
