// indicators.js — All technical indicators computed from OHLCV candles

// ── Helpers ──────────────────────────────────────────────────────────────────
const avg  = arr => arr.reduce((a,b)=>a+b,0)/arr.length;
const sma  = (arr,n) => arr.length>=n ? avg(arr.slice(-n)) : null;
const ema  = (arr,n) => {
  if (arr.length < n) return null;
  const k = 2/(n+1);
  let e = avg(arr.slice(0,n));
  for (let i=n;i<arr.length;i++) e = arr[i]*k + e*(1-k);
  return +e.toFixed(2);
};

// ── RSI ──────────────────────────────────────────────────────────────────────
function calcRSI(closes, period=14) {
  if (closes.length < period+1) return null;
  let gains=0, losses=0;
  for (let i=1;i<=period;i++) {
    const d=closes[i]-closes[i-1];
    if(d>0) gains+=d; else losses-=d;
  }
  let ag=gains/period, al=losses/period;
  for (let i=period+1;i<closes.length;i++) {
    const d=closes[i]-closes[i-1];
    ag=(ag*(period-1)+(d>0?d:0))/period;
    al=(al*(period-1)+(d<0?-d:0))/period;
  }
  return al===0 ? 100 : +(100-100/(1+ag/al)).toFixed(2);
}

// ── MACD ─────────────────────────────────────────────────────────────────────
function calcMACD(closes) {
  if (closes.length < 35) return {macd:null,signal:null,hist:null};
  const k12=2/13, k26=2/27, k9=2/10;
  let e12=avg(closes.slice(0,12)), e26=avg(closes.slice(0,26));
  for(let i=12;i<closes.length;i++) e12=closes[i]*k12+e12*(1-k12);
  for(let i=26;i<closes.length;i++) e26=closes[i]*k26+e26*(1-k26);
  const macdLine=e12-e26;
  let signal=macdLine;
  const macdVals=[];
  let tmpE12=avg(closes.slice(0,12)),tmpE26=avg(closes.slice(0,26));
  for(let i=Math.max(12,26);i<closes.length;i++){
    tmpE12=closes[i]*k12+tmpE12*(1-k12);
    tmpE26=closes[i]*k26+tmpE26*(1-k26);
    macdVals.push(tmpE12-tmpE26);
  }
  if(macdVals.length>=9){
    signal=avg(macdVals.slice(0,9));
    for(let i=9;i<macdVals.length;i++) signal=macdVals[i]*k9+signal*(1-k9);
  }
  return {macd:+macdLine.toFixed(2),signal:+signal.toFixed(2),hist:+(macdLine-signal).toFixed(2)};
}

// ── ADX ──────────────────────────────────────────────────────────────────────
function calcADX(candles, period=14) {
  if (candles.length < period*2) return null;
  const tr=[],pdm=[],ndm=[];
  for(let i=1;i<candles.length;i++){
    const [,,,lo,cl]=[...candles[i-1]];
    const [,,hi,low]=[...candles[i]];
    tr.push(Math.max(hi-low, Math.abs(hi-cl), Math.abs(low-cl)));
    pdm.push(Math.max(hi-candles[i-1][2],0));
    ndm.push(Math.max(candles[i-1][3]-low,0));
  }
  const smoothed=(arr,n)=>{
    let s=arr.slice(0,n).reduce((a,b)=>a+b,0);
    const res=[s];
    for(let i=n;i<arr.length;i++){s=s-s/n+arr[i];res.push(s);}
    return res;
  };
  const atr14=smoothed(tr,period), pdi14=smoothed(pdm,period), ndi14=smoothed(ndm,period);
  const dx=atr14.map((a,i)=>{
    const p=100*pdi14[i]/a, n=100*ndi14[i]/a;
    return 100*Math.abs(p-n)/(p+n||1);
  });
  const adxArr=smoothed(dx,period);
  return +adxArr[adxArr.length-1].toFixed(2);
}

// ── Bollinger Bands ───────────────────────────────────────────────────────────
function calcBB(closes, period=20, mult=2) {
  if(closes.length<period) return {upper:null,lower:null,mid:null,width:null};
  const sl=closes.slice(-period);
  const m=avg(sl);
  const std=Math.sqrt(sl.reduce((a,b)=>a+(b-m)**2,0)/period);
  const width = +(((m+mult*std)-(m-mult*std))/m*100).toFixed(2);
  return {upper:+(m+mult*std).toFixed(2),lower:+(m-mult*std).toFixed(2),mid:+m.toFixed(2),width};
}

