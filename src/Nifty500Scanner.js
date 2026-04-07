import { useState, useEffect, useRef } from "react";

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

// ── Module-level cache — survives tab switches ───────────────────────────────
let SCAN_CACHE = {
  results: [],
  log: "",
  niftyDraw: 15,
  timestamp: null,
};

// ── Parse CNX500 CSV ─────────────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.trim().split("\n").filter(l=>l.trim());
  if (lines.length < 2) throw new Error("CSV too short");
  const delim = lines[0].includes("\t") ? "\t" : ",";
  const headers = lines[0].split(delim).map(h=>h.trim().toLowerCase().replace(/"/g,""));
  const symIdx  = headers.findIndex(h=>h.includes("symbol"));
  const secIdx  = headers.findIndex(h=>h.includes("industry")||h.includes("sector"));
  const nameIdx = headers.findIndex(h=>h.includes("company")||h.includes("name"));
  if (symIdx===-1) throw new Error("Symbol column not found");
  const stocks = [];
  for (let i=1; i<lines.length; i++) {
    const cols = lines[i].split(delim).map(c=>c.trim().replace(/"/g,""));
    const sym = cols[symIdx];
    if (!sym||sym.length<2) continue;
    stocks.push({
      symbol: `NSE:${sym}-EQ`,
      rawSym: sym,
      name:   nameIdx>=0?cols[nameIdx]:sym,
      sector: secIdx>=0?cols[secIdx]:"Other",
    });
  }
  return stocks;
}

const CNX500_SYMBOLS = [
  {symbol:"NSE:RELIANCE-EQ",   name:"Reliance Industries",  sector:"Oil & Gas"},
  {symbol:"NSE:TCS-EQ",        name:"TCS",                  sector:"IT"},
  {symbol:"NSE:HDFCBANK-EQ",   name:"HDFC Bank",            sector:"Banking"},
  {symbol:"NSE:BHARTIARTL-EQ", name:"Bharti Airtel",        sector:"Telecom"},
  {symbol:"NSE:ICICIBANK-EQ",  name:"ICICI Bank",           sector:"Banking"},
  {symbol:"NSE:INFOSYS-EQ",    name:"Infosys",              sector:"IT"},
  {symbol:"NSE:SBIN-EQ",       name:"State Bank of India",  sector:"Banking"},
  {symbol:"NSE:HINDUNILVR-EQ", name:"Hindustan Unilever",   sector:"FMCG"},
  {symbol:"NSE:ITC-EQ",        name:"ITC",                  sector:"FMCG"},
  {symbol:"NSE:KOTAKBANK-EQ",  name:"Kotak Bank",           sector:"Banking"},
  {symbol:"NSE:LT-EQ",         name:"L&T",                  sector:"Capital Goods"},
  {symbol:"NSE:AXISBANK-EQ",   name:"Axis Bank",            sector:"Banking"},
  {symbol:"NSE:MARUTI-EQ",     name:"Maruti Suzuki",        sector:"Auto"},
  {symbol:"NSE:SUNPHARMA-EQ",  name:"Sun Pharma",           sector:"Pharma"},
  {symbol:"NSE:TATAMOTORS-EQ", name:"Tata Motors",          sector:"Auto"},
  {symbol:"NSE:WIPRO-EQ",      name:"Wipro",                sector:"IT"},
  {symbol:"NSE:TITAN-EQ",      name:"Titan",                sector:"Consumer"},
  {symbol:"NSE:BAJFINANCE-EQ", name:"Bajaj Finance",        sector:"NBFC"},
  {symbol:"NSE:NTPC-EQ",       name:"NTPC",                 sector:"Power"},
  {symbol:"NSE:POWERGRID-EQ",  name:"Power Grid",           sector:"Power"},
  {symbol:"NSE:CIPLA-EQ",      name:"Cipla",                sector:"Pharma"},
  {symbol:"NSE:DRREDDY-EQ",    name:"Dr Reddy's",           sector:"Pharma"},
  {symbol:"NSE:LUPIN-EQ",      name:"Lupin",                sector:"Pharma"},
  {symbol:"NSE:DIVISLAB-EQ",   name:"Divi's Lab",           sector:"Pharma"},
  {symbol:"NSE:AUROPHARMA-EQ", name:"Aurobindo Pharma",     sector:"Pharma"},
  {symbol:"NSE:TATAPOWER-EQ",  name:"Tata Power",           sector:"Power"},
  {symbol:"NSE:TATASTEEL-EQ",  name:"Tata Steel",           sector:"Metals"},
  {symbol:"NSE:JSWSTEEL-EQ",   name:"JSW Steel",            sector:"Metals"},
  {symbol:"NSE:HINDALCO-EQ",   name:"Hindalco",             sector:"Metals"},
  {symbol:"NSE:ONGC-EQ",       name:"ONGC",                 sector:"Oil & Gas"},
  {symbol:"NSE:COALINDIA-EQ",  name:"Coal India",           sector:"Mining"},
  {symbol:"NSE:GRASIM-EQ",     name:"Grasim",               sector:"Cement"},
  {symbol:"NSE:ULTRACEMCO-EQ", name:"UltraTech Cement",     sector:"Cement"},
  {symbol:"NSE:ADANIPORTS-EQ", name:"Adani Ports",          sector:"Logistics"},
  {symbol:"NSE:BAJAJFINSV-EQ", name:"Bajaj Finserv",        sector:"NBFC"},
  {symbol:"NSE:HCLTECH-EQ",    name:"HCL Tech",             sector:"IT"},
  {symbol:"NSE:TECHM-EQ",      name:"Tech Mahindra",        sector:"IT"},
  {symbol:"NSE:NESTLEIND-EQ",  name:"Nestle India",         sector:"FMCG"},
  {symbol:"NSE:TATACONSUM-EQ", name:"Tata Consumer",        sector:"FMCG"},
  {symbol:"NSE:GODREJCP-EQ",   name:"Godrej Consumer",      sector:"FMCG"},
  {symbol:"NSE:DABUR-EQ",      name:"Dabur",                sector:"FMCG"},
  {symbol:"NSE:MARICO-EQ",     name:"Marico",               sector:"FMCG"},
  {symbol:"NSE:COLPAL-EQ",     name:"Colgate",              sector:"FMCG"},
  {symbol:"NSE:BRITANNIA-EQ",  name:"Britannia",            sector:"FMCG"},
  {symbol:"NSE:PIDILITIND-EQ", name:"Pidilite",             sector:"Chemicals"},
  {symbol:"NSE:ASIANPAINT-EQ", name:"Asian Paints",         sector:"Chemicals"},
  {symbol:"NSE:HAVELLS-EQ",    name:"Havells",              sector:"Electricals"},
  {symbol:"NSE:SIEMENS-EQ",    name:"Siemens",              sector:"Capital Goods"},
  {symbol:"NSE:BEL-EQ",        name:"BEL",                  sector:"Defence"},
  {symbol:"NSE:HAL-EQ",        name:"HAL",                  sector:"Defence"},
  {symbol:"NSE:IRFC-EQ",       name:"IRFC",                 sector:"NBFC"},
  {symbol:"NSE:PFC-EQ",        name:"PFC",                  sector:"NBFC"},
  {symbol:"NSE:RECLTD-EQ",     name:"REC",                  sector:"NBFC"},
  {symbol:"NSE:HDFCLIFE-EQ",   name:"HDFC Life",            sector:"Insurance"},
  {symbol:"NSE:SBILIFE-EQ",    name:"SBI Life",             sector:"Insurance"},
  {symbol:"NSE:LICI-EQ",       name:"LIC",                  sector:"Insurance"},
  {symbol:"NSE:INDUSINDBK-EQ", name:"IndusInd Bank",        sector:"Banking"},
  {symbol:"NSE:FEDERALBNK-EQ", name:"Federal Bank",         sector:"Banking"},
  {symbol:"NSE:CANBK-EQ",      name:"Canara Bank",          sector:"Banking"},
  {symbol:"NSE:BANKBARODA-EQ", name:"Bank of Baroda",       sector:"Banking"},
  {symbol:"NSE:PNB-EQ",        name:"Punjab National Bank", sector:"Banking"},
  {symbol:"NSE:ZOMATO-EQ",     name:"Zomato",               sector:"Consumer Tech"},
  {symbol:"NSE:DMART-EQ",      name:"DMart",                sector:"Retail"},
  {symbol:"NSE:TRENT-EQ",      name:"Trent",                sector:"Retail"},
  {symbol:"NSE:APOLLOHOSP-EQ", name:"Apollo Hospitals",     sector:"Healthcare"},
  {symbol:"NSE:APOLLOTYRE-EQ", name:"Apollo Tyres",         sector:"Auto"},
  {symbol:"NSE:MOTHERSON-EQ",  name:"Motherson Sumi",       sector:"Auto"},
  {symbol:"NSE:MUTHOOTFIN-EQ", name:"Muthoot Finance",      sector:"NBFC"},
  {symbol:"NSE:CHOLAFIN-EQ",   name:"Cholamandalam",        sector:"NBFC"},
  {symbol:"NSE:LTIM-EQ",       name:"LTIMindtree",          sector:"IT"},
  {symbol:"NSE:MPHASIS-EQ",    name:"Mphasis",              sector:"IT"},
  {symbol:"NSE:PERSISTENT-EQ", name:"Persistent Systems",   sector:"IT"},
  {symbol:"NSE:COFORGE-EQ",    name:"Coforge",              sector:"IT"},
  {symbol:"NSE:OFSS-EQ",       name:"Oracle Fin Services",  sector:"IT"},
  {symbol:"NSE:INDIGO-EQ",     name:"IndiGo",               sector:"Aviation"},
  {symbol:"NSE:IRCTC-EQ",      name:"IRCTC",                sector:"Tourism"},
  {symbol:"NSE:DIXON-EQ",      name:"Dixon Technologies",   sector:"Electronics"},
  {symbol:"NSE:JUBLFOOD-EQ",   name:"Jubilant FoodWorks",   sector:"QSR"},
];

// ── Level 1 Filter ────────────────────────────────────────────────────────────
function level1Filter(candles, niftyDrawdownPct) {
  if (!candles || candles.length < 50) return null;
  const closes = candles.map(c=>c[4]);
  const price  = closes[closes.length-1];
  const w52    = candles.slice(-252);
  const high52w = Math.max(...w52.map(c=>c[2]));
  const high1y  = Math.max(...candles.slice(-252).map(c=>c[2]));
  const high5y  = Math.max(...candles.map(c=>c[2]));
  const pctFrom52wHigh = (price-high52w)/high52w*100;
  const pctFrom1yHigh  = (price-high1y)/high1y*100;
  const pctFrom5yHigh  = (price-high5y)/high5y*100;

  const breakout52w = pctFrom52wHigh >= -3;
  const breakout1y  = pctFrom1yHigh  >= -3;
  const breakout5y  = pctFrom5yHigh  >= -3;
  const nearHighThreshold = -(Math.abs(niftyDrawdownPct)+5);
  const nearHigh = pctFrom52wHigh >= nearHighThreshold && pctFrom52wHigh < -3;
  const deepDown = pctFrom52wHigh < -20;
  const last3 = closes.slice(-3);
  const reversing = deepDown && last3[2]>last3[0] && closes[closes.length-1]>closes[closes.length-4];

  let category = null;
  if (breakout5y)       category = "5Y_BREAKOUT";
  else if (breakout1y)  category = "1Y_BREAKOUT";
  else if (breakout52w) category = "52W_BREAKOUT";
  else if (nearHigh)    category = "NEAR_HIGH";
  else if (reversing)   category = "REVERSAL";
  if (!category) return null;

  return {category, price,
    pctFrom52wHigh:+pctFrom52wHigh.toFixed(1),
    pctFrom1yHigh: +pctFrom1yHigh.toFixed(1),
    pctFrom5yHigh: +pctFrom5yHigh.toFixed(1),
    high52w, high1y, high5y};
}

// ── Level 2 Filter ────────────────────────────────────────────────────────────
function level2Filter(candles) {
  if (!candles || candles.length < 50) return null;
  const closes  = candles.map(c=>c[4]);
  const volumes = candles.map(c=>c[5]);
  const lastC   = candles[candles.length-1];
  const price   = closes[closes.length-1];

  const calcEMA = (arr, n) => {
    if (arr.length<n) return null;
    const k=2/(n+1); let e=arr.slice(0,n).reduce((a,b)=>a+b,0)/n;
    for(let i=n;i<arr.length;i++) e=arr[i]*k+e*(1-k); return e;
  };
  const calcSMA = (arr, n) => arr.length<n?null:arr.slice(-n).reduce((a,b)=>a+b,0)/n;

  const ema10 = calcEMA(closes,10);
  const ema20 = calcEMA(closes,20);
  const ema50 = calcEMA(closes,50);
  const volMA = calcSMA(volumes,50);
  const lastVol = volumes[volumes.length-1];

  const instVol    = volMA && lastVol > volMA*2;
  const volAboveMA = volMA && lastVol > volMA;
  const last10     = candles.slice(-11,-1);
  const downVols   = last10.filter(c=>c[4]<c[1]).map(c=>c[5]);
  const maxDownVol = downVols.length?Math.max(...downVols):0;
  const pocketPivot= lastVol>maxDownVol && closes[closes.length-1]>closes[closes.length-2];
  const range      = lastC[2]-lastC[3];
  const upperWick  = lastC[2]-Math.max(lastC[1],lastC[4]);
  const strongBody = range>0 && (upperWick/range)<0.25;
  const hug10  = ema10 && Math.abs(price-ema10)/ema10<0.03;
  const hug20  = ema20 && Math.abs(price-ema20)/ema20<0.03;
  const hug50  = ema50 && Math.abs(price-ema50)/ema50<0.03;
  const hugging= hug10||hug20||hug50;

  const score = [instVol,pocketPivot,volAboveMA,strongBody,hugging].filter(Boolean).length;
  return {score, instVol, pocketPivot, volAboveMA, strongBody, hugging,
    ema10:ema10?+ema10.toFixed(2):null,
    ema20:ema20?+ema20.toFixed(2):null,
    ema50:ema50?+ema50.toFixed(2):null,
    volRatio:volMA?+(lastVol/volMA).toFixed(1):null};
}

// ── EMA Stage Classification ─────────────────────────────────────────────────
function classifyStage(candles) {
  if (!candles || candles.length < 200) return null;
  const closes  = candles.map(c=>c[4]);
  const volumes = candles.map(c=>c[5]);
  const price   = closes[closes.length-1];

  const calcEMA = (arr, n) => {
    if (arr.length<n) return null;
    const k=2/(n+1); let e=arr.slice(0,n).reduce((a,b)=>a+b,0)/n;
    for(let i=n;i<arr.length;i++) e=arr[i]*k+e*(1-k); return e;
  };
  const calcSMA = (arr,n) => arr.length<n?null:arr.slice(-n).reduce((a,b)=>a+b,0)/n;

  const e9   = calcEMA(closes, 9);
  const e21  = calcEMA(closes, 21);
  const e34  = calcEMA(closes, 34);
  const e50  = calcEMA(closes, 50);
  const e100 = calcEMA(closes, 100);
  const e200 = calcEMA(closes, 200);
  const volMA= calcSMA(volumes, 50);
  const lastVol = volumes[volumes.length-1];

  // Previous EMA9 for turn detection
  const prevCloses = closes.slice(0,-1);
  const prevE9  = calcEMA(prevCloses, 9);
  const prevE21 = calcEMA(prevCloses, 21);

  const lastC = candles[candles.length-1];
  const isRed = lastC[4] < lastC[1]; // close < open

  // Count how many EMAs price is above
  const emas = [e9,e21,e34,e50,e100,e200].filter(Boolean);
  const aboveCount = emas.filter(e=>price>e).length;
  const belowCount = emas.length - aboveCount;

  // EMA order check — bullish: 9>21>34>50>100>200
  const bullishOrder = e9>e21 && e21>e34 && e34>e50 && e50>e100 && e100>e200;
  const bearishOrder = e200>e100 && e100>e50 && e50>e34 && e34>e21 && e21>e9;

  // EMA9 turning up
  const e9TurningUp  = e9 && prevE9  && e9  > prevE9;
  const e21TurningUp = e21 && prevE21 && e21 > prevE21;

  // Volume spike
  const volSpike = volMA && lastVol > volMA * 1.5;

  // Higher lows last 3 candles
  const last3Lows = candles.slice(-3).map(c=>c[3]);
  const higherLows = last3Lows[2]>last3Lows[1] && last3Lows[1]>last3Lows[0];

  // Stage determination
  let stage, stageColor, stageLabel;

  if (aboveCount >= 4 && e9>e21 && e21>e50) {
    stage = "STAGE2"; stageColor = "#22c55e"; stageLabel = "Stage 2 ▲";
  } else if (aboveCount >= 2 && price > e21) {
    stage = "STAGE2_EARLY"; stageColor = "#86efac"; stageLabel = "Stage 2 Early";
  } else if (bearishOrder && aboveCount === 0) {
    stage = "STAGE4"; stageColor = "#ef4444"; stageLabel = "Stage 4 ▼";
  } else if (aboveCount <= 2 && belowCount >= 4) {
    stage = "STAGE4_EARLY"; stageColor = "#fca5a5"; stageLabel = "Stage 4 Early";
  } else {
    stage = "STAGE3"; stageColor = "#f59e0b"; stageLabel = "Stage 3 ~";
  }

  // Bottom fishing score (only relevant for Stage 4)
  let bottomScore = 0;
  const bottomReasons = [];
  if (e9TurningUp)  { bottomScore++; bottomReasons.push("EMA9 turning ↑"); }
  if (e21TurningUp) { bottomScore++; bottomReasons.push("EMA21 turning ↑"); }
  if (volSpike)     { bottomScore++; bottomReasons.push(`Vol spike ${(lastVol/volMA).toFixed(1)}x`); }
  if (higherLows)   { bottomScore++; bottomReasons.push("Higher lows"); }
  if (!isRed)       { bottomScore++; bottomReasons.push("Green candle"); }
  if (price > e9 && stage.includes("STAGE4")) { bottomScore++; bottomReasons.push("Above EMA9"); }

  const isBottomFish = stage.includes("STAGE4") && bottomScore >= 3;

  return {
    stage, stageColor, stageLabel,
    aboveCount, belowCount,
    e9, e21, e34, e50, e100, e200,
    e9TurningUp, e21TurningUp,
    volSpike, higherLows, isRed,
    bottomScore, bottomReasons, isBottomFish,
    bullishOrder, bearishOrder,
  };
}

// ── Category config ───────────────────────────────────────────────────────────
const CAT = {
  "5Y_BREAKOUT": {label:"5Y HIGH 🚀",  color:"#a855f7"},
  "1Y_BREAKOUT": {label:"1Y HIGH 🚀",  color:"#22c55e"},
  "52W_BREAKOUT":{label:"52W HIGH 🚀", color:"#22c55e"},
  "NEAR_HIGH":   {label:"NEAR HIGH 📍",color:"#f59e0b"},
  "REVERSAL":    {label:"REVERSAL 🔄", color:"#3b82f6"},
};

// ── Result Card ───────────────────────────────────────────────────────────────
function ResultCard({stock}) {
  const {name,rawSym,sector,l1,l2,stg} = stock;
  const cat = CAT[l1.category]||{label:l1.category,color:T.t2};
  const score = l2?.score??0;
  const sc = score>=4?T.green:score>=2?T.amber:T.blue;
  return (
    <div style={{background:T.bg2,border:`1px solid ${score>=4?cat.color:T.border}`,
      borderRadius:8,padding:"10px 12px"}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
        <div>
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
            <span style={{fontFamily:"monospace",fontSize:13,fontWeight:700,color:T.t0}}>
              {rawSym}
            </span>
            <span style={{fontSize:8,padding:"1px 5px",borderRadius:2,
              background:cat.color+"22",color:cat.color,
              border:`0.5px solid ${cat.color}`,fontWeight:600}}>
              {cat.label}
            </span>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:4,flexWrap:"wrap"}}>
          <span style={{fontSize:9,color:T.t3}}>{name} · {sector}</span>
          {stg&&(
            <span style={{fontSize:8,padding:"1px 5px",borderRadius:2,fontWeight:600,
              background:stg.stageColor+"22",color:stg.stageColor,
              border:`0.5px solid ${stg.stageColor}`}}>
              {stg.stageLabel} {stg.aboveCount}/6 EMAs
            </span>
          )}
          {stg?.isBottomFish&&(
            <span style={{fontSize:8,padding:"1px 5px",borderRadius:2,fontWeight:600,
              background:"#78350f",color:"#f59e0b",border:"0.5px solid #f59e0b"}}>
              🎣 BOTTOM FISH {stg.bottomScore}/6
            </span>
          )}
          {stg?.isRed&&(
            <span style={{fontSize:8,padding:"1px 4px",borderRadius:2,
              background:"#7f1d1d",color:"#ef4444"}}>🔴 RED DAY</span>
          )}
        </div>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontFamily:"monospace",fontSize:15,fontWeight:700,color:T.amber}}>
            ₹{n2(l1.price)}
          </div>
          {l2&&<div style={{fontFamily:"monospace",fontSize:11,color:sc}}>L2:{score}/5</div>}
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:4,marginBottom:6}}>
        {[
          {l:"vs 52W",v:`${l1.pctFrom52wHigh}%`,c:l1.pctFrom52wHigh>=-3?T.green:l1.pctFrom52wHigh>=-15?T.amber:T.red},
          {l:"vs 1Y", v:`${l1.pctFrom1yHigh}%`, c:l1.pctFrom1yHigh>=-3?T.green:l1.pctFrom1yHigh>=-15?T.amber:T.red},
          {l:"vs 5Y", v:`${l1.pctFrom5yHigh}%`, c:l1.pctFrom5yHigh>=-3?T.green:l1.pctFrom5yHigh>=-15?T.amber:T.red},
        ].map(x=>(
          <div key={x.l} style={{background:T.bg3,borderRadius:4,padding:"3px 6px",textAlign:"center"}}>
            <div style={{fontSize:7,color:T.t3}}>{x.l}</div>
            <div style={{fontFamily:"monospace",fontSize:10,fontWeight:600,color:x.c}}>{x.v}</div>
          </div>
        ))}
      </div>
      {l2&&(
        <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
          {[
            {k:"instVol",l:"INST VOL"},
            {k:"pocketPivot",l:"PKT PIVOT"},
            {k:"volAboveMA",l:"VOL>MA"},
            {k:"strongBody",l:"STRONG"},
            {k:"hugging",l:"EMA HUG"},
          ].map(({k,l})=>(
            <span key={k} style={{fontSize:8,padding:"2px 5px",borderRadius:2,
              background:l2[k]?T.greenDim:T.bg3,
              color:l2[k]?T.green:T.t3,
              border:`0.5px solid ${l2[k]?T.green:T.border}`}}>{l}</span>
          ))}
          {l2.volRatio&&(
            <span style={{fontSize:8,padding:"2px 5px",borderRadius:2,
              background:T.bg3,color:T.t2,border:`0.5px solid ${T.border}`}}>
              {l2.volRatio}x vol
            </span>
          )}
        </div>
      )}
      {stg?.isBottomFish&&stg.bottomReasons.length>0&&(
        <div style={{marginTop:6,padding:"4px 8px",background:"#78350f44",
          border:"0.5px solid #f59e0b",borderRadius:4,
          fontFamily:"monospace",fontSize:8,color:"#f59e0b"}}>
          🎣 {stg.bottomReasons.join(" · ")}
        </div>
      )}
    </div>
  );
}

