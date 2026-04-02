// Screens.js — Screener.in Custom Screen Results
import { useState, useEffect } from "react";

const T = {
  bg0:"#09090b",bg1:"#0f1014",bg2:"#16191f",bg3:"#1e2229",
  border:"#2a3240",borderHi:"#3d4d60",
  t0:"#f1f5f9",t1:"#cbd5e1",t2:"#94a3b8",t3:"#546070",
  amber:"#f59e0b",amberDim:"#78350f",
  green:"#22c55e",greenDim:"#14532d",
  red:"#ef4444",redDim:"#7f1d1d",
  blue:"#3b82f6",blueDim:"#1e3a5f",
  purple:"#a855f7",purpleDim:"#4a1d96",
};

const COLORS = {
  green:  { bg:T.greenDim,  border:T.green,  text:T.green  },
  amber:  { bg:T.amberDim,  border:T.amber,  text:T.amber  },
  blue:   { bg:T.blueDim,   border:T.blue,   text:T.blue   },
  purple: { bg:T.purpleDim, border:T.purple, text:T.purple },
};

const n2 = v => v!=null?Number(v).toLocaleString("en-IN",{maximumFractionDigits:2}):"—";
const n1 = v => v!=null?Number(v).toFixed(1):"—";

function StockRow({ stock, color, onSelect, rank }) {
  const col = COLORS[color]||COLORS.amber;
  const pctColor = stock.pctFromATH!=null
    ? stock.pctFromATH >= -3  ? T.green
    : stock.pctFromATH >= -15 ? T.amber
    : T.red
    : T.t2;

  return (
    <tr onClick={()=>onSelect&&onSelect(stock.symbol)}
      style={{cursor:"pointer",transition:"background 0.15s"}}
      onMouseEnter={e=>e.currentTarget.style.background=T.bg3}
      onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
      <td style={{padding:"6px 8px",fontFamily:"monospace",
        fontSize:9,color:T.t3,textAlign:"center"}}>{rank}</td>
      <td style={{padding:"6px 8px"}}>
        <div style={{fontFamily:"monospace",fontSize:11,
          fontWeight:600,color:T.t0}}>{stock.symbol}</div>
        <div style={{fontSize:9,color:T.t3,marginTop:1}}>{stock.name}</div>
      </td>
      <td style={{padding:"6px 8px",fontFamily:"monospace",
        fontSize:11,color:T.amber,textAlign:"right"}}>
        ₹{n2(stock.cmp)}
      </td>
      <td style={{padding:"6px 8px",fontFamily:"monospace",
        fontSize:10,textAlign:"right",color:pctColor}}>
        {stock.pctFromATH!=null
          ? `${stock.pctFromATH >= 0?"+":""}${stock.pctFromATH}%`
          : "—"}
      </td>
      <td style={{padding:"6px 8px",fontFamily:"monospace",
        fontSize:10,color:T.t1,textAlign:"right"}}>{n2(stock.pe)}</td>
      <td style={{padding:"6px 8px",fontFamily:"monospace",
        fontSize:10,textAlign:"right",
        color:stock.roce>=20?T.green:stock.roce>=15?T.amber:T.t2}}>
        {n1(stock.roce)}%
      </td>
      <td style={{padding:"6px 8px",fontFamily:"monospace",
        fontSize:10,color:T.t1,textAlign:"right"}}>
        {stock.marketCap!=null
          ? stock.marketCap>=10000
            ? `₹${(stock.marketCap/1000).toFixed(0)}K Cr`
            : `₹${n2(stock.marketCap)} Cr`
          : "—"}
      </td>
      <td style={{padding:"6px 8px",fontFamily:"monospace",fontSize:10,
        textAlign:"right",
        color:stock.qtrSalesVar>12?T.green:stock.qtrSalesVar>0?T.amber:T.red}}>
        {stock.qtrSalesVar!=null?`${stock.qtrSalesVar>0?"+":""}${n1(stock.qtrSalesVar)}%`:"—"}
      </td>
      <td style={{padding:"6px 8px",fontFamily:"monospace",fontSize:10,
        textAlign:"right",
        color:stock.qtrProfitVar>15?T.green:stock.qtrProfitVar>0?T.amber:T.red}}>
        {stock.qtrProfitVar!=null?`${stock.qtrProfitVar>0?"+":""}${n1(stock.qtrProfitVar)}%`:"—"}
      </td>
      <td style={{padding:"6px 8px",textAlign:"center"}}>
        <span style={{fontSize:8,padding:"2px 6px",borderRadius:2,
          background:col.bg,color:col.text,
          border:`0.5px solid ${col.border}`,
          fontFamily:"monospace",cursor:"pointer"}}>
          Analyse ↗
        </span>
      </td>
    </tr>
  );
}

