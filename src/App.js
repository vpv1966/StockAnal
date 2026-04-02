import { useState, useCallback, useRef, useEffect } from "react";
import { computeAllIndicators, calcMultiCPR } from "./indicators";
import { loadToken, fetchHistory, fetchQuote, fetchPeerQuote, fetchMarketContext, fetchFundamentals, fetchNSEQuote, getExpiryHL, getPrevMonthExpiry, fetchCircuitChanges } from "./fyersApi";
import Screener from "./Screener";
import MarketBreadth from "./MarketBreadth";
import Nifty500Scanner from "./Nifty500Scanner";
import IntradayPulse from "./IntradayPulse";
import Screens from "./Screens";
import FundamentalAnalysis from "./FundamentalAnalysis";

const T = {
  bg0:"#09090b",bg1:"#0f1014",bg2:"#16191f",bg3:"#1e2229",bg4:"#252c35",
  border:"#2a3240",borderHi:"#3d4d60",
  t0:"#f1f5f9",           // primary text — bright white
  t1:"#cbd5e1",           // secondary text — light grey-blue (was #94a3b8)
  t2:"#94a3b8",           // labels/captions — medium (was #546070 — too dark)
  t3:"#546070",           // muted/disabled — only for truly background info
  amber:"#f59e0b",amberDim:"#78350f",amberBright:"#fcd34d",
  green:"#22c55e",greenDim:"#14532d",
  red:"#ef4444",redDim:"#7f1d1d",
  blue:"#3b82f6",blueDim:"#1e3a5f",
  purple:"#a855f7",teal:"#14b8a6",
};

const SECTOR_PEERS = {
  Pharmaceuticals:["NSE:DRREDDY-EQ","NSE:CIPLA-EQ","NSE:DIVISLAB-EQ","NSE:LUPIN-EQ"],
  Power:["NSE:NTPC-EQ","NSE:POWERGRID-EQ","NSE:TATAPOWER-EQ","NSE:NHPC-EQ"],
  Auto:["NSE:MARUTI-EQ","NSE:TATAMOTORS-EQ","NSE:BAJAJ-AUTO-EQ","NSE:HEROMOTOCO-EQ"],
  Banking:["NSE:HDFCBANK-EQ","NSE:ICICIBANK-EQ","NSE:KOTAKBANK-EQ","NSE:AXISBANK-EQ"],
  IT:["NSE:TCS-EQ","NSE:INFY-EQ","NSE:WIPRO-EQ","NSE:HCLTECH-EQ"],
  Energy:["NSE:RELIANCE-EQ","NSE:ONGC-EQ","NSE:BPCL-EQ","NSE:IOC-EQ"],
  Metals:["NSE:TATASTEEL-EQ","NSE:JSWSTEEL-EQ","NSE:HINDALCO-EQ","NSE:SAIL-EQ"],
  FMCG:["NSE:HINDUNILVR-EQ","NSE:ITC-EQ","NSE:NESTLEIND-EQ","NSE:BRITANNIA-EQ"],
  Default:["NSE:RELIANCE-EQ","NSE:TCS-EQ","NSE:HDFCBANK-EQ","NSE:INFY-EQ"],
};
const SECTOR_MAP = {
  SUNPHARMA:"Pharmaceuticals",DRREDDY:"Pharmaceuticals",CIPLA:"Pharmaceuticals",DIVISLAB:"Pharmaceuticals",LUPIN:"Pharmaceuticals",AUROPHARMA:"Pharmaceuticals",
  NTPC:"Power",POWERGRID:"Power",TATAPOWER:"Power",NHPC:"Power",ADANIPOWER:"Power",CESC:"Power",
  MARUTI:"Auto",TATAMOTORS:"Auto","BAJAJ-AUTO":"Auto",HEROMOTOCO:"Auto","M&M":"Auto",EICHERMOT:"Auto",
  HDFCBANK:"Banking",ICICIBANK:"Banking",KOTAKBANK:"Banking",AXISBANK:"Banking",SBIN:"Banking",
  TCS:"IT",INFY:"IT",WIPRO:"IT",HCLTECH:"IT",TECHM:"IT",
  RELIANCE:"Energy",ONGC:"Energy",BPCL:"Energy",IOC:"Energy",
  TATASTEEL:"Metals",JSWSTEEL:"Metals",HINDALCO:"Metals",
  HINDUNILVR:"FMCG",ITC:"FMCG",NESTLEIND:"FMCG",BRITANNIA:"FMCG",
};

const stageLabel = n=>["","Basing","Advancing","Topping","Declining"][n]||"?";
const col   = v => (+v) >= 0 ? T.green : T.red;
const fmtP  = v => v != null ? `₹${(+v).toLocaleString("en-IN")}` : "—";
const fmtPct= v => v != null ? `${(+v)>=0?"+":""}${(+v).toFixed(2)}%` : "—";

// ── Primitives ───────────────────────────────────────────────────────────────
const Dot = ({color=T.green,pulse=false}) => (
  <span style={{display:"inline-block",width:7,height:7,borderRadius:"50%",background:color,marginRight:5,flexShrink:0,animation:pulse?"pulse 2s infinite":"none"}}/>
);
const Bar = ({pct,color=T.green,h=3}) => (
  <div style={{height:h,background:T.bg3,borderRadius:2,overflow:"hidden"}}>
    <div style={{height:"100%",width:`${Math.min(100,Math.max(0,pct||0))}%`,background:color,borderRadius:2,transition:"width 0.8s ease"}}/>
  </div>
);

// Compact indicator row
const IR = ({label,value,color=T.t1,badge,bc,bb}) => (
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"3px 0",borderBottom:`0.5px solid ${T.border}`}}>
    <span style={{fontFamily:"monospace",fontSize:10,color:T.t2,whiteSpace:"nowrap"}}>{label}</span>
    <span style={{fontFamily:"monospace",fontSize:11,fontWeight:500,color,display:"flex",gap:4,alignItems:"center"}}>
      {value}
      {badge&&<span style={{fontSize:8,padding:"1px 5px",borderRadius:2,background:bb||T.bg3,color:bc||T.t2,fontWeight:600}}>{badge}</span>}
    </span>
  </div>
);

// Compact KV card
const KV = ({label,value,color=T.t0}) => (
  <div style={{background:T.bg3,border:`0.5px solid ${T.border}`,borderRadius:4,padding:"5px 7px"}}>
    <div style={{fontSize:9,color:T.t2,marginBottom:1,letterSpacing:"0.3px"}}>{label}</div>
    <div style={{fontFamily:"monospace",fontSize:12,fontWeight:500,color}}>{value||"—"}</div>
  </div>
);

// Traffic light — inline compact badges
const TrafficBadges = ({ind}) => {
  const signals = [
    {k:"Trend",  ok:ind.trendDaily?.includes("Up"),   fail:ind.trendDaily?.includes("Down")},
    {k:"RSI",    ok:ind.rsi>=45&&ind.rsi<=65,          fail:ind.rsi>72||ind.rsi<35},
    {k:"MACD",   ok:ind.macd>ind.macdSignal,           fail:ind.macd<ind.macdSignal},
    {k:"MAs",    ok:ind.ma50&&ind.price>ind.ma50&&ind.ma200&&ind.price>ind.ma200, fail:ind.ma200&&ind.price<ind.ma200},
    {k:"Vol",    ok:ind.relVol>=1.2,                   fail:ind.relVol<0.7},
    {k:"Stage",  ok:ind.stage===2,                    fail:ind.stage>=3},
    {k:"ADX",    ok:ind.adx>25,                        fail:ind.adx<18},
    {k:"Cloud",  ok:ind.ichimoku?.includes("Above"),   fail:ind.ichimoku?.includes("Below")},
  ];
  return (
    <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
      {signals.map(s=>{
        const color = s.ok?T.green:s.fail?T.red:T.amber;
        const bg    = s.ok?T.greenDim:s.fail?T.redDim:T.amberDim;
        return (
          <div key={s.k} style={{display:"flex",alignItems:"center",gap:3,padding:"2px 7px",borderRadius:3,background:bg,border:`0.5px solid ${color}`}}>
            <div style={{width:5,height:5,borderRadius:"50%",background:color}}/>
            <span style={{fontSize:10,color,fontFamily:"monospace",fontWeight:600}}>{s.k}</span>
          </div>
        );
      })}
    </div>
  );
};