// ── Ichimoku ─────────────────────────────────────────────────────────────────
function calcIchimoku(candles) {
  if(candles.length<52) return {status:"Insufficient data"};
  const highs=candles.map(c=>c[2]),lows=candles.map(c=>c[3]);
  const hpH=(n)=>Math.max(...highs.slice(-n));
  const lpL=(n)=>Math.min(...lows.slice(-n));
  const tenkan=(hpH(9)+lpL(9))/2;
  const kijun=(hpH(26)+lpL(26))/2;
  const spanA=(tenkan+kijun)/2;
  const spanB=(hpH(52)+lpL(52))/2;
  const price=candles[candles.length-1][4];
  const cloud=Math.max(spanA,spanB);
  const cloudLow=Math.min(spanA,spanB);
  let status="";
  if(price>cloud) status="Above Cloud ✓";
  else if(price<cloudLow) status="Below Cloud ✗";
  else status="Inside Cloud";
  return {tenkan:+tenkan.toFixed(2),kijun:+kijun.toFixed(2),spanA:+spanA.toFixed(2),spanB:+spanB.toFixed(2),status};
}

// ── Guppy MMA ────────────────────────────────────────────────────────────────
function calcGuppy(closes) {
  const shortP=[3,5,8,10,12,15];
  const longP=[30,35,40,45,50,60];
  const sEMAs=shortP.map(p=>ema(closes,p)).filter(Boolean);
  const lEMAs=longP.map(p=>ema(closes,p)).filter(Boolean);
  if(!sEMAs.length||!lEMAs.length) return "Insufficient data";
  const sMin=Math.min(...sEMAs),sMax=Math.max(...sEMAs);
  const lMin=Math.min(...lEMAs),lMax=Math.max(...lEMAs);
  if(sMin>lMax) return "Bullish — Short above Long";
  if(sMax<lMin) return "Bearish — Short below Long";
  return "Transition";
}

// ── TTM Squeeze ───────────────────────────────────────────────────────────────
function calcTTM(closes, highs, lows) {
  if(closes.length<20) return null;
  const {upper:bbU,lower:bbL}=calcBB(closes);
  const kc20H=avg(highs.slice(-20)),kc20L=avg(lows.slice(-20));
  const atr20=avg(highs.slice(-20).map((h,i)=>h-lows.slice(-20)[i]));
  const kcU=kc20H+1.5*atr20,kcL=kc20L-1.5*atr20;
  if(!bbU||!bbL) return null;
  return (bbU<kcU&&bbL>kcL) ? "−" : "+";
}

// ── CPR ───────────────────────────────────────────────────────────────────────
function calcCPR(candle) {
  const [,, h, l, c]=candle;
  const pivot=(h+l+c)/3;
  const bc=(h+l)/2;
  const tc=2*pivot-bc;
  const r1=2*pivot-l, r2=pivot+(h-l);
  const s1=2*pivot-h, s2=pivot-(h-l);
  return {
    pivot:+pivot.toFixed(2), bc:+bc.toFixed(2), tc:+tc.toFixed(2),
    r1:+r1.toFixed(2), r2:+r2.toFixed(2),
    s1:+s1.toFixed(2), s2:+s2.toFixed(2)
  };
}

