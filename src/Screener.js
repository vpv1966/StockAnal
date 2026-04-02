import { useState, useCallback, useRef } from "react";
import { fetchHistory } from "./fyersApi";
import { computeAllIndicators } from "./indicators";

// ── Curated universe by sector ───────────────────────────────────────────────
const UNIVERSE = {
  Pharma: ["SUNPHARMA","DRREDDY","CIPLA","DIVISLAB","LUPIN","AUROPHARMA","TORNTPHARM","ALKEM","MANKIND","ZYDUSLIFE"],
  Power:  ["NTPC","POWERGRID","TATAPOWER","NHPC","ADANIPOWER","CESC","SJVN","RECLTD","PFC","JSWENERGY"],
  Auto:   ["MARUTI","TATAMOTORS","M&M","BAJAJ-AUTO","HEROMOTOCO","EICHERMOT","ASHOKLEY","TVSMOTORS","MOTHERSON","BOSCHLTD"],
  IT:     ["TCS","INFY","WIPRO","HCLTECH","TECHM","LTIM","MPHASIS","PERSISTENT","COFORGE","TATAELXSI"],
  Banking:["HDFCBANK","ICICIBANK","KOTAKBANK","AXISBANK","SBIN","FEDERALBNK","IDFCFIRSTB","BANDHANBNK","AUBANK","INDUSINDBK"],
  Energy: ["RELIANCE","ONGC","BPCL","IOC","GAIL","IGL","MGL","HINDPETRO","PETRONET","ATGL"],
  FMCG:   ["HINDUNILVR","ITC","NESTLEIND","BRITANNIA","DABUR","MARICO","GODREJCP","COLPAL","EMAMILTD","TATACONSUM"],
  Metals: ["TATASTEEL","JSWSTEEL","HINDALCO","SAIL","NMDC","VEDL","HINDZINC","MOIL","NALCO","APLAPOLLO"],
};

const ALL_STOCKS = [...new Set(Object.values(UNIVERSE).flat())];

const T = {
  bg0:"#09090b",bg1:"#0f1014",bg2:"#16191f",bg3:"#1e2229",bg4:"#252c35",
  border:"#2a3240",borderHi:"#3d4d60",
  t0:"#e2e8f0",t1:"#94a3b8",t2:"#546070",t3:"#2d3a47",
  amber:"#f59e0b",amberDim:"#78350f",amberBright:"#fcd34d",
  green:"#22c55e",greenDim:"#14532d",
  red:"#ef4444",redDim:"#7f1d1d",
  blue:"#3b82f6",blueDim:"#1e3a5f",
};

const col   = v => v >= 0 ? T.green : T.red;
const fmtP  = v => v != null ? `₹${(+v).toLocaleString("en-IN")}` : "N/A";
const fmtPct= v => v != null ? `${(+v)>=0?"+":""}${(+v).toFixed(2)}%` : "N/A";