// ── Enhanced Chart with overlays ─────────────────────────────────────────────
const EnhancedChart = ({candles, ind}) => {
  const [bars, setBars] = useState(30);
  if (!candles || candles.length < 10) return <div style={{color:T.t3,fontSize:11,padding:16,textAlign:"center"}}>No chart data</div>;

  const recent = candles.slice(-bars);
  const W = 560, H = 220, VOL_H = 40, PAD = { t:8, r:60, b:4, l:8 };
  const chartH = H - VOL_H - 4;

  const opens  = recent.map(c=>c[1]);
  const highs  = recent.map(c=>c[2]);
  const lows   = recent.map(c=>c[3]);
  const closes = recent.map(c=>c[4]);
  const vols   = recent.map(c=>c[5]);

  const minP = Math.min(...lows)  * 0.998;
  const maxP = Math.max(...highs) * 1.002;
  const pRange = maxP - minP || 1;
  const maxV = Math.max(...vols) || 1;

  const totalCandles = recent.length;
  const candleW = (W - PAD.l - PAD.r) / totalCandles;
  const gapW    = candleW * 0.15;
  const bodyW   = candleW - gapW * 2;

  const px = i  => PAD.l + i * candleW + candleW / 2;
  const py = v  => PAD.t + (1 - (v - minP) / pRange) * chartH;
  const vy = v  => H - VOL_H + (1 - v / maxV) * (VOL_H - 4);

  // ── Ichimoku calculations ──
  const allCloses = candles.map(c=>c[4]);
  const allHighs  = candles.map(c=>c[2]);
  const allLows   = candles.map(c=>c[3]);
  const ichPeriodHigh = (arr, start, len) => Math.max(...arr.slice(start, start+len));
  const ichPeriodLow  = (arr, start, len) => Math.min(...arr.slice(start, start+len));

  // For each visible candle, compute Senkou A & B (shifted back 26)
  const spanAB = recent.map((_, i) => {
    const globalIdx = candles.length - bars + i;
    const tenkanHi = ichPeriodHigh(allHighs, Math.max(0, globalIdx-8),  9);
    const tenkanLo = ichPeriodLow (allLows,  Math.max(0, globalIdx-8),  9);
    const kijunHi  = ichPeriodHigh(allHighs, Math.max(0, globalIdx-25), 26);
    const kijunLo  = ichPeriodLow (allLows,  Math.max(0, globalIdx-25), 26);
    const tenkan   = (tenkanHi + tenkanLo) / 2;
    const kijun    = (kijunHi  + kijunLo)  / 2;
    const spanA    = (tenkan + kijun) / 2;
    const senkouHi = ichPeriodHigh(allHighs, Math.max(0, globalIdx-51), 52);
    const senkouLo = ichPeriodLow (allLows,  Math.max(0, globalIdx-51), 52);
    const spanB    = (senkouHi + senkouLo) / 2;
    return { spanA, spanB, tenkan, kijun };
  });

  // Cloud polygon points
  const cloudTop    = spanAB.map((s,i)=>({x:px(i), y:py(Math.max(s.spanA,s.spanB))}));
  const cloudBottom = spanAB.map((s,i)=>({x:px(i), y:py(Math.min(s.spanA,s.spanB))}));
  const cloudPts    = [...cloudTop, ...[...cloudBottom].reverse()].map(p=>`${p.x},${p.y}`).join(" ");
  const cloudColor  = closes[closes.length-1] > spanAB[spanAB.length-1]?.spanA ? "#22c55e22" : "#ef444422";
  const cloudStroke = closes[closes.length-1] > spanAB[spanAB.length-1]?.spanA ? "#22c55e55" : "#ef444455";

  // MA lines
  const maLine = (maArr, sliceLen, color, dash="") => {
    if (!maArr) return null;
    const pts = recent.map((_, i) => {
      const globalIdx = candles.length - bars + i;
      const slice = allCloses.slice(Math.max(0, globalIdx - sliceLen + 1), globalIdx + 1);
      if (slice.length < Math.min(sliceLen, 10)) return null;
      const val = slice.reduce((a,b)=>a+b,0) / slice.length;
      return `${px(i)},${py(val)}`;
    }).filter(Boolean);
    if (pts.length < 2) return null;
    return <polyline key={color} points={pts.join(" ")} fill="none" stroke={color} strokeWidth="1" strokeDasharray={dash} opacity="0.8"/>;
  };

  // CPR lines — today's CPR from last candle
  const lastC = candles[candles.length-1];
  const pivot = (lastC[2]+lastC[3]+lastC[4])/3;
  const bc    = (lastC[2]+lastC[3])/2;
  const tc    = 2*pivot - bc;

  const hLine = (val, color, label, dash="") => {
    if (val < minP || val > maxP) return null;
    const y = py(val);
    return (
      <g key={label}>
        <line x1={PAD.l} y1={y} x2={W-PAD.r} y2={y} stroke={color} strokeWidth="0.8" strokeDasharray={dash} opacity="0.9"/>
        <text x={W-PAD.r+3} y={y+3} fontSize="7.5" fill={color} fontFamily="monospace">{label}</text>
        <text x={W-PAD.r+3} y={y+11} fontSize="7" fill={color} fontFamily="monospace" opacity="0.8">{val.toFixed(0)}</text>
      </g>
    );
  };

  return (
    <div>
      {/* Bar selector */}
      <div style={{display:"flex",gap:4,marginBottom:6,alignItems:"center"}}>
        <span style={{fontSize:9,color:T.t2,fontFamily:"monospace",marginRight:4}}>BARS:</span>
        {[20,30,45,60].map(n=>(
          <button key={n} onClick={()=>setBars(n)}
            style={{fontFamily:"monospace",fontSize:9,padding:"2px 8px",borderRadius:3,cursor:"pointer",
              background:bars===n?T.amber:T.bg3,border:`0.5px solid ${bars===n?T.amber:T.border}`,
              color:bars===n?T.bg0:T.t2}}>
            {n}D
          </button>
        ))}
        <span style={{marginLeft:"auto",fontSize:9,color:T.t2,fontFamily:"monospace"}}>
          CPR: TC {tc.toFixed(0)} · P {pivot.toFixed(0)} · BC {bc.toFixed(0)}
        </span>
      </div>

      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{overflow:"visible"}}>
        {/* Ichimoku Cloud */}
        <polygon points={cloudPts} fill={cloudColor} stroke={cloudStroke} strokeWidth="0.5"/>

        {/* Tenkan & Kijun lines */}
        <polyline points={spanAB.map((s,i)=>`${px(i)},${py(s.tenkan)}`).join(" ")} fill="none" stroke="#f59e0b" strokeWidth="0.7" opacity="0.6" strokeDasharray="2,2"/>
        <polyline points={spanAB.map((s,i)=>`${px(i)},${py(s.kijun)}`).join(" ")}  fill="none" stroke="#3b82f6" strokeWidth="0.7" opacity="0.6" strokeDasharray="2,2"/>

        {/* MA lines */}
        {maLine(ind.ma50,  50, "#f59e0b")}
        {maLine(ind.ma200, 200, "#a855f7", "3,2")}

        {/* CPR horizontal lines */}
        {hLine(tc,    "#22c55e", "TC",  "2,2")}
        {hLine(pivot, "#94a3b8", "P",   "2,2")}
        {hLine(bc,    "#ef4444", "BC",  "2,2")}

        {/* Candles */}
        {recent.map((c,i) => {
          const [,o,hi,lo,cl] = c;
          const isUp  = cl >= o;
          const clr   = isUp ? T.green : T.red;
          const x     = PAD.l + i * candleW + gapW;
          const bodyTop = Math.min(py(o), py(cl));
          const bodyBot = Math.max(py(o), py(cl));
          const bodyHt  = Math.max(1, bodyBot - bodyTop);
          return (
            <g key={i}>
              <line x1={x+bodyW/2} y1={py(hi)} x2={x+bodyW/2} y2={py(lo)} stroke={clr} strokeWidth="0.8"/>
              <rect x={x} y={bodyTop} width={bodyW} height={bodyHt} fill={clr} opacity={isUp?0.9:0.85}/>
            </g>
          );
        })}

        {/* Price label on right */}
        <rect x={W-PAD.r+1} y={py(closes[closes.length-1])-7} width={PAD.r-2} height={13} fill={T.amber} rx="2"/>
        <text x={W-PAD.r+3} y={py(closes[closes.length-1])+3} fontSize="8" fill={T.bg0} fontFamily="monospace" fontWeight="600">
          {closes[closes.length-1].toFixed(0)}
        </text>

        {/* Volume bars */}
        {recent.map((c,i) => {
          const isUp = c[4] >= c[1];
          const vh = Math.max(1, H - vy(c[5]) - 4);
          return (
            <rect key={i} x={PAD.l + i*candleW + gapW} y={vy(c[5])} width={bodyW} height={vh}
              fill={isUp?T.green:T.red} opacity="0.35"/>
          );
        })}

        {/* Volume baseline */}
        <line x1={PAD.l} y1={H-4} x2={W-PAD.r} y2={H-4} stroke={T.border} strokeWidth="0.5"/>

        {/* Legend */}
        {[
          {color:"#f59e0b",label:"MA50",dash:false},
          {color:"#a855f7",label:"MA200",dash:true},
          {color:"#22c55e",label:"Tenkan",dash:true},
          {color:"#3b82f6",label:"Kijun",dash:true},
        ].map((l,i)=>(
          <g key={l.label}>
            <line x1={PAD.l+i*62} y1={H-8} x2={PAD.l+i*62+16} y2={H-8} stroke={l.color} strokeWidth="1.2" strokeDasharray={l.dash?"3,2":""}/>
            <text x={PAD.l+i*62+19} y={H-5} fontSize="7.5" fill={l.color} fontFamily="monospace">{l.label}</text>
          </g>
        ))}
      </svg>
    </div>
  );
};

// ── Market Bar ───────────────────────────────────────────────────────────────
const MarketBar = ({market}) => {
  if (!market?.length) return null;
  return (
    <div style={{display:"flex",gap:20,padding:"4px 16px",background:T.bg1,borderBottom:`0.5px solid ${T.border}`,fontSize:11,fontFamily:"monospace",alignItems:"center"}}>
      <span style={{color:T.t2,fontSize:9,letterSpacing:"1px"}}>MKT</span>
      {market.map(m=>(
        <span key={m.symbol} style={{display:"flex",gap:5,alignItems:"center"}}>
          <span style={{color:T.t2,fontSize:9}}>{m.symbol}</span>
          <span style={{color:T.t0,fontWeight:500,fontSize:11}}>{fmtP(m.price)}</span>
          <span style={{color:col(m.chgPct),fontWeight:500,fontSize:10}}>{fmtPct(m.chgPct)}</span>
        </span>
      ))}
      <span style={{color:T.t3,marginLeft:"auto",fontSize:9}}>
        {new Date().toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})} IST
      </span>
    </div>
  );
};

// ── Watchlist ────────────────────────────────────────────────────────────────
const Watchlist = ({items,onScan,active,editing,wlInput,setWlInput,onAdd,onRemove,setEditing}) => (
  <div style={{background:T.bg1,borderRight:`1px solid ${T.border}`,width:140,flexShrink:0,display:"flex",flexDirection:"column"}}>
    <div style={{padding:"6px 10px",display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:`0.5px solid ${T.border}`,flexShrink:0}}>
      <span style={{fontSize:8,fontWeight:600,letterSpacing:"2px",textTransform:"uppercase",color:T.t2}}>WATCHLIST</span>
      <button onClick={()=>setEditing(v=>!v)}
        style={{fontSize:9,background:editing?T.amber:T.bg3,border:`0.5px solid ${editing?T.amber:T.border}`,borderRadius:2,color:editing?T.bg0:T.t2,cursor:"pointer",padding:"1px 6px"}}>
        {editing?"done":"edit"}
      </button>
    </div>
    {editing&&(
      <div style={{padding:"6px 8px",borderBottom:`0.5px solid ${T.border}`,flexShrink:0}}>
        <div style={{display:"flex",gap:4}}>
          <input value={wlInput} onChange={e=>setWlInput(e.target.value.toUpperCase())}
            onKeyDown={e=>e.key==="Enter"&&wlInput&&onAdd(wlInput)}
            placeholder="ADD SYMBOL"
            style={{flex:1,fontFamily:"monospace",fontSize:9,padding:"4px 6px",background:T.bg2,border:`0.5px solid ${T.border}`,borderRadius:3,color:T.t0,outline:"none"}}/>
          <button onClick={()=>wlInput&&onAdd(wlInput)}
            style={{fontSize:10,background:T.amber,border:"none",borderRadius:3,color:T.bg0,cursor:"pointer",padding:"3px 7px",fontWeight:600}}>+</button>
        </div>
      </div>
    )}
    <div style={{overflowY:"auto",flex:1}}>
      {items.map(sym=>(
        <div key={sym} style={{display:"flex",alignItems:"center",borderBottom:`0.5px solid ${T.border}`,background:active===sym?T.bg3:"transparent"}}>
          <button onClick={()=>onScan(sym)}
            style={{flex:1,padding:"7px 10px",background:"transparent",border:"none",textAlign:"left",cursor:"pointer",color:active===sym?T.amber:T.t1,fontFamily:"monospace",fontSize:11,fontWeight:active===sym?600:400}}>
            {sym}
          </button>
          {editing&&(
            <button onClick={()=>onRemove(sym)}
              style={{padding:"4px 6px",background:"none",border:"none",color:T.red,cursor:"pointer",fontSize:11,flexShrink:0}}>×</button>
          )}
        </div>
      ))}
    </div>
  </div>
);