// ── Multi-Timeframe CPR ──────────────────────────────────────────────────────
export function calcMultiCPR(candles, price) {
  if (!candles || candles.length < 5) return null;

  // Helper: merge candles into one OHLC
  const merge = (cs) => ({
    h: Math.max(...cs.map(c=>c[2])),
    l: Math.min(...cs.map(c=>c[3])),
    c: cs[cs.length-1][4],
  });

  // Helper: build CPR from merged OHLC
  const buildCPR = (h,l,c,label) => {
    const pivot = (h+l+c)/3;
    const bc    = (h+l)/2;
    const tc    = 2*pivot-bc;
    const width = +(tc-bc).toFixed(2);
    const widthPct = +(width/pivot*100).toFixed(2);
    const narrow = widthPct < 0.5; // <0.5% width = narrow
    // Position of price vs CPR
    const pos = price > tc ? "ABOVE"
              : price < bc ? "BELOW"
              : "INSIDE";
    const distToTC = +(price - tc).toFixed(2);
    const distToBC = +(price - bc).toFixed(2);
    const distToP  = +(price - pivot).toFixed(2);
    const nearestDist = pos==="ABOVE" ? distToTC : pos==="BELOW" ? distToBC
      : Math.abs(distToTC) < Math.abs(distToBC) ? distToTC : distToBC;
    return {
      label, pivot:+pivot.toFixed(2), bc:+bc.toFixed(2), tc:+tc.toFixed(2),
      width, widthPct, narrow, pos, distToTC, distToBC, distToP, nearestDist,
      h:+h.toFixed(2), l:+l.toFixed(2), c:+c.toFixed(2),
    };
  };

  const now = new Date();

  // Daily CPR — from yesterday's candle (last completed day)
  const yesterday = candles[candles.length-1];
  const daily = buildCPR(yesterday[2], yesterday[3], yesterday[4], "Daily");

  // Weekly CPR — find last week's candles (Mon-Fri before current week)
  const getWeekStart = (d) => {
    const dt = new Date(d*1000);
    const day = dt.getDay();
    const diff = day===0?-6:1-day;
    const ws = new Date(dt); ws.setDate(dt.getDate()+diff); ws.setHours(0,0,0,0);
    return ws.getTime()/1000;
  };
  const thisWeekStart = getWeekStart(Math.floor(Date.now()/1000));
  const lastWeekCandles = candles.filter(c => c[0] < thisWeekStart).slice(-7);
  const lw = merge(lastWeekCandles.length ? lastWeekCandles : candles.slice(-5));
  const weekly = buildCPR(lw.h, lw.l, lw.c, "Weekly");

  // Monthly CPR — last calendar month
  const thisMonth = now.getMonth(), thisYear = now.getFullYear();
  const lastMonthCandles = candles.filter(c => {
    const d = new Date(c[0]*1000);
    return (d.getMonth() < thisMonth && d.getFullYear()===thisYear)
        || (thisMonth===0 && d.getFullYear()===thisYear-1 && d.getMonth()===11);
  }).slice(-25);
  const lm = merge(lastMonthCandles.length ? lastMonthCandles : candles.slice(-21));
  const monthly = buildCPR(lm.h, lm.l, lm.c, "Monthly");

  // Yearly CPR — last calendar year
  const lastYearCandles = candles.filter(c => {
    const d = new Date(c[0]*1000);
    return d.getFullYear() === thisYear-1;
  }).slice(-252);
  const ly = merge(lastYearCandles.length ? lastYearCandles : candles.slice(-252));
  const yearly = buildCPR(ly.h, ly.l, ly.c, "Yearly");

  // Confluence — how many timeframes agree on direction
  const positions = [daily.pos, weekly.pos, monthly.pos, yearly.pos];
  const aboveCount  = positions.filter(p=>p==="ABOVE").length;
  const belowCount  = positions.filter(p=>p==="BELOW").length;
  const insideCount = positions.filter(p=>p==="INSIDE").length;
  const confluence  = aboveCount>=3?"STRONG_BULL":aboveCount===2?"MILD_BULL"
    :belowCount>=3?"STRONG_BEAR":belowCount===2?"MILD_BEAR":"MIXED";

  return { daily, weekly, monthly, yearly, confluence, aboveCount, belowCount, insideCount };
}

// ── Stage Analysis ────────────────────────────────────────────────────────────
function calcStage(closes, ma50v, ma150v, ma200v) {
  const price=closes[closes.length-1];
  if(!ma50v||!ma150v||!ma200v) return 0;
  if(price>ma50v&&price>ma150v&&price>ma200v&&ma50v>ma150v&&ma150v>ma200v) return 2;
  if(price<ma50v&&price<ma150v&&price<ma200v&&ma50v<ma150v&&ma150v<ma200v) return 4;
  if(price>ma200v&&ma200v<ma150v) return 1;
  return 3;
}

// ── Relative Strength Score ───────────────────────────────────────────────────
function calcRS(closes) {
  if(closes.length<252) return 50;
  const p=closes[closes.length-1];
  const p63 =closes[closes.length-64]  ||p;
  const p126=closes[closes.length-127] ||p;
  const p189=closes[closes.length-190] ||p;
  const p252=closes[closes.length-253] ||p;
  const rs=0.4*(p/p63)+0.2*(p/p126)+0.2*(p/p189)+0.2*(p/p252);
  return Math.min(99,Math.max(1,Math.round((rs-0.7)*300)));
}