// ── Actionable Block ─────────────────────────────────────────────────────────
function ActionableBlock({stocks, onSelectStock}) {
  if (!stocks.length) return null;
  return (
    <div style={{background:"#0a1a0a",border:`1px solid #22c55e`,
      borderRadius:8,padding:"12px 14px",marginBottom:8,flexShrink:0}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
        <div style={{fontSize:10,fontWeight:600,color:"#22c55e",
          fontFamily:"monospace",letterSpacing:"1px"}}>
          ✅ ACTIONABLE TODAY — {stocks.length} STOCK{stocks.length>1?"S":""}
        </div>
        <div style={{fontSize:9,color:"#546070",fontFamily:"monospace"}}>
          Click any stock → full analysis in Screener
        </div>
      </div>
      <div style={{display:"grid",
        gridTemplateColumns:`repeat(${Math.min(stocks.length,4)},1fr)`,gap:8}}>
        {stocks.map(s=>{
          const cat = CAT[s.l1.category]||{label:s.l1.category,color:"#94a3b8"};
          const sc  = s.l2?.score??0;
          return (
            <div key={s.rawSym}
              onClick={()=>onSelectStock&&onSelectStock(s.rawSym)}
              style={{background:"#0d1f0d",border:"1px solid #22c55e",
                borderRadius:8,padding:"10px 12px",cursor:"pointer",
                transition:"all 0.2s",
                boxShadow:"0 0 12px #22c55e22"}}
              onMouseEnter={e=>e.currentTarget.style.boxShadow="0 0 20px #22c55e55"}
              onMouseLeave={e=>e.currentTarget.style.boxShadow="0 0 12px #22c55e22"}>

              {/* Stock name + price */}
              <div style={{display:"flex",justifyContent:"space-between",
                alignItems:"flex-start",marginBottom:6}}>
                <div>
                  <div style={{fontFamily:"monospace",fontSize:14,
                    fontWeight:700,color:"#f1f5f9"}}>{s.rawSym}</div>
                  <div style={{fontSize:8,color:"#546070",marginTop:1}}>
                    {s.name}
                  </div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontFamily:"monospace",fontSize:14,
                    fontWeight:700,color:"#f59e0b"}}>
                    ₹{Number(s.l1.price).toLocaleString("en-IN",{maximumFractionDigits:1})}
                  </div>
                  <div style={{fontSize:9,color:"#22c55e",fontFamily:"monospace"}}>
                    L2: {sc}/5
                  </div>
                </div>
              </div>

              {/* Category + Stage badges */}
              <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:6}}>
                <span style={{fontSize:8,padding:"2px 6px",borderRadius:2,
                  background:cat.color+"22",color:cat.color,
                  border:`0.5px solid ${cat.color}`,fontWeight:600}}>
                  {cat.label}
                </span>
                {s.stg&&(
                  <span style={{fontSize:8,padding:"2px 6px",borderRadius:2,
                    background:s.stg.stageColor+"22",color:s.stg.stageColor,
                    border:`0.5px solid ${s.stg.stageColor}`,fontWeight:600}}>
                    {s.stg.stageLabel}
                  </span>
                )}
                {s.stg?.isBottomFish&&(
                  <span style={{fontSize:8,padding:"2px 6px",borderRadius:2,
                    background:"#78350f",color:"#f59e0b",
                    border:"0.5px solid #f59e0b",fontWeight:600}}>
                    🎣 BOTTOM FISH
                  </span>
                )}
              </div>

              {/* Key metrics */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",
                gap:4,marginBottom:6}}>
                <div style={{background:"#0a0a0f",borderRadius:4,
                  padding:"3px 6px",textAlign:"center"}}>
                  <div style={{fontSize:7,color:"#546070"}}>vs 52W High</div>
                  <div style={{fontFamily:"monospace",fontSize:10,fontWeight:600,
                    color:s.l1.pctFrom52wHigh>=-3?"#22c55e":
                          s.l1.pctFrom52wHigh>=-15?"#f59e0b":"#ef4444"}}>
                    {s.l1.pctFrom52wHigh}%
                  </div>
                </div>
                <div style={{background:"#0a0a0f",borderRadius:4,
                  padding:"3px 6px",textAlign:"center"}}>
                  <div style={{fontSize:7,color:"#546070"}}>EMAs above</div>
                  <div style={{fontFamily:"monospace",fontSize:10,fontWeight:600,
                    color:s.stg?.aboveCount>=4?"#22c55e":
                          s.stg?.aboveCount>=2?"#f59e0b":"#ef4444"}}>
                    {s.stg?.aboveCount??"-"}/6
                  </div>
                </div>
              </div>

              {/* L2 signals */}
              {s.l2&&(
                <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
                  {[
                    {k:"instVol",    l:"INST VOL"},
                    {k:"pocketPivot",l:"PKT PIVOT"},
                    {k:"volAboveMA", l:"VOL>MA"},
                    {k:"strongBody", l:"STRONG"},
                    {k:"hugging",    l:"EMA HUG"},
                  ].map(({k,l})=>s.l2[k]&&(
                    <span key={k} style={{fontSize:7,padding:"1px 4px",borderRadius:2,
                      background:"#14532d",color:"#22c55e",
                      border:"0.5px solid #22c55e"}}>{l}</span>
                  ))}
                </div>
              )}

              {/* Click hint */}
              <div style={{marginTop:6,fontSize:8,color:"#3d4d60",
                textAlign:"center",fontFamily:"monospace"}}>
                Click → Full Analysis ↗
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function Nifty500Scanner({tokenData, onSelectStock}) {
  const [results,   setResults]   = useState([]);
  const [scanning,  setScanning]  = useState(false);
  const [phase,     setPhase]     = useState("");
  const [progress,  setProgress]  = useState({done:0,total:0});
  const [log,       setLog]       = useState("");
  const [debugLog,  setDebugLog]  = useState([]);
  const [niftyDraw, setNiftyDraw] = useState(15);
  const [testMode,  setTestMode]  = useState(true);
  const [csvLoaded, setCsvLoaded] = useState(false);
  const [csvStocks, setCsvStocks] = useState([]);
  const stocksRef = useRef([]);
  const [filterCat,   setFilterCat]   = useState("ALL");
  const [filterStage, setFilterStage] = useState("ALL");
  const [minL2,     setMinL2]     = useState(0);
  const [sortBy,    setSortBy]    = useState("l2score");
  const [expandSec, setExpandSec] = useState({});
  const cancelRef  = useRef(false);
  const tokenRef   = useRef(null);
  const drawRef    = useRef(15);

  useEffect(()=>{ if(tokenData) tokenRef.current=tokenData; },[tokenData]);

  // Restore from module-level cache when tab is revisited
  useEffect(()=>{
    if (SCAN_CACHE.results.length > 0) {
      setResults(SCAN_CACHE.results);
      const ago = SCAN_CACHE.timestamp
        ? `(scanned ${SCAN_CACHE.timestamp.toLocaleTimeString("en-IN")})`
        : "";
      setLog(`✓ ${SCAN_CACHE.results.length} cached results ${ago} — RUN SCAN to refresh`);
    }
  },[]);

  const loadCSV = async () => {
    try {
      const r = await fetch("/cnx500.csv?t="+Date.now());
      if (!r.ok) throw new Error("cnx500.csv not found in public folder");
      const text = await r.text();
      const parsed = parseCSV(text);
      setCsvStocks(parsed);
      stocksRef.current = parsed;
      setCsvLoaded(true);
      setLog(`✓ Loaded ${parsed.length} stocks from cnx500.csv`);
    } catch(e) {
      setLog(`❌ ${e.message}`);
    }
  };

  const runScan = async () => {
    const td = tokenRef.current || tokenData;
    if (!td) { setLog("❌ No token — run get_token.py first"); return; }
    const source = testMode
      ? CNX500_SYMBOLS.slice(0,12)
      : (stocksRef.current.length ? stocksRef.current : CNX500_SYMBOLS);
    if (!source.length) { setLog("❌ No stocks"); return; }

    cancelRef.current = false;
    setScanning(true);
    setResults([]);
    setDebugLog([]);
    setPhase("L1");

    const mapped = source.map(s=>({
      ...s,
      rawSym: s.symbol.replace("NSE:","").replace("-EQ","")
    }));

    setProgress({done:0,total:mapped.length});
    setLog(`Scanning ${mapped.length} stocks...`);

    const l1Results = [];
    const dbg = [];
    let done=0;

    for (const stock of mapped) {
      if (cancelRef.current) break;
      try {
        const raw = stock.symbol.replace("NSE:","").replace("-EQ","");
        // Direct fetch with full URL — bypasses proxy issues
        const now = new Date();
        const from = new Date(); from.setDate(from.getDate()-365);
        const fmt = d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        const url = `https://api-t1.fyers.in/data/history?symbol=${encodeURIComponent('NSE:'+raw+'-EQ')}&resolution=D&date_format=1&range_from=${fmt(from)}&range_to=${fmt(now)}&cont_flag=1`;
        const res = await fetch(url, {headers:{Authorization:`${td.app_id}:${td.access_token}`}});
        if (!res.ok) throw new Error(`${res.status}`);
        const json = await res.json();
        const candles = json.candles || [];
        if (candles && candles.length>0) {
          const l1 = level1Filter(candles, drawRef.current);
          const stg = classifyStage(candles);
          if (l1) {
            // For BREAKOUT/NEAR_HIGH require price above EMA21
            const priceAboveE21 = !stg || !stg.e21 || candles[candles.length-1][4] > stg.e21;
            if ((l1.category==="NEAR_HIGH"||l1.category.includes("BREAKOUT")) && !priceAboveE21) {
              dbg.push(`⬇ ${stock.rawSym}: ${l1.category} but below EMA21 → ${stg?.stageLabel}`);
              // Still add but mark as stage4
              if (stg?.isBottomFish) {
                l1Results.push({...stock, candles, l1:{...l1,category:"REVERSAL"}, l2:null, stg});
                dbg.push(`🎣 ${stock.rawSym}: Bottom fish candidate! (${stg.bottomScore}/6)`);
              }
            } else {
              l1Results.push({...stock, candles, l1, l2:null, stg});
              dbg.push(`✅ ${stock.rawSym}: ${l1.category} (${l1.pctFrom52wHigh}%) ${stg?.stageLabel||""}`);
            }
          } else {
            // Check if Stage4 bottom fish even if L1 failed
            if (stg?.isBottomFish) {
              const price = candles[candles.length-1][4];
              const high52w = Math.max(...candles.slice(-252).map(c=>c[2]));
              const pct = ((price-high52w)/high52w*100).toFixed(1);
              l1Results.push({...stock, candles,
                l1:{category:"REVERSAL", price, pctFrom52wHigh:+pct,
                    pctFrom1yHigh:+pct, pctFrom5yHigh:+pct,
                    high52w, high1y:high52w, high5y:high52w},
                l2:null, stg});
              dbg.push(`🎣 ${stock.rawSym}: Bottom fish (${stg.bottomScore}/6) ${pct}%`);
            } else {
              dbg.push(`– ${stock.rawSym}: ${candles.length} candles, ${((candles[candles.length-1][4]-Math.max(...candles.slice(-252).map(c=>c[2])))/Math.max(...candles.slice(-252).map(c=>c[2]))*100).toFixed(1)}% from 52wH ${stg?.stageLabel||""}`);
            }
          }
        } else {
          dbg.push(`⚠ ${stock.rawSym}: empty candles`);
        }
      } catch(e) {
        dbg.push(`❌ ${stock.rawSym}: ${e.message}`);
      }
      done++;
      setProgress({done,total:mapped.length});
      setLog(dbg[dbg.length-1]||"");
      setDebugLog([...dbg]);
      await new Promise(r=>setTimeout(r,300));
    }

    setLog(`L1 done — ${l1Results.length} passed. Running L2...`);
    SCAN_CACHE.results=[...l1Results]; setResults([...l1Results]);
    setPhase("L2");

    const final = [];
    for (const stock of l1Results) {
      if (cancelRef.current) break;
      const l2 = level2Filter(stock.candles);
      final.push({...stock, l2, stg:stock.stg});
      SCAN_CACHE.results=[...final]; setResults([...final]);
      await new Promise(r=>setTimeout(r,50));
    }

    setPhase("");
    setScanning(false);
    const act = final.filter(s=>s.l2?.score>=4).length;
    setLog(`✅ Done — ${final.length} passed L1 · ${act} actionable`);
    SCAN_CACHE.results=final; setResults(final); SCAN_CACHE.timestamp=new Date();
  };

  const filtered = results
    .filter(s=>filterCat==="ALL"||s.l1.category===filterCat)
    .filter(s=>(s.l2?.score??0)>=minL2)
    .filter(s=>filterStage==="ALL"
      || (filterStage==="STAGE2"&&s.stg?.stage==="STAGE2")
      || (filterStage==="STAGE2_EARLY"&&s.stg?.stage==="STAGE2_EARLY")
      || (filterStage==="STAGE4"&&s.stg?.stage?.includes("STAGE4"))
      || (filterStage==="BOTTOM"&&s.stg?.isBottomFish)
      || (filterStage==="REDDAY"&&s.stg?.isRed))
    .sort((a,b)=>sortBy==="l2score"?(b.l2?.score??0)-(a.l2?.score??0):
                 sortBy==="pctHigh"?b.l1.pctFrom52wHigh-a.l1.pctFrom52wHigh:
                 a.sector.localeCompare(b.sector));

  const bySector={};
  filtered.forEach(s=>{
    if(!bySector[s.sector]) bySector[s.sector]=[];
    bySector[s.sector].push(s);
  });

  const cats=["5Y_BREAKOUT","1Y_BREAKOUT","52W_BREAKOUT","NEAR_HIGH","REVERSAL"];
  const catCounts={};
  cats.forEach(c=>{catCounts[c]=results.filter(s=>s.l1.category===c).length;});

  return (
    <div style={{height:"100%",overflowY:"auto",padding:"12px 16px",
      display:"flex",flexDirection:"column",gap:8}}>

      {/* Header controls */}
      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",flexShrink:0}}>
        <span style={{fontFamily:"monospace",fontSize:10,color:T.amber,fontWeight:600}}>
          🔍 CNX 500 SCANNER
        </span>
        <span style={{fontSize:9,color:T.t3}}>Level 1: Price · Level 2: Quality</span>

        <div style={{display:"flex",alignItems:"center",gap:4}}>
          <span style={{fontSize:9,color:T.t2}}>Nifty from ATH:</span>
          <input type="number" value={niftyDraw}
            onChange={e=>{const v=parseFloat(e.target.value)||15;setNiftyDraw(v);drawRef.current=v;}}
            style={{width:45,fontFamily:"monospace",fontSize:10,padding:"3px 5px",
              background:T.bg3,border:`0.5px solid ${T.border}`,
              borderRadius:3,color:T.amber}}/>
          <span style={{fontSize:9,color:T.t2}}>%</span>
        </div>

        {!testMode&&!csvLoaded&&(
          <button onClick={loadCSV}
            style={{fontFamily:"monospace",fontSize:9,padding:"4px 12px",
              background:T.blue,border:"none",borderRadius:4,
              color:"#fff",cursor:"pointer",fontWeight:600}}>
            📂 LOAD CNX500 CSV
          </button>
        )}
        {!testMode&&csvLoaded&&(
          <span style={{fontSize:9,color:T.green,fontFamily:"monospace"}}>
            ✓ {csvStocks.length} stocks loaded
          </span>
        )}
        <button onClick={()=>setTestMode(t=>!t)}
          style={{fontFamily:"monospace",fontSize:9,padding:"4px 10px",
            background:testMode?"#1a3a1a":T.bg3,
            border:`0.5px solid ${testMode?T.green:T.border}`,
            borderRadius:4,color:testMode?T.green:T.t2,cursor:"pointer"}}>
          {testMode?`✓ TEST (12 stocks)`:"FULL MODE"}
        </button>

        <button onClick={runScan} disabled={scanning||!tokenData||(!testMode&&!csvLoaded)}
          style={{fontFamily:"monospace",fontSize:10,padding:"5px 14px",
            background:scanning?T.bg3:T.amber,border:"none",
            borderRadius:4,color:scanning?T.t2:T.bg0,
            cursor:scanning?"not-allowed":"pointer",fontWeight:700}}>
          {scanning?`${phase} ${progress.done}/${progress.total}`:"▶ RUN SCAN"}
        </button>

        {scanning&&(
          <button onClick={()=>cancelRef.current=true}
            style={{fontFamily:"monospace",fontSize:9,padding:"4px 10px",
              background:T.redDim,border:`0.5px solid ${T.red}`,
              borderRadius:4,color:T.red,cursor:"pointer"}}>⏹ STOP</button>
        )}
      </div>

      {/* Progress bar */}
      {scanning&&(
        <div style={{height:4,background:T.bg3,borderRadius:2,overflow:"hidden",flexShrink:0}}>
          <div style={{height:"100%",background:T.amber,borderRadius:2,
            width:`${progress.total?(progress.done/progress.total*100):0}%`,
            transition:"width 0.3s"}}/>
        </div>
      )}

      {/* Log */}
      {log&&(
        <div style={{fontFamily:"monospace",fontSize:10,padding:"5px 10px",
          background:T.bg2,borderRadius:4,border:`0.5px solid ${T.border}`,flexShrink:0,
          color:log.includes("❌")?T.red:log.includes("✅")?T.green:T.amber}}>
          {log}
        </div>
      )}

      {/* Debug log panel */}
      {debugLog.length>0&&(
        <div style={{background:T.bg1,border:`0.5px solid ${T.border}`,
          borderRadius:6,padding:"8px 10px",maxHeight:180,overflowY:"auto",flexShrink:0}}>
          <div style={{fontSize:8,color:T.amber,fontWeight:600,marginBottom:4}}>DEBUG LOG</div>
          {debugLog.map((l,i)=>(
            <div key={i} style={{fontFamily:"monospace",fontSize:9,padding:"1px 0",
              color:l.startsWith("✅")?T.green:l.startsWith("❌")?T.red:T.t2}}>
              {l}
            </div>
          ))}
        </div>
      )}

      {/* Stats */}
      {results.length>0&&(
        <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:6,flexShrink:0}}>
          {[
            {l:"PASSED L1",v:results.length,c:T.amber},
            {l:"L2 ≥4/5",  v:results.filter(s=>s.l2?.score>=4).length,c:T.green},
            {l:"5Y HIGH",  v:catCounts["5Y_BREAKOUT"],c:"#a855f7"},
            {l:"1Y HIGH",  v:catCounts["1Y_BREAKOUT"],c:T.green},
            {l:"NEAR HIGH",v:catCounts["NEAR_HIGH"],  c:T.amber},
            {l:"REVERSAL", v:catCounts["REVERSAL"],   c:T.blue},
          ].map(x=>(
            <div key={x.l} style={{background:T.bg2,border:`0.5px solid ${T.border}`,
              borderRadius:6,padding:"5px 8px",textAlign:"center"}}>
              <div style={{fontSize:7,color:T.t3,marginBottom:1}}>{x.l}</div>
              <div style={{fontFamily:"monospace",fontSize:18,fontWeight:700,color:x.c}}>{x.v}</div>
            </div>
          ))}
        </div>
      )}

      {/* Actionable Block */}
      {results.filter(s=>(s.l2?.score??0)>=4).length>0&&(
        <ActionableBlock
          stocks={results.filter(s=>(s.l2?.score??0)>=4)
            .sort((a,b)=>(b.l2?.score??0)-(a.l2?.score??0))}
          onSelectStock={onSelectStock}/>
      )}

      {/* Filter Bar */}
      {results.length>0&&(
        <div style={{background:T.bg2,border:`0.5px solid ${T.borderHi}`,
          borderRadius:8,padding:"8px 12px",flexShrink:0}}>
          <div style={{fontSize:8,color:T.amber,fontWeight:600,
            letterSpacing:"1px",marginBottom:6}}>FILTERS</div>
        <div style={{display:"flex",gap:5,alignItems:"center",flexWrap:"wrap"}}>
          {/* Stage filter */}
          <span style={{fontSize:9,color:T.t3,fontFamily:"monospace"}}>STAGE:</span>
          {/* ── High-conviction quick tabs ── */}
          {[
            ["ALL",        "🌐 All",           T.t2,    T.border],
            ["STAGE2",     "★ Stage 2",         T.green, "#22c55e"],
            ["STAGE2_EARLY","◎ Stage 2 Early",  "#86efac","#86efac"],
            ["STAGE4",     "▼ Stage 4",         "#ef4444","#ef4444"],
            ["BOTTOM",     "🎣 Bottom Fish",    T.amber, T.amber],
            ["REDDAY",     "🔴 Red Day",        "#fca5a5","#fca5a5"],
          ].map(([k,l,col,bdr])=>(
            <button key={k} onClick={()=>setFilterStage(k)}
              style={{fontFamily:"monospace",fontSize:9,padding:"4px 10px",borderRadius:4,
                cursor:"pointer",fontWeight:filterStage===k?700:400,
                background:filterStage===k?col+"22":T.bg3,
                border:`1px solid ${filterStage===k?bdr:T.border}`,
                color:filterStage===k?col:T.t3}}>
              {l}
              {k!=="ALL"&&<span style={{fontSize:7,marginLeft:4,opacity:0.7}}>
                {k==="STAGE2"?results.filter(s=>s.stg?.stage==="STAGE2").length:
                 k==="STAGE2_EARLY"?results.filter(s=>s.stg?.stage==="STAGE2_EARLY").length:
                 k==="STAGE4"?results.filter(s=>s.stg?.stage?.includes("STAGE4")).length:
                 k==="BOTTOM"?results.filter(s=>s.stg?.isBottomFish).length:
                 k==="REDDAY"?results.filter(s=>s.stg?.isRed).length:0}
              </span>}
            </button>
          ))}
          <div style={{width:1,height:16,background:T.border}}/>
          {["ALL","5Y_BREAKOUT","1Y_BREAKOUT","52W_BREAKOUT","NEAR_HIGH","REVERSAL"].map(c=>(
            <button key={c} onClick={()=>setFilterCat(c)}
              style={{fontFamily:"monospace",fontSize:8,padding:"3px 8px",borderRadius:3,
                cursor:"pointer",background:filterCat===c?T.amber:T.bg3,
                border:`0.5px solid ${filterCat===c?T.amber:T.border}`,
                color:filterCat===c?T.bg0:T.t2}}>
              {c==="ALL"?"ALL":CAT[c]?.label||c}
            </button>
          ))}
          <span style={{fontSize:9,color:T.t2,marginLeft:6}}>L2≥</span>
          {[0,2,3,4].map(n=>(
            <button key={n} onClick={()=>setMinL2(n)}
              style={{fontFamily:"monospace",fontSize:8,padding:"3px 7px",borderRadius:3,
                cursor:"pointer",background:minL2===n?T.blue:T.bg3,
                border:`0.5px solid ${minL2===n?T.blue:T.border}`,
                color:minL2===n?T.t0:T.t2}}>{n}</button>
          ))}
          {[["l2score","L2 Score"],["pctHigh","% High"],["sector","Sector"]].map(([k,l])=>(
            <button key={k} onClick={()=>setSortBy(k)}
              style={{fontFamily:"monospace",fontSize:8,padding:"3px 7px",borderRadius:3,
                cursor:"pointer",background:sortBy===k?T.purple:T.bg3,
                border:`0.5px solid ${sortBy===k?T.purple:T.border}`,
                color:sortBy===k?T.t0:T.t2}}>{l}</button>
          ))}
          <span style={{marginLeft:"auto",fontSize:9,color:T.t3,fontFamily:"monospace"}}>
            {filtered.length} shown
          </span>
        </div>
        </div>
      )}

      {/* Empty state */}
      {!scanning&&results.length===0&&(
        <div style={{textAlign:"center",padding:"40px",flex:1}}>
          <div style={{fontSize:32,marginBottom:10}}>🔍</div>
          <div style={{fontSize:14,color:T.t1,marginBottom:6}}>CNX 500 Scanner</div>
          <div style={{fontSize:10,color:T.t2,lineHeight:2}}>
            TEST MODE scans 12 major stocks · FULL MODE scans 80 stocks<br/>
            Set Nifty from ATH % → Click ▶ RUN SCAN
          </div>
        </div>
      )}

      {/* Results grouped by sector */}
      {Object.entries(bySector)
        .sort((a,b)=>b[1].filter(s=>s.l2?.score>=4).length-a[1].filter(s=>s.l2?.score>=4).length)
        .map(([sec,stocks])=>(
          <div key={sec} style={{flexShrink:0}}>
            <div onClick={()=>setExpandSec(p=>({...p,[sec]:!(p[sec]!==false)}))}
              style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",
                background:T.bg2,border:`0.5px solid ${T.borderHi}`,
                borderRadius:6,cursor:"pointer",marginBottom:6}}>
              <span style={{fontFamily:"monospace",fontSize:10,fontWeight:600,color:T.t1,flex:1}}>
                {sec}
              </span>
              <span style={{fontSize:9,color:T.green,fontFamily:"monospace"}}>
                {stocks.filter(s=>s.l2?.score>=4).length>0?
                  `${stocks.filter(s=>s.l2?.score>=4).length} ACTION`:""}
              </span>
              <span style={{fontSize:9,color:T.t2,fontFamily:"monospace"}}>
                {stocks.length} stocks
              </span>
              <span style={{fontSize:9,color:T.t3}}>
                {expandSec[sec]!==false?"▲":"▼"}
              </span>
            </div>
            {expandSec[sec]!==false&&(
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:8}}>
                {stocks.map(s=><ResultCard key={s.rawSym} stock={s}/>)}
              </div>
            )}
          </div>
        ))
      }
    </div>
  );
}