// Score a stock for "entry opportunity today"
function entryScore(ind) {
  let score = 0;
  const reasons = [];

  // Must-have filters
  if (!ind) return { score: -99, reasons: ["No data"], pass: false };

  // Stage 2 — mandatory
  if (ind.stage === 2) { score += 25; reasons.push("Stage 2 ✓"); }
  else if (ind.stage === 1) { score += 5; reasons.push("Stage 1"); }
  else { score -= 20; }

  // Price above all key MAs
  if (ind.ma50  && ind.price > ind.ma50)  { score += 10; reasons.push("Above MA50 ✓"); }
  if (ind.ma150 && ind.price > ind.ma150) { score += 10; reasons.push("Above MA150 ✓"); }
  if (ind.ma200 && ind.price > ind.ma200) { score += 10; reasons.push("Above MA200 ✓"); }

  // RSI in sweet spot 45–65 (not overbought, trending)
  if (ind.rsi >= 45 && ind.rsi <= 65) { score += 15; reasons.push(`RSI ${ind.rsi} ✓`); }
  else if (ind.rsi > 65 && ind.rsi < 72) { score += 5; reasons.push(`RSI ${ind.rsi}`); }
  else if (ind.rsi > 72) { score -= 10; reasons.push(`RSI ${ind.rsi} OB`); }
  else if (ind.rsi < 45) { score -= 5; }

  // MACD bullish crossover
  if (ind.macd && ind.macdSignal && ind.macd > ind.macdSignal) {
    score += 12; reasons.push("MACD Bull X ✓");
  }

  // Volume expanding
  if (ind.relVol >= 1.3) { score += 10; reasons.push(`Vol ${ind.relVol}x ✓`); }
  else if (ind.relVol >= 1.0) { score += 5; }

  // ADX trending
  if (ind.adx >= 25) { score += 8; reasons.push(`ADX ${ind.adx} ✓`); }

  // Minervini score
  const mvP = ind.mvScore || 0;
  if (mvP >= 7) { score += 15; reasons.push(`Minervini ${mvP}/8 ✓`); }
  else if (mvP >= 5) { score += 8; }

  // Close to 52W high (momentum) but not overextended
  if (ind.fromHigh >= 88 && ind.fromHigh <= 100) { score += 8; reasons.push("Near 52W High ✓"); }
  else if (ind.fromHigh < 75) { score -= 5; }

  // Guppy bullish
  if (ind.guppy?.includes("Bull")) { score += 5; reasons.push("Guppy Bull ✓"); }

  // TTM firing
  if (ind.ttm === "+") { score += 5; reasons.push("TTM Firing ✓"); }

  // Daily change positive (uptrend today)
  if (ind.changePct > 0) { score += 5; reasons.push(`+${ind.changePct}% today`); }

  const pass = ind.stage === 2
    && ind.price > (ind.ma50 || 0)
    && ind.price > (ind.ma200 || 0)
    && ind.rsi >= 40 && ind.rsi <= 75
    && ind.macd > ind.macdSignal
    && ind.mvScore >= 5;

  return { score, reasons, pass };
}

function getSetupLabel(score) {
  if (score >= 90) return { label: "🔥 PRIME ENTRY", color: T.green, bg: T.greenDim };
  if (score >= 75) return { label: "⚡ STRONG BUY", color: T.green, bg: T.greenDim };
  if (score >= 60) return { label: "👀 WATCH NOW", color: T.amber, bg: T.amberDim };
  if (score >= 45) return { label: "📋 ON RADAR", color: T.blue, bg: T.blueDim };
  return { label: "❌ SKIP", color: T.t2, bg: T.bg3 };
}