// ── CAGR returns ──────────────────────────────────────────────────────────────
function calcCAGR(closes) {
  const cur  = closes[closes.length-1];
  const get  = (n) => closes.length>n ? closes[closes.length-1-n] : null;
  const pct  = (past) => past ? +((cur/past-1)*100).toFixed(2) : null;
  const ann  = (past, yrs) => past ? +(((cur/past)**(1/yrs)-1)*100).toFixed(2) : null;
  return {
    m1:  pct(get(21)),
    m6:  pct(get(126)),
    y1:  pct(get(252)),
    y3:  ann(get(756),  3),
    y5:  ann(get(1260), 5),
  };
}

// ── ATH ───────────────────────────────────────────────────────────────────────
function calcATH(candles) {
  let athPrice=0, athIdx=0;
  candles.forEach((c,i)=>{ if(c[2]>athPrice){athPrice=c[2];athIdx=i;} });
  const athDate=new Date(candles[athIdx][0]*1000).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"2-digit"});
  return {price:+athPrice.toFixed(2), date:athDate};
}

// ── Highest Volume flags ──────────────────────────────────────────────────────
function calcVolFlags(candles) {
  const now = candles[candles.length-1];
  const vol = now[5];
  const month  = candles.slice(-21);
  const qtr    = candles.slice(-63);
  const year   = candles.slice(-252);
  const maxVol = (arr) => Math.max(...arr.map(c=>c[5]));
  return {
    isHighestMonth:  vol >= maxVol(month),
    isHighestQtr:    vol >= maxVol(qtr),
    isHighestYear:   vol >= maxVol(year),
    monthMaxVol:     maxVol(month),
    qtrMaxVol:       maxVol(qtr),
    yearMaxVol:      maxVol(year),
  };
}

// ── Mini Coil (TaPlot) ────────────────────────────────────────────────────────
// Logic: Find a wide bar that engulfs 2+ subsequent bars entirely within its range
// Trigger = price breaking above the wide bar high
function calcMiniCoil(candles, minBars=2) {
  if (candles.length < 5) return { detected: false };
  const recent = candles.slice(-30); // look back 30 bars

  for (let i = recent.length - minBars - 1; i >= 0; i--) {
    const wide = recent[i];
    const wideHigh = wide[2], wideLow = wide[3];
    const wideRange = wideHigh - wideLow;

    // Skip very narrow bars
    if (wideRange < 0.001) continue;

    // Count how many consecutive bars after wide bar are inside its range
    let innerCount = 0;
    for (let j = i + 1; j < recent.length; j++) {
      const c = recent[j];
      if (c[2] <= wideHigh && c[3] >= wideLow) {
        innerCount++;
      } else break; // breaks coil if bar goes outside
    }

    if (innerCount >= minBars) {
      const lastClose = recent[recent.length - 1][4];
      const triggered = lastClose > wideHigh;
      const barsAgo   = recent.length - 1 - i;
      return {
        detected:   true,
        wideHigh:   +wideHigh.toFixed(2),
        wideLow:    +wideLow.toFixed(2),
        innerBars:  innerCount,
        barsAgo,
        triggered,
        triggerLevel: +wideHigh.toFixed(2),
        fresh:      barsAgo <= 5,
      };
    }
  }
  return { detected: false };
}

// ── Pivot Pocket ─────────────────────────────────────────────────────────────
// Up-day with volume > highest down-day volume of last 10 down-days
function calcPivotPocket(candles) {
  if (candles.length < 15) return { detected: false };
  const recent = candles.slice(-30);
  const today  = recent[recent.length - 1];
  const isUpDay = today[4] > today[1]; // close > open

  // Find last 10 down-days
  const downDays = recent.slice(0, -1).filter(c => c[4] < c[1]);
  const last10Down = downDays.slice(-10);
  if (last10Down.length < 3) return { detected: false };

  const maxDownVol = Math.max(...last10Down.map(c => c[5]));
  const todayVol   = today[5];
  const detected   = isUpDay && todayVol > maxDownVol;

  return {
    detected,
    todayVol,
    maxDownVol,
    ratio: +(todayVol / maxDownVol).toFixed(2),
  };
}