function ScreenPanel({ screen, onSelect }) {
  const col = COLORS[screen.color]||COLORS.amber;
  const [sortBy,  setSortBy]  = useState("default");
  const [search,  setSearch]  = useState("");

  const sorted = [...(screen.stocks||[])].filter(s=>
    !search || s.name.toLowerCase().includes(search.toLowerCase())
    || s.symbol.toLowerCase().includes(search.toLowerCase())
  ).sort((a,b)=>{
    if (sortBy==="roce")    return (b.roce??0)-(a.roce??0);
    if (sortBy==="cmp")     return (b.cmp??0)-(a.cmp??0);
    if (sortBy==="mcap")    return (b.marketCap??0)-(a.marketCap??0);
    if (sortBy==="ath")     return (b.pctFromATH??-999)-(a.pctFromATH??-999);
    if (sortBy==="sales")   return (b.qtrSalesVar??-999)-(a.qtrSalesVar??-999);
    if (sortBy==="profit")  return (b.qtrProfitVar??-999)-(a.qtrProfitVar??-999);
    return 0;
  });

  if (screen.error) {
    return (
      <div style={{background:T.redDim,border:`0.5px solid ${T.red}`,
        borderRadius:8,padding:"16px",margin:"8px 0"}}>
        <div style={{color:T.red,fontFamily:"monospace",fontSize:11}}>
          ❌ {screen.name}: {screen.error}
        </div>
        <div style={{color:T.t2,fontSize:10,marginTop:6}}>
          Run: <code>python3 scripts/fetch_screens.py</code>
        </div>
      </div>
    );
  }

  return (
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      {/* Screen header */}
      <div style={{background:col.bg,border:`1px solid ${col.border}`,
        borderRadius:8,padding:"10px 14px",
        display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <div style={{fontFamily:"monospace",fontSize:11,
            fontWeight:700,color:col.text}}>{screen.name}</div>
          <div style={{fontSize:9,color:T.t2,marginTop:2}}>{screen.desc}</div>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontFamily:"monospace",fontSize:20,
            fontWeight:700,color:col.text}}>{screen.count}</div>
          <div style={{fontSize:8,color:T.t2}}>stocks found</div>
          {screen.fetchedAt&&(
            <div style={{fontSize:8,color:T.t3,marginTop:2}}>
              {new Date(screen.fetchedAt).toLocaleTimeString("en-IN")}
            </div>
          )}
        </div>
      </div>

      {/* Controls */}
      <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
        <input value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="Search stock..."
          style={{fontFamily:"monospace",fontSize:10,padding:"4px 8px",
            background:T.bg3,border:`0.5px solid ${T.border}`,
            borderRadius:3,color:T.t1,width:150}}/>
        <span style={{fontSize:9,color:T.t2,fontFamily:"monospace"}}>SORT:</span>
        {[["default","Default"],["roce","ROCE"],["ath","ATH%"],
          ["sales","Sales Gr"],["profit","Profit Gr"],["mcap","Mkt Cap"]].map(([k,l])=>(
          <button key={k} onClick={()=>setSortBy(k)}
            style={{fontFamily:"monospace",fontSize:8,padding:"3px 8px",
              borderRadius:3,cursor:"pointer",
              background:sortBy===k?col.border:T.bg3,
              border:`0.5px solid ${sortBy===k?col.border:T.border}`,
              color:sortBy===k?T.bg0:T.t2}}>
            {l}
          </button>
        ))}
        <span style={{marginLeft:"auto",fontSize:9,color:T.t3,
          fontFamily:"monospace"}}>
          {sorted.length} shown
        </span>
      </div>

      {/* Table */}
      {sorted.length>0?(
        <div style={{background:T.bg1,border:`0.5px solid ${T.border}`,
          borderRadius:8,overflow:"hidden"}}>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:10}}>
              <thead>
                <tr style={{background:T.bg2,
                  borderBottom:`0.5px solid ${T.border}`}}>
                  {["#","Stock","CMP","vs ATH","P/E",
                    "ROCE","Mkt Cap","Sales Gr%","Profit Gr%","Action"].map(h=>(
                    <th key={h} style={{padding:"6px 8px",textAlign:"left",
                      color:T.t2,fontWeight:500,fontSize:9,
                      fontFamily:"monospace",whiteSpace:"nowrap"}}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((stock,i)=>(
                  <StockRow key={stock.symbol||i} stock={stock}
                    color={screen.color} onSelect={onSelect} rank={i+1}/>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ):(
        <div style={{textAlign:"center",padding:"20px",
          color:T.t3,fontFamily:"monospace",fontSize:10}}>
          {screen.count===0?"No stocks match this screen today":"No results for search"}
        </div>
      )}
    </div>
  );
}

export default function Screens({ onSelectStock }) {
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [activeTab,  setActiveTab]  = useState(0);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/screens.json?t="+Date.now());
      if (!r.ok) throw new Error("screens.json not found");
      const d = await r.json();
      setData(d);
    } catch(e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(()=>{ load(); },[]);

  const screens = data?.screens||[];
  const activeScreen = screens[activeTab];

  return (
    <div style={{height:"100%",overflowY:"auto",padding:"12px 16px",
      display:"flex",flexDirection:"column",gap:10}}>

      {/* Header */}
      <div style={{display:"flex",alignItems:"center",
        gap:8,flexShrink:0,flexWrap:"wrap"}}>
        <span style={{fontFamily:"monospace",fontSize:10,
          color:T.amber,fontWeight:600,letterSpacing:"1px"}}>
          📋 SCREENER.IN SCREENS
        </span>
        {data?.fetchedAt&&(
          <span style={{fontSize:9,color:T.t3}}>
            Updated: {new Date(data.fetchedAt).toLocaleString("en-IN")}
          </span>
        )}
        <button onClick={load}
          style={{marginLeft:"auto",fontFamily:"monospace",fontSize:9,
            padding:"4px 10px",background:T.bg3,
            border:`0.5px solid ${T.border}`,borderRadius:3,
            color:T.t1,cursor:"pointer"}}>
          ↻ RELOAD
        </button>
      </div>

      {/* Tabs */}
      {screens.length>0&&(
        <div style={{display:"flex",gap:4,flexShrink:0,flexWrap:"wrap"}}>
          {screens.map((s,i)=>{
            const col = COLORS[s.color]||COLORS.amber;
            return (
              <button key={s.id} onClick={()=>setActiveTab(i)}
                style={{fontFamily:"monospace",fontSize:10,
                  padding:"5px 14px",borderRadius:4,cursor:"pointer",
                  background:activeTab===i?col.border:T.bg3,
                  border:`0.5px solid ${activeTab===i?col.border:T.border}`,
                  color:activeTab===i?T.bg0:T.t1,
                  fontWeight:activeTab===i?600:400}}>
                {s.name}
                <span style={{marginLeft:6,fontSize:9,
                  color:activeTab===i?T.bg0:T.t3}}>
                  ({s.count})
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Loading */}
      {loading&&(
        <div style={{textAlign:"center",padding:"40px",color:T.amber,
          fontFamily:"monospace",fontSize:11}}>
          Loading screens...
        </div>
      )}

      {/* Error */}
      {error&&!loading&&(
        <div style={{background:T.redDim,border:`0.5px solid ${T.red}`,
          borderRadius:8,padding:"16px"}}>
          <div style={{color:T.red,fontFamily:"monospace",
            fontSize:11,marginBottom:8}}>
            ❌ {error}
          </div>
          <div style={{color:T.t2,fontSize:10,lineHeight:2}}>
            Run this in Terminal to fetch screens:<br/>
            <code style={{color:T.amber}}>
              cd ~/Desktop/war-room && python3 scripts/fetch_screens.py
            </code>
          </div>
        </div>
      )}

      {/* Active screen */}
      {!loading&&!error&&activeScreen&&(
        <ScreenPanel screen={activeScreen}
          onSelect={sym=>onSelectStock&&onSelectStock(sym)}/>
      )}
    </div>
  );
}