// ── Screener Component ────────────────────────────────────────────────────────
export default function Screener({ tokenData, onSelectStock }) {
  const [running, setRunning]     = useState(false);
  const [results, setResults]     = useState([]);
  const [progress, setProgress]   = useState({ done: 0, total: 0 });
  const [sector, setSector]       = useState("All");
  const [sortBy, setSortBy]       = useState("score");
  const [filterPass, setFilterPass] = useState(false);
  const [elapsed, setElapsed]     = useState(0);
  const cancelRef = useRef(false);
  const timerRef  = useRef(null);

  const sectors = ["All", ...Object.keys(UNIVERSE)];
  const universe = sector === "All" ? ALL_STOCKS : UNIVERSE[sector];

  const runScan = useCallback(async () => {
    if (!tokenData) { alert("Token not loaded — run get_token.py first"); return; }
    cancelRef.current = false;
    setRunning(true);
    setResults([]);
    setProgress({ done: 0, total: universe.length });
    setElapsed(0);

    const start = Date.now();
    timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now()-start)/1000)), 500);

    const BATCH = 5; // parallel calls per batch
    let done = 0;

    for (let i = 0; i < universe.length; i += BATCH) {
      if (cancelRef.current) break;
      const batch = universe.slice(i, i + BATCH);

      const batchResults = await Promise.all(batch.map(async (sym) => {
        try {
          const candles = await fetchHistory(sym, tokenData.access_token, tokenData.app_id);
          if (!candles?.length) return null;
          const ind = computeAllIndicators(candles);
          if (!ind) return null;
          const { score, reasons, pass } = entryScore(ind);
          return { sym, ind, score, reasons, pass };
        } catch { return null; }
      }));

      const valid = batchResults.filter(Boolean);
      done += batch.length;
      setProgress({ done, total: universe.length });
      setResults(prev => {
        const updated = [...prev, ...valid];
        return updated.sort((a,b) => b.score - a.score);
      });

      // Small delay between batches to avoid rate limits
      if (i + BATCH < universe.length) await new Promise(r => setTimeout(r, 300));
    }

    clearInterval(timerRef.current);
    setRunning(false);
  }, [tokenData, universe]);

  const cancel = () => { cancelRef.current = true; clearInterval(timerRef.current); setRunning(false); };

  const displayed = results
    .filter(r => filterPass ? r.pass : true)
    .sort((a,b) => {
      if (sortBy === "score")    return b.score - a.score;
      if (sortBy === "rsi")      return (a.ind?.rsi||99) - (b.ind?.rsi||99);
      if (sortBy === "change")   return (b.ind?.changePct||0) - (a.ind?.changePct||0);
      if (sortBy === "minervini")return (b.ind?.mvScore||0) - (a.ind?.mvScore||0);
      if (sortBy === "rs")       return (b.ind?.rs||0) - (a.ind?.rs||0);
      return 0;
    })
    .slice(0, filterPass ? 50 : 20); // show top 20 or top 50 passing

  const passCount = results.filter(r=>r.pass).length;
  const pct = progress.total > 0 ? (progress.done / progress.total * 100) : 0;

  return (
    <div style={{padding:"0 16px 32px",animation:"fadeUp 0.3s ease"}}>

      {/* Header */}
      <div style={{padding:"14px 0",borderBottom:`1px solid ${T.border}`,marginBottom:14}}>
        <div style={{fontFamily:"monospace",fontSize:10,color:T.amber,letterSpacing:"3px",marginBottom:4}}>DAILY OPPORTUNITY SCREENER</div>
        <div style={{fontSize:20,fontWeight:500,color:T.t0,marginBottom:4}}>Top Entry Setups — Today</div>
        <div style={{fontSize:12,color:T.t1}}>
          Scans {universe.length} stocks · Filters: Stage 2 · Above MAs · RSI 40–75 · MACD Bull X · Minervini ≥5/8
        </div>
      </div>

      {/* Controls */}
      <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center",marginBottom:14}}>
        {/* Sector filter */}
        <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
          {sectors.map(s=>(
            <button key={s} onClick={()=>setSector(s)} disabled={running}
              style={{fontFamily:"monospace",fontSize:10,padding:"5px 12px",borderRadius:3,cursor:"pointer",
                background:sector===s?T.amber:T.bg3,
                border:`0.5px solid ${sector===s?T.amber:T.border}`,
                color:sector===s?T.bg0:T.t1,fontWeight:sector===s?600:400}}>
              {s}
            </button>
          ))}
        </div>

        <div style={{marginLeft:"auto",display:"flex",gap:8}}>
          <button onClick={()=>setFilterPass(v=>!v)}
            style={{fontFamily:"monospace",fontSize:10,padding:"6px 14px",borderRadius:3,cursor:"pointer",
              background:filterPass?T.greenDim:T.bg3,
              border:`0.5px solid ${filterPass?T.green:T.border}`,
              color:filterPass?T.green:T.t1}}>
            {filterPass?`✓ Passing Only (${passCount})`:"Show All"}
          </button>
          {running
            ? <button onClick={cancel} style={{fontFamily:"monospace",fontSize:11,padding:"6px 16px",background:T.redDim,border:`0.5px solid ${T.red}`,borderRadius:3,color:T.red,cursor:"pointer",fontWeight:600}}>⏹ STOP</button>
            : <button onClick={runScan} style={{fontFamily:"monospace",fontSize:11,padding:"6px 20px",background:T.amber,border:"none",borderRadius:3,color:T.bg0,cursor:"pointer",fontWeight:700}}>▶ RUN SCAN</button>
          }
        </div>
      </div>

      {/* Progress */}
      {(running || progress.done > 0) && (
        <div style={{marginBottom:14,background:T.bg2,border:`0.5px solid ${T.border}`,borderRadius:8,padding:12}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:6,fontSize:11,fontFamily:"monospace",color:T.t1}}>
            <span>
              {running
                ? <><span style={{animation:"pulse 1s infinite",display:"inline-block",color:T.amber}}>●</span> Scanning {progress.done}/{progress.total} stocks...</>
                : <span style={{color:T.green}}>✓ Scan complete — {progress.done} stocks scanned</span>}
            </span>
            <span style={{color:T.t2}}>{elapsed}s · {passCount} passing · {results.length} scanned</span>
          </div>
          <div style={{height:6,background:T.bg3,borderRadius:3,overflow:"hidden"}}>
            <div style={{height:"100%",width:`${pct}%`,background:running?T.amber:T.green,borderRadius:3,transition:"width 0.3s ease"}}/>
          </div>
          {running && (
            <div style={{marginTop:6,fontSize:10,color:T.t3,fontFamily:"monospace"}}>
              Scanning in batches of 5 · {progress.total - progress.done} remaining
            </div>
          )}
        </div>
      )}

      {/* Sort bar */}
      {results.length > 0 && (
        <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:10,fontSize:11}}>
          <span style={{color:T.t2,fontFamily:"monospace",fontSize:10}}>SORT BY:</span>
          {[["score","Setup Score"],["change","Change%"],["rsi","RSI"],["minervini","Minervini"],["rs","RS Score"]].map(([k,l])=>(
            <button key={k} onClick={()=>setSortBy(k)}
              style={{fontFamily:"monospace",fontSize:10,padding:"3px 10px",borderRadius:3,cursor:"pointer",
                background:sortBy===k?T.bg4:T.bg2,
                border:`0.5px solid ${sortBy===k?T.borderHi:T.border}`,
                color:sortBy===k?T.t0:T.t2}}>
              {l}
            </button>
          ))}
          <span style={{marginLeft:"auto",fontSize:10,color:T.t2,fontFamily:"monospace"}}>
            Showing top {displayed.length} of {results.length}
          </span>
        </div>
      )}

      {/* Results table */}
      {displayed.length > 0 && (
        <div style={{background:T.bg2,border:`0.5px solid ${T.border}`,borderRadius:8,overflow:"hidden"}}>
          <table style={{width:"100%",borderCollapse:"collapse",tableLayout:"fixed"}}>
            <thead>
              <tr style={{background:T.bg3}}>
                {[
                  ["#",    "4%"],["Stock", "9%"],["Setup","11%"],["Score","6%"],["Price","8%"],
                  ["Chg%", "7%"],["RSI",   "6%"],["MACD",  "7%"],["Stage","9%"],
                  ["MV",   "6%"],["RS",    "6%"],["ADX",   "6%"],["Signals","15%"],
                ].map(([h,w])=>(
                  <th key={h} style={{fontSize:9,textTransform:"uppercase",letterSpacing:"1px",color:T.t2,textAlign:"left",padding:"8px 8px",borderBottom:`0.5px solid ${T.border}`,width:w,fontFamily:"monospace"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayed.map((r, idx) => {
                const { sym, ind, score, reasons, pass } = r;
                const setup = getSetupLabel(score);
                const isTop3 = idx < 3;
                return (
                  <tr key={sym}
                    onClick={() => onSelectStock(sym)}
                    style={{borderBottom:`0.5px solid ${T.border}`,cursor:"pointer",background:isTop3?T.bg3:"transparent",transition:"background 0.1s"}}
                    onMouseEnter={e=>e.currentTarget.style.background=T.bg4}
                    onMouseLeave={e=>e.currentTarget.style.background=isTop3?T.bg3:"transparent"}>
                    <td style={{padding:"8px 8px",fontFamily:"monospace",fontSize:11,color:isTop3?T.amber:T.t2,fontWeight:isTop3?600:400}}>
                      {idx+1}
                      {isTop3&&<span style={{marginLeft:3}}>{idx===0?"🥇":idx===1?"🥈":"🥉"}</span>}
                    </td>
                    <td style={{padding:"8px 8px",fontFamily:"monospace",fontSize:11,fontWeight:600,color:T.t0}}>
                      {sym}
                      {pass&&<span style={{marginLeft:4,fontSize:8,padding:"1px 4px",borderRadius:2,background:T.greenDim,color:T.green}}>✓</span>}
                    </td>
                    <td style={{padding:"8px 8px"}}>
                      <span style={{fontSize:9,padding:"3px 6px",borderRadius:3,background:setup.bg,color:setup.color,fontWeight:600,whiteSpace:"nowrap"}}>{setup.label}</span>
                    </td>
                    <td style={{padding:"8px 8px",fontFamily:"monospace",fontSize:12,fontWeight:600,color:score>=75?T.green:score>=55?T.amber:T.t2}}>{score}</td>
                    <td style={{padding:"8px 8px",fontFamily:"monospace",fontSize:11,color:T.t0}}>{fmtP(ind.price)}</td>
                    <td style={{padding:"8px 8px",fontFamily:"monospace",fontSize:11,color:col(ind.changePct),fontWeight:500}}>{fmtPct(ind.changePct)}</td>
                    <td style={{padding:"8px 8px",fontFamily:"monospace",fontSize:11,color:ind.rsi>70?T.red:ind.rsi<40?T.green:T.t0}}>{ind.rsi}</td>
                    <td style={{padding:"8px 8px",fontFamily:"monospace",fontSize:10,color:ind.macd>ind.macdSignal?T.green:T.red}}>
                      {ind.macd>ind.macdSignal?"Bull ▲":"Bear ▼"}
                    </td>
                    <td style={{padding:"8px 8px",fontFamily:"monospace",fontSize:10,color:ind.stage===2?T.green:ind.stage>=3?T.red:T.amber}}>
                      {["","Basing","Advancing","Topping","Declining"][ind.stage]||"N/A"}
                    </td>
                    <td style={{padding:"8px 8px",fontFamily:"monospace",fontSize:11}}>
                      <div style={{display:"flex",alignItems:"center",gap:4}}>
                        <div style={{height:4,width:`${(ind.mvScore||0)/8*40}px`,background:ind.mvScore>=6?T.green:T.amber,borderRadius:2,minWidth:2}}/>
                        <span style={{color:ind.mvScore>=6?T.green:T.t1,fontSize:10}}>{ind.mvScore}/8</span>
                      </div>
                    </td>
                    <td style={{padding:"8px 8px",fontFamily:"monospace",fontSize:11,color:ind.rs>=75?T.green:ind.rs>=50?T.amber:T.red}}>{ind.rs}</td>
                    <td style={{padding:"8px 8px",fontFamily:"monospace",fontSize:11,color:ind.adx>25?T.green:T.t2}}>{ind.adx||"N/A"}</td>
                    <td style={{padding:"8px 8px",fontSize:9,color:T.t2}}>
                      <div style={{overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis",maxWidth:130}}>
                        {reasons.slice(0,4).join(" · ")}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty state */}
      {!running && results.length === 0 && (
        <div style={{textAlign:"center",padding:"48px 16px",color:T.t3}}>
          <div style={{fontSize:32,marginBottom:12}}>📡</div>
          <div style={{fontFamily:"monospace",fontSize:12,color:T.t2,marginBottom:8}}>Select a sector and hit RUN SCAN</div>
          <div style={{fontSize:11,color:T.t3}}>Scans {universe.length} stocks · Results appear live as each batch completes</div>
        </div>
      )}
    </div>
  );
}