// ── Minervini Criteria ────────────────────────────────────────────────────────
function calcMinervini(closes, highs, lows, ma50v, ma150v, ma200v, rs) {
  const price = closes[closes.length-1];
  const wkLow  = Math.min(...lows.slice(-52));
  const wkHigh = Math.max(...highs.slice(-52));
  return {
    abvMA50:             !!ma50v  && price > ma50v,
    abvMA150:            !!ma150v && price > ma150v,
    abvMA200:            !!ma200v && price > ma200v,
    ma50abvMA200:        !!ma50v  && !!ma200v && ma50v > ma200v,
    ma150abvMA200:       !!ma150v && !!ma200v && ma150v > ma200v,
    priceAbv25wkLow:     price > wkLow * 1.25,
    within25pct52wkHigh: price >= wkHigh * 0.75,
    rs75plus:            rs >= 75,
  };
}

// ── Recommendation ───────────────────────────────────────────────────────────
function calcRecommendation(ind) {
  let score=0;
  if(ind.stage===2)                          score+=3;
  if(ind.rsi>=45&&ind.rsi<=65)              score+=2;
  if(ind.macd>ind.macdSignal)               score+=2;
  if(ind.adx>25)                            score+=1;
  if(ind.price>(ind.ma50||0))               score+=1;
  if(ind.price>(ind.ma200||0))              score+=1;
  if(ind.relVol>=1.2)                       score+=1;
  if(ind.mvScore>=6)                        score+=2;
  if(ind.rs>=65)                            score+=1;
  if(ind.ichimoku?.includes("Above"))       score+=1;
  const conf=Math.round(score/15*100);
  let rec="HOLD",recLabel="Neutral Setup";
  if(score>=11){rec="BUY"; recLabel="Strong Entry";}
  else if(score>=9){rec="BUY"; recLabel="Emerging Setup";}
  else if(score>=7){rec="WATCH"; recLabel="Watch for Entry";}
  else if(score<=4){rec="SELL"; recLabel="Avoid / Exit";}
  return {rec,recLabel,conf,score};
}

// ── PSAR ─────────────────────────────────────────────────────────────────────
function calcPSAR(candles, start=0.02, increment=0.02, maximum=0.18) {
  if (candles.length < 5) return [];
  let bull = true;
  let af   = start;
  let ep   = candles[0][3]; // extreme point = low initially
  let psar = candles[0][2]; // start above first high

  const result = [psar];
  for (let i = 1; i < candles.length; i++) {
    const hi = candles[i][2], lo = candles[i][3];
    const prevHi = candles[i-1][2], prevLo = candles[i-1][3];

    if (bull) {
      psar = psar + af * (ep - psar);
      psar = Math.min(psar, prevLo, i >= 2 ? candles[i-2][3] : prevLo);
      if (lo < psar) {
        bull = false; psar = ep; ep = lo; af = start;
      } else {
        if (hi > ep) { ep = hi; af = Math.min(af + increment, maximum); }
      }
    } else {
      psar = psar + af * (ep - psar);
      psar = Math.max(psar, prevHi, i >= 2 ? candles[i-2][2] : prevHi);
      if (hi > psar) {
        bull = true; psar = ep; ep = hi; af = start;
      } else {
        if (lo < ep) { ep = lo; af = Math.min(af + increment, maximum); }
      }
    }
    result.push(psar);
  }
  return result;
}

// ── AMA (Adaptive Moving Average) ────────────────────────────────────────────
function calcAMA(candles, length=40, fastLen=4, slowLen=20) {
  const src = candles.map(c => (c[2] + c[3] + c[4]) / 3); // HLC3
  const fastAlpha = 2 / (fastLen + 1);
  const slowAlpha = 2 / (slowLen + 1);
  const result = new Array(candles.length).fill(null);

  for (let i = 1; i < candles.length; i++) {
    const start = Math.max(0, i - length);
    const highs = candles.slice(start, i + 1).map(c => c[2]);
    const lows  = candles.slice(start, i + 1).map(c => c[3]);
    const hh = Math.max(...highs);
    const ll = Math.min(...lows);
    const range = hh - ll;
    const mltp = range !== 0 ? Math.abs(2 * src[i] - ll - hh) / range : 0;
    const ssc  = mltp * (fastAlpha - slowAlpha) + slowAlpha;
    const prev = result[i-1] !== null ? result[i-1] : src[i];
    result[i] = prev + Math.pow(ssc, 2) * (src[i] - prev);
  }
  return result;
}