// ── Dashboard — side by side layout ─────────────────────────────────────────
// ── CPR Multi-Timeframe Panel ─────────────────────────────────────────────────
function CPRPanel({multiCPR, candles, price, fetchIntraday, intraday}) {
  const [activeTab, setActiveTab] = useState("daily");

  if (!multiCPR) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",
      height:120,color:T.t3,fontSize:11,fontFamily:"monospace"}}>
      Scan a stock to see CPR analysis
    </div>
  );

  const {daily, weekly, monthly, yearly, confluence, aboveCount, belowCount} = multiCPR;

  const posColor = p => p==="ABOVE"?T.green:p==="BELOW"?T.red:T.amber;
  const posIcon  = p => p==="ABOVE"?"▲":p==="BELOW"?"▼":"◆";
  const confColor = confluence.includes("BULL")?T.green:confluence.includes("BEAR")?T.red:T.amber;

  // ── Tab 1: Daily candles vs W/M/Y CPR ─────────────────────────────────────
  const DailyChart = () => {
    if (!candles||candles.length<10) return null;
    const last10 = candles.slice(-10);
    const prices = last10.map(c=>c[4]);
    const allLevels = [
      weekly.tc, weekly.pivot, weekly.bc,
      monthly.tc, monthly.pivot, monthly.bc,
      yearly.tc,  yearly.pivot,  yearly.bc,
      ...prices
    ].filter(Boolean);
    const minP = Math.min(...allLevels)*0.998;
    const maxP = Math.max(...allLevels)*1.002;
    const range = maxP-minP||1;
    const W=100, H=120, barW=7, gap=3;
    const py = v => H-((v-minP)/range)*H;
    const totalW = last10.length*(barW+gap);

    const cprLines = [
      {v:weekly.tc,  c:"#3b82f6", dash:"4,2", lbl:"W-TC"},
      {v:weekly.pivot,c:"#3b82f6",dash:"2,3", lbl:"W-P"},
      {v:weekly.bc,  c:"#3b82f6", dash:"4,2", lbl:"W-BC"},
      {v:monthly.tc, c:"#a855f7", dash:"4,2", lbl:"M-TC"},
      {v:monthly.pivot,c:"#a855f7",dash:"2,3",lbl:"M-P"},
      {v:monthly.bc, c:"#a855f7", dash:"4,2", lbl:"M-BC"},
      {v:yearly.tc,  c:"#f59e0b", dash:"4,2", lbl:"Y-TC"},
      {v:yearly.pivot,c:"#f59e0b",dash:"2,3", lbl:"Y-P"},
      {v:yearly.bc,  c:"#f59e0b", dash:"4,2", lbl:"Y-BC"},
    ];

    return (
      <div>
        <div style={{fontSize:8,color:T.t2,marginBottom:4,fontFamily:"monospace",
          display:"flex",gap:12,flexWrap:"wrap"}}>
          <span><span style={{color:"#3b82f6"}}>─</span> Weekly</span>
          <span><span style={{color:"#a855f7"}}>─</span> Monthly</span>
          <span><span style={{color:"#f59e0b"}}>─</span> Yearly</span>
          <span style={{marginLeft:"auto"}}>Last 10 days close vs CPR lines</span>
        </div>
        <svg width="100%" height={H+20} viewBox={`0 0 ${totalW+60} ${H+20}`}>
          {/* CPR lines */}
          {cprLines.map((l,i)=>(
            <g key={i}>
              <line x1="0" y1={py(l.v)} x2={totalW+55} y2={py(l.v)}
                stroke={l.c} strokeWidth="0.8" strokeDasharray={l.dash} opacity="0.7"/>
              <text x={totalW+58} y={py(l.v)+3} fontSize="5" fill={l.c} opacity="0.9">{l.lbl}</text>
            </g>
          ))}
          {/* Price bars */}
          {last10.map((c,i)=>{
            const x = i*(barW+gap);
            const cl = c[4], op = c[1], hi = c[2], lo = c[3];
            const isUp = cl>=op;
            const barColor = isUp?T.green:T.red;
            const bodyTop = py(Math.max(cl,op));
            const bodyBot = py(Math.min(cl,op));
            const bodyH   = Math.max(1, bodyBot-bodyTop);
            const d = new Date(c[0]*1000);
            const lbl = `${d.getDate()}/${d.getMonth()+1}`;
            return (
              <g key={i}>
                <line x1={x+barW/2} y1={py(hi)} x2={x+barW/2} y2={py(lo)}
                  stroke={barColor} strokeWidth="0.8" opacity="0.6"/>
                <rect x={x} y={bodyTop} width={barW} height={bodyH}
                  fill={isUp?T.greenDim:T.redDim} stroke={barColor} strokeWidth="0.7"/>
                <text x={x+barW/2} y={H+14} fontSize="6" fill={T.t3}
                  textAnchor="middle">{lbl}</text>
                {/* Position dot */}
                <circle cx={x+barW/2} cy={py(cl)-4} r="1.5"
                  fill={cl>weekly.tc?"#3b82f6":cl<weekly.bc?"#ef4444":"#f59e0b"}/>
              </g>
            );
          })}
        </svg>
        {/* Last 10 days position table */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(10,1fr)",gap:2,marginTop:4}}>
          {last10.map((c,i)=>{
            const cl = c[4];
            const wPos = cl>weekly.tc?"A":cl<weekly.bc?"B":"I";
            const mPos = cl>monthly.tc?"A":cl<monthly.bc?"B":"I";
            const yPos = cl>yearly.tc?"A":cl<yearly.bc?"B":"I";
            const d = new Date(c[0]*1000);
            return (
              <div key={i} style={{textAlign:"center",background:T.bg3,
                borderRadius:3,padding:"2px 1px"}}>
                <div style={{fontSize:6,color:T.t3}}>{d.getDate()}/{d.getMonth()+1}</div>
                <div style={{fontSize:7,color:"#3b82f6",fontWeight:600}}>{wPos}</div>
                <div style={{fontSize:7,color:"#a855f7",fontWeight:600}}>{mPos}</div>
                <div style={{fontSize:7,color:"#f59e0b",fontWeight:600}}>{yPos}</div>
              </div>
            );
          })}
        </div>
        <div style={{fontSize:7,color:T.t3,marginTop:3,fontFamily:"monospace"}}>
          A=Above · I=Inside · B=Below&nbsp;&nbsp;
          <span style={{color:"#3b82f6"}}>W</span>eekly ·{" "}
          <span style={{color:"#a855f7"}}>M</span>onthly ·{" "}
          <span style={{color:"#f59e0b"}}>Y</span>early
        </div>
      </div>
    );
  };

  // ── Tab 2: 15-min vs D/W CPR ──────────────────────────────────────────────
  const IntradayChart = () => {
    if (!intraday||!intraday.length) return (
      <div style={{textAlign:"center",padding:"20px 0"}}>
        <div style={{fontSize:11,color:T.t3,marginBottom:8,fontFamily:"monospace"}}>
          15-min intraday data not loaded
        </div>
        <button onClick={fetchIntraday}
          style={{fontFamily:"monospace",fontSize:10,padding:"5px 14px",
            background:T.amber,border:"none",borderRadius:3,
            color:T.bg0,fontWeight:600,cursor:"pointer"}}>
          Load 15-min Data
        </button>
      </div>
    );

    const prices = intraday.map(c=>c[4]);
    const allLevels = [
      daily.tc, daily.pivot, daily.bc,
      weekly.tc, weekly.pivot, weekly.bc,
      ...prices
    ].filter(Boolean);
    const minP = Math.min(...allLevels)*0.998;
    const maxP = Math.max(...allLevels)*1.002;
    const range = maxP-minP||1;
    const H=120;
    const totalW = intraday.length*6;

    const py = v => H-((v-minP)/range)*H;
    const cprLines = [
      {v:daily.tc,    c:T.green,  dash:"4,2", lbl:"D-TC"},
      {v:daily.pivot, c:T.green,  dash:"2,3", lbl:"D-P"},
      {v:daily.bc,    c:T.green,  dash:"4,2", lbl:"D-BC"},
      {v:weekly.tc,   c:"#3b82f6",dash:"4,2", lbl:"W-TC"},
      {v:weekly.pivot,c:"#3b82f6",dash:"2,3", lbl:"W-P"},
      {v:weekly.bc,   c:"#3b82f6",dash:"4,2", lbl:"W-BC"},
    ];

    // Line chart for 15-min closes
    const pts = intraday.map((c,i)=>`${i*6+3},${py(c[4])}`).join(" ");

    return (
      <div>
        <div style={{fontSize:8,color:T.t2,marginBottom:4,fontFamily:"monospace",
          display:"flex",gap:12,flexWrap:"wrap"}}>
          <span><span style={{color:T.green}}>─</span> Daily CPR</span>
          <span><span style={{color:"#3b82f6"}}>─</span> Weekly CPR</span>
          <span style={{marginLeft:"auto",color:T.amber}}>
            CMP: ₹{price?.toFixed(1)} vs D-CPR: {daily.pos}
          </span>
        </div>
        <svg width="100%" height={H+10} viewBox={`0 0 ${totalW+60} ${H+10}`}>
          {cprLines.map((l,i)=>(
            <g key={i}>
              <line x1="0" y1={py(l.v)} x2={totalW+55} y2={py(l.v)}
                stroke={l.c} strokeWidth="0.8" strokeDasharray={l.dash} opacity="0.8"/>
              <text x={totalW+58} y={py(l.v)+3} fontSize="5" fill={l.c}>{l.lbl}</text>
            </g>
          ))}
          {/* Price area fill */}
          <polyline points={pts} fill="none" stroke={T.amber} strokeWidth="1.2" strokeLinejoin="round"/>
          {/* Current price dot */}
          {intraday.length>0&&(
            <circle cx={(intraday.length-1)*6+3} cy={py(intraday[intraday.length-1][4])} r="2.5"
              fill={T.amber}/>
          )}
        </svg>
        {/* Current position summary */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4,marginTop:6}}>
          {[
            {l:"vs Daily CPR",  pos:daily.pos,  tc:daily.tc,  bc:daily.bc,  p:daily.pivot,  c:T.green},
            {l:"vs Weekly CPR", pos:weekly.pos, tc:weekly.tc, bc:weekly.bc, p:weekly.pivot, c:"#3b82f6"},
          ].map(item=>(
            <div key={item.l} style={{background:T.bg3,border:`0.5px solid ${posColor(item.pos)}`,
              borderRadius:4,padding:"5px 7px"}}>
              <div style={{fontSize:8,color:T.t2,marginBottom:2}}>{item.l}</div>
              <div style={{fontFamily:"monospace",fontSize:11,fontWeight:600,
                color:posColor(item.pos)}}>
                {posIcon(item.pos)} {item.pos}
              </div>
              <div style={{fontSize:8,color:T.t3,fontFamily:"monospace",marginTop:1}}>
                TC:{item.tc} P:{item.p} BC:{item.bc}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div style={{height:"100%",display:"flex",flexDirection:"column"}}>

      {/* Confluence summary */}
      <div style={{background:confColor+"22",border:`0.5px solid ${confColor}`,
        borderRadius:5,padding:"6px 8px",marginBottom:6,
        display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <div style={{fontSize:8,color:T.t2,marginBottom:1,fontFamily:"monospace",letterSpacing:"1px"}}>
            CPR CONFLUENCE
          </div>
          <div style={{fontSize:11,fontWeight:600,color:confColor,fontFamily:"monospace"}}>
            {confluence.replace("_"," ")} · {aboveCount} Above · {belowCount} Below
          </div>
        </div>
        <div style={{display:"flex",gap:3}}>
          {[daily,weekly,monthly,yearly].map(tf=>(
            <div key={tf.label} style={{textAlign:"center",
              background:posColor(tf.pos)+"22",
              border:`0.5px solid ${posColor(tf.pos)}`,
              borderRadius:3,padding:"2px 5px",minWidth:28}}>
              <div style={{fontSize:7,color:T.t2}}>{tf.label[0]}</div>
              <div style={{fontSize:9,fontWeight:700,color:posColor(tf.pos),fontFamily:"monospace"}}>
                {posIcon(tf.pos)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* D/W/M/Y CPR summary row */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:3,marginBottom:6}}>
        {[daily,weekly,monthly,yearly].map(tf=>(
          <div key={tf.label} style={{background:T.bg3,border:`0.5px solid ${posColor(tf.pos)}`,
            borderRadius:4,padding:"4px 5px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:2}}>
              <span style={{fontSize:8,color:T.t2,fontFamily:"monospace"}}>{tf.label}</span>
              <span style={{fontSize:7,padding:"1px 3px",borderRadius:2,fontWeight:600,
                background:posColor(tf.pos)+"22",color:posColor(tf.pos),fontFamily:"monospace"}}>
                {tf.narrow?"N":"W"}
              </span>
            </div>
            <div style={{fontSize:10,fontWeight:600,color:posColor(tf.pos),fontFamily:"monospace"}}>
              {posIcon(tf.pos)} {tf.pos}
            </div>
            <div style={{fontSize:7,color:T.t3,fontFamily:"monospace",marginTop:1}}>
              P:{tf.pivot} · {tf.nearestDist>=0?"+":""}{tf.nearestDist?.toFixed(1)}
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{display:"flex",gap:3,marginBottom:6}}>
        {[["daily","📅 10D vs W/M/Y"],["intraday","⏱ 15min vs D/W"]].map(([t,l])=>(
          <button key={t} onClick={()=>setActiveTab(t)}
            style={{fontFamily:"monospace",fontSize:9,padding:"3px 10px",
              borderRadius:3,cursor:"pointer",flex:1,
              background:activeTab===t?T.amber:T.bg3,
              border:`0.5px solid ${activeTab===t?T.amber:T.border}`,
              color:activeTab===t?T.bg0:T.t2,fontWeight:activeTab===t?600:400}}>
            {l}
          </button>
        ))}
      </div>

      {/* Chart area */}
      <div style={{flex:1,overflowY:"auto"}}>
        {activeTab==="daily"   && <DailyChart/>}
        {activeTab==="intraday"&& <IntradayChart/>}
      </div>
    </div>
  );
}

function Dashboard({data, peers, candles, circuitChanges, intraday15, fetchIntraday}) {
  const {symbol,companyName,ind,fund,sector,expiryHL,prevExpiry,todayCircuitChange,multiCPR} = data;
  const i = ind;
  const mvKeys=["abvMA50","abvMA150","abvMA200","ma50abvMA200","ma150abvMA200","priceAbv25wkLow","within25pct52wkHigh","rs75plus"];
  const mvLbls=["MA50","MA150","MA200","50>200","150>200","+25%Lo","<25%Hi","RS75"];
  const recColors={BUY:T.green,SELL:T.red,HOLD:T.amber,WATCH:T.blue};
  const recBgs   ={BUY:T.greenDim,SELL:T.redDim,HOLD:T.amberDim,WATCH:T.blueDim};
  const allRS=[i.rs,...(peers||[]).filter(Boolean).map(p=>p.rs||50)];
  const rsRank=allRS.filter(x=>x<=i.rs).length;

  return (
    <div style={{display:"flex",flex:1,overflow:"hidden",gap:0}}>

      {/* ── LEFT PANEL — indicators ── */}
      <div style={{width:"38%",overflowY:"auto",padding:"10px 12px",borderRight:`0.5px solid ${T.border}`}}>

        {/* Stock header */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10,paddingBottom:8,borderBottom:`0.5px solid ${T.border}`}}>
          <div>
            <div style={{fontFamily:"monospace",fontSize:10,color:T.amber,letterSpacing:"2px",marginBottom:2}}>NSE: {symbol}</div>
            <div style={{fontSize:16,fontWeight:500,color:T.t0}}>{companyName||symbol}</div>
            <div style={{display:"flex",gap:4,marginTop:3,flexWrap:"wrap"}}>
              {[sector, fund?.mcap?`₹${fund.mcap}Cr`:null].filter(Boolean).map(t=>(
                <span key={t} style={{fontSize:9,padding:"1px 6px",borderRadius:2,background:T.bg3,border:`0.5px solid ${T.border}`,color:T.t1,fontFamily:"monospace"}}>{t}</span>
              ))}
            </div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontFamily:"monospace",fontSize:22,fontWeight:600,color:T.t0}}>{fmtP(i.price)}</div>
            <div style={{fontFamily:"monospace",fontSize:11,color:col(i.changePct)}}>{fmtPct(i.changePct)}</div>
            <div style={{fontFamily:"monospace",fontSize:9,color:recColors[i.rec]||T.amber,marginTop:2,padding:"2px 6px",borderRadius:2,background:recBgs[i.rec]||T.amberDim,display:"inline-block"}}>{i.rec} — {i.recLabel}</div>
          </div>
        </div>

        {/* Traffic light — compact badges */}
        <div style={{marginBottom:8}}>
          <div style={{fontSize:8,color:T.t2,letterSpacing:"1px",textTransform:"uppercase",marginBottom:4}}>Signal Summary</div>
          <TrafficBadges ind={i}/>
        </div>

        {/* 2-col grid: price + technicals */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>

          {/* Price & Volume */}
          <div>
            <div style={{fontSize:9,color:T.t2,letterSpacing:"1px",textTransform:"uppercase",marginBottom:4,paddingBottom:3,borderBottom:`0.5px solid ${T.border}`}}>Price & Volume</div>
            <IR label="52W High" value={fmtP(i.wkHigh)} color={T.green}/>
            <IR label="52W Low"  value={fmtP(i.wkLow)}  color={T.red}/>
            <IR label="Volume"   value={`${((i.vol||0)/100000).toFixed(1)}L`} color={T.t0}/>
            <IR label="Rel Vol"  value={`${i.relVol||"—"}x`} color={i.relVol>=1.2?T.green:i.relVol<0.8?T.red:T.t1}/>
            <IR label="ATR"      value={`₹${i.atr||"—"}`} color={T.t1}/>
            <IR label="Liq"      value={`₹${i.liquidity||"—"}Cr`} color={T.t1}/>
            <IR label="Daily"    value={i.trendDaily}  color={i.trendDaily?.includes("Up")?T.green:T.red}/>
            <IR label="Weekly"   value={i.trendWeekly} color={i.trendWeekly==="Up"?T.green:i.trendWeekly==="Down"?T.red:T.t1}/>
          </div>

          {/* Technicals */}
          <div>
            <div style={{fontSize:9,color:T.t2,letterSpacing:"1px",textTransform:"uppercase",marginBottom:4,paddingBottom:3,borderBottom:`0.5px solid ${T.border}`}}>Technicals</div>
            <IR label="RSI(14)" value={i.rsi} color={i.rsi>70?T.red:i.rsi<40?T.green:T.t0}
              badge={i.rsi>70?"OB":i.rsi<40?"OS":"OK"} bc={i.rsi>70?T.red:i.rsi<40?T.green:T.t2} bb={i.rsi>70?T.redDim:i.rsi<40?T.greenDim:T.bg3}/>
            <IR label="ADX (D)" value={i.adx||"—"} color={i.adx>=25?T.green:T.t1}
              badge={i.adx>=35?"🟢 Strong":i.adx>=25?"🟢 Trend":"⚪ Weak"} bc={i.adx>=25?T.green:T.t2} bb={i.adx>=25?T.greenDim:T.bg3}/>
            <IR label="MACD"    value={`${i.macd||"—"}/${i.macdSignal||"—"}`} color={i.macd>i.macdSignal?T.green:T.red}
              badge={i.macd>i.macdSignal?"▲":"▼"} bc={i.macd>i.macdSignal?T.green:T.red} bb={i.macd>i.macdSignal?T.greenDim:T.redDim}/>
            <IR label="UW%"     value={`${i.upperWick||0}%`} color={i.upperWick>4?T.red:T.t1}/>
            <IR label="TTM"     value={i.ttm==="+"?"Fire+":"Sqz−"} color={i.ttm==="+"?T.green:T.red}/>
            <IR label="U/D"     value={i.udr} color={i.udr>1.2?T.green:i.udr<0.8?T.red:T.t1}/>
            <IR label="Guppy"   value={i.guppy?.split(" ")[0]||"—"} color={i.guppy?.includes("Bull")?T.green:i.guppy?.includes("Bear")?T.red:T.t1}/>
            <IR label="RS"      value={i.rs} color={i.rs>=75?T.green:i.rs>=50?T.amber:T.red}
              badge={i.rs>=75?"Ldr":i.rs>=50?"Avg":"Lag"} bc={i.rs>=75?T.green:i.rs>=50?T.amber:T.red} bb={i.rs>=75?T.greenDim:i.rs>=50?T.amberDim:T.redDim}/>
          </div>
        </div>

        {/* MAs */}
        <div style={{marginBottom:8}}>
          <div style={{fontSize:9,color:T.t2,letterSpacing:"1px",textTransform:"uppercase",marginBottom:4,paddingBottom:3,borderBottom:`0.5px solid ${T.border}`}}>Moving Averages vs Close</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 8px"}}>
            {[["EMA9",i.ema9],["MA20",i.ma20],["MA50",i.ma50],["MA150",i.ma150],["MA200",i.ma200]].map(([l,v])=>(
              <IR key={l} label={l} value={`${fmtP(v)} ${v?(i.price>v?"▲":"▼"):""}`} color={v?(i.price>v?T.green:T.red):T.t2}/>
            ))}
            <IR label="Stage" value={`S${i.stage} ${stageLabel(i.stage)}`} color={i.stage===2?T.green:i.stage>=3?T.red:T.amber}/>
          </div>
        </div>

        {/* Minervini */}
        <div style={{marginBottom:8}}>
          <div style={{fontSize:9,color:T.t2,letterSpacing:"1px",textTransform:"uppercase",marginBottom:4,paddingBottom:3,borderBottom:`0.5px solid ${T.border}`}}>Minervini {i.mvScore}/8 — {i.mvScore>=6?"VCP Candidate":i.mvScore>=4?"Partial":"Weak"}</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(8,1fr)",gap:3}}>
            {mvKeys.map((k,idx)=>(
              <div key={k} style={{textAlign:"center",padding:"3px 2px",borderRadius:3,background:i.mv?.[k]?T.greenDim:T.bg3,border:`0.5px solid ${i.mv?.[k]?T.green:T.border}`}}>
                <div style={{fontSize:7,color:T.t2,marginBottom:1,overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>{mvLbls[idx]}</div>
                <div style={{fontSize:11,color:i.mv?.[k]?T.green:T.red}}>{i.mv?.[k]?"✓":"✗"}</div>
              </div>
            ))}
          </div>
          <Bar pct={i.mvScore/8*100} color={i.mvScore>=6?T.green:i.mvScore>=4?T.amber:T.red} h={3}/>
        </div>

        {/* CAGR Returns */}
        <div style={{marginBottom:8}}>
          <div style={{fontSize:9,color:T.t2,letterSpacing:"1px",textTransform:"uppercase",marginBottom:4,paddingBottom:3,borderBottom:`0.5px solid ${T.border}`}}>CAGR Returns</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:4}}>
            {[["1M",i.cagr?.m1],["6M",i.cagr?.m6],["1Y",i.cagr?.y1],["3Y",i.cagr?.y3],["5Y",i.cagr?.y5]].map(([l,v])=>(
              <div key={l} style={{textAlign:"center",padding:"4px 2px",background:T.bg3,border:`0.5px solid ${T.border}`,borderRadius:3}}>
                <div style={{fontSize:8,color:T.t2,marginBottom:1,fontFamily:"monospace"}}>{l}</div>
                <div style={{fontSize:10,fontWeight:600,color:v==null?"#2d3a47":v>=0?T.green:T.red,fontFamily:"monospace"}}>{v!=null?`${v>=0?"+":""}${v}%`:"—"}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ATH + Volume Flags */}
        <div style={{marginBottom:8}}>
          <div style={{fontSize:9,color:T.t2,letterSpacing:"1px",textTransform:"uppercase",marginBottom:4,paddingBottom:3,borderBottom:`0.5px solid ${T.border}`}}>ATH & Volume Highlights</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4,marginBottom:4}}>
            <div style={{background:T.bg3,border:`0.5px solid ${T.border}`,borderRadius:4,padding:"5px 7px"}}>
              <div style={{fontSize:8,color:T.t2,marginBottom:1}}>ATH PRICE</div>
              <div style={{fontFamily:"monospace",fontSize:11,fontWeight:500,color:T.amber}}>₹{i.ath?.price||"—"}</div>
            </div>
            <div style={{background:T.bg3,border:`0.5px solid ${T.border}`,borderRadius:4,padding:"5px 7px"}}>
              <div style={{fontSize:8,color:T.t2,marginBottom:1}}>ATH DATE</div>
              <div style={{fontFamily:"monospace",fontSize:11,fontWeight:500,color:T.t1}}>{i.ath?.date||"—"}</div>
            </div>
          </div>
          <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
            {i.volFlags?.isHighestYear&&<span style={{fontSize:9,padding:"2px 7px",borderRadius:2,background:T.amberDim,border:`0.5px solid ${T.amber}`,color:T.amber,fontFamily:"monospace",fontWeight:600}}>📊 Highest Vol Year</span>}
            {i.volFlags?.isHighestQtr&&<span style={{fontSize:9,padding:"2px 7px",borderRadius:2,background:"#1e3a5f",border:`0.5px solid ${T.blue}`,color:T.blue,fontFamily:"monospace",fontWeight:600}}>📊 Highest Vol Qtr</span>}
            {i.volFlags?.isHighestMonth&&<span style={{fontSize:9,padding:"2px 7px",borderRadius:2,background:T.greenDim,border:`0.5px solid ${T.green}`,color:T.green,fontFamily:"monospace",fontWeight:600}}>📊 Highest Vol Month</span>}
            {!i.volFlags?.isHighestMonth&&!i.volFlags?.isHighestQtr&&!i.volFlags?.isHighestYear&&<span style={{fontSize:9,color:T.t3,fontFamily:"monospace"}}>No volume highlight today</span>}
          </div>
        </div>

        {/* Mini Coil + Pivot Pocket */}
        <div style={{marginBottom:8}}>
          <div style={{fontSize:9,color:T.t2,letterSpacing:"1px",textTransform:"uppercase",marginBottom:4,paddingBottom:3,borderBottom:`0.5px solid ${T.border}`}}>Pattern Signals</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
            {/* Mini Coil */}
            <div style={{background:i.miniCoil?.detected?T.greenDim:T.bg3,border:`0.5px solid ${i.miniCoil?.detected?T.green:T.border}`,borderRadius:4,padding:"6px 8px"}}>
              <div style={{fontSize:8,color:T.t2,marginBottom:3,fontFamily:"monospace",letterSpacing:"1px"}}>MINI COIL</div>
              {i.miniCoil?.detected
                ?<>
                  <div style={{fontSize:10,fontWeight:600,color:i.miniCoil.triggered?T.amber:T.green,fontFamily:"monospace"}}>
                    {i.miniCoil.triggered?"🚀 TRIGGERED":"🔵 FORMING"}
                  </div>
                  <div style={{fontSize:9,color:T.t1,marginTop:2,fontFamily:"monospace"}}>
                    {i.miniCoil.innerBars} bars inside · {i.miniCoil.barsAgo}d ago
                  </div>
                  <div style={{fontSize:9,color:T.t2,fontFamily:"monospace"}}>
                    Trigger: ₹{i.miniCoil.triggerLevel}
                  </div>
                </>
                :<div style={{fontSize:10,color:T.t3,fontFamily:"monospace"}}>Not detected</div>
              }
            </div>
            {/* Pivot Pocket */}
            <div style={{background:i.pivotPocket?.detected?T.amberDim:T.bg3,border:`0.5px solid ${i.pivotPocket?.detected?T.amber:T.border}`,borderRadius:4,padding:"6px 8px"}}>
              <div style={{fontSize:8,color:T.t2,marginBottom:3,fontFamily:"monospace",letterSpacing:"1px"}}>PIVOT POCKET</div>
              {i.pivotPocket?.detected
                ?<>
                  <div style={{fontSize:10,fontWeight:600,color:T.amber,fontFamily:"monospace"}}>⚡ DETECTED</div>
                  <div style={{fontSize:9,color:T.t1,marginTop:2,fontFamily:"monospace"}}>
                    Vol {i.pivotPocket.ratio}x max down-vol
                  </div>
                </>
                :<div style={{fontSize:10,color:T.t3,fontFamily:"monospace"}}>Not today</div>
              }
            </div>
          </div>

          {/* JR KG + BBPT */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5,marginTop:5}}>
            {/* JR KG */}
            <div style={{
              background:i.jrkg?.buySignal?T.greenDim:i.jrkg?.sellSignal?T.redDim:i.jrkg?.aboveZero?T.greenDim:T.redDim,
              border:`0.5px solid ${i.jrkg?.buySignal?T.green:i.jrkg?.sellSignal?T.red:i.jrkg?.aboveZero?T.green:T.red}`,
              borderRadius:4,padding:"6px 8px"}}>
              <div style={{fontSize:8,color:T.t2,marginBottom:2,fontFamily:"monospace",letterSpacing:"1px"}}>JR KG</div>
              <div style={{fontSize:10,fontWeight:600,fontFamily:"monospace",color:
                i.jrkg?.buySignal?T.green:i.jrkg?.sellSignal?T.red:
                i.jrkg?.earlyExit?T.amber:i.jrkg?.aboveZero?T.green:T.red}}>
                {i.jrkg?.buySignal?"🟢 BUY SIGNAL":
                 i.jrkg?.sellSignal?"🔴 SELL SIGNAL":
                 i.jrkg?.earlyExit?"🟡 EARLY EXIT":
                 i.jrkg?.aboveZero?"▲ ABOVE ZERO":"▼ BELOW ZERO"}
              </div>
              <div style={{fontSize:9,color:T.t2,fontFamily:"monospace"}}>
                Val: {i.jrkg?.value} · AMA {i.jrkg?.priceAboveAma?"↑":"↓"} ₹{i.jrkg?.ama}
              </div>
            </div>

            {/* BBPT */}
            <div style={{
              background:i.bbpt?.isBull?T.greenDim:i.bbpt?.isBear?T.redDim:T.bg3,
              border:`0.5px solid ${i.bbpt?.isBull?T.green:i.bbpt?.isBear?T.red:T.border}`,
              borderRadius:4,padding:"6px 8px"}}>
              <div style={{fontSize:8,color:T.t2,marginBottom:2,fontFamily:"monospace",letterSpacing:"1px"}}>BBPT</div>
              <div style={{fontSize:10,fontWeight:600,fontFamily:"monospace",color:
                i.bbpt?.isBull&&!i.bbpt?.isBear?T.green:
                i.bbpt?.isBear&&!i.bbpt?.isBull?T.red:
                i.bbpt?.trend>0?T.green:T.red}}>
                {i.bbpt?.signal==="STRONG_BULL"?"🟢 STRONG BULL":
                 i.bbpt?.signal==="BULL"?"🟢 BULL":
                 i.bbpt?.signal==="BEAR"?"🔴 BEAR":
                 i.bbpt?.signal==="STRONG_BEAR"?"🔴 STRONG BEAR":
                 i.bbpt?.trend>0?"▲ WEAK BULL":"▼ WEAK BEAR"}
              </div>
              <div style={{fontSize:9,color:T.t2,fontFamily:"monospace"}}>
                Bull: {i.bbpt?.bullTrend} · Bear: {i.bbpt?.bearTrend2}
              </div>
            </div>
          </div>
        </div>

        {/* Peers */}
        <div>
          <div style={{fontSize:9,color:T.t2,letterSpacing:"1px",textTransform:"uppercase",marginBottom:4,paddingBottom:3,borderBottom:`0.5px solid ${T.border}`}}>Peers · RS Rank #{rsRank}/{allRS.length}</div>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:9,tableLayout:"fixed"}}>
            <thead>
              <tr>{["Stock","Price","Chg%","vs Hi"].map(h=>(
                <th key={h} style={{color:T.t2,textAlign:"left",padding:"2px 4px",borderBottom:`0.5px solid ${T.border}`,fontFamily:"monospace",fontWeight:400,letterSpacing:"0.5px"}}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              <tr style={{background:T.bg3}}>
                <td style={{padding:"3px 4px",fontFamily:"monospace",color:T.amber,fontWeight:600,overflow:"hidden",whiteSpace:"nowrap"}}>{symbol}★</td>
                <td style={{padding:"3px 4px",fontFamily:"monospace",color:T.t0}}>{fmtP(i.price)}</td>
                <td style={{padding:"3px 4px",fontFamily:"monospace",color:col(i.changePct)}}>{fmtPct(i.changePct)}</td>
                <td style={{padding:"3px 4px",fontFamily:"monospace",color:T.green}}>{i.fromHigh}%</td>
              </tr>
              {(peers||[]).map((p,idx)=>p&&(
                <tr key={idx} style={{borderBottom:`0.5px solid ${T.border}`}}>
                  <td style={{padding:"3px 4px",fontFamily:"monospace",color:T.t1,overflow:"hidden",whiteSpace:"nowrap"}}>{p.symbol}</td>
                  <td style={{padding:"3px 4px",fontFamily:"monospace",color:T.t0}}>{fmtP(p.price)}</td>
                  <td style={{padding:"3px 4px",fontFamily:"monospace",color:col(p.chgPct)}}>{fmtPct(p.chgPct)}</td>
                  <td style={{padding:"3px 4px",fontFamily:"monospace",color:T.t1}}>{p.high52?`${((p.price/p.high52)*100).toFixed(1)}%`:"—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Circuit Limits + Expiry */}
        <div style={{marginBottom:8}}>
          <div style={{fontSize:9,color:T.t2,letterSpacing:"1px",textTransform:"uppercase",marginBottom:4,paddingBottom:3,borderBottom:`0.5px solid ${T.border}`}}>Circuit & F&O Expiry</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:4,marginBottom:6}}>
            <div style={{background:T.bg3,border:`0.5px solid ${T.border}`,borderRadius:4,padding:"5px 7px"}}>
              <div style={{fontSize:9,color:T.t2,marginBottom:1}}>CIRCUIT BAND</div>
              <div style={{fontFamily:"monospace",fontSize:12,fontWeight:600,
                color:fund?.priceBand==="No Band"||!fund?.priceBand?T.t2:
                fund?.bandPct<=5?T.red:fund?.bandPct<=10?T.amber:T.green}}>
                {fund?.priceBand||"—"}
              </div>
            </div>
            <div style={{background:T.bg3,border:`0.5px solid ${T.border}`,borderRadius:4,padding:"5px 7px"}}>
              <div style={{fontSize:9,color:T.t2,marginBottom:1}}>UPPER CIRCUIT</div>
              <div style={{fontFamily:"monospace",fontSize:12,fontWeight:500,color:T.green}}>
                {fund?.upperCircuit?`₹${fund.upperCircuit}`:"—"}
              </div>
            </div>
            <div style={{background:T.bg3,border:`0.5px solid ${T.border}`,borderRadius:4,padding:"5px 7px"}}>
              <div style={{fontSize:9,color:T.t2,marginBottom:1}}>LOWER CIRCUIT</div>
              <div style={{fontFamily:"monospace",fontSize:12,fontWeight:500,color:T.red}}>
                {fund?.lowerCircuit?`₹${fund.lowerCircuit}`:"—"}
              </div>
            </div>
            <div style={{background:fund?.isFNO?T.greenDim:T.bg3,border:`0.5px solid ${fund?.isFNO?T.green:T.border}`,borderRadius:4,padding:"5px 7px"}}>
              <div style={{fontSize:9,color:T.t2,marginBottom:1}}>F&O ELIGIBLE</div>
              <div style={{fontFamily:"monospace",fontSize:12,fontWeight:600,color:fund?.isFNO?T.green:T.t2}}>
                {fund?.isFNO?"✓ YES":"✗ NO"}
              </div>
            </div>
          </div>

          {/* Circuit change alert */}
          {todayCircuitChange&&(
            <div style={{background:T.amberDim,border:`0.5px solid ${T.amber}`,borderRadius:4,padding:"6px 8px",marginBottom:6,display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:14}}>⚠️</span>
              <div>
                <div style={{fontSize:10,fontWeight:600,color:T.amber,fontFamily:"monospace"}}>CIRCUIT BAND CHANGED TODAY</div>
                <div style={{fontSize:10,color:T.t1,fontFamily:"monospace"}}>
                  {todayCircuitChange.old||"—"} → {todayCircuitChange.new||"—"}
                </div>
              </div>
            </div>
          )}

          {/* Prev month expiry H/L */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:4}}>
            <div style={{background:T.bg3,border:`0.5px solid ${T.border}`,borderRadius:4,padding:"5px 7px"}}>
              <div style={{fontSize:9,color:T.t2,marginBottom:1}}>PREV EXPIRY DATE</div>
              <div style={{fontFamily:"monospace",fontSize:11,fontWeight:500,color:T.amber}}>
                {prevExpiry?prevExpiry.toLocaleDateString("en-IN",{day:"2-digit",month:"short"}):"—"}
              </div>
            </div>
            <div style={{background:T.bg3,border:`0.5px solid ${T.border}`,borderRadius:4,padding:"5px 7px"}}>
              <div style={{fontSize:9,color:T.t2,marginBottom:1}}>EXPIRY HIGH</div>
              <div style={{fontFamily:"monospace",fontSize:11,fontWeight:500,color:T.green}}>
                {expiryHL?`₹${expiryHL.high}`:"—"}
              </div>
            </div>
            <div style={{background:T.bg3,border:`0.5px solid ${T.border}`,borderRadius:4,padding:"5px 7px"}}>
              <div style={{fontSize:9,color:T.t2,marginBottom:1}}>EXPIRY LOW</div>
              <div style={{fontFamily:"monospace",fontSize:11,fontWeight:500,color:T.red}}>
                {expiryHL?`₹${expiryHL.low}`:"—"}
              </div>
            </div>
          </div>
        </div>

        {/* Fundamentals — moved to bottom */}
        <div style={{marginBottom:8}}>
          <div style={{fontSize:9,color:T.t2,letterSpacing:"1px",textTransform:"uppercase",marginBottom:4,paddingBottom:3,borderBottom:`0.5px solid ${T.border}`}}>
            Fundamentals <span style={{fontSize:8,color:T.t3,fontWeight:400,letterSpacing:0,textTransform:"none"}}>— via Screener.in (may be delayed)</span>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:4}}>
            <KV label="P/E"  value={fund?.pe||"—"}/>
            <KV label="P/B"  value={fund?.pb||"—"}/>
            <KV label="ROE %"  value={fund?.roe||"—"} color={parseFloat(fund?.roe)>15?T.green:T.t0}/>
            <KV label="D/E"  value={fund?.de||"—"}  color={parseFloat(fund?.de)>1.5?T.red:T.t0}/>
            <KV label="Prm %" value={fund?.promoter||"—"} color={parseFloat(fund?.promoter)>50?T.green:T.t0}/>
            <KV label="EPS TTM"  value={fund?.eps||"—"}/>
            <KV label="MCap Cr" value={fund?.mcap||"—"} color={parseFloat(fund?.mcap)<1000?T.red:T.t0}/>
            <KV label="Div %" value={fund?.divYield||"—"}/>
          </div>
        </div>
      </div>

      {/* ── RIGHT PANEL — chart + verdict ── */}
      <div style={{width:"62%",display:"flex",flexDirection:"column",overflowY:"auto",padding:"10px 12px"}}>

        {/* Chart */}
        <div style={{background:T.bg2,border:`0.5px solid ${T.border}`,borderRadius:8,padding:10,marginBottom:8}}>
          <div style={{fontSize:8,color:T.t2,letterSpacing:"1px",textTransform:"uppercase",marginBottom:6}}>
            PRICE CHART · CPR · ICHIMOKU · MA50/200 · VOLUME
          </div>
          <EnhancedChart candles={candles} ind={i}/>
        </div>

        {/* CPR Multi-Timeframe Panel */}
        <div style={{background:T.bg2,border:`0.5px solid ${T.border}`,borderRadius:8,
          padding:10,marginBottom:8,minHeight:280}}>
          <div style={{fontSize:8,color:T.t2,letterSpacing:"1px",textTransform:"uppercase",marginBottom:6}}>
            CPR · DAILY / WEEKLY / MONTHLY / YEARLY
          </div>
          <CPRPanel
            multiCPR={multiCPR}
            candles={candles}
            price={i?.price}
            intraday={intraday15}
            fetchIntraday={()=>fetchIntraday(symbol)}
          />
        </div>

        {/* Verdict */}
        <div style={{background:T.bg1,border:`1px solid ${T.borderHi}`,borderRadius:8,padding:10,flex:1}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
            <div>
              <div style={{fontSize:8,color:T.amber,letterSpacing:"2px",textTransform:"uppercase",marginBottom:3}}>WAR ROOM VERDICT</div>
              <div style={{fontSize:9,color:T.t2,fontFamily:"monospace"}}>Stage {i.stage} · MV {i.mvScore}/8 · RS {i.rs} · Score {i.score}/15</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontFamily:"monospace",fontSize:18,fontWeight:600,color:recColors[i.rec]||T.amber}}>{i.rec}</div>
              <div style={{fontSize:9,padding:"2px 8px",borderRadius:2,background:recBgs[i.rec]||T.amberDim,color:recColors[i.rec]||T.amber,border:`0.5px solid ${recColors[i.rec]||T.amber}`}}>{i.recLabel}</div>
            </div>
          </div>
          <Bar pct={i.conf} color={T.amber} h={4}/>
          <div style={{fontSize:9,color:T.t2,fontFamily:"monospace",marginTop:2,marginBottom:8}}>{i.conf}% conviction</div>
          <div style={{fontSize:12,color:T.t1,lineHeight:1.9}}>
            {/* Para 1 — trend & setup */}
            <b style={{color:T.t0}}>{symbol}</b> is in{" "}
            <b style={{color:i.stage===2?T.green:i.stage>=3?T.red:T.amber}}>Stage {i.stage} — {["","Basing","Advancing","Topping","Declining"][i.stage]||"Unknown"}</b>,
            trading at <b style={{color:T.t0}}>{fmtP(i.price)}</b> — <b style={{color:i.fromHigh>88?T.green:i.fromHigh<75?T.red:T.amber}}>{i.fromHigh}%</b> of its 52-week high of {fmtP(i.wkHigh)}.
            Price is {i.price>(i.ma50||0)&&i.price>(i.ma200||0)
              ?<><b style={{color:T.green}}>above both MA50 (₹{i.ma50}) and MA200 (₹{i.ma200})</b> — long-term structure intact.</>
              :i.price>(i.ma200||0)
              ?<><b style={{color:T.amber}}>above MA200 (₹{i.ma200}) but below MA50 (₹{i.ma50}).</b></>
              :<><b style={{color:T.red}}>below MA200 (₹{i.ma200}) — structural weakness.</b></>}
          </div>
          <div style={{fontSize:12,color:T.t1,lineHeight:1.9,marginTop:6}}>
            {/* Para 2 — momentum */}
            {i.macd>i.macdSignal
              ?<><b style={{color:T.green}}>MACD is in bullish crossover</b> ({i.macd}/{i.macdSignal}), confirming upward momentum. </>
              :<><b style={{color:T.red}}>MACD is in bearish crossover</b> ({i.macd}/{i.macdSignal}), signalling caution. </>}
            RSI at <b style={{color:i.rsi>70?T.red:i.rsi<40?T.green:T.t0}}>{i.rsi}</b>{" "}
            {i.rsi>70?"is overbought — wait for a pullback before adding.":i.rsi<40?"is oversold — potential bounce zone, watch for reversal candle.":"is in healthy momentum range — room to run."}{" "}
            ADX at <b style={{color:i.adx>25?T.green:T.t1}}>{i.adx||"N/A"}</b>{" "}
            {(i.adx||0)>35?"confirms a strong trending move with conviction.":(i.adx||0)>25?"confirms a trending move.":"is below 25, suggesting a weak or ranging trend — wait for trend confirmation."}{" "}
            Volume at <b style={{color:i.relVol>=1.2?T.green:i.relVol<0.8?T.red:T.t1}}>{i.relVol}x</b> average —{" "}
            {i.relVol>=1.3?"strong institutional participation visible.":i.relVol>=1.0?"moderate participation.":"below average — low conviction move."}
          </div>
          <div style={{fontSize:12,color:T.t1,lineHeight:1.9,marginTop:6}}>
            {/* Para 3 — systems */}
            Minervini score <b style={{color:T.amber}}>{i.mvScore}/8</b>{" "}
            {i.mvScore>=6?"qualifies as a VCP candidate — watch for tight consolidation and low-volume base before entry.":i.mvScore>=4?"shows a partial setup — needs more criteria to align.":"is weak — not a Minervini setup at this stage."}{" "}
            Ichimoku cloud: <b style={{color:i.ichimoku?.includes("Above")?T.green:T.red}}>{i.ichimoku}</b>.{" "}
            Guppy MMA: <b style={{color:i.guppy?.includes("Bull")?T.green:i.guppy?.includes("Bear")?T.red:T.amber}}>{i.guppy}</b>.{" "}
            TTM Squeeze: <b style={{color:i.ttm==="+"?T.green:T.red}}>{i.ttm==="+"?"Firing — momentum expanding":"Compressed — breakout may be near"}</b>.
          </div>
          <div style={{marginTop:8,padding:8,background:T.bg3,borderRadius:5,fontFamily:"monospace",fontSize:11}}>
            {i.rec==="BUY"
              ?<><span style={{color:T.t2}}>Entry </span><span style={{color:T.green}}>{fmtP(+(i.price*0.97).toFixed(0))}–{fmtP(i.price)}</span>
                <span style={{color:T.t2}}> · Target </span><span style={{color:T.green}}>{fmtP(+(i.price*1.15).toFixed(0))} +15%</span>
                <span style={{color:T.t2}}> · Stop </span><span style={{color:T.red}}>{fmtP(+(i.price*0.93).toFixed(0))} -7%</span></>
              :i.rec==="WATCH"
              ?<><span style={{color:T.t2}}>Watch breakout above </span><span style={{color:T.amber}}>{fmtP(i.wkHigh)}</span>
                <span style={{color:T.t2}}> · Stop </span><span style={{color:T.red}}>{fmtP(+(i.price*0.93).toFixed(0))} -7%</span></>
              :<span style={{color:T.t2}}>Wait for better setup · No fresh entry</span>
            }
          </div>
          {/* Key Levels */}
          <div style={{marginTop:10,paddingTop:8,borderTop:`0.5px solid ${T.border}`}}>
            <div style={{fontSize:8,color:T.t2,letterSpacing:"1px",textTransform:"uppercase",marginBottom:6}}>Key Levels — CPR & Pivots</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:4}}>
              {[["S2",i.s2,T.red],["S1",i.s1,T.red],["Pivot",i.pivot,T.t1],["R1",i.r1,T.green],["R2",i.r2,T.green]].map(([l,v,c])=>(
                <div key={l} style={{textAlign:"center",padding:"4px 2px",background:T.bg3,border:`0.5px solid ${T.border}`,borderRadius:3}}>
                  <div style={{fontSize:8,color:T.t2,marginBottom:2,fontFamily:"monospace"}}>{l}</div>
                  <div style={{fontSize:9,fontWeight:600,color:c,fontFamily:"monospace"}}>{v?v.toFixed(0):"—"}</div>
                </div>
              ))}
            </div>
          </div>

          {/* CPR Width */}
          <div style={{marginTop:8,padding:"6px 8px",background:T.bg3,borderRadius:4,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontSize:8,color:T.t2,marginBottom:2,fontFamily:"monospace"}}>CPR WIDTH</div>
              <div style={{fontFamily:"monospace",fontSize:10,fontWeight:600,color:
                i.r1&&i.s1?(i.r1-i.s1)<i.atr*0.5?T.green:i.r1-i.s1>i.atr*1.5?T.red:T.amber:T.t1}}>
                {i.r1&&i.s1?`₹${(i.r1-i.s1).toFixed(0)}`:"—"}
              </div>
            </div>
            <div style={{fontSize:9,color:i.r1&&i.s1&&i.atr?(i.r1-i.s1)<i.atr*0.5?"Narrow — trending":i.r1-i.s1>i.atr*1.5?"Wide — ranging":"Moderate":T.t2,fontFamily:"monospace",textAlign:"right"}}>
              {i.r1&&i.s1&&i.atr?(i.r1-i.s1)<i.atr*0.5?"Narrow — trending day":i.r1-i.s1>i.atr*1.5?"Wide — ranging market":"Moderate width":"—"}
            </div>
          </div>

          {/* Key Risks */}
          <div style={{marginTop:8}}>
            <div style={{fontSize:8,color:T.t2,letterSpacing:"1px",textTransform:"uppercase",marginBottom:5}}>Key Risks</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
              {i.risks?.slice(0,4).map((r,idx)=>(
                <span key={idx} style={{fontSize:9,padding:"2px 6px",borderRadius:2,background:T.bg3,border:`0.5px solid ${T.border}`,color:T.t2,fontFamily:"monospace"}}>{r}</span>
              ))}
            </div>
          </div>

          {/* Scanned at */}
          <div style={{marginTop:8,paddingTop:6,borderTop:`0.5px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{fontSize:8,color:T.t3,fontFamily:"monospace"}}>
              <Dot color={T.green} pulse/>FYERS API LIVE · NOT FINANCIAL ADVICE
            </div>
            <div style={{fontSize:8,color:T.t3,fontFamily:"monospace"}}>
              Scanned {data.scannedAt?new Date(data.scannedAt).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"}):"—"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────────────────────────
const DEFAULT_WATCHLIST=["SUNPHARMA","NTPC","TATAMOTORS","RELIANCE","CIPLA","TATAPOWER","HDFCBANK","DRREDDY","LUPIN","MARUTI","TCS","DIVISLAB"];

export default function App() {
  const [tokenData,setTokenData]   = useState(null);
  const [tokenError,setTokenError] = useState(null);
  const [tokenDismissed,setTokenDismissed] = useState(false);
  const [scans,setScans]           = useState([]);
  const [activeIdx,setActiveIdx]   = useState(null);
  const [loading,setLoading]       = useState(false);
  const [loadMsg,setLoadMsg]       = useState("");
  const [inputSym,setInputSym]     = useState("");
  const [market,setMarket]         = useState(null);
  const [circuitChanges,setCircuitChanges] = useState(null);
  const [intraday15,setIntraday15]         = useState([]);
  const [watchlist,setWatchlist]   = useState(()=>{
    try{ const s=localStorage.getItem("warroom_watchlist"); return s?JSON.parse(s):DEFAULT_WATCHLIST; }
    catch{ return DEFAULT_WATCHLIST; }
  });
  const [editingWL,setEditingWL]   = useState(false);
  const [wlInput,setWlInput]       = useState("");
  const [showWatchlist,setShowWatchlist] = useState(true);
  const [activeView,setActiveView] = useState("dashboard");
  const loadingRef = useRef(false);

  useEffect(()=>{
    loadToken().then(t=>setTokenData(t)).catch(e=>setTokenError(e.message));
  },[]);

  const fetchIntraday = useCallback(async(sym) => {
    if (!tokenData||!sym) return;
    try {
      const now  = new Date();
      const from = new Date(); from.setHours(9,0,0,0);
      const fmt  = d=>d.toISOString().split("T")[0];
      const url  = `https://api-t1.fyers.in/data/history?symbol=${encodeURIComponent("NSE:"+sym+"-EQ")}&resolution=15&date_format=1&range_from=${fmt(from)}&range_to=${fmt(now)}&cont_flag=1`;
      const r = await fetch(url,{headers:{Authorization:`${tokenData.app_id}:${tokenData.access_token}`}});
      const d = await r.json();
      if (d.candles?.length) setIntraday15(d.candles);
    } catch {}
  },[tokenData]);

  useEffect(()=>{
    if (!tokenData) return;
    fetchMarketContext(tokenData.access_token,tokenData.app_id).then(m=>{ if(m) setMarket(m); });
    fetchCircuitChanges().then(cc=>{ if(cc) setCircuitChanges(cc); });
  },[tokenData]);

  const addToWatchlist = (sym) => {
    const s = sym.toUpperCase().trim();
    if (!s || watchlist.includes(s)) return;
    const updated = [...watchlist, s];
    setWatchlist(updated);
    setWlInput("");
    try { localStorage.setItem("warroom_watchlist", JSON.stringify(updated)); } catch {}
  };
  const removeFromWatchlist = (sym) => {
    const updated = watchlist.filter(s=>s!==sym);
    setWatchlist(updated);
    try { localStorage.setItem("warroom_watchlist", JSON.stringify(updated)); } catch {}
  };

  const scan = useCallback(async (rawSym) => {
    if (loadingRef.current) return;
    const sym = rawSym.toUpperCase().trim();
    if (!tokenData){ console.warn("No token — live data unavailable"); return; }
    loadingRef.current=true;
    setLoading(true);
    setInputSym(sym);
    setActiveView("dashboard");
    try {
      setLoadMsg(`Fetching 1Y candles for ${sym}...`);
      const candles = await fetchHistory(sym, tokenData.access_token, tokenData.app_id);
      if (!candles?.length) throw new Error("No candle data returned");
      setLoadMsg("Computing indicators...");
      const ind = computeAllIndicators(candles);
      if (!ind) throw new Error("Not enough data");
      setLoadMsg("Live quote...");
      try {
        const q = await fetchQuote(sym, tokenData.access_token, tokenData.app_id);
        if (q?.lp)  ind.price     = +q.lp.toFixed(2);
        if (q?.chp) ind.changePct = +q.chp.toFixed(2);
      } catch {}
      setLoadMsg("Fetching NSE data (circuit + fundamentals)...");
      let fund = null;
      let nseData = null;
      try {
        nseData = await fetchNSEQuote(sym);
        // Merge NSE data into fund object + try Screener as fallback
        const screenerFund = await fetchFundamentals(sym).catch(()=>null);
        fund = {
          ...(screenerFund || {}),
          pe:      nseData?.pe      || screenerFund?.pe      || null,
          pb:      nseData?.pb      || screenerFund?.pb      || null,
          eps:     screenerFund?.eps || null,
          mcap:    screenerFund?.mcap || null,
          roe:     screenerFund?.roe  || null,
          de:      screenerFund?.de   || null,
          promoter: screenerFund?.promoter || null,
          divYield: screenerFund?.divYield || null,
          // Circuit from NSE
          priceBand:     nseData?.priceBand     || "—",
          bandPct:       nseData?.bandPct       || null,
          upperCircuit:  nseData?.upperCircuit  || null,
          lowerCircuit:  nseData?.lowerCircuit  || null,
          isFNO:         nseData?.isFNO         || false,
          companyName:   nseData?.companyName   || null,
          industry:      nseData?.industry      || null,
        };
      } catch {}
      const sector = SECTOR_MAP[sym] || "Unknown";
      setLoadMsg("Peer data...");
      const peers = await Promise.all(
        (SECTOR_PEERS[sector]||SECTOR_PEERS.Default).map(p=>fetchPeerQuote(p,tokenData.access_token,tokenData.app_id))
      );
      // F&O expiry levels
      const prevExpiry = getPrevMonthExpiry();
      const expiryHL   = getExpiryHL(candles, prevExpiry);
      // Circuit change for this stock today
      const todayCircuitChange = circuitChanges?.changes?.find(c=>c.symbol===sym) || null;

      const multiCPR = calcMultiCPR(candles, ind?.price||0);
      const scanData={
        symbol:sym, sector,
        companyName: fund?.companyName || sym,
        fund, ind, peers, candles,
        expiryHL, prevExpiry,
        todayCircuitChange,
        multiCPR,
        scannedAt:new Date()
      };
      setScans(prev=>{
        const exists=prev.findIndex(s=>s.symbol===sym);
        if(exists>=0){ const u=[...prev]; u[exists]=scanData; setActiveIdx(exists); return u; }
        setActiveIdx(prev.length); return [...prev,scanData];
      });
    } catch(e){ alert(`Scan failed: ${e.message}`); }
    finally { setLoading(false); setLoadMsg(""); loadingRef.current=false; }
  },[tokenData]);

  const activeData = activeIdx!==null ? scans[activeIdx] : null;

  const css=`
    @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@300;400;500;600&display=swap');
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:${T.bg0};color:${T.t0};font-family:'IBM Plex Sans',sans-serif;height:100vh;overflow:hidden}
    input,button{font-family:'IBM Plex Sans',sans-serif}
    ::-webkit-scrollbar{width:3px;height:3px}::-webkit-scrollbar-track{background:${T.bg1}}::-webkit-scrollbar-thumb{background:${T.border};border-radius:2px}
    @keyframes fadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
    @keyframes spin{to{transform:rotate(360deg)}}
  `;

  const NAV_H  = 42;
  const BAR_H  = tokenData ? 26 : 0;
  const MKT_H  = market?.length ? 24 : 0;
  const BODY_H = `calc(100vh - ${NAV_H + BAR_H + MKT_H}px)`;

  return (
    <>
      <style>{css}</style>
      <div style={{height:"100vh",background:T.bg0,display:"flex",flexDirection:"column",overflow:"hidden"}}>

        {/* Nav */}
        <div style={{background:T.bg1,borderBottom:`1px solid ${T.border}`,height:NAV_H,display:"flex",alignItems:"center",gap:8,padding:"0 12px",flexShrink:0}}>
          <button onClick={()=>setShowWatchlist(v=>!v)} style={{fontFamily:"monospace",fontSize:10,color:T.amber,letterSpacing:"2px",fontWeight:600,background:"none",border:"none",cursor:"pointer",whiteSpace:"nowrap"}}>⚡ WAR ROOM</button>
          <div style={{width:1,height:18,background:T.border,flexShrink:0}}/>
          <div style={{display:"flex",gap:3,flex:1,overflowX:"auto",scrollbarWidth:"none"}}>
            {scans.map((s,idx)=>(
              <button key={s.symbol} onClick={()=>{setActiveIdx(idx);setActiveView("dashboard");setIntraday15([]);}}
                style={{fontFamily:"monospace",fontSize:9,padding:"3px 10px",whiteSpace:"nowrap",background:activeIdx===idx&&activeView==="dashboard"?T.amber:T.bg3,border:`0.5px solid ${activeIdx===idx&&activeView==="dashboard"?T.amber:T.border}`,borderRadius:3,color:activeIdx===idx&&activeView==="dashboard"?T.bg0:T.t1,cursor:"pointer",fontWeight:activeIdx===idx?600:400}}>
                {s.symbol} <span style={{color:activeIdx===idx&&activeView==="dashboard"?T.bg0:col(s.ind?.changePct)}}>{s.ind?.changePct>=0?"+":""}{s.ind?.changePct}%</span>
              </button>
            ))}
          </div>
          <div style={{display:"flex",gap:6,flexShrink:0,alignItems:"center"}}>
            <button onClick={()=>setActiveView(v=>v==="screener"?"dashboard":"screener")}
              style={{fontFamily:"monospace",fontSize:9,padding:"5px 12px",background:activeView==="screener"?"#4a1d96":T.bg3,border:`0.5px solid ${activeView==="screener"?"#a855f7":T.border}`,borderRadius:4,color:activeView==="screener"?"#a855f7":T.t1,cursor:"pointer",fontWeight:activeView==="screener"?600:400}}>
              📡 SCREENER
            </button>
            <button onClick={()=>setActiveView(v=>v==="breadth"?"dashboard":"breadth")}
              style={{fontFamily:"monospace",fontSize:9,padding:"5px 12px",background:activeView==="breadth"?"#1a3a1a":T.bg3,border:`0.5px solid ${activeView==="breadth"?T.green:T.border}`,borderRadius:4,color:activeView==="breadth"?T.green:T.t1,cursor:"pointer",fontWeight:activeView==="breadth"?600:400}}>
              📊 BREADTH
            </button>
            <button onClick={()=>setActiveView(v=>v==="scanner"?"dashboard":"scanner")}
              style={{fontFamily:"monospace",fontSize:9,padding:"5px 12px",background:activeView==="scanner"?"#1a0a2e":T.bg3,border:`0.5px solid ${activeView==="scanner"?"#a855f7":T.border}`,borderRadius:4,color:activeView==="scanner"?"#a855f7":T.t1,cursor:"pointer",fontWeight:activeView==="scanner"?600:400}}>
              🔍 CNX500
            </button>
            <button onClick={()=>setActiveView(v=>v==="intraday"?"dashboard":"intraday")}
              style={{fontFamily:"monospace",fontSize:9,padding:"5px 12px",background:activeView==="intraday"?"#1a1a00":T.bg3,border:`0.5px solid ${activeView==="intraday"?T.amber:T.border}`,borderRadius:4,color:activeView==="intraday"?T.amber:T.t1,cursor:"pointer",fontWeight:activeView==="intraday"?600:400}}>
              ⚡ INTRADAY
            </button>
            <button onClick={()=>setActiveView(v=>v==="screens"?"dashboard":"screens")}
              style={{fontFamily:"monospace",fontSize:9,padding:"5px 12px",background:activeView==="screens"?"#0a1a0a":T.bg3,border:`0.5px solid ${activeView==="screens"?T.green:T.border}`,borderRadius:4,color:activeView==="screens"?T.green:T.t1,cursor:"pointer",fontWeight:activeView==="screens"?600:400}}>
              📋 MY SCREENS
            </button>
            <button onClick={()=>setActiveView(v=>v==="forensic"?"dashboard":"forensic")}
              style={{fontFamily:"monospace",fontSize:9,padding:"5px 12px",background:activeView==="forensic"?"#1a0a2e":T.bg3,border:`0.5px solid ${activeView==="forensic"?"#a855f7":T.border}`,borderRadius:4,color:activeView==="forensic"?"#a855f7":T.t1,cursor:"pointer",fontWeight:activeView==="forensic"?600:400}}>
              🔬 FORENSIC
            </button>
            <button onClick={()=>setActiveView(v=>v==="fundamental"?"dashboard":"fundamental")}
              style={{fontFamily:"monospace",fontSize:9,padding:"5px 12px",background:activeView==="fundamental"?"#0a1a1a":T.bg3,border:`0.5px solid ${activeView==="fundamental"?T.teal:T.border}`,borderRadius:4,color:activeView==="fundamental"?T.teal:T.t1,cursor:"pointer",fontWeight:activeView==="fundamental"?600:400}}>
              🧭 FUNDAMENTAL
            </button>
            <input value={inputSym} onChange={e=>setInputSym(e.target.value.toUpperCase())}
              onKeyDown={e=>e.key==="Enter"&&inputSym&&scan(inputSym)}
              placeholder="SYMBOL"
              style={{fontFamily:"monospace",fontSize:10,padding:"5px 8px",background:T.bg2,border:`1px solid ${T.border}`,borderRadius:4,color:T.t0,outline:"none",width:100}}/>
            <button onClick={()=>inputSym&&scan(inputSym)} disabled={loading}
              style={{padding:"5px 12px",background:T.amber,color:T.bg0,border:"none",borderRadius:4,fontFamily:"monospace",fontSize:10,fontWeight:600,cursor:loading?"not-allowed":"pointer",opacity:loading?0.5:1}}>
              {loading?"...":"SCAN"}
            </button>
          </div>
        </div>

        {/* Token bar */}
        {tokenError&&!tokenDismissed&&<div style={{background:T.redDim,borderBottom:`1px solid ${T.red}`,padding:"4px 12px",fontSize:10,color:T.red,fontFamily:"monospace",flexShrink:0,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
  <       span>⚠ No Fyers token — live prices unavailable. Forensic analysis works normally.</span>
          <button onClick={()=>setTokenDismissed(true)} style={{background:"transparent",border:`1px solid ${T.red}`,color:T.red,borderRadius:3,padding:"1px 8px",cursor:"pointer",fontSize:10,marginLeft:12}}>Dismiss ✕</button>
        </div>}
        {tokenData&&<div style={{background:T.bg1,borderBottom:`0.5px solid ${T.border}`,padding:"3px 12px",fontSize:9,color:T.t2,fontFamily:"monospace",display:"flex",gap:12,flexShrink:0}}>
          <span><Dot color={T.green} pulse/>Token valid · {tokenData.app_id}</span>
          <span>Generated: {new Date(tokenData.generated_at).toLocaleTimeString()}</span>
        </div>}

        {/* Market bar */}
        <MarketBar market={market}/>

        {/* Body */}
        <div style={{display:"flex",height:BODY_H,overflow:"hidden"}}>
          {showWatchlist&&<Watchlist items={watchlist} onScan={scan} active={activeData?.symbol}
            editing={editingWL} wlInput={wlInput} setWlInput={setWlInput}
            onAdd={addToWatchlist} onRemove={removeFromWatchlist} setEditing={setEditingWL}/>}

          <div style={{flex:1,display:"flex",overflow:"hidden"}}>

            {/* Screener */}
            {activeView==="screener"&&(
              <div style={{flex:1,overflowY:"auto"}}>
                <Screener tokenData={tokenData} onSelectStock={sym=>{setActiveView("dashboard");scan(sym);}}/>
              </div>
            )}

            {/* Market Breadth */}
            {activeView==="breadth"&&(
              <div style={{flex:1,overflowY:"auto"}}>
                <MarketBreadth tokenData={tokenData}/>
              </div>
            )}

            {/* CNX500 Scanner */}
            {activeView==="scanner"&&(
              <div style={{flex:1,overflow:"hidden"}}>
                <Nifty500Scanner tokenData={tokenData}
                  onSelectStock={sym=>{
                    setActiveView("dashboard");
                    scan(sym);
                  }}/>
              </div>
            )}

            {/* Intraday Pulse */}
            {activeView==="intraday"&&(
              <div style={{flex:1,overflow:"hidden"}}>
                <IntradayPulse tokenData={tokenData}
                  onSelectStock={sym=>{
                    setActiveView("dashboard");
                    scan(sym);
                  }}/>
              </div>
            )}

            {/* Screens */}
            {activeView==="screens"&&(
              <div style={{flex:1,overflow:"hidden"}}>
                <Screens onSelectStock={sym=>{
                    setActiveView("dashboard");
                    scan(sym);
                  }}/>
              </div>
            )}

            {/* Forensic Analysis */}
            {activeView==="forensic"&&(
              <div style={{flex:1,overflow:"hidden"}}>
                <FundamentalAnalysis
                  activeTopTab="forensic"
                  onSelectStock={sym=>{setActiveView("dashboard");scan(sym);}}/>
              </div>
            )}

            {/* Fundamental Analysis */}
            {activeView==="fundamental"&&(
              <div style={{flex:1,overflow:"hidden"}}>
                <FundamentalAnalysis
                  activeTopTab="fundamental"
                  onSelectStock={sym=>{setActiveView("dashboard");scan(sym);}}/>
              </div>
            )}

            {/* Dashboard */}
            {activeView==="dashboard"&&loading&&(
              <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12}}>
                <div style={{width:28,height:28,border:`3px solid ${T.border}`,borderTopColor:T.amber,borderRadius:"50%",animation:"spin 1s linear infinite"}}/>
                <div style={{fontFamily:"monospace",fontSize:10,color:T.amber,letterSpacing:"2px"}}>{loadMsg||"SCANNING..."}</div>
              </div>
            )}

            {activeView==="dashboard"&&!loading&&!activeData&&(
              <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:32,textAlign:"center"}}>
                <div style={{fontFamily:"monospace",fontSize:9,color:T.amber,letterSpacing:"4px",marginBottom:12}}>STOCK WAR ROOM</div>
                <div style={{fontSize:24,fontWeight:300,color:T.t0,marginBottom:6}}>Deep Scan. Zero Noise.</div>
                <div style={{fontSize:12,color:T.t1,lineHeight:1.7,maxWidth:400,marginBottom:20}}>
                  Live Fyers data · All indicators · Chart with CPR & Ichimoku · One screen
                </div>
                <div style={{display:"flex",gap:8,marginBottom:12}}>
                  <input value={inputSym} onChange={e=>setInputSym(e.target.value.toUpperCase())}
                    onKeyDown={e=>e.key==="Enter"&&inputSym&&scan(inputSym)}
                    placeholder="e.g. SUNPHARMA"
                    style={{fontFamily:"monospace",fontSize:13,padding:"10px 14px",background:T.bg2,border:`1.5px solid ${T.borderHi}`,borderRadius:5,color:T.t0,outline:"none",width:180}}/>
                  <button onClick={()=>inputSym&&scan(inputSym)}
                    style={{padding:"10px 20px",background:T.amber,color:T.bg0,border:"none",borderRadius:5,fontFamily:"monospace",fontSize:12,fontWeight:600,cursor:"pointer"}}>
                    ⚡ SCAN
                  </button>
                </div>
                <div style={{fontSize:10,color:T.t3,fontFamily:"monospace"}}>Or click any stock in the watchlist →</div>
              </div>
            )}

            {activeView==="dashboard"&&!loading&&activeData&&(
              <Dashboard data={activeData} peers={activeData.peers} candles={activeData.candles} circuitChanges={circuitChanges} intraday15={intraday15} fetchIntraday={fetchIntraday}/>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