// ── JR KG Indicator ──────────────────────────────────────────────────────────
// Ported from Pine Script: PSAR + EMA5/13 crossover + AMA adaptive exit
// Output: finalToDraw value, signal (BUY/SELL/HOLD), color state
export function calcJRKG(candles) {
  if (candles.length < 60) return { value: 0, signal: "HOLD", state: "neutral", buySignal: false, sellSignal: false, earlyExit: false };

  const closes = candles.map(c => c[4]);
  const k5 = 2/6, k13 = 2/14, k50 = 2/51;

  // Build EMA series bar-by-bar
  const ema5arr = [], ema13arr = [], ema50arr = [];
  let e5 = closes[0], e13 = closes[0], e50 = closes[0];
  for (let i = 0; i < closes.length; i++) {
    e5  = closes[i] * k5  + e5  * (1 - k5);
    e13 = closes[i] * k13 + e13 * (1 - k13);
    e50 = closes[i] * k50 + e50 * (1 - k50);
    ema5arr.push(e5);
    ema13arr.push(e13);
    ema50arr.push(e50);
  }

  const psarArr = calcPSAR(candles);
  const amaArr  = calcAMA(candles);

  // Compute finalToDraw series
  const ftd = new Array(candles.length).fill(0);

  for (let i = 1; i < candles.length; i++) {
    const cl  = closes[i], cl1 = closes[i-1];
    const e5  = ema5arr[i],  e5_1  = ema5arr[i-1];
    const e13 = ema13arr[i], e13_1 = ema13arr[i-1];
    const e50 = ema50arr[i];
    const psar = psarArr[i] || 0;
    const ama  = amaArr[i]  || cl;
    const prev = ftd[i-1];

    const smooth = ((cl - cl1) / cl1 * 100) / 2.0;

    // Crossovers
    const ema5CrossAbove13 = e5 > e13 && e5_1 <= e13_1;  // ema5to13CrossOver (ema5 crosses above ema13)
    const ema13CrossAbove5 = e13 > e5 && ema13arr[i-1] <= ema5arr[i-1]; // ema13to5CrossOver
    const psarBelowClose   = psar < cl;
    const amaCrossUnder    = cl < ama && cl1 >= (amaArr[i-1] || cl1);
    const closeAboveEma5   = cl > e5 && cl1 <= e5_1;  // emaEntryToCloseCrossOver
    const ema50CrossAbove  = cl > e50 && cl1 <= ema50arr[i-1]; // ema50Crossover

    let val;
    // AMA-respecting logic (default respect_ama=true)
    if (cl < ama && amaCrossUnder) {
      val = -5.1 + smooth;
    } else if (ema50CrossAbove && psarBelowClose && e5 > e13) {
      val = 5.1 + smooth;
    } else if (psarBelowClose && prev < 0 && closeAboveEma5 && e5 > e13) {
      val = 5.1 + smooth;
    } else if ((ema5CrossAbove13 && psarBelowClose) ||
               (psarBelowClose && prev < 0 && psar < cl && psarArr[i-1] >= closes[i-1] && cl > e5 && e5 > e13)) {
      val = 5.1 + smooth;
    } else if (cl <= cl1 && psarBelowClose) {
      val = prev + smooth;
    } else if (cl > e5 && e5 > e13 && psarBelowClose && cl1 < e5_1) {
      val = prev < 0 ? 5.5 + smooth : prev + smooth;
    } else if (prev < 0 && psar < cl && psarArr[i-1] >= closes[i-1] && e5 > e13 && psarBelowClose) {
      val = 5.5 + smooth;
    } else {
      val = prev + smooth;
    }
    ftd[i] = val;
  }

  const last  = ftd[ftd.length - 1];
  const prev  = ftd[ftd.length - 2];
  const lastCl = closes[closes.length - 1];
  const prevCl = closes[closes.length - 2];
  const lastAma = amaArr[amaArr.length - 1] || lastCl;

  const zeroCrossAbove = last > 0 && prev <= 0;
  const zeroCrossBelow = last < 0 && prev >= 0;
  const earlyExit      = lastCl < lastAma && last > 5;

  // State for coloring
  let state = "neutral";
  if (last >= 0) state = lastCl >= prevCl ? "bullish" : "bull_weak";
  else           state = lastCl >= prevCl ? "bear_weak" : "bearish";

  return {
    value:      +last.toFixed(2),
    prevValue:  +prev.toFixed(2),
    signal:     zeroCrossAbove ? "BUY" : zeroCrossBelow ? "SELL" : last > 0 ? "HOLD_LONG" : "HOLD_SHORT",
    state,
    buySignal:  zeroCrossAbove,
    sellSignal: zeroCrossBelow,
    earlyExit,
    aboveZero:  last > 0,
    ama:        lastAma ? +lastAma.toFixed(2) : null,
    priceAboveAma: lastCl > lastAma,
  };
}

// ── BBPT (Bull Bear Power Trend) ─────────────────────────────────────────────
// BullTrend = (close - lowest(low,50)) / ATR(5)
// BearTrend = (highest(high,50) - close) / ATR(5)
// Key levels: BullTrend > 2 = strongly bullish, BearTrend > 2 = strongly bearish
export function calcBBPT(candles) {
  if (candles.length < 55) return null;

  const closes = candles.map(c => c[4]);
  const highs  = candles.map(c => c[2]);
  const lows   = candles.map(c => c[3]);

  // ATR(5)
  const trArr = [];
  for (let i = 1; i < candles.length; i++) {
    trArr.push(Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i-1]),
      Math.abs(lows[i]  - closes[i-1])
    ));
  }
  const atr5 = trArr.slice(-5).reduce((a,b)=>a+b,0) / 5;
  if (atr5 === 0) return null;

  // 50-period high/low
  const lo50 = Math.min(...lows.slice(-50));
  const hi50 = Math.max(...highs.slice(-50));
  const cl   = closes[closes.length - 1];

  const bullTrend  = (cl - lo50) / atr5;
  const bearTrend  = (hi50 - cl) / atr5;
  const bearTrend2 = -bearTrend; // mirrored for display
  const trend      = bullTrend - bearTrend;

  // Histograms (bars that haven't reached the ±2 levels)
  const bullHist = bullTrend < 2  ? bullTrend - 2  : 0; // red bars below +2
  const bearHist = bearTrend2 > -2 ? bearTrend2 + 2 : 0; // green bars above -2

  // Interpretation
  let signal = "NEUTRAL";
  let detail = "";
  if (bullTrend > 2 && bearTrend2 < -2) {
    signal = "STRONG_BULL"; detail = "Bull>2 & Bear<-2 — strong uptrend";
  } else if (bullTrend > 2) {
    signal = "BULL"; detail = `BullTrend ${bullTrend.toFixed(1)} > 2 — bullish`;
  } else if (bearTrend2 < -2) {
    signal = "BEAR"; detail = `BearTrend ${bearTrend2.toFixed(1)} < -2 — bearish`;
  } else if (trend > 0) {
    signal = "WEAK_BULL"; detail = "Trend positive but below key levels";
  } else {
    signal = "WEAK_BEAR"; detail = "Trend negative — watch for reversal";
  }

  return {
    bullTrend:  +bullTrend.toFixed(2),
    bearTrend2: +bearTrend2.toFixed(2),
    trend:      +trend.toFixed(2),
    bullHist:   +bullHist.toFixed(2),
    bearHist:   +bearHist.toFixed(2),
    signal,
    detail,
    isBull: bullTrend > 2,
    isBear: bearTrend2 < -2,
  };
}

// ── MAIN EXPORT ───────────────────────────────────────────────────────────────
export function computeAllIndicators(candles) {
  if (!candles || candles.length < 60) return null;
  const opens  = candles.map(c=>c[1]);
  const highs  = candles.map(c=>c[2]);
  const lows   = candles.map(c=>c[3]);
  const closes = candles.map(c=>c[4]);
  const vols   = candles.map(c=>c[5]);

  const price   = closes[closes.length-1];
  const prevClose = closes[closes.length-2];
  const change    = +(price-prevClose).toFixed(2);
  const changePct = +(change/prevClose*100).toFixed(2);

  const ma20  = sma(closes,20);
  const ma50  = sma(closes,50);
  const ma150 = sma(closes,150);
  const ma200 = sma(closes,200);
  const ema9  = ema(closes,9);

  const rsi  = calcRSI(closes);
  const {macd,signal:macdSignal,hist:macdHist} = calcMACD(closes);
  const adx  = calcADX(candles);
  const bb   = calcBB(closes);
  const ich  = calcIchimoku(candles);
  const guppy = calcGuppy(closes);
  const ttm  = calcTTM(closes,highs,lows);
  const cpr  = calcCPR(candles[candles.length-1]);
  const stage = calcStage(closes, ma50, ma150, ma200);
  const rs    = calcRS(closes);
  const cagr  = calcCAGR(closes);
  const ath   = calcATH(candles);
  const volFlags = calcVolFlags(candles);
  const miniCoil = calcMiniCoil(candles);
  const jrkg    = calcJRKG(candles);
  const bbpt    = calcBBPT(candles);
  const pivotPocket = calcPivotPocket(candles);
  const mv    = calcMinervini(closes,highs,lows,ma50,ma150,ma200,rs);
  const mvScore = Object.values(mv).filter(Boolean).length;

  // Volume metrics
  const vol    = vols[vols.length-1];
  const vol20  = avg(vols.slice(-20));
  const relVol = +(vol/vol20).toFixed(2);

  // ATR
  const trArr = candles.slice(-15).map((c,i,a)=>i===0?c[2]-c[3]:
    Math.max(c[2]-c[3],Math.abs(c[2]-a[i-1][4]),Math.abs(c[3]-a[i-1][4])));
  const atr = +avg(trArr).toFixed(2);

  // Liquidity
  const liquidity = +((price*vol)/1e7).toFixed(2);

  // 52-week range
  const wkHighArr=highs.slice(-252), wkLowArr=lows.slice(-252);
  const wkHigh=Math.max(...wkHighArr),wkLow=Math.min(...wkLowArr);
  const fromHigh=+(price/wkHigh*100).toFixed(1);

  // Upper wick %
  const lastC=candles[candles.length-1];
  const upperWick = lastC[2]>Math.max(lastC[1],lastC[4])
    ? +((lastC[2]-Math.max(lastC[1],lastC[4]))/lastC[2]*100).toFixed(1) : 0;

  // Up/Down ratio (20 days)
  const recent20=candles.slice(-20);
  const upVol=recent20.filter(c=>c[4]>=c[1]).reduce((a,c)=>a+c[5],0);
  const dnVol=recent20.filter(c=>c[4]< c[1]).reduce((a,c)=>a+c[5],0);
  const udr=+(upVol/(dnVol||1)).toFixed(2);

  // Trend
  const trendDaily  = price>prevClose?"Up":"Down";
  const trendWeekly = closes.length>=5&&closes[closes.length-1]>closes[closes.length-6]?"Up":"Down";

  // ADX strength label
  const adxStrong = adx >= 25;

  const ind = {
    price, prevClose, change, changePct,
    ma20:ma20?+ma20.toFixed(2):null,
    ma50:ma50?+ma50.toFixed(2):null,
    ma150:ma150?+ma150.toFixed(2):null,
    ma200:ma200?+ma200.toFixed(2):null,
    ema9:ema9?+ema9.toFixed(2):null,
    rsi, macd, macdSignal, macdHist,
    adx, adxStrong,
    upperBB:bb.upper, lowerBB:bb.lower, bbWidth:bb.width,
    ichimoku:ich.status, tenkan:ich.tenkan, kijun:ich.kijun,
    spanA:ich.spanA, spanB:ich.spanB,
    guppy, ttm,
    ...cpr,
    stage, rs, mv, mvScore,
    vol, relVol, atr, liquidity,
    wkHigh:+wkHigh.toFixed(2), wkLow:+wkLow.toFixed(2), fromHigh,
    upperWick, udr,
    trendDaily, trendWeekly,
    adxStrong,
    // New
    cagr, ath, volFlags,
    miniCoil, pivotPocket, jrkg, bbpt,
    risks: [
      adx<18&&"Weak trend ADX < 18",
      upperWick>4&&"Upper wick > 4%",
      relVol<0.8&&"Low volume",
      stage>=3&&"Stage 3/4 — late",
      rsi>72&&"RSI overbought",
      bb.width<2&&"Tight BB — coiling",
    ].filter(Boolean),
  };

  return {...ind, ...calcRecommendation(ind)};
}
