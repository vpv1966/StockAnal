// FundamentalAnalysis.js — Institutional Forensic Analysis Engine v2
// Framework: Mentor forensic sequence + new tabs from Ajanta/Coal India sessions
// Tab order: Overview → DuPont → Common Size → Rev DCF → 3-Scenario → CAPEX → WC → CFO → Valuation → Fibonacci → Tax & BS → AI → Verdict
import { useState, useRef, useCallback } from "react";

const T = {
  bg0:"#09090b",bg1:"#0f1014",bg2:"#16191f",bg3:"#1e2229",
  border:"#2a3240",borderHi:"#3d4d60",
  t0:"#f1f5f9",t1:"#cbd5e1",t2:"#94a3b8",t3:"#546070",
  amber:"#f59e0b",amberDim:"#78350f",
  green:"#22c55e",greenDim:"#14532d",
  red:"#ef4444",redDim:"#7f1d1d",
  blue:"#3b82f6",blueDim:"#1e3a5f",
  purple:"#a855f7",teal:"#14b8a6",tealDim:"#042f2e",
};

const n2 = v => v!=null?Number(v).toLocaleString("en-IN",{maximumFractionDigits:2}):"—";
const n0 = v => v!=null?Math.round(Number(v)).toLocaleString("en-IN"):"—";
const n1 = v => v!=null?Number(v).toFixed(1):"—";
const pct= v => v!=null?`${Number(v).toFixed(1)}%`:"—";
const cagr=(s,e,y)=> s&&e&&s>0&&y>0?((Math.pow(e/s,1/y)-1)*100).toFixed(1):null;
const avg =(arr)=> { const v=arr.filter(x=>x!=null); return v.length?v.reduce((a,b)=>a+b,0)/v.length:null; };

// ── Parse technofunda.co Excel ────────────────────────────────────────────────
function parseExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const XLSX = window.XLSX;
        const wb   = XLSX.read(e.target.result, {type:"array", cellDates:true});
        const ds   = wb.Sheets["Data Sheet"];
        if (!ds) throw new Error("'Data Sheet' tab not found — use technofunda.co template");
        const rows = XLSX.utils.sheet_to_json(ds, {header:1, defval:null});
        const find = (label) => rows.find(r=>r[0]===label);
        const vals = (label, start=1, end=11) => {
          const r = find(label);
          return r ? r.slice(start,end).map(v=>typeof v==="number"?v:null) : Array(end-start).fill(null);
        };
        const val1 = (label) => { const r=find(label); return r?r[1]:null; };

        const plIdx = rows.findIndex(r=>r[0]==="PROFIT & LOSS");
        const years = plIdx>=0
          ? rows[plIdx+1].slice(1,11).map(d=>d instanceof Date?d.getFullYear():(typeof d==="string"?d.slice(0,4):String(d)))
          : [];

        const qIdx = rows.findIndex(r=>r[0]==="Quarters");
        const qDates = qIdx>=0
          ? rows[qIdx+1].slice(1,11).map(d=>d instanceof Date
              ? `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()]} ${d.getFullYear()}`
              : String(d))
          : [];

        const d = {
          company: val1("COMPANY NAME"),
          price:   val1("Current Price"),
          mktCap:  val1("Market Capitalization"),
          years, qDates,
          pl:{
            sales:       vals("Sales"),
            rawMat:      vals("Raw Material Cost"),
            changeInInv: vals("Change in Inventory"),
            power:       vals("Power and Fuel"),
            otherMfr:    vals("Other Mfr. Exp"),
            employee:    vals("Employee Cost"),
            selling:     vals("Selling and admin"),
            otherExp:    vals("Other Expenses"),
            otherIncome: vals("Other Income"),
            depreciation:vals("Depreciation"),
            interest:    vals("Interest"),
            pbt:         vals("Profit before tax"),
            tax:         vals("Tax"),
            pat:         vals("Net profit"),
            dividend:    vals("Dividend Amount"),
          },
          q:{
            dates:  qDates,
            sales:  qIdx>=0?rows[qIdx+2]?.slice(1,11).map(v=>typeof v==="number"?v:null)||[]:[],
            exp:    qIdx>=0?rows[qIdx+3]?.slice(1,11).map(v=>typeof v==="number"?v:null)||[]:[],
            opProfit:qIdx>=0?rows[qIdx+10]?.slice(1,11).map(v=>typeof v==="number"?v:null)||[]:[],
            pat:    qIdx>=0?rows[qIdx+9]?.slice(1,11).map(v=>typeof v==="number"?v:null)||[]:[],
          },
          bs:{
            equity:      vals("Equity Share Capital"),
            reserves:    vals("Reserves"),
            borrowings:  vals("Borrowings"),
            otherLiab:   vals("Other Liabilities"),
            totalLiab:   vals("Total"),
            netBlock:    vals("Net Block"),
            cwip:        vals("Capital Work in Progress"),
            investments: vals("Investments"),
            otherAssets: vals("Other Assets"),
            receivables: vals("Receivables"),
            inventory:   vals("Inventory"),
            cash:        vals("Cash & Bank"),
            shares:      vals("No. of Equity Shares"),
          },
          cf:{
            cfo: vals("Cash from Operating Activity"),
            cfi: vals("Cash from Investing Activity"),
            cff: vals("Cash from Financing Activity"),
          },
          histPrices: (find("PRICE:")||[]).slice(1,11).map(v=>typeof v==="number"?v:null),
          sharesAdj:  vals("Adjusted Equity Shares in Cr"),
        };
        resolve(d);
      } catch(err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// ── Compute all forensic metrics ──────────────────────────────────────────────
function computeForensics(d) {
  const {pl, bs, cf, years} = d;
  const n    = years.length;
  const last = n-1;

  const capEmployed = years.map((_,i) =>
    (bs.equity[i]||0)+(bs.reserves[i]||0)+(bs.borrowings[i]||0));
  const netWorth = years.map((_,i)=> (bs.equity[i]||0)+(bs.reserves[i]||0));
  const ebit   = pl.pbt.map((p,i)=> p!=null&&pl.interest[i]!=null?p+pl.interest[i]:null);
  const ebitda = ebit.map((e,i)=> e!=null&&pl.depreciation[i]!=null?e+pl.depreciation[i]:null);
  const opm    = pl.sales.map((s,i)=> s&&ebitda[i]?ebitda[i]/s*100:null);
  const npm    = pl.sales.map((s,i)=> s&&pl.pat[i]?pl.pat[i]/s*100:null);
  const roce   = capEmployed.map((c,i)=> c&&ebit[i]?ebit[i]/c*100:null);
  const roe    = netWorth.map((nw,i)=> nw&&pl.pat[i]?pl.pat[i]/nw*100:null);
  const de     = netWorth.map((nw,i)=> nw&&bs.borrowings[i]!=null?bs.borrowings[i]/nw:null);
  const taxRate= pl.pbt.map((p,i)=> p&&pl.tax[i]?pl.tax[i]/p*100:null);
  const totalAssets = bs.totalLiab;
  const ato    = totalAssets.map((a,i)=> a&&pl.sales[i]?pl.sales[i]/a:null);
  const nfat   = bs.netBlock.map((nb,i)=> nb&&pl.sales[i]?pl.sales[i]/nb:null);
  const ca     = years.map((_,i)=>(bs.receivables[i]||0)+(bs.inventory[i]||0)+(bs.cash[i]||0));
  const cr     = ca.map((c,i)=> bs.otherLiab[i]?c/bs.otherLiab[i]:null);

  const debtorDays   = pl.sales.map((s,i)=> s&&bs.receivables[i]?bs.receivables[i]/s*365:null);
  const cogs         = pl.sales.map((_,i)=> (pl.rawMat[i]||0)+(pl.changeInInv[i]||0)+(pl.power[i]||0)+(pl.otherMfr[i]||0));
  const inventoryDays= cogs.map((c,i)=> c&&bs.inventory[i]?bs.inventory[i]/c*365:null);
  const payableDays  = cogs.map((c,i)=> c&&bs.otherLiab[i]?bs.otherLiab[i]/c*365:null);
  const opCycle      = debtorDays.map((d,i)=> d&&inventoryDays[i]?d+inventoryDays[i]:null);
  const ccc          = opCycle.map((o,i)=> o&&payableDays[i]?o-payableDays[i]:null);

  const cfoPat   = cf.cfo.map((c,i)=> c&&pl.pat[i]?c/pl.pat[i]*100:null);
  const cfoEbitda= cf.cfo.map((c,i)=> c&&ebitda[i]?c/ebitda[i]*100:null);

  const capexCFI = cf.cfi.map(c=> c!=null?Math.abs(c):null);
  const capexNB  = years.map((_,i)=>{
    if (i===0) return null;
    const nbChg   = bs.netBlock[i]!=null&&bs.netBlock[i-1]!=null?bs.netBlock[i]-bs.netBlock[i-1]:null;
    const cwipChg = bs.cwip[i]!=null&&bs.cwip[i-1]!=null?bs.cwip[i]-bs.cwip[i-1]:null;
    const dep     = pl.depreciation[i];
    if (nbChg==null||cwipChg==null||dep==null) return null;
    return +(nbChg+cwipChg+dep).toFixed(2);
  });
  const capex    = capexNB.map((nb,i)=> nb!=null?nb:capexCFI[i]);
  const fcf      = cf.cfo.map((c,i)=> c!=null&&capex[i]!=null?+(c-capex[i]).toFixed(2):null);
  const reinvRate= cf.cfo.map((c,i)=> c&&capex[i]?capex[i]/c*100:null);

  const cfoCum   = cf.cfo.reduce((a,b)=>(a||0)+(b||0),0);
  const capexCum = capex.reduce((a,b)=>(a||0)+(b||0),0);
  const depCum   = pl.depreciation.reduce((a,b)=>(a||0)+(b||0),0);
  const fcfCum   = fcf.reduce((a,b)=>(a||0)+(b||0),0);
  const fcfReinvRate = cfoCum?(fcfCum/cfoCum*100):null;
  const undepCapex   = capexCum - depCum;
  const impliedRevFromCapex = undepCapex * 2;

  const ceCagr    = cagr(capEmployed[0], capEmployed[last], n-1);
  const salesCagr = cagr(pl.sales[0], pl.sales[last], n-1);
  const patCagr   = cagr(pl.pat[0], pl.pat[last], n-1);
  const sales3Cagr= last>=3?cagr(pl.sales[last-3], pl.sales[last], 3):null;
  const pat3Cagr  = last>=3?cagr(pl.pat[last-3], pl.pat[last], 3):null;
  const sales5Cagr= last>=5?cagr(pl.sales[last-5], pl.sales[last], 5):null;
  const pat5Cagr  = last>=5?cagr(pl.pat[last-5], pl.pat[last], 5):null;
  const pat5CagrSafe = pat5Cagr || (last>=2?cagr(pl.pat[0], pl.pat[last], last):null);
  const pat3CagrSafe = pat3Cagr || pat5CagrSafe;

  // Common size P&L (% of sales)
  const commonSize = years.map((_,i)=>{
    const s = pl.sales[i];
    if (!s) return null;
    return {
      rawMat:   pl.rawMat[i]!=null?pl.rawMat[i]/s*100:null,
      employee: pl.employee[i]!=null?pl.employee[i]/s*100:null,
      selling:  pl.selling[i]!=null?pl.selling[i]/s*100:null,
      otherMfr: pl.otherMfr[i]!=null?pl.otherMfr[i]/s*100:null,
      power:    pl.power[i]!=null?pl.power[i]/s*100:null,
      otherExp: pl.otherExp[i]!=null?pl.otherExp[i]/s*100:null,
      depreciation: pl.depreciation[i]!=null?pl.depreciation[i]/s*100:null,
      interest: pl.interest[i]!=null?pl.interest[i]/s*100:null,
      opm:      ebitda[i]!=null?ebitda[i]/s*100:null,
      npm:      pl.pat[i]!=null?pl.pat[i]/s*100:null,
    };
  });

  const revDCF = (mktCap, basePAT, sharesAdj, dr, tg, yrs, termMult) => {
    if (!mktCap||!basePAT||!termMult) return null;
    let lo=0, hi=3.0, mid=0, dcf=0;
    for(let iter=0;iter<120;iter++){
      mid=(lo+hi)/2; dcf=0;
      let pat=basePAT;
      for(let y=1;y<=yrs;y++){ pat=pat*(1+mid); dcf+=pat/Math.pow(1+dr,y); }
      dcf += pat*termMult/Math.pow(1+dr,yrs);
      if(dcf>mktCap) hi=mid; else lo=mid;
    }
    return (mid*100).toFixed(2);
  };

  return {
    capEmployed,netWorth,ebit,ebitda,opm,npm,roce,roe,de,
    taxRate,ato,nfat,ca,cr,cogs,
    debtorDays,inventoryDays,payableDays,opCycle,ccc,
    cfoPat,cfoEbitda,capex,fcf,reinvRate,
    cfoCum,capexCum,depCum,fcfCum,fcfReinvRate,
    undepCapex,impliedRevFromCapex,
    ceCagr,salesCagr,patCagr,
    sales3Cagr,pat3Cagr,sales5Cagr,pat5Cagr,
    pat5CagrSafe,pat3CagrSafe,
    commonSize,
    revDCF,
  };
}

// ── Shared UI primitives ──────────────────────────────────────────────────────
const Flag = ({ok, label, value, detail}) => {
  const col  = ok===true?T.green:ok===false?T.red:T.amber;
  const icon = ok===true?"✓":ok===false?"✗":"~";
  return (
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",
      padding:"6px 0",borderBottom:`0.5px solid ${T.border}`,gap:8}}>
      <div style={{flex:1}}>
        <span style={{color:T.t2,fontSize:11}}>{label}</span>
        {detail&&<div style={{fontSize:9,color:T.t3,marginTop:1}}>{detail}</div>}
      </div>
      <span style={{fontFamily:"monospace",fontSize:11,fontWeight:600,
        color:col,whiteSpace:"nowrap"}}>{icon} {value}</span>
    </div>
  );
};

const SectionTitle = ({children,color}) => (
  <div style={{fontFamily:"monospace",fontSize:9,fontWeight:600,
    color:color||T.amber,letterSpacing:"1px",
    borderBottom:`0.5px solid ${T.border}`,paddingBottom:5,marginBottom:8}}>
    {children}
  </div>
);

const KV = ({label,value,color=T.t0,sub}) => (
  <div style={{background:T.bg3,border:`0.5px solid ${T.border}`,borderRadius:4,padding:"6px 8px"}}>
    <div style={{fontSize:8,color:T.t3,marginBottom:2}}>{label}</div>
    <div style={{fontFamily:"monospace",fontSize:13,fontWeight:600,color}}>{value||"—"}</div>
    {sub&&<div style={{fontSize:8,color:T.t3,marginTop:1}}>{sub}</div>}
  </div>
);

const TrendTable = ({label,rows,years,highlightLast=2}) => (
  <div style={{marginBottom:12}}>
    {label&&<div style={{fontSize:10,color:T.t2,marginBottom:4,fontWeight:500}}>{label}</div>}
    <div style={{overflowX:"auto"}}>
      <table style={{width:"100%",borderCollapse:"collapse",fontFamily:"monospace",fontSize:10}}>
        <thead>
          <tr style={{borderBottom:`0.5px solid ${T.border}`}}>
            <th style={{textAlign:"left",padding:"3px 6px",color:T.t3,fontWeight:400,minWidth:120}}>Metric</th>
            {years.map((y,i)=>(
              <th key={y} style={{textAlign:"right",padding:"3px 6px",
                color:i>=years.length-highlightLast?T.amber:T.t3,fontWeight:400,whiteSpace:"nowrap"}}>{y}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([lbl,vals,col,fmt])=>(
            <tr key={lbl} style={{borderBottom:`0.5px solid ${T.border}`}}>
              <td style={{padding:"4px 6px",color:T.t2}}>{lbl}</td>
              {vals.map((v,i)=>(
                <td key={i} style={{padding:"4px 6px",textAlign:"right",
                  color:v!=null?(col||(v>=0?T.t1:T.red)):T.t3}}>
                  {v!=null?(fmt?fmt(v):n2(v)):"—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

// ── Main Component ────────────────────────────────────────────────────────────
export default function FundamentalAnalysis({ onSelectStock }) {
  const [data,      setData]      = useState(null);
  const [forensics, setForensics] = useState(null);
  const [tab,       setTab]       = useState("overview");
  const [aiSummary, setAiSummary] = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [dragging,  setDragging]  = useState(false);

  // DCF inputs
  const [termMult,  setTermMult]  = useState(25);
  const [dcfYears,  setDcfYears]  = useState(5);
  const [userPAT,   setUserPAT]   = useState("");
  const [dcfDR,     setDcfDR]     = useState(25);
  const [dcfTG,     setDcfTG]     = useState(6);

  // 3-Scenario inputs
  const [sc, setSc] = useState({
    bearSales:0, baseSales:0, bullSales:0,
    bearOPM:28, baseOPM:30, bullOPM:32,
    bearEmpPct:32, baseEmpPct:30, bullEmpPct:28,
    bearOMCPct:32, baseOMCPct:31, bullOMCPct:30,
    otherIncome:0, intRatio:0.5, depRatio:3,
    taxRate:25, years:2,
  });
  const [scInited, setScInited] = useState(false);

  // Valuation multiples — derived from actuals, user can override
  const [valFcfMultipleOverride, setValFcfMultipleOverride] = useState("");

  // Fibonacci inputs
  const [fibHigh,   setFibHigh]   = useState("");
  const [fibLow,    setFibLow]    = useState("");

  const [aiResult,      setAiResult]      = useState(null);
  const [aiLoading,     setAiLoading]     = useState(false);
  const [aiQuery,       setAiQuery]       = useState("");
  const [attachedDocs,  setAttachedDocs]  = useState([]);
  const [aiMode,        setAiMode]        = useState("web");
  const docInputRef = useRef();
  const inputRef    = useRef();

  const handleFile = async (file) => {
    if (!file?.name.endsWith(".xlsx")) { setError("Please upload a .xlsx file"); return; }
    if (!window.XLSX) { setError("Excel library loading — please wait 2 seconds and retry"); return; }
    setLoading(true); setError(null);
    try {
      const d = await parseExcel(file);
      if (!d.company) throw new Error("Could not read company name from Data Sheet");
      const f = computeForensics(d);
      setData(d); setForensics(f);
      // Pre-fill scenario inputs from actuals
      const last = d.years.length-1;
      const s    = d.pl.sales[last]||0;
      const oi   = d.pl.otherIncome[last]||0;
      const intR = s>0&&d.pl.interest[last]!=null?+(d.pl.interest[last]/s*100).toFixed(2):0.5;
      const depR = s>0&&d.pl.depreciation[last]!=null?+(d.pl.depreciation[last]/s*100).toFixed(2):3;
      const tr   = d.pl.pbt[last]&&d.pl.tax[last]?+(d.pl.tax[last]/d.pl.pbt[last]*100).toFixed(1):25;
      const empPct = f.commonSize[last]?.employee?.toFixed(1)||30;
      const omcPct = f.commonSize[last]?.otherMfr?.toFixed(1)||30;
      const opmNow = f.opm[last]?.toFixed(1)||28;
      setSc({
        bearSales:+(s*1.05).toFixed(0), baseSales:+(s*1.10).toFixed(0), bullSales:+(s*1.15).toFixed(0),
        bearOPM:+opmNow-2, baseOPM:+opmNow, bullOPM:+opmNow+2,
        bearEmpPct:+empPct+2, baseEmpPct:+empPct, bullEmpPct:+empPct-2,
        bearOMCPct:+omcPct+2, baseOMCPct:+omcPct, bullOMCPct:+omcPct-2,
        otherIncome:oi, intRatio:intR, depRatio:depR,
        taxRate:Math.max(tr,25), years:2,
      });
      setScInited(true);
      setAiQuery(`Analyse ${d.company} — provide: 1) Business segment-wise revenue breakdown and growth trend, 2) CAPEX plan and funding for next 3 years, 3) Key management commentary from latest concall on margins, employee costs, other manufacturing costs, and working capital, 4) Is current performance cyclical or structural? Use all public domain information.`);
    } catch(e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const handleDocUpload = async(files) => {
    const newDocs = [];
    for (const file of Array.from(files)) {
      if (file.type==="application/pdf") {
        const data = await new Promise((res,rej)=>{
          const r = new FileReader();
          r.onload = e => res(e.target.result.split(",")[1]);
          r.onerror = rej;
          r.readAsDataURL(file);
        });
        newDocs.push({name:file.name, type:"pdf", data, size:file.size});
      } else if (file.type.startsWith("text/")) {
        const data = await file.text();
        newDocs.push({name:file.name, type:"text", data, size:file.size});
      }
    }
    setAttachedDocs(prev=>[...prev,...newDocs]);
  };

  const buildContext = useCallback(()=>{
    if (!data||!forensics) return "";
    const f2=forensics,d2=data,yrs=d2.years||[],ln=yrs.length-1;
    if (ln<0) return "";
    const pl2=d2.pl;
    const impl5c = f2.revDCF(d2.mktCap,pl2.pat[ln],d2.sharesAdj?.[ln],dcfDR/100,dcfTG/100,5,termMult);
    const impl3c = f2.revDCF(d2.mktCap,pl2.pat[ln],d2.sharesAdj?.[ln],dcfDR/100,dcfTG/100,3,termMult);
    return `FORENSIC ANALYSIS DATA FOR ${d2.company} (${yrs[0]}-${yrs[ln]})
Current Price: ₹${n2(d2.price)} | Market Cap: ₹${n2(d2.mktCap)} Cr

P&L SUMMARY (10Y):
Sales: ₹${n2(pl2.sales[0])} Cr → ₹${n2(pl2.sales[ln])} Cr | CAGR: ${f2.salesCagr}%
PAT:   ₹${n2(pl2.pat[0])} Cr → ₹${n2(pl2.pat[ln])} Cr | CAGR: ${f2.patCagr}% | 5Y: ${f2.pat5Cagr}% | 3Y: ${f2.pat3Cagr}%
OPM: ${f2.opm[0]?.toFixed(1)}% → ${f2.opm[ln]?.toFixed(1)}% | NPM: ${f2.npm[0]?.toFixed(1)}% → ${f2.npm[ln]?.toFixed(1)}%

COMMON SIZE (latest year):
Employee/Sales: ${f2.commonSize[ln]?.employee?.toFixed(1)}% | OtherMfr/Sales: ${f2.commonSize[ln]?.otherMfr?.toFixed(1)}% | Selling/Sales: ${f2.commonSize[ln]?.selling?.toFixed(1)}%

REVERSE DCF (${dcfDR}% DR, ${dcfTG}% TG, ${termMult}x terminal):
5Y Implied: ${impl5c}% vs Actual: ${f2.pat5Cagr}% → ${parseFloat(f2.pat5Cagr)>parseFloat(impl5c)?"PASS":"FAIL"}
3Y Implied: ${impl3c}% vs Actual: ${f2.pat3Cagr}% → ${parseFloat(f2.pat3Cagr)>parseFloat(impl3c)?"PASS":"FAIL"}

WORKING CAPITAL:
Debtor Days: ${f2.debtorDays[ln-1]?.toFixed(0)}d → ${f2.debtorDays[ln]?.toFixed(0)}d
Inventory Days: ${f2.inventoryDays[ln-1]?.toFixed(0)}d → ${f2.inventoryDays[ln]?.toFixed(0)}d
Operating Cycle: ${f2.opCycle[ln-1]?.toFixed(0)}d → ${f2.opCycle[ln]?.toFixed(0)}d

CFO QUALITY:
CFO/PAT: ${f2.cfoPat[ln]?.toFixed(0)}% | FCF: ₹${n2(f2.fcf[ln])} Cr
10Y CFO: ₹${Math.round(f2.cfoCum).toLocaleString("en-IN")} Cr | CAPEX: ₹${Math.round(f2.capexCum).toLocaleString("en-IN")} Cr | FCF/CFO: ${f2.fcfReinvRate?.toFixed(1)}%

DUPONT (${yrs[ln]}):
ROE: ${f2.roe[ln]?.toFixed(1)}% | ROCE: ${f2.roce[ln]?.toFixed(1)}% | NPM: ${f2.npm[ln]?.toFixed(1)}% | ATO: ${f2.ato[ln]?.toFixed(2)}x`;
  },[data,forensics,termMult,dcfDR,dcfTG]);

  const runAI = useCallback(async(customQuery, docs) => {
    const query = customQuery||aiQuery;
    if (!query&&(!docs||!docs.length)) return;
    setAiLoading(true); setAiResult(null);
    try {
      const useTools = aiMode!=="docs";
      const context  = buildContext()||"";
      const docsToUse = docs||attachedDocs;
      let msgContent = [];
      for (const doc of docsToUse) {
        if (doc.type==="pdf") {
          msgContent.push({type:"document",source:{type:"base64",media_type:"application/pdf",data:doc.data},title:doc.name});
        } else if (doc.type==="text") {
          msgContent.push({type:"text",text:`ATTACHED DOCUMENT: ${doc.name}\n\n${doc.data}`});
        }
      }
      msgContent.push({
        type:"text",
        text: context ? `COMPUTED FORENSIC DATA FROM EXCEL:\n${context}\n\n---\nQUESTION/TASK:\n${query}` : query
      });
      const body = {
        model:"claude-sonnet-4-20250514",
        max_tokens:2000,
        system:"You are an expert Indian equity research analyst using the mentor forensic framework. When given computed forensic data, analyse it critically. Be specific with numbers. Use tabular format where helpful. Sequence: DuPont → Common Size → Reverse DCF → Projection (with Valuation Triangulation) → CAPEX → WC → CFO → Fibonacci → AI Research.",
        messages:[{role:"user",content:msgContent}],
      };
      if (useTools) body.tools=[{type:"web_search_20250305",name:"web_search"}];
      const r = await fetch("http://localhost:3001/ai",{
        method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)
      });
      if (!r.ok) { const err=await r.json().catch(()=>({})); throw new Error(`API ${r.status}: ${err.error?.message||r.statusText}`); }
      const resp = await r.json();
      const text = (resp.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("\n");
      setAiResult(text||"No text response — try rephrasing");
    } catch(e) {
      if (e.message.includes("Failed to fetch")||e.message.includes("NetworkError")) {
        setAiResult("❌ Cannot reach AI proxy.\n\nRun in Terminal:\n  cd ~/Desktop/war-room\n  python3 scripts/ai_proxy.py");
      } else {
        setAiResult("❌ "+e.message);
      }
    }
    finally { setAiLoading(false); }
  },[aiQuery,data,attachedDocs,aiMode,termMult,buildContext]);

  // ── Upload screen ──────────────────────────────────────────────────────────
  if (!data) return (
    <div style={{height:"100%",display:"flex",flexDirection:"column",
      alignItems:"center",justifyContent:"center",padding:40,gap:14}}>
      <div style={{fontSize:28}}>🔬</div>
      <div style={{fontFamily:"monospace",fontSize:13,color:T.t0,fontWeight:600}}>
        Institutional Forensic Analysis v2
      </div>
      <div style={{fontSize:10,color:T.t2,textAlign:"center",maxWidth:400,lineHeight:1.9}}>
        Upload your <b style={{color:T.amber}}>technofunda.co Excel</b> for any stock.<br/>
        Full mentor framework: DuPont → Common Size → Reverse DCF → 3-Scenario →
        CAPEX → WC → CFO → Fibonacci → AI Research
      </div>
      <div
        onClick={()=>inputRef.current.click()}
        onDrop={e=>{e.preventDefault();setDragging(false);handleFile(e.dataTransfer.files[0]);}}
        onDragOver={e=>{e.preventDefault();setDragging(true);}}
        onDragLeave={()=>setDragging(false)}
        style={{width:"100%",maxWidth:400,border:`1.5px dashed ${dragging?T.amber:T.border}`,
          borderRadius:8,padding:"28px 20px",textAlign:"center",cursor:"pointer",
          background:dragging?T.amberDim+"33":T.bg2}}>
        {loading
          ? <div style={{color:T.amber,fontFamily:"monospace",fontSize:11}}>Reading Excel...</div>
          : <><div style={{fontSize:22,marginBottom:6}}>📂</div>
              <div style={{fontSize:11,color:T.t1}}>Drop .xlsx here or click to browse</div>
              <div style={{fontSize:9,color:T.t3,marginTop:3}}>technofunda.co format only</div></>}
        <input ref={inputRef} type="file" accept=".xlsx" style={{display:"none"}}
          onChange={e=>handleFile(e.target.files[0])}/>
      </div>
      {error&&<div style={{background:T.redDim,border:`0.5px solid ${T.red}`,
        borderRadius:6,padding:"8px 12px",fontSize:10,color:T.red,
        fontFamily:"monospace",maxWidth:400,width:"100%"}}>❌ {error}</div>}
    </div>
  );

  const {pl,bs,cf,years,q} = data;
  const f = forensics;
  const n = years.length, last = n-1;

  const ttmPAT    = userPAT&&!isNaN(parseFloat(userPAT))?parseFloat(userPAT):pl.pat[last];
  const ttmSource = userPAT&&!isNaN(parseFloat(userPAT))?"user override":"from Excel";
  const impl5 = f.revDCF(data.mktCap,ttmPAT,data.sharesAdj?.[last],dcfDR/100,dcfTG/100,5,termMult);
  const impl3 = f.revDCF(data.mktCap,ttmPAT,data.sharesAdj?.[last],dcfDR/100,dcfTG/100,3,termMult);
  const pat5CagrDisplay = f.pat5Cagr||f.pat5CagrSafe;
  const pat3CagrDisplay = f.pat3Cagr||f.pat3CagrSafe;

  // 3-scenario compute helper
  const calcScenario = (sales, opm, intRatio, depRatio, taxRate, otherIncome) => {
    const op   = sales * opm / 100;
    const ebitda_s = op + otherIncome;
    const dep  = sales * depRatio / 100;
    const inte = sales * intRatio / 100;
    const pbt  = ebitda_s - dep - inte;
    const tax  = Math.max(pbt * taxRate / 100, 0);
    const pat  = pbt - tax;
    return {op,ebitda:ebitda_s,dep,inte,pbt,tax,pat};
  };

  const sBear = calcScenario(sc.bearSales, sc.bearOPM, sc.intRatio, sc.depRatio, sc.taxRate, sc.otherIncome);
  const sBase = calcScenario(sc.baseSales, sc.baseOPM, sc.intRatio, sc.depRatio, sc.taxRate, sc.otherIncome);
  const sBull = calcScenario(sc.bullSales, sc.bullOPM, sc.intRatio, sc.depRatio, sc.taxRate, sc.otherIncome);
  const cagrSc = (endPat) => ttmPAT&&endPat&&sc.years>0?((Math.pow(endPat/ttmPAT,1/sc.years)-1)*100).toFixed(1):null;

  // Fibonacci compute
  const fibH = parseFloat(fibHigh), fibL = parseFloat(fibLow);
  const fibValid = !isNaN(fibH)&&!isNaN(fibL)&&fibH>fibL;
  const fibRange = fibH - fibL;
  const fibLevels = [
    {lbl:"0.0% — Recent High",    pct:0,     price:fibH,                    note:"Resistance / exit zone"},
    {lbl:"23.6% retracement",     pct:23.6,  price:fibH-0.236*fibRange,     note:"Minor support"},
    {lbl:"38.2% retracement",     pct:38.2,  price:fibH-0.382*fibRange,     note:"Watch zone"},
    {lbl:"50.0% retracement",     pct:50.0,  price:fibH-0.500*fibRange,     note:"Optimal entry"},
    {lbl:"61.8% — Golden ratio",  pct:61.8,  price:fibH-0.618*fibRange,     note:"Best entry"},
    {lbl:"78.6% retracement",     pct:78.6,  price:fibH-0.786*fibRange,     note:"Deep value zone"},
    {lbl:"100% — Recent Low",     pct:100,   price:fibL,                    note:"Strong support"},
  ];

  // ── Valuation triangulation — all multiples derived from actuals ───────────
  const sharesOutCr = data.sharesAdj?.[last]||0;

  // 1. MCap/Sales: derived = current MCap ÷ latest annual Sales
  const derivedMcapSalesMult = data.mktCap&&pl.sales[last]
    ? +(data.mktCap/pl.sales[last]).toFixed(2) : 3;

  // 2. MCap/FCF: derived = current MCap ÷ latest annual FCF
  const latestFCF = f.fcf[last]&&f.fcf[last]>0 ? f.fcf[last] : null;
  const derivedFcfMult = data.mktCap&&latestFCF
    ? +(data.mktCap/latestFCF).toFixed(1) : 17.5;
  // User can override if latest FCF is distorted (e.g. one-time items)
  const fcfMultToUse = valFcfMultipleOverride&&!isNaN(parseFloat(valFcfMultipleOverride))
    ? parseFloat(valFcfMultipleOverride) : derivedFcfMult;

  // 3. Dividend yield: derived = latest annual dividend ÷ current MCap
  const latestDiv = pl.dividend[last]&&pl.dividend[last]>0 ? pl.dividend[last] : null;
  const derivedDivYield = data.mktCap&&latestDiv
    ? +(latestDiv/data.mktCap*100).toFixed(2) : 2;
  const divPayoutRatio = latestDiv&&pl.pat[last]&&pl.pat[last]>0
    ? +(latestDiv/pl.pat[last]).toFixed(3) : 0.35;

  // FCF% of CFO — 3Y trailing average (for projecting FCF from PAT)
  const fcfPctOfCFO = f.cfoCum&&f.fcfCum&&f.fcfCum>0 ? Math.min(1, f.fcfCum/f.cfoCum) : 0.3;
  const cfoPctOfPAT3Y = avg(f.cfoPat.filter(Boolean).slice(-3))/100 || 0.8;

  const calcValTarget = (method) => {
    if (method==="sales") {
      return {
        bear: sc.bearSales * derivedMcapSalesMult,
        base: sc.baseSales * derivedMcapSalesMult,
        bull: sc.bullSales * derivedMcapSalesMult,
        method:"MCap / Sales",
        multiple:`${derivedMcapSalesMult}x`,
        derivation:`₹${n0(data.mktCap)}Cr MCap ÷ ₹${n0(pl.sales[last])}Cr Sales = ${derivedMcapSalesMult}x (applied to projected sales)`,
      };
    }
    if (method==="fcf") {
      // Projected FCF = proj PAT × CFO/PAT% × FCF/CFO%
      const projFCF = k => {
        const pat = k==="bear"?sBear.pat : k==="base"?sBase.pat : sBull.pat;
        return (pat||0) * cfoPctOfPAT3Y * fcfPctOfCFO;
      };
      return {
        bear: projFCF("bear") * fcfMultToUse,
        base: projFCF("base") * fcfMultToUse,
        bull: projFCF("bull") * fcfMultToUse,
        method:"MCap / FCF",
        multiple:`${fcfMultToUse}x`,
        derivation:`₹${n0(data.mktCap)}Cr MCap ÷ ₹${latestFCF?n0(latestFCF):"—"}Cr FCF = ${derivedFcfMult}x derived${valFcfMultipleOverride?" → overridden to "+fcfMultToUse+"x":""}. Proj FCF = PAT × CFO/PAT(${(cfoPctOfPAT3Y*100).toFixed(0)}%) × FCF/CFO(${(fcfPctOfCFO*100).toFixed(0)}%)`,
      };
    }
    if (method==="div") {
      // MCap = projected dividend ÷ same trailing yield (yield held constant)
      const projDiv = k => {
        const pat = k==="bear"?sBear.pat : k==="base"?sBase.pat : sBull.pat;
        return (pat||0) * divPayoutRatio;
      };
      return {
        bear: projDiv("bear") / Math.max(derivedDivYield/100, 0.005),
        base: projDiv("base") / Math.max(derivedDivYield/100, 0.005),
        bull: projDiv("bull") / Math.max(derivedDivYield/100, 0.005),
        method:"Dividend yield",
        multiple:`${derivedDivYield}% yield`,
        derivation:`Trailing yield = ₹${latestDiv?n0(latestDiv):"—"}Cr div ÷ ₹${n0(data.mktCap)}Cr MCap = ${derivedDivYield}%. Payout = ${(divPayoutRatio*100).toFixed(0)}%. Yield held constant on projected dividends.`,
      };
    }
    return {bear:0,base:0,bull:0,method:"",multiple:"",derivation:""};
  };

  const vtSales = calcValTarget("sales");
  const vtFCF   = calcValTarget("fcf");
  const vtDiv   = calcValTarget("div");
  const toPrice = (mcap) => sharesOutCr>0?+(mcap/sharesOutCr).toFixed(0):0;
  const avgMcap = (sc2) => (vtSales[sc2]+vtFCF[sc2]+vtDiv[sc2])/3;

  const TABS = [
    ["overview",  "📊 Overview"],
    ["dupont",    "1. DuPont"],
    ["commonsize","2. Common Size"],
    ["dcf",       "3. Rev DCF"],
    ["scenario",  "4. Projection"],
    ["capex",     "5. CAPEX"],
    ["wc",        "6. WC"],
    ["cfo",       "7. CFO"],
    ["fibonacci", "8. Fibonacci"],
    ["tax",       "9. Tax & BS"],
    ["ai",        "10. AI Research"],
    ["verdict",   "Verdict ★"],
  ];

  // Tab colour map
  const tabColors = {
    overview:T.amber, dupont:T.blue, commonsize:T.teal,
    dcf:T.purple, scenario:T.amber, capex:"#f97316",
    wc:T.blue, cfo:T.green,
    fibonacci:"#ec4899", tax:T.red, ai:T.blue, verdict:T.green,
  };

  return (
    <div style={{height:"100%",display:"flex",flexDirection:"column",
      padding:"10px 14px",gap:8,overflowY:"auto"}}>

      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",
        alignItems:"flex-start",flexShrink:0}}>
        <div>
          <div style={{fontFamily:"monospace",fontSize:13,fontWeight:600,color:T.t0}}>
            🔬 {data.company}
          </div>
          <div style={{fontSize:9,color:T.t3}}>
            {years[0]}–{years[last]} · Mentor Framework v2 · {years.length} years
          </div>
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          {data.price&&(
            <div style={{textAlign:"right"}}>
              <div style={{fontFamily:"monospace",fontSize:13,color:T.amber}}>₹{n2(data.price)}</div>
              {data.mktCap&&<div style={{fontSize:9,color:T.t3}}>MCap ₹{n0(data.mktCap)} Cr</div>}
            </div>
          )}
          {onSelectStock&&(
            <button onClick={()=>onSelectStock(data.company.split(" ")[0])}
              style={{fontFamily:"monospace",fontSize:8,padding:"4px 8px",
                background:T.blue,border:"none",borderRadius:3,color:"#fff",cursor:"pointer"}}>
              War Room ↗
            </button>
          )}
          <button onClick={()=>{setData(null);setForensics(null);setAiResult(null);setScInited(false);}}
            style={{fontFamily:"monospace",fontSize:8,padding:"4px 8px",
              background:T.bg3,border:`0.5px solid ${T.border}`,
              borderRadius:3,color:T.t2,cursor:"pointer"}}>↩ New</button>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{display:"flex",gap:3,flexShrink:0,flexWrap:"wrap"}}>
        {TABS.map(([k,l])=>{
          const tc = tabColors[k]||T.amber;
          return (
            <button key={k} onClick={()=>setTab(k)}
              style={{fontFamily:"monospace",fontSize:9,padding:"4px 9px",
                borderRadius:3,cursor:"pointer",
                background:tab===k?tc:T.bg3,
                border:`0.5px solid ${tab===k?tc:T.border}`,
                color:tab===k?T.bg0:T.t2,fontWeight:tab===k?600:400}}>
              {l}
            </button>
          );
        })}
      </div>

      {/* ════════════════════════════════════════════════════════════
          TAB 0 — OVERVIEW
         ════════════════════════════════════════════════════════════ */}
      {tab==="overview"&&(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
            {[
              {l:"Sales CAGR 10Y",v:`${f.salesCagr}%`, c:parseFloat(f.salesCagr)>=12?T.green:T.amber, sub:`₹${n0(pl.sales[0])} → ₹${n0(pl.sales[last])} Cr`},
              {l:"PAT CAGR 10Y",  v:`${f.patCagr}%`,  c:parseFloat(f.patCagr)>=15?T.green:T.amber,   sub:`₹${n0(pl.pat[0])} → ₹${n0(pl.pat[last])} Cr`},
              {l:"Sales CAGR 5Y", v:`${f.sales5Cagr||"—"}%`, c:T.blue, sub:"5 year trend"},
              {l:"PAT CAGR 5Y",   v:`${pat5CagrDisplay||"—"}%`, c:T.purple, sub:"5 year trend"},
              {l:"OPM Latest",    v:pct(f.opm[last]), c:f.opm[last]>=15?T.green:f.opm[last]>=8?T.amber:T.red, sub:`Was ${pct(f.opm[0])} in ${years[0]}`},
              {l:"EBITDA Latest", v:`₹${n0(f.ebitda[last])} Cr`, c:T.amber, sub:`CAGR ${cagr(f.ebitda[0],f.ebitda[last],last)}%`},
              {l:"PAT Latest",    v:`₹${n0(pl.pat[last])} Cr`, c:T.green, sub:`NPM ${pct(f.npm[last])}`},
              {l:"ROCE",          v:pct(f.roce[last]), c:f.roce[last]>=15?T.green:T.red, sub:`ROE ${pct(f.roe[last])}`},
              {l:"D/E",           v:`${f.de[last]?.toFixed(2)}x`, c:f.de[last]<=1?T.green:T.red, sub:`Borrow ₹${n0(bs.borrowings[last])} Cr`},
              {l:"CFO / PAT",     v:pct(f.cfoPat[last]), c:f.cfoPat[last]>=80?T.green:T.red, sub:"Cash conversion"},
              {l:"FCF",           v:`₹${n0(f.fcf[last])} Cr`, c:f.fcf[last]>0?T.green:T.red, sub:"CFO minus CAPEX"},
              {l:"Imp. Growth",   v:`${impl5||"—"}%`, c:T.purple, sub:`25% DR, ${dcfYears}Y, ${termMult}x PE`},
            ].map(m=>(
              <div key={m.l} style={{background:T.bg2,border:`0.5px solid ${T.border}`,
                borderRadius:6,padding:"8px 10px"}}>
                <div style={{fontSize:8,color:T.t3,marginBottom:3}}>{m.l}</div>
                <div style={{fontFamily:"monospace",fontSize:15,fontWeight:600,color:m.c}}>{m.v}</div>
                <div style={{fontSize:9,color:T.t3,marginTop:2}}>{m.sub}</div>
              </div>
            ))}
          </div>

          <div style={{background:T.bg2,border:`0.5px solid ${T.border}`,borderRadius:6,padding:"10px 12px"}}>
            <SectionTitle>P&L HELICOPTER VIEW</SectionTitle>
            <TrendTable years={years} rows={[
              ["Sales (₹Cr)",  pl.sales,  T.blue],
              ["EBITDA (₹Cr)", f.ebitda,  T.amber],
              ["OPM %",        f.opm,     T.purple, v=>`${v.toFixed(1)}%`],
              ["PAT (₹Cr)",    pl.pat,    T.green],
              ["NPM %",        f.npm,     T.green,  v=>`${v.toFixed(1)}%`],
              ["ROCE %",       f.roce,    null,     v=>`${v.toFixed(1)}%`],
            ]}/>
          </div>

          <div style={{background:T.bg2,border:`0.5px solid ${T.border}`,borderRadius:6,padding:"10px 12px"}}>
            <SectionTitle>GROWTH RATE MATRIX</SectionTitle>
            <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:6}}>
              {[
                ["Period","Sales CAGR","PAT CAGR","EBITDA CAGR","OPM Δ"],
                ["10Y",`${f.salesCagr}%`,`${f.patCagr}%`,`${cagr(f.ebitda[0],f.ebitda[last],last)}%`,`${((f.opm[last]||0)-(f.opm[0]||0)).toFixed(1)}pp`],
                ["5Y", `${f.sales5Cagr||"—"}%`,`${pat5CagrDisplay||"—"}%`,`${last>=5?cagr(f.ebitda[Math.max(last-5,0)],f.ebitda[last],5)||"—":"—"}%`,`${last>=5?((f.opm[last]||0)-(f.opm[Math.max(last-5,0)]||0)).toFixed(1)+"pp":"—"}`],
                ["3Y", `${f.sales3Cagr||"—"}%`,`${pat3CagrDisplay||"—"}%`,`${last>=3?cagr(f.ebitda[Math.max(last-3,0)],f.ebitda[last],3)||"—":"—"}%`,`${last>=3?((f.opm[last]||0)-(f.opm[Math.max(last-3,0)]||0)).toFixed(1)+"pp":"—"}`],
              ].map((row,ri)=>row.map((cell,ci)=>(
                <div key={`${ri}-${ci}`} style={{background:ri===0?T.bg3:T.bg2,borderRadius:3,padding:"5px 7px",border:`0.5px solid ${T.border}`}}>
                  <div style={{fontFamily:"monospace",fontSize:ri===0?8:11,fontWeight:ri===0?400:600,
                    color:ri===0?T.t3:ci===0?T.t2:parseFloat(cell)>=15?T.green:parseFloat(cell)>=8?T.amber:parseFloat(cell)<0?T.red:T.t1}}>
                    {cell}
                  </div>
                </div>
              )))}
            </div>
          </div>

          {aiSummary&&(
            <div style={{background:T.bg2,border:`0.5px solid ${T.green}`,borderRadius:6,padding:"10px 12px"}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                <SectionTitle color={T.green}>AI RESEARCH SUMMARY</SectionTitle>
                <button onClick={()=>setAiSummary(null)} style={{fontSize:9,color:T.t3,background:"none",border:"none",cursor:"pointer"}}>✕</button>
              </div>
              <div style={{fontSize:11,color:T.t1,lineHeight:1.9,whiteSpace:"pre-wrap"}}>{aiSummary}</div>
            </div>
          )}
          {!aiSummary&&(
            <button onClick={()=>setTab("ai")}
              style={{fontFamily:"monospace",fontSize:9,padding:"7px",background:T.bg3,
                border:`0.5px solid ${T.border}`,borderRadius:4,color:T.t2,cursor:"pointer",width:"100%"}}>
              + Run AI Research Summary (appears here)
            </button>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          TAB 1 — DUPONT
         ════════════════════════════════════════════════════════════ */}
      {tab==="dupont"&&(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <div style={{background:T.bg2,border:`0.5px solid ${T.border}`,borderRadius:6,padding:"10px 12px"}}>
            <SectionTitle color={T.blue}>5-STAGE DUPONT — ROE DECOMPOSITION</SectionTitle>

            {/* DuPont flow visual */}
            <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:12,
              padding:"10px 12px",background:T.bg3,borderRadius:6}}>
              {[
                {lbl:"NPM",val:pct(f.npm[last]),c:T.green,note:"PAT/Sales"},
                {op:"×"},
                {lbl:"ATO",val:`${f.ato[last]?.toFixed(2)}x`,c:T.blue,note:"Sales/Assets"},
                {op:"×"},
                {lbl:"Eq.Mult",val:`${(f.capEmployed[last]/f.netWorth[last])?.toFixed(2)}x`,c:T.amber,note:"Assets/Equity"},
                {op:"="},
                {lbl:"ROE",val:pct(f.roe[last]),c:T.purple,note:"Final",highlight:true},
              ].map((item,i)=>(
                item.op
                  ? <div key={i} style={{fontSize:20,color:T.t3,fontWeight:300}}>{item.op}</div>
                  : <div key={i} style={{background:item.highlight?"#7c3aed22":T.bg2,
                      border:`0.5px solid ${item.highlight?"#7c3aed":T.border}`,
                      borderRadius:6,padding:"8px 12px",textAlign:"center",minWidth:80}}>
                      <div style={{fontSize:9,color:T.t3}}>{item.note}</div>
                      <div style={{fontFamily:"monospace",fontSize:14,fontWeight:600,color:item.c}}>{item.val}</div>
                      <div style={{fontSize:8,color:T.t3,marginTop:1}}>{item.lbl}</div>
                    </div>
              ))}
            </div>

            <TrendTable years={years} rows={[
              ["Tax Burden (PAT/PBT)",    pl.pat.map((p,i)=>pl.pbt[i]?p/pl.pbt[i]:null),null,v=>`${(v*100).toFixed(1)}%`],
              ["Interest Burden (PBT/EBIT)",pl.pbt.map((p,i)=>f.ebit[i]?p/f.ebit[i]:null),null,v=>`${(v*100).toFixed(1)}%`],
              ["EBIT Margin %",           f.ebit.map((e,i)=>pl.sales[i]?e/pl.sales[i]*100:null),T.amber,v=>`${v.toFixed(1)}%`],
              ["Asset Turnover (x)",      f.ato,T.blue,v=>`${v.toFixed(2)}x`],
              ["Equity Multiplier (x)",   f.capEmployed.map((c,i)=>f.netWorth[i]?c/f.netWorth[i]:null),null,v=>`${v.toFixed(2)}x`],
              ["ROE %",                   f.roe,T.green,v=>`${v.toFixed(1)}%`],
              ["ROCE %",                  f.roce,T.purple,v=>`${v.toFixed(1)}%`],
            ]}/>

            {/* ROE driver analysis */}
            {(()=>{
              const roeNow=f.roe[last],roePrev5=f.roe[Math.max(last-5,0)];
              const npmNow=f.npm[last],npmPrev5=f.npm[Math.max(last-5,0)];
              const atoNow=f.ato[last],atoPrev5=f.ato[Math.max(last-5,0)];
              const levNow=f.capEmployed[last]/f.netWorth[last];
              const levPrev5=f.capEmployed[Math.max(last-5,0)]/f.netWorth[Math.max(last-5,0)];
              const npmDelta=npmNow&&npmPrev5?npmNow-npmPrev5:null;
              const atoDelta=atoNow&&atoPrev5?atoNow-atoPrev5:null;
              const levDelta=levNow&&levPrev5?levNow-levPrev5:null;
              const roeDelta=roeNow&&roePrev5?roeNow-roePrev5:null;
              const primaryDriver=Math.abs(npmDelta||0)>Math.abs(atoDelta||0)&&Math.abs(npmDelta||0)>Math.abs(levDelta||0)?"Net Profit Margin":Math.abs(atoDelta||0)>Math.abs(levDelta||0)?"Asset Turnover":"Equity Multiplier (Leverage)";
              const driverQuality=primaryDriver==="Net Profit Margin"?"BEST — operational improvement":primaryDriver==="Asset Turnover"?"GOOD — capital efficiency":"RISKY — leverage-driven ROE";
              return (
                <div style={{background:T.bg3,borderRadius:5,padding:"10px 12px",marginTop:8}}>
                  <div style={{fontSize:9,color:T.blue,fontWeight:600,marginBottom:8}}>ROE DRIVER ANALYSIS (5-YEAR CHANGE)</div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,marginBottom:10}}>
                    {[["ROE Δ",roeDelta!=null?`${roeDelta>=0?"+":""}${roeDelta.toFixed(1)}%`:"—",roeDelta>=0?T.green:T.red],
                      ["NPM Δ",npmDelta!=null?`${npmDelta>=0?"+":""}${npmDelta.toFixed(1)}%`:"—",npmDelta>=0?T.green:T.red],
                      ["ATO Δ",atoDelta!=null?`${atoDelta>=0?"+":""}${atoDelta.toFixed(2)}x`:"—",atoDelta>=0?T.green:T.red],
                      ["Leverage Δ",levDelta!=null?`${levDelta>=0?"+":""}${levDelta.toFixed(2)}x`:"—",levDelta<=0?T.green:T.red],
                    ].map(([l,v,c])=>(
                      <div key={l} style={{background:T.bg2,borderRadius:4,padding:"6px 8px",textAlign:"center"}}>
                        <div style={{fontSize:8,color:T.t3}}>{l}</div>
                        <div style={{fontFamily:"monospace",fontSize:13,fontWeight:600,color:c}}>{v}</div>
                      </div>
                    ))}
                  </div>
                  <Flag label="Primary ROE driver (5Y)" ok={primaryDriver!=="Equity Multiplier (Leverage)"}
                    value={primaryDriver} detail={driverQuality}/>
                  <Flag label="Leverage direction" ok={levDelta<=0}
                    value={levDelta!=null?`${levNow?.toFixed(2)}x vs ${levPrev5?.toFixed(2)}x (5Y ago)`:"—"}
                    detail={levDelta<=0?"Deleveraging while growing — very positive":"Increasing leverage — watch D/E ratio"}/>
                  <Flag label="NPM trend" ok={npmDelta>=0}
                    value={`${npmNow?.toFixed(1)}% vs ${npmPrev5?.toFixed(1)}% (5Y ago)`}
                    detail={npmDelta>=0?"Margin expansion — highest quality ROE driver":"Margin compression — P&L game requires cost monitoring"}/>
                  <Flag label="Asset Turnover trend" ok={atoDelta>=0}
                    value={`${atoNow?.toFixed(2)}x vs ${atoPrev5?.toFixed(2)}x (5Y ago)`}
                    detail={atoDelta>=0?"Using assets more efficiently":"ATO declining — CAPEX not yet earning"}/>
                  <div style={{background:T.bg2,borderRadius:4,padding:"8px 10px",marginTop:8,fontSize:10,color:T.t2,lineHeight:1.8}}>
                    <span style={{color:T.amber,fontWeight:600}}>Mentor conclusion: </span>
                    {primaryDriver==="Net Profit Margin"?"This is a P&L game — concentrate on cost structure (employee cost, OMC, selling & admin). DuPont confirms margins are the lever.":
                     primaryDriver==="Asset Turnover"?"Asset efficiency is driving ROE — investigate CAPEX plan and fixed asset utilisation.":
                     "Leverage is inflating ROE — this may not be sustainable. Check D/E trajectory."}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          TAB 2 — COMMON SIZE P&L
         ════════════════════════════════════════════════════════════ */}
      {tab==="commonsize"&&(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <div style={{background:T.bg2,border:`0.5px solid ${T.border}`,borderRadius:6,padding:"10px 12px"}}>
            <SectionTitle color={T.teal}>COMMON SIZE P&L — COST STRUCTURE AS % OF SALES</SectionTitle>
            <div style={{fontSize:9,color:T.t3,marginBottom:8}}>
              Mentor: Identify the 2-3 largest cost heads. Track their 5-year trajectory. These are the margin levers.
            </div>

            <TrendTable years={years} rows={[
              ["Raw Material %",  f.commonSize.map(c=>c?.rawMat),   null, v=>`${v.toFixed(1)}%`],
              ["Employee Cost %", f.commonSize.map(c=>c?.employee), null, v=>`${v.toFixed(1)}%`],
              ["Other Mfr (OMC) %",f.commonSize.map(c=>c?.otherMfr),null,v=>`${v.toFixed(1)}%`],
              ["Selling & Admin %",f.commonSize.map(c=>c?.selling), null, v=>`${v.toFixed(1)}%`],
              ["Power & Fuel %",  f.commonSize.map(c=>c?.power),   null, v=>`${v.toFixed(1)}%`],
              ["Depreciation %",  f.commonSize.map(c=>c?.depreciation),null,v=>`${v.toFixed(1)}%`],
              ["Interest %",      f.commonSize.map(c=>c?.interest), null, v=>`${v.toFixed(1)}%`],
              ["OPM %",           f.opm,                            T.amber, v=>`${v.toFixed(1)}%`],
              ["NPM %",           f.npm,                            T.green, v=>`${v.toFixed(1)}%`],
            ]}/>

            {/* Top 3 cost heads analysis */}
            {(()=>{
              const cs = f.commonSize[last];
              if (!cs) return null;
              const costs = [
                {name:"Employee Cost",  now:cs.employee,  prev5:f.commonSize[Math.max(last-5,0)]?.employee},
                {name:"Raw Material",   now:cs.rawMat,    prev5:f.commonSize[Math.max(last-5,0)]?.rawMat},
                {name:"Other Mfr (OMC)",now:cs.otherMfr,  prev5:f.commonSize[Math.max(last-5,0)]?.otherMfr},
                {name:"Selling & Admin",now:cs.selling,   prev5:f.commonSize[Math.max(last-5,0)]?.selling},
                {name:"Power & Fuel",   now:cs.power,     prev5:f.commonSize[Math.max(last-5,0)]?.power},
              ].filter(c=>c.now!=null).sort((a,b)=>(b.now||0)-(a.now||0));
              const top3 = costs.slice(0,3);
              return (
                <div style={{background:T.bg3,borderRadius:5,padding:"10px 12px",marginTop:4}}>
                  <div style={{fontSize:9,color:T.teal,fontWeight:600,marginBottom:8}}>TOP COST HEADS — 5-YEAR TRAJECTORY</div>
                  {top3.map((c,i)=>{
                    const delta = c.now&&c.prev5?c.now-c.prev5:null;
                    const rising = delta>0.5;
                    const falling= delta<-0.5;
                    return (
                      <div key={c.name} style={{marginBottom:8}}>
                        <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                          <span style={{fontSize:10,color:T.t1,fontWeight:600}}>#{i+1} {c.name}</span>
                          <span style={{fontFamily:"monospace",fontSize:10,
                            color:rising?T.red:falling?T.green:T.amber}}>
                            {c.prev5?.toFixed(1)}% → {c.now?.toFixed(1)}%
                            {delta!=null&&<span style={{marginLeft:4}}>({delta>=0?"+":""}{delta.toFixed(1)}pp)</span>}
                          </span>
                        </div>
                        <div style={{height:6,background:T.bg2,borderRadius:3,overflow:"hidden"}}>
                          <div style={{height:"100%",width:`${Math.min(c.now||0,60)/60*100}%`,
                            background:rising?T.red:falling?T.green:T.amber,borderRadius:3}}/>
                        </div>
                        <div style={{fontSize:9,color:T.t3,marginTop:2}}>
                          {rising?"⚠ Rising — structural cost pressure. Check management guidance for trajectory.":
                           falling?"✓ Falling — positive. Structural efficiency or scale leverage.":
                           "~ Stable. Confirm management guidance on expected trend."}
                        </div>
                      </div>
                    );
                  })}
                  <div style={{background:T.bg2,borderRadius:4,padding:"8px 10px",marginTop:8}}>
                    <div style={{fontSize:9,color:T.teal,fontWeight:600,marginBottom:4}}>MENTOR FRAMEWORK — NEXT STEPS</div>
                    <div style={{fontSize:9,color:T.t2,lineHeight:1.9}}>
                      1. Check concall for management guidance on top 2 cost heads<br/>
                      2. If employee cost rising: next wage revision date? Workforce reduction plan?<br/>
                      3. If OMC rising: MDO contract mining? Stripping ratio? Diesel costs?<br/>
                      4. Use AI Research tab → "Cost guidance" preset for concall commentary<br/>
                      5. Go to Scenario tab → adjust cost % assumptions accordingly
                    </div>
                  </div>
                  <button onClick={()=>{
                    setTab("ai");
                    setAiQuery(`${data.company} — from latest concall and management commentary:
1. What is the guidance on EMPLOYEE COST as % of sales for next 2-3 years? Any wage revision pending? Workforce reduction plan?
2. What is the guidance on OTHER MANUFACTURING COST / OMC as % of sales? MDO contracts, stripping ratios, fuel costs?
3. Is there any specific OPM guidance for FY26/FY27?
4. Raw material cost outlook — any backward integration or hedging strategy?
Provide in tabular format: FY26E / FY27E / FY28E % of sales for each cost head.`);
                  }}
                    style={{width:"100%",marginTop:8,fontFamily:"monospace",fontSize:9,padding:"7px",
                      background:T.tealDim,border:`0.5px solid ${T.teal}`,
                      borderRadius:4,color:T.teal,cursor:"pointer",fontWeight:600}}>
                    🔍 Get Cost Guidance from AI (Concall Check) →
                  </button>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          TAB 3 — REVERSE DCF (interactive)
         ════════════════════════════════════════════════════════════ */}
      {tab==="dcf"&&(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <div style={{background:T.bg2,border:`0.5px solid ${T.border}`,borderRadius:6,padding:"10px 12px"}}>
            <SectionTitle color={T.purple}>REVERSE DCF — MENTOR FRAMEWORK</SectionTitle>
            <div style={{fontSize:9,color:T.t3,marginBottom:10}}>
              Question: What PAT growth rate is the market pricing in at current MCap?
              If historical CAGR exceeds implied growth → margin of safety. If not → overvalued.
            </div>

            {/* Interactive controls */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:10}}>
              <div style={{background:T.bg3,borderRadius:4,padding:"6px 8px"}}>
                <div style={{fontSize:8,color:T.t3}}>Discount Rate (%)</div>
                <input type="number" value={dcfDR} onChange={e=>setDcfDR(+e.target.value||25)}
                  style={{width:"100%",fontFamily:"monospace",fontSize:13,padding:"2px 4px",marginTop:2,
                    background:T.bg2,border:`0.5px solid ${T.border}`,borderRadius:3,color:T.amber}}/>
                <div style={{fontSize:8,color:T.t3,marginTop:1}}>Mentor uses 25%</div>
              </div>
              <div style={{background:T.bg3,borderRadius:4,padding:"6px 8px"}}>
                <div style={{fontSize:8,color:T.t3}}>Terminal Growth (%)</div>
                <input type="number" value={dcfTG} onChange={e=>setDcfTG(+e.target.value||6)}
                  style={{width:"100%",fontFamily:"monospace",fontSize:13,padding:"2px 4px",marginTop:2,
                    background:T.bg2,border:`0.5px solid ${T.border}`,borderRadius:3,color:T.amber}}/>
                <div style={{fontSize:8,color:T.t3,marginTop:1}}>GDP-level default</div>
              </div>
              <div style={{background:T.bg3,borderRadius:4,padding:"6px 8px"}}>
                <div style={{fontSize:8,color:T.t3}}>Terminal PE Multiple</div>
                <input type="number" value={termMult} onChange={e=>setTermMult(+e.target.value||25)}
                  style={{width:"100%",fontFamily:"monospace",fontSize:13,padding:"2px 4px",marginTop:2,
                    background:T.bg2,border:`0.5px solid ${T.border}`,borderRadius:3,color:T.amber}}/>
                <div style={{fontSize:8,color:T.t3,marginTop:1}}>Median sector PE</div>
              </div>
              <div style={{background:T.bg3,borderRadius:4,padding:"6px 8px"}}>
                <div style={{fontSize:8,color:T.t3}}>TTM PAT (₹ Cr) — Override</div>
                <input type="number" placeholder={`${pl.pat[last]}`} value={userPAT}
                  onChange={e=>setUserPAT(e.target.value)}
                  style={{width:"100%",fontFamily:"monospace",fontSize:13,padding:"2px 4px",marginTop:2,
                    background:T.bg2,border:`0.5px solid ${userPAT?T.amber:T.border}`,borderRadius:3,color:T.amber}}/>
                <div style={{fontSize:8,color:T.t3,marginTop:1}}>{ttmSource}</div>
              </div>
              <div style={{background:T.bg3,borderRadius:4,padding:"6px 8px"}}>
                <div style={{fontSize:8,color:T.t3}}>Current MCap (₹ Cr)</div>
                <div style={{fontFamily:"monospace",fontSize:13,color:T.amber,marginTop:4}}>₹{n0(data.mktCap)}</div>
                <div style={{fontSize:8,color:T.t3,marginTop:1}}>from Excel</div>
              </div>
              <div style={{background:T.bg3,borderRadius:4,padding:"6px 8px"}}>
                <div style={{fontSize:8,color:T.t3}}>Period</div>
                <div style={{display:"flex",gap:4,marginTop:4}}>
                  {[3,5].map(y=>(
                    <button key={y} onClick={()=>setDcfYears(y)}
                      style={{fontFamily:"monospace",fontSize:11,padding:"3px 12px",borderRadius:3,cursor:"pointer",
                        background:dcfYears===y?T.purple:T.bg2,border:`0.5px solid ${dcfYears===y?T.purple:T.border}`,
                        color:dcfYears===y?T.t0:T.t2}}>{y}Y</button>
                  ))}
                </div>
              </div>
            </div>

            {/* Results */}
            {[{yrs:5,impl:impl5,actual:f.pat5Cagr},{yrs:3,impl:impl3,actual:f.pat3Cagr}].map(({yrs,impl,actual})=>{
              const pass=impl&&actual&&parseFloat(actual)>parseFloat(impl);
              return (
                <div key={yrs} style={{background:pass?T.greenDim+"44":T.redDim+"44",
                  border:`0.5px solid ${pass?T.green:T.red}`,
                  borderRadius:6,padding:"10px 12px",marginBottom:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                    <span style={{fontFamily:"monospace",fontSize:11,color:T.t1,fontWeight:600}}>{yrs}-Year Iteration</span>
                    <span style={{fontFamily:"monospace",fontSize:12,fontWeight:600,color:pass?T.green:T.red}}>
                      {pass?"✓ PASS — Actual > Implied":"✗ FAIL — Actual < Implied"}
                    </span>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                    {[
                      ["Implied Growth",impl?`${impl}%`:"—",T.amber],
                      [`Actual ${yrs}Y PAT CAGR`,actual?`${actual}%`:"—",pass?T.green:T.red],
                      ["Verdict",pass?"Has margin of safety":"Priced to perfection",pass?T.green:T.red],
                    ].map(([l,v,c])=>(
                      <div key={l} style={{background:T.bg2,borderRadius:4,padding:"6px 8px"}}>
                        <div style={{fontSize:8,color:T.t3}}>{l}</div>
                        <div style={{fontFamily:"monospace",fontSize:11,color:c,fontWeight:500}}>{v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            <div style={{background:T.bg2,border:`0.5px solid ${T.border}`,borderRadius:6,padding:"10px 12px"}}>
              <SectionTitle>PAT TREND & CAGR COMPOSITE</SectionTitle>
              <TrendTable years={years} rows={[
                ["PAT (₹Cr)", pl.pat, T.green],
                ["PAT YoY %", pl.pat.map((p,i)=>i>0&&pl.pat[i-1]?((p-pl.pat[i-1])/pl.pat[i-1]*100):null),null,v=>`${v.toFixed(1)}%`],
              ]}/>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginTop:8}}>
                {[["10Y CAGR",`${f.patCagr}%`,T.blue],["5Y CAGR",`${f.pat5Cagr}%`,T.green],
                  ["3Y CAGR",`${f.pat3Cagr}%`,T.amber],["Implied",`${impl5||"—"}%`,T.purple]
                ].map(([l,v,c])=>(
                  <div key={l} style={{background:T.bg3,borderRadius:4,padding:"6px 8px",textAlign:"center"}}>
                    <div style={{fontSize:8,color:T.t3}}>{l}</div>
                    <div style={{fontFamily:"monospace",fontSize:14,fontWeight:600,color:c}}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          TAB 4 — 3-SCENARIO PROJECTION (Bear / Base / Bull)
         ════════════════════════════════════════════════════════════ */}
      {tab==="scenario"&&(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <div style={{background:T.bg2,border:`0.5px solid ${T.border}`,borderRadius:6,padding:"10px 12px"}}>
            <SectionTitle color={T.amber}>3-SCENARIO P&L PROJECTION — MENTOR FRAMEWORK</SectionTitle>
            <div style={{fontSize:9,color:T.t3,marginBottom:10}}>
              Use management guidance for OPM / cost assumptions. Apply FY25 ratios for interest & depreciation.
              Tax floor = max(actual, 25%). From mentor: start with sales, apply OPM, add other income = EBITDA → subtract D&A → EBIT → subtract interest → PBT → apply tax → PAT.
            </div>

            {/* Projection year control */}
            <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:12}}>
              <span style={{fontSize:9,color:T.t2}}>Projection horizon:</span>
              {[1,2,3].map(y=>(
                <button key={y} onClick={()=>setSc(p=>({...p,years:y}))}
                  style={{fontFamily:"monospace",fontSize:9,padding:"3px 10px",borderRadius:3,cursor:"pointer",
                    background:sc.years===y?T.amber:T.bg3,border:`0.5px solid ${sc.years===y?T.amber:T.border}`,
                    color:sc.years===y?T.bg0:T.t2}}>FY{(parseInt(years[last]||"2025")+y).toString().slice(-2)}</button>
              ))}
              <span style={{fontSize:9,color:T.t3,marginLeft:"auto"}}>Current base year: {years[last]} | TTM PAT: ₹{n0(ttmPAT)} Cr</span>
            </div>

            {/* Assumption inputs */}
            <div style={{overflowX:"auto",marginBottom:12}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:10}}>
                <thead>
                  <tr style={{borderBottom:`0.5px solid ${T.border}`}}>
                    {["Assumption","Base Year (Actual)","Bear","Base","Bull"].map(h=>(
                      <th key={h} style={{padding:"5px 8px",textAlign:h==="Assumption"?"left":"right",
                        color:h==="Bear"?T.red:h==="Base"?T.amber:h==="Bull"?T.green:T.t3,
                        fontFamily:"monospace",fontSize:9,fontWeight:500}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    {label:"Sales (₹ Cr)", keys:["bearSales","baseSales","bullSales"],
                     actual:n0(pl.sales[last]), type:"number"},
                    {label:"OPM %", keys:["bearOPM","baseOPM","bullOPM"],
                     actual:pct(f.opm[last]), type:"number"},
                    {label:"Employee % of Sales", keys:["bearEmpPct","baseEmpPct","bullEmpPct"],
                     actual:pct(f.commonSize[last]?.employee), type:"number"},
                    {label:"OMC % of Sales", keys:["bearOMCPct","baseOMCPct","bullOMCPct"],
                     actual:pct(f.commonSize[last]?.otherMfr), type:"number"},
                    {label:"Other Income (₹ Cr)", keys:["otherIncome","otherIncome","otherIncome"],
                     actual:n0(pl.otherIncome[last]), type:"single"},
                    {label:"Interest/Sales %", keys:["intRatio","intRatio","intRatio"],
                     actual:pct(f.commonSize[last]?.interest), type:"single"},
                    {label:"Depn/Sales %", keys:["depRatio","depRatio","depRatio"],
                     actual:pct(f.commonSize[last]?.depreciation), type:"single"},
                    {label:"Tax Rate %", keys:["taxRate","taxRate","taxRate"],
                     actual:pct(avg(f.taxRate.slice(-3).filter(v=>v!=null))), type:"single"},
                  ].map(row=>(
                    <tr key={row.label} style={{borderBottom:`0.5px solid ${T.border}`}}>
                      <td style={{padding:"5px 8px",color:T.t2,fontSize:10}}>{row.label}</td>
                      <td style={{padding:"5px 8px",textAlign:"right",color:T.t3,fontFamily:"monospace",fontSize:10}}>{row.actual}</td>
                      {row.type==="single"
                        ? <td colSpan={3} style={{padding:"5px 8px",textAlign:"right"}}>
                            <input type="number" value={sc[row.keys[0]]}
                              onChange={e=>setSc(p=>({...p,[row.keys[0]]:+e.target.value}))}
                              style={{width:80,fontFamily:"monospace",fontSize:10,padding:"2px 4px",
                                background:T.bg3,border:`0.5px solid ${T.border}`,borderRadius:3,color:T.amber,textAlign:"right"}}/>
                          </td>
                        : [0,1,2].map(ci=>(
                          <td key={ci} style={{padding:"5px 8px",textAlign:"right"}}>
                            <input type="number" value={sc[row.keys[ci]]}
                              onChange={e=>setSc(p=>({...p,[row.keys[ci]]:+e.target.value}))}
                              style={{width:75,fontFamily:"monospace",fontSize:10,padding:"2px 4px",
                                background:ci===0?T.redDim:ci===1?T.amberDim:T.greenDim,
                                border:`0.5px solid ${ci===0?T.red:ci===1?T.amber:T.green}`,
                                borderRadius:3,color:ci===0?T.red:ci===1?T.amber:T.green,textAlign:"right"}}/>
                          </td>
                        ))
                      }
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Computed projections */}
            <div style={{background:T.bg3,borderRadius:5,padding:"10px 12px"}}>
              <div style={{fontFamily:"monospace",fontSize:9,fontWeight:600,color:T.amber,marginBottom:10,letterSpacing:"0.5px"}}>
                COMPUTED PROJECTIONS (₹ Cr)
              </div>
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontFamily:"monospace",fontSize:11}}>
                  <thead>
                    <tr style={{borderBottom:`0.5px solid ${T.border}`}}>
                      {["P&L Line","FY"+years[last]+" Actual","Bear","Base","Bull"].map(h=>(
                        <th key={h} style={{padding:"5px 8px",textAlign:h.includes("Actual")||h==="P&L Line"?"left":"right",
                          color:h==="Bear"?T.red:h==="Base"?T.amber:h==="Bull"?T.green:T.t3,
                          fontWeight:500,fontSize:9}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ["Sales",    pl.sales[last],    sc.bearSales,  sc.baseSales,  sc.bullSales,  T.blue],
                      ["OPM %",   f.opm[last],        sc.bearOPM,    sc.baseOPM,    sc.bullOPM,    T.purple, true],
                      ["Op Profit",f.ebitda[last]-pl.otherIncome[last], sBear.op, sBase.op, sBull.op, T.amber],
                      ["Other Income",pl.otherIncome[last], sc.otherIncome, sc.otherIncome, sc.otherIncome, T.t2],
                      ["EBITDA",  f.ebitda[last],     sBear.ebitda,  sBase.ebitda,  sBull.ebitda,  T.amber],
                      ["Depreciation",pl.depreciation[last], sBear.dep, sBase.dep, sBull.dep, T.t3],
                      ["Interest",pl.interest[last],  sBear.inte,    sBase.inte,    sBull.inte,    T.t3],
                      ["PBT",     pl.pbt[last],       sBear.pbt,     sBase.pbt,     sBull.pbt,     T.blue],
                      ["Tax",     pl.tax[last],       sBear.tax,     sBase.tax,     sBull.tax,     T.red],
                      ["PAT",     pl.pat[last],       sBear.pat,     sBase.pat,     sBull.pat,     T.green, false, true],
                    ].map(([lbl,act,...vals])=>{
                      const [bv,basv,bulv,col,isPct,isBold] = vals;
                      return (
                        <tr key={lbl} style={{borderBottom:`0.5px solid ${T.border}`,
                          fontWeight:isBold?600:400}}>
                          <td style={{padding:"5px 8px",color:T.t2}}>{lbl}</td>
                          <td style={{padding:"5px 8px",color:T.t3}}>{isPct?pct(act):n0(act)}</td>
                          <td style={{padding:"5px 8px",textAlign:"right",color:T.red}}>{isPct?pct(bv):n0(bv)}</td>
                          <td style={{padding:"5px 8px",textAlign:"right",color:T.amber}}>{isPct?pct(basv):n0(basv)}</td>
                          <td style={{padding:"5px 8px",textAlign:"right",color:T.green}}>{isPct?pct(bulv):n0(bulv)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* CAGR row */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginTop:12}}>
                {[
                  {sc:"Bear",pat:sBear.pat,color:T.red},
                  {sc:"Base",pat:sBase.pat,color:T.amber},
                  {sc:"Bull",pat:sBull.pat,color:T.green},
                ].map(({sc:scn,pat,color})=>{
                  const gr = cagrSc(pat);
                  return (
                    <div key={scn} style={{background:T.bg2,borderRadius:5,padding:"8px 10px",
                      border:`0.5px solid ${color}22`}}>
                      <div style={{fontSize:10,color,fontWeight:600,marginBottom:4}}>{scn} case</div>
                      <div style={{fontFamily:"monospace",fontSize:15,fontWeight:700,color}}>₹{n0(pat)} Cr</div>
                      <div style={{fontSize:9,color:T.t3,marginTop:2}}>PAT FY{(parseInt(years[last]||"2025")+sc.years).toString().slice(-2)}</div>
                      <div style={{fontSize:11,color,marginTop:4,fontWeight:500}}>
                        {gr}% CAGR
                      </div>
                      <div style={{fontSize:8,color:T.t3}}>from TTM ₹{n0(ttmPAT)} Cr</div>
                    </div>
                  );
                })}
              </div>

              {/* Cross-check with Implied Growth */}
              <div style={{background:T.bg2,borderRadius:4,padding:"8px 10px",marginTop:10,fontSize:10,color:T.t2,lineHeight:1.9}}>
                <span style={{color:T.amber,fontWeight:600}}>Implied growth check: </span>
                Reverse DCF says market needs {impl5||"—"}% CAGR.
                Bear gives {cagrSc(sBear.pat)||"—"}%, Base {cagrSc(sBase.pat)||"—"}%, Bull {cagrSc(sBull.pat)||"—"}%.
                {impl5&&(
                  parseFloat(cagrSc(sBase.pat)||0)>parseFloat(impl5)
                    ? <span style={{color:T.green}}> Base case exceeds implied → margin of safety.</span>
                    : parseFloat(cagrSc(sBull.pat)||0)>parseFloat(impl5)
                      ? <span style={{color:T.amber}}> Only Bull case meets implied → stock priced to perfection.</span>
                      : <span style={{color:T.red}}> No scenario meets implied growth → expensive.</span>
                )}
              </div>
            </div>
          </div>

          {/* ── VALUATION TRIANGULATION — embedded in Projection tab ── */}
          <div style={{background:T.bg2,border:`0.5px solid ${T.border}`,borderRadius:6,padding:"10px 12px"}}>
            <SectionTitle color={T.teal}>STEP 8 — VALUATION TRIANGULATION (3 METHODS × 3 SCENARIOS)</SectionTitle>
            <div style={{fontSize:9,color:T.t3,marginBottom:10,lineHeight:1.8}}>
              All multiples derived from this company's own actuals — not universal constants.
              Avg of 3 methods = triangulated price target. If all three converge = high conviction.
              {sharesOutCr>0&&<span> Shares outstanding: <b style={{color:T.amber}}>{n1(sharesOutCr)} Cr</b></span>}
            </div>

            {/* Derivation box — show how each multiple was computed */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6,marginBottom:10}}>
              {[vtSales, vtFCF, vtDiv].map((vt,i)=>(
                <div key={i} style={{background:T.bg3,borderRadius:4,padding:"6px 8px",border:`0.5px solid ${T.border}`}}>
                  <div style={{fontSize:8,fontWeight:600,color:T.teal,marginBottom:3,fontFamily:"monospace"}}>{vt.method}</div>
                  <div style={{fontSize:8,color:T.t2,lineHeight:1.7}}>{vt.derivation}</div>
                  {i===1&&valFcfMultipleOverride===("")&&latestFCF&&latestFCF<0&&(
                    <div style={{fontSize:8,color:T.red,marginTop:2}}>⚠ Latest FCF negative — override below</div>
                  )}
                </div>
              ))}
            </div>

            {/* FCF multiple override only (others are fully derived) */}
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10,
              background:T.bg3,borderRadius:4,padding:"6px 10px"}}>
              <div style={{fontSize:9,color:T.t2}}>FCF multiple override (blank = use derived {derivedFcfMult}x):</div>
              <input type="number" step="0.5" value={valFcfMultipleOverride}
                onChange={e=>setValFcfMultipleOverride(e.target.value)}
                placeholder={`${derivedFcfMult}x derived`}
                style={{width:120,fontFamily:"monospace",fontSize:11,padding:"3px 6px",
                  background:T.bg2,border:`0.5px solid ${valFcfMultipleOverride?T.amber:T.border}`,
                  borderRadius:3,color:T.amber}}/>
              <div style={{fontSize:9,color:T.t3}}>Current FCF yield: {data.mktCap&&latestFCF?(latestFCF/data.mktCap*100).toFixed(2):"—"}%</div>
            </div>

            {/* Main valuation table */}
            <div style={{overflowX:"auto",marginBottom:10}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontFamily:"monospace",fontSize:10}}>
                <thead>
                  <tr style={{borderBottom:`0.5px solid ${T.border}`,background:T.bg3}}>
                    {["Method","Multiple","Bear MCap (Cr)","Bear ₹","Base MCap (Cr)","Base ₹","Bull MCap (Cr)","Bull ₹"].map(h=>(
                      <th key={h} style={{padding:"5px 8px",textAlign:"left",color:T.t3,fontWeight:400,fontSize:9,whiteSpace:"nowrap"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[vtSales,vtFCF,vtDiv].map((vt,i)=>(
                    <tr key={i} style={{borderBottom:`0.5px solid ${T.border}`}}>
                      <td style={{padding:"5px 8px",color:T.t1,whiteSpace:"nowrap"}}>{vt.method}</td>
                      <td style={{padding:"5px 8px",color:T.teal,whiteSpace:"nowrap"}}>{vt.multiple}</td>
                      <td style={{padding:"5px 8px",color:T.red}}>{n0(vt.bear)}</td>
                      <td style={{padding:"5px 8px",color:T.red,fontWeight:600}}>₹{n0(toPrice(vt.bear))}</td>
                      <td style={{padding:"5px 8px",color:T.amber}}>{n0(vt.base)}</td>
                      <td style={{padding:"5px 8px",color:T.amber,fontWeight:600}}>₹{n0(toPrice(vt.base))}</td>
                      <td style={{padding:"5px 8px",color:T.green}}>{n0(vt.bull)}</td>
                      <td style={{padding:"5px 8px",color:T.green,fontWeight:600}}>₹{n0(toPrice(vt.bull))}</td>
                    </tr>
                  ))}
                  {/* Average row with formula shown */}
                  {["bear","base","bull"].map((sc2,ci)=>{
                    const avg3mcap = avgMcap(sc2);
                    const avg3px   = toPrice(avg3mcap);
                    const color    = ci===0?T.red:ci===1?T.amber:T.green;
                    const p1 = toPrice(vtSales[sc2]), p2 = toPrice(vtFCF[sc2]), p3 = toPrice(vtDiv[sc2]);
                    return null; // rendered separately below
                  })}
                  <tr style={{background:T.bg3}}>
                    <td style={{padding:"5px 8px",color:T.teal,fontWeight:600}} colSpan={2}>
                      Average (Sales + FCF + Div) ÷ 3
                    </td>
                    <td style={{padding:"5px 8px",color:T.red}}>{n0(avgMcap("bear"))}</td>
                    <td style={{padding:"5px 8px",color:T.red,fontWeight:700,fontSize:12}}>₹{n0(toPrice(avgMcap("bear")))}</td>
                    <td style={{padding:"5px 8px",color:T.amber}}>{n0(avgMcap("base"))}</td>
                    <td style={{padding:"5px 8px",color:T.amber,fontWeight:700,fontSize:12}}>₹{n0(toPrice(avgMcap("base")))}</td>
                    <td style={{padding:"5px 8px",color:T.green}}>{n0(avgMcap("bull"))}</td>
                    <td style={{padding:"5px 8px",color:T.green,fontWeight:700,fontSize:12}}>₹{n0(toPrice(avgMcap("bull")))}</td>
                  </tr>
                  <tr style={{background:T.bg2}}>
                    <td style={{padding:"5px 8px",color:T.t3}} colSpan={2}>Current MCap / CMP</td>
                    <td style={{padding:"5px 8px",color:T.t2}} colSpan={2}>{n0(data.mktCap)} Cr</td>
                    <td style={{padding:"5px 8px",color:T.amber,fontWeight:600}} colSpan={2}>₹{n2(data.price)}</td>
                    <td style={{padding:"5px 8px",color:T.t3,fontSize:9}} colSpan={2}>
                      {data.mktCap&&avgMcap("base")
                        ? `${((avgMcap("base")/data.mktCap-1)*100).toFixed(1)}% vs base avg`
                        : "—"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Avg target derivation — shown explicitly */}
            <div style={{background:T.bg3,borderRadius:4,padding:"8px 10px",marginBottom:8,fontSize:9,color:T.t2,lineHeight:2,fontFamily:"monospace"}}>
              <div style={{color:T.teal,fontWeight:600,marginBottom:4}}>AVG TARGET PRICE DERIVATION (Base case example)</div>
              <div>Sales method: ₹{n0(toPrice(vtSales.base))} &nbsp;+&nbsp; FCF method: ₹{n0(toPrice(vtFCF.base))} &nbsp;+&nbsp; Div method: ₹{n0(toPrice(vtDiv.base))}</div>
              <div style={{color:T.amber,fontWeight:600}}>
                = (₹{n0(toPrice(vtSales.base))} + ₹{n0(toPrice(vtFCF.base))} + ₹{n0(toPrice(vtDiv.base))}) ÷ 3 = ₹{n0(toPrice(avgMcap("base")))} (Base avg target)
              </div>
            </div>

            {/* Convergence and CMP crosscheck */}
            {(()=>{
              const basePrices = [toPrice(vtSales.base), toPrice(vtFCF.base), toPrice(vtDiv.base)].filter(p=>p>0);
              const spread = basePrices.length>1 ? Math.max(...basePrices)-Math.min(...basePrices) : 0;
              const avg3   = toPrice(avgMcap("base"));
              const cmp    = data.price||0;
              return (
                <div style={{display:"flex",flexDirection:"column",gap:4}}>
                  <Flag label="Method spread (base)" ok={spread<avg3*0.2}
                    value={`₹${n0(Math.min(...basePrices))}–₹${n0(Math.max(...basePrices))} (spread ₹${n0(spread)})`}
                    detail={spread<avg3*0.2?"Methods converge — high conviction on target":"Wide spread — use FCF (most conservative) as anchor"}/>
                  <Flag label="CMP vs Base avg target" ok={cmp<avg3}
                    value={`CMP ₹${n2(cmp)} vs ₹${n0(avg3)} (${((avg3/cmp-1)*100).toFixed(1)}% ${avg3>cmp?"upside":"downside"})`}
                    detail={cmp<avg3?"Stock below base avg — potential upside":cmp<toPrice(avgMcap("bull"))?"Priced between base and bull — limited upside":"Above bull case avg — expensive"}/>
                  <Flag label="CMP vs FCF method (most conservative)" ok={cmp<toPrice(vtFCF.base)}
                    value={`CMP ₹${n2(cmp)} vs FCF target ₹${n0(toPrice(vtFCF.base))} (${((toPrice(vtFCF.base)/cmp-1)*100).toFixed(1)}% ${toPrice(vtFCF.base)>cmp?"upside":"downside"})`}
                    detail="If FCF-based price ≈ CMP → stock priced to perfection at base case (Coal India pattern). Upside only in bull."/>
                  <Flag label="Dividend yield floor support (Bear)" ok={cmp>toPrice(vtDiv.bear)*0.9}
                    value={`Bear div-based price ₹${n0(toPrice(vtDiv.bear))} (yield = ${derivedDivYield}% held constant)`}
                    detail="Bear dividend MCap = floor support level from yield perspective"/>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          TAB 5 — CAPEX FORENSICS
         ════════════════════════════════════════════════════════════ */}
      {tab==="capex"&&(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <div style={{background:T.bg2,border:`0.5px solid ${T.border}`,borderRadius:6,padding:"10px 12px"}}>
            <SectionTitle color={T.purple}>CAPEX & CAPITAL EFFICIENCY</SectionTitle>
            <TrendTable years={years} rows={[
              ["Net Block (₹Cr)",   bs.netBlock,    T.blue],
              ["CWIP (₹Cr)",        bs.cwip,        T.t2],
              ["CAPEX (₹Cr)",       f.capex,        T.amber],
              ["Depreciation (₹Cr)",pl.depreciation,T.t2],
              ["NFAT (x)",          f.nfat,         T.green, v=>`${v.toFixed(2)}x`],
              ["Asset Turnover (x)",f.ato,          T.blue,  v=>`${v.toFixed(2)}x`],
              ["ROCE %",            f.roce,         null,    v=>`${v.toFixed(1)}%`],
            ]}/>

            <div style={{background:T.bg3,borderRadius:5,padding:"8px 10px",marginBottom:8}}>
              <div style={{fontSize:10,color:T.amber,fontWeight:600,marginBottom:6}}>CAPEX JUSTIFICATION — MENTOR RULES</div>
              <Flag label="Total 10Y CAPEX" ok={null} value={`₹${n0(f.capexCum)} Cr`}/>
              <Flag label="Total 10Y Depreciation" ok={null} value={`₹${n0(f.depCum)} Cr`}/>
              <Flag label="Net undepreciated CAPEX" ok={null} value={`₹${n0(f.undepCapex)} Cr`} detail="Should generate 2x in Sales"/>
              <Flag label="2× undep CAPEX rule" ok={pl.sales[last]>=f.impliedRevFromCapex}
                value={<span>
                  <span style={{color:T.blue}}>Target ₹{n0(Math.round(f.impliedRevFromCapex))} Cr</span>
                  <span style={{color:T.t3}}> vs Actual </span>
                  <span style={{color:pl.sales[last]>=f.impliedRevFromCapex?T.green:T.red}}>₹{n0(pl.sales[last])} Cr</span>
                </span>}/>
              <Flag label="Sales CAGR vs Cap Employed CAGR" ok={parseFloat(f.salesCagr)>=parseFloat(f.ceCagr)-2}
                value={`Sales ${f.salesCagr}% vs CE ${f.ceCagr}%`}
                detail="Should be similar — CE growing faster than Sales = capital inefficiency"/>
              <Flag label="Reinvestment rate (10Y avg)" ok={null}
                value={`${(f.capexCum/f.cfoCum*100).toFixed(0)}% of CFO`}
                detail={`FCF/CFO: ${f.fcfReinvRate?.toFixed(1)}% — ${f.fcfReinvRate<20?"Capital hungry":"Generates free cash"}`}/>
              <Flag label="Growth CAPEX (CAPEX − Depreciation)"
                ok={null}
                value={`₹${n0(f.capex[last]-pl.depreciation[last])} Cr (latest year)`}
                detail="Mentor: growth CAPEX = incremental capacity addition, not just maintenance"/>
              <Flag label="CAPEX funded by" ok={f.cfoCum>=f.capexCum}
                value={f.cfoCum>=f.capexCum?"Operations (CFO) — self-funding":f.de[last]<=0.5?"Equity — D/E low":"Debt — watch leverage"}
                detail={`10Y CFO ₹${n0(f.cfoCum)} Cr vs CAPEX ₹${n0(f.capexCum)} Cr`}/>
            </div>

            {/* 6 forensic checks */}
            {(()=>{
              const totalCapex=f.capexCum,totalPAT=pl.pat.reduce((a,b)=>(a||0)+(b||0),0);
              const salesNow=pl.sales[last],sales10ago=pl.sales[0];
              const incrSales=salesNow-sales10ago;
              const salesEff=f.undepCapex>0?salesNow/f.undepCapex:null;
              const incrEff=totalCapex>0?incrSales/totalCapex:null;
              const cumPatCapex=totalCapex>0?totalPAT/totalCapex:null;
              const ebitdaGrowth=f.ebitda[Math.max(last-5,0)]&&f.ebitda[last]?((f.ebitda[last]/f.ebitda[Math.max(last-5,0)]-1)*100).toFixed(1):null;
              const capex5y=f.capex.slice(-5).reduce((a,b)=>(a||0)+(b||0),0);
              const capex5ago=f.capex.slice(0,5).reduce((a,b)=>(a||0)+(b||0),0);
              const capexGrowth=capex5ago&&capex5y?((capex5y/capex5ago-1)*100).toFixed(1):null;
              const cfoCapexR=totalCapex>0?f.cfoCum/totalCapex:null;
              const debtRising=f.de[last]>f.de[Math.max(last-3,0)];
              const phantom=cfoCapexR&&cfoCapexR<0.8&&debtRising;
              const passed=[salesEff>=2,incrEff>=1,cumPatCapex>=1,ebitdaGrowth&&capexGrowth&&parseFloat(ebitdaGrowth)>=parseFloat(capexGrowth),!phantom,f.de[last]<=1].filter(Boolean).length;
              return (
                <div style={{background:T.bg2,border:`0.5px solid ${T.border}`,borderRadius:6,padding:"10px 12px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                    <SectionTitle color={T.purple}>6 CAPEX FORENSIC CHECKS</SectionTitle>
                    <span style={{fontFamily:"monospace",fontSize:11,fontWeight:600,
                      color:passed>=5?T.green:passed>=3?T.amber:T.red}}>{passed}/6 passed</span>
                  </div>
                  {[
                    {label:"Sales/Undep CAPEX",val:salesEff,fmt:v=>`${v.toFixed(2)}x`,ok:salesEff>=2,bench:">2x Good · <1.5x Inefficient"},
                    {label:"Incr Sales/Total CAPEX",val:incrEff,fmt:v=>`${v.toFixed(2)}x`,ok:incrEff>=1,bench:">1x Good · Negative = Disaster"},
                    {label:"Cum PAT/Total CAPEX",val:cumPatCapex,fmt:v=>`${v.toFixed(2)}x`,ok:cumPatCapex>=1,bench:">1.5x Strong · <0.5x Value destruction"},
                    {label:"EBITDA growth vs CAPEX growth",val:null,fmt:()=>`EBITDA ${ebitdaGrowth}% vs CAPEX ${capexGrowth}%`,ok:ebitdaGrowth&&capexGrowth&&parseFloat(ebitdaGrowth)>=parseFloat(capexGrowth),bench:"EBITDA growth >= CAPEX growth = Good"},
                    {label:"Phantom CAPEX check",val:null,fmt:()=>phantom?"PHANTOM DETECTED":"Self-funded",ok:!phantom,bench:"CFO should fund CAPEX. Debt rising + low CFO/CAPEX = borrowing to invest"},
                    {label:"D/E ratio",val:f.de[last],fmt:v=>`${v.toFixed(2)}x`,ok:f.de[last]<=1,bench:"<0.5x Excellent · <1x Good · >2x High"},
                  ].map((ck,i)=>{
                    const c=ck.ok===true?T.green:ck.ok===false?T.red:T.amber;
                    return (
                      <div key={i} style={{background:T.bg3,borderRadius:4,padding:"7px 9px",marginBottom:5}}>
                        <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
                          <span style={{fontSize:10,color:T.t1,fontWeight:500}}>{ck.label}</span>
                          <span style={{fontFamily:"monospace",fontSize:11,fontWeight:700,color:c}}>
                            {ck.ok===true?"✓":ck.ok===false?"✗":"~"} {ck.val!=null?ck.fmt(ck.val):ck.fmt(null)}
                          </span>
                        </div>
                        <div style={{fontSize:8,color:T.t3,fontStyle:"italic"}}>{ck.bench}</div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          TAB 6 — WORKING CAPITAL FORENSICS
         ════════════════════════════════════════════════════════════ */}
      {tab==="wc"&&(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <div style={{background:T.bg2,border:`0.5px solid ${T.border}`,borderRadius:6,padding:"10px 12px"}}>
            <SectionTitle color={T.blue}>WORKING CAPITAL FORENSICS — MENTOR FRAMEWORK</SectionTitle>
            <TrendTable label="Operating Cycle (Days)" years={years} rows={[
              ["Debtor Days",     f.debtorDays,    null, v=>`${v.toFixed(0)}d`],
              ["Inventory Days",  f.inventoryDays, null, v=>`${v.toFixed(0)}d`],
              ["Op Cycle (D+I)",  f.opCycle,       null, v=>`${v.toFixed(0)}d`],
              ["Payable Days",    f.payableDays,   null, v=>`${v.toFixed(0)}d`],
              ["Cash Conv. Cycle",f.ccc,           null, v=>`${v.toFixed(0)}d`],
            ]}/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
              {[last-1,last].filter(i=>i>=1).map(i=>{
                const ddChg=f.debtorDays[i]-f.debtorDays[i-1];
                const idChg=f.inventoryDays[i]-f.inventoryDays[i-1];
                const pdChg=f.payableDays[i]-f.payableDays[i-1];
                const ocChg=f.opCycle[i]-f.opCycle[i-1];
                const salesChg=pl.sales[i]&&pl.sales[i-1]?(pl.sales[i]-pl.sales[i-1])/pl.sales[i-1]*100:null;
                return (
                  <div key={i} style={{background:T.bg3,borderRadius:5,padding:"8px 10px"}}>
                    <div style={{fontSize:10,color:T.amber,fontWeight:600,marginBottom:6}}>{years[i-1]} → {years[i]}</div>
                    <Flag label="Debtor Days" ok={ddChg<=0}
                      value={<span><span style={{color:T.t3}}>{f.debtorDays[i-1]?.toFixed(0)}d→</span><span style={{color:ddChg<=0?T.green:T.red}}>{f.debtorDays[i]?.toFixed(0)}d ({ddChg>=0?"+":""}{ddChg.toFixed(0)}d)</span></span>}/>
                    <Flag label="Inventory Days" ok={idChg<=0}
                      value={<span><span style={{color:T.t3}}>{f.inventoryDays[i-1]?.toFixed(0)}d→</span><span style={{color:idChg<=0?T.green:T.red}}>{f.inventoryDays[i]?.toFixed(0)}d ({idChg>=0?"+":""}{idChg.toFixed(0)}d)</span></span>}/>
                    <Flag label="Op Cycle" ok={ocChg<=0}
                      value={<span><span style={{color:T.t3}}>{f.opCycle[i-1]?.toFixed(0)}d→</span><span style={{color:ocChg<=0?T.green:T.red,fontWeight:600}}>{f.opCycle[i]?.toFixed(0)}d ({ocChg>=0?"+":""}{ocChg.toFixed(0)}d)</span></span>}/>
                    <Flag label="Payable Days" ok={pdChg>=0}
                      value={<span><span style={{color:T.t3}}>{f.payableDays[i-1]?.toFixed(0)}d→</span><span style={{color:pdChg>=0?T.green:T.red}}>{f.payableDays[i]?.toFixed(0)}d</span></span>}/>
                    <Flag label="Sales" ok={salesChg>0}
                      value={<span style={{color:salesChg>0?T.green:T.red,fontWeight:600}}>{salesChg>=0?"+":""}{salesChg?.toFixed(1)}%</span>}/>
                  </div>
                );
              })}
            </div>
            <TrendTable label="Balance Sheet WC Items" years={years} rows={[
              ["Receivables (₹Cr)",bs.receivables,T.amber],
              ["Inventory (₹Cr)",  bs.inventory,  T.amber],
              ["Cash (₹Cr)",       bs.cash,       T.green],
              ["Other Assets",     bs.otherAssets,null],
              ["Other Liabilities",bs.otherLiab,  null],
            ]}/>
            {(()=>{
              const ocNow=f.opCycle[last],ocPrev=f.opCycle[last-1];
              const sNow=pl.sales[last],sPrev=pl.sales[last-1];
              const moneyBlocked=ocNow&&ocPrev&&sNow?((ocNow-ocPrev)/365*sNow).toFixed(0):null;
              const wcEff=ocNow>ocPrev&&sNow<sPrev?"FORCED (not efficiency)":ocNow<ocPrev&&sNow>sPrev?"GENUINE EFFICIENCY":ocNow>ocPrev&&sNow>sPrev?"GROWTH-DRIVEN — monitor":"EFFICIENCY GAIN";
              return (
                <div style={{background:T.bg3,borderRadius:4,padding:"8px 10px",marginTop:8}}>
                  <div style={{fontSize:9,color:T.amber,fontWeight:600,marginBottom:6}}>QUANTIFIED WC ASSESSMENT</div>
                  <Flag label="Op Cycle direction" ok={ocNow<=ocPrev} value={`${ocNow>ocPrev?"STRETCHING ↑":"IMPROVING ↓"} (${ocPrev?.toFixed(0)}d → ${ocNow?.toFixed(0)}d)`}/>
                  <Flag label="WC verdict" ok={wcEff.includes("GENUINE")||wcEff.includes("EFFICIENCY")} value={wcEff}/>
                  {moneyBlocked&&(
                    <div style={{background:T.bg2,borderRadius:4,padding:"7px 9px",marginTop:6}}>
                      <div style={{fontFamily:"monospace",fontSize:10,color:parseFloat(moneyBlocked)>0?T.red:T.green,fontWeight:600}}>
                        {parseFloat(moneyBlocked)>0?"📦":"✓"} ₹{Math.abs(moneyBlocked)} Cr {parseFloat(moneyBlocked)>0?"additional cash blocked in WC":"cash released from WC"}
                      </div>
                      <div style={{fontSize:9,color:T.t3,marginTop:3}}>
                        {(ocNow-ocPrev).toFixed(0)}d cycle change × ₹{(sNow/365).toFixed(1)} Cr/day = ₹{Math.abs(moneyBlocked)} Cr
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          TAB 7 — CFO FORENSICS
         ════════════════════════════════════════════════════════════ */}
      {tab==="cfo"&&(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <div style={{background:T.bg2,border:`0.5px solid ${T.border}`,borderRadius:6,padding:"10px 12px"}}>
            <SectionTitle color={T.green}>CFO FORENSICS — PAT → CASH TRANSLATION</SectionTitle>
            <TrendTable years={years} rows={[
              ["PAT (₹Cr)",     pl.pat,      T.green],
              ["CFO (₹Cr)",     cf.cfo,      T.blue],
              ["CFO/PAT %",     f.cfoPat,    null, v=>`${v.toFixed(0)}%`],
              ["CFO/EBITDA %",  f.cfoEbitda, null, v=>`${v.toFixed(0)}%`],
              ["FCF (₹Cr)",     f.fcf,       null],
              ["FCF/CFO %",     f.fcf.map((fc,i)=>cf.cfo[i]?fc/cf.cfo[i]*100:null), null, v=>`${v.toFixed(0)}%`],
            ]}/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:8}}>
              {[last-1,last].filter(i=>i>=1).map(i=>{
                const quality=f.cfoPat[i];
                const qCol=quality>=80?T.green:quality>=50?T.amber:T.red;
                return (
                  <div key={i} style={{background:T.bg3,borderRadius:5,padding:"8px 10px"}}>
                    <div style={{fontSize:10,color:T.amber,fontWeight:600,marginBottom:6}}>{years[i]} CFO Quality</div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4,marginBottom:6}}>
                      {[["PAT",`₹${n0(pl.pat[i])} Cr`,pl.pat[i]>pl.pat[i-1]?T.green:T.red],
                        ["CFO",`₹${n0(cf.cfo[i])} Cr`,cf.cfo[i]>0?T.green:T.red],
                        ["CFO/PAT",`${quality?.toFixed(0)}%`,qCol],
                        ["FCF",`₹${n0(f.fcf[i])} Cr`,f.fcf[i]>0?T.green:T.red],
                      ].map(([l,v,c])=>(
                        <div key={l} style={{background:T.bg2,borderRadius:3,padding:"4px 6px"}}>
                          <div style={{fontSize:8,color:T.t3}}>{l}</div>
                          <div style={{fontFamily:"monospace",fontSize:11,fontWeight:500,color:c}}>{v}</div>
                        </div>
                      ))}
                    </div>
                    <Flag label="CFO/PAT >= 80%" ok={quality>=80} value={`${quality?.toFixed(0)}%`}
                      detail={quality>=100?"Non-cash > WC drag — excellent":quality>=80?"Good cash translation":quality>=50?"WC drag visible":"Leakage — investigate"}/>
                  </div>
                );
              })}
            </div>
            <TrendTable label="Cash Flow Summary" years={years} rows={[
              ["CFO (₹Cr)",        cf.cfo,   T.green],
              ["CFI (₹Cr)",        cf.cfi,   T.red],
              ["CFF (₹Cr)",        cf.cff,   T.blue],
              ["True CAPEX (₹Cr)", f.capex,  T.amber],
              ["FCF=CFO-CAPEX",    f.fcf,    null],
            ]}/>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginTop:8}}>
              {[["10Y CFO",`₹${n0(f.cfoCum)} Cr`,T.green],["10Y CAPEX",`₹${n0(f.capexCum)} Cr`,T.amber],
                ["10Y FCF",`₹${n0(f.fcfCum)} Cr`,f.fcfCum>0?T.green:T.red],
                ["FCF/CFO",`${f.fcfReinvRate?.toFixed(1)}%`,f.fcfReinvRate>50?T.green:T.amber],
                ["FCF Yield",data.mktCap&&f.fcf[last]?`${(f.fcf[last]/data.mktCap*100).toFixed(2)}%`:"—",T.blue],
                ["10Y Depn",`₹${n0(f.depCum)} Cr`,T.t2],
              ].map(([l,v,c])=>(
                <div key={l} style={{background:T.bg3,borderRadius:4,padding:"6px 8px"}}>
                  <div style={{fontSize:8,color:T.t3}}>{l}</div>
                  <div style={{fontFamily:"monospace",fontSize:12,fontWeight:500,color:c}}>{v}</div>
                </div>
              ))}
            </div>

            {/* ── FCF RECONCILIATION — why Screener vs War Room differ ── */}
            {(()=>{
              const i = last;
              const nb_chg   = bs.netBlock[i]!=null&&bs.netBlock[i-1]!=null ? bs.netBlock[i]-bs.netBlock[i-1] : null;
              const cwip_chg = bs.cwip[i]!=null&&bs.cwip[i-1]!=null ? bs.cwip[i]-bs.cwip[i-1] : null;
              const depn_i   = pl.depreciation[i];
              const capex_nb = nb_chg!=null&&cwip_chg!=null&&depn_i!=null ? nb_chg+cwip_chg+depn_i : null;
              const fcf_nb   = cf.cfo[i]!=null&&capex_nb!=null ? cf.cfo[i]-capex_nb : null;
              const fcf_cfi  = cf.cfo[i]!=null&&cf.cfi[i]!=null ? cf.cfo[i]-Math.abs(cf.cfi[i]) : null;
              const fcf_scr  = cf.cfo[i]!=null&&cf.cfi[i]!=null ? cf.cfo[i]+cf.cfi[i] : null; // same as CFI method
              return (
                <div style={{background:T.bg3,borderRadius:5,padding:"10px 12px",marginTop:8,border:`0.5px solid ${T.amber}`}}>
                  <div style={{fontFamily:"monospace",fontSize:9,fontWeight:600,color:T.amber,marginBottom:6}}>
                    FCF RECONCILIATION — WHY SCREENER ≠ WAR ROOM ({years[last]})
                  </div>
                  <div style={{overflowX:"auto"}}>
                    <table style={{width:"100%",borderCollapse:"collapse",fontFamily:"monospace",fontSize:10}}>
                      <thead>
                        <tr style={{borderBottom:`0.5px solid ${T.border}`}}>
                          {["Method","Formula","CAPEX used","FCF Result","Who uses it","Accuracy"].map(h=>(
                            <th key={h} style={{padding:"4px 8px",textAlign:"left",color:T.t3,fontWeight:400,fontSize:9}}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr style={{borderBottom:`0.5px solid ${T.border}`,background:T.greenDim+"33"}}>
                          <td style={{padding:"5px 8px",color:T.green,fontWeight:600}}>NB Method ★</td>
                          <td style={{padding:"5px 8px",color:T.t2,fontSize:9}}>CFO − (ΔNB + ΔCWIP + Depn)</td>
                          <td style={{padding:"5px 8px",color:T.amber}}>
                            {nb_chg!=null?`ΔNB ₹${n0(nb_chg)} + ΔCWIP ₹${n0(cwip_chg)} + Dep ₹${n0(depn_i)} = ₹${n0(capex_nb)}`:"—"}
                          </td>
                          <td style={{padding:"5px 8px",color:T.green,fontWeight:700}}>
                            ₹{fcf_nb!=null?n0(fcf_nb):"—"} Cr
                          </td>
                          <td style={{padding:"5px 8px",color:T.t2,fontSize:9}}>War Room (CFO tab)</td>
                          <td style={{padding:"5px 8px"}}>
                            <span style={{fontSize:8,padding:"1px 5px",borderRadius:2,background:T.greenDim,color:T.green}}>Most accurate</span>
                          </td>
                        </tr>
                        <tr style={{borderBottom:`0.5px solid ${T.border}`}}>
                          <td style={{padding:"5px 8px",color:T.blue,fontWeight:600}}>CFI Method</td>
                          <td style={{padding:"5px 8px",color:T.t2,fontSize:9}}>CFO − |CFI|</td>
                          <td style={{padding:"5px 8px",color:T.amber}}>
                            {cf.cfi[i]!=null?`|CFI| = ₹${n0(Math.abs(cf.cfi[i]))} Cr`:"—"}
                          </td>
                          <td style={{padding:"5px 8px",color:T.blue,fontWeight:700}}>
                            ₹{fcf_cfi!=null?n0(fcf_cfi):"—"} Cr
                          </td>
                          <td style={{padding:"5px 8px",color:T.t2,fontSize:9}}>Some analysts</td>
                          <td style={{padding:"5px 8px"}}>
                            <span style={{fontSize:8,padding:"1px 5px",borderRadius:2,background:T.amberDim,color:T.amber}}>Includes investments</span>
                          </td>
                        </tr>
                        <tr style={{borderBottom:`0.5px solid ${T.border}`}}>
                          <td style={{padding:"5px 8px",color:T.purple,fontWeight:600}}>Screener</td>
                          <td style={{padding:"5px 8px",color:T.t2,fontSize:9}}>CFO + CFI (annual)</td>
                          <td style={{padding:"5px 8px",color:T.amber}}>
                            {cf.cfi[i]!=null?`CFI = ₹${n0(cf.cfi[i])} Cr (signed)`:"—"}
                          </td>
                          <td style={{padding:"5px 8px",color:T.purple,fontWeight:700}}>
                            ₹{fcf_scr!=null?n0(fcf_scr):"—"} Cr
                          </td>
                          <td style={{padding:"5px 8px",color:T.t2,fontSize:9}}>Screener.in (annual)</td>
                          <td style={{padding:"5px 8px"}}>
                            <span style={{fontSize:8,padding:"1px 5px",borderRadius:2,background:T.amberDim,color:T.amber}}>CFI has noise</span>
                          </td>
                        </tr>
                        <tr>
                          <td style={{padding:"5px 8px",color:T.red,fontWeight:600}}>Screener TTM</td>
                          <td style={{padding:"5px 8px",color:T.t2,fontSize:9}}>Sum last 4 qtrs CFO+CFI</td>
                          <td style={{padding:"5px 8px",color:T.t2,fontSize:9}}>Quarterly CFI highly lumpy</td>
                          <td style={{padding:"5px 8px",color:T.red,fontWeight:700}}>Varies widely</td>
                          <td style={{padding:"5px 8px",color:T.t2,fontSize:9}}>Screener TTM widget</td>
                          <td style={{padding:"5px 8px"}}>
                            <span style={{fontSize:8,padding:"1px 5px",borderRadius:2,background:T.redDim,color:T.red}}>Most distorted</span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div style={{marginTop:8,fontSize:9,color:T.t2,lineHeight:1.9}}>
                    <span style={{color:T.amber,fontWeight:600}}>Why CFI method overstates/understates CAPEX: </span>
                    CFI includes asset sale proceeds (reduces apparent capex), investments bought/sold, and interest received.
                    The NB method isolates only true fixed asset additions: Gross additions to Net Block + CWIP + Depreciation charged = capital deployed in physical assets.
                    <br/>
                    <span style={{color:T.amber,fontWeight:600}}>Why Screener TTM differs most: </span>
                    Quarterly CFI is lumpy — a large land purchase or asset sale in one quarter skews the 4-quarter sum dramatically.
                    Always use <span style={{color:T.green,fontWeight:600}}>annual NB-method FCF from this War Room</span> as the anchor.
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          TAB 9 — FIBONACCI ENTRY LEVELS
         ════════════════════════════════════════════════════════════ */}
      {tab==="fibonacci"&&(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <div style={{background:T.bg2,border:`0.5px solid ${T.border}`,borderRadius:6,padding:"10px 12px"}}>
            <SectionTitle color="#ec4899">FIBONACCI RETRACEMENT — WEEKLY CHART ENTRY ZONES</SectionTitle>
            <div style={{fontSize:9,color:T.t3,marginBottom:10}}>
              Mentor: Use weekly chart. Draw Fibonacci between recent swing high and swing low.
              61.8% (golden ratio) is the best entry. Cross-check with 65W EMA and DCF fair value.
              Set TradingView alerts at 50% and 61.8% levels.
            </div>

            {/* Input controls */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:12}}>
              <div style={{background:T.bg3,borderRadius:4,padding:"6px 8px"}}>
                <div style={{fontSize:8,color:T.t3}}>Recent Swing High (₹)</div>
                <input type="number" value={fibHigh} onChange={e=>setFibHigh(e.target.value)}
                  placeholder={n2(data.price*1.15)}
                  style={{width:"100%",fontFamily:"monospace",fontSize:14,padding:"3px 4px",marginTop:2,
                    background:T.bg2,border:`0.5px solid ${T.border}`,borderRadius:3,color:"#ec4899"}}/>
                <div style={{fontSize:8,color:T.t3,marginTop:1}}>52W high or recent ATH</div>
              </div>
              <div style={{background:T.bg3,borderRadius:4,padding:"6px 8px"}}>
                <div style={{fontSize:8,color:T.t3}}>Recent Swing Low (₹)</div>
                <input type="number" value={fibLow} onChange={e=>setFibLow(e.target.value)}
                  placeholder={n2(data.price*0.80)}
                  style={{width:"100%",fontFamily:"monospace",fontSize:14,padding:"3px 4px",marginTop:2,
                    background:T.bg2,border:`0.5px solid ${T.border}`,borderRadius:3,color:"#ec4899"}}/>
                <div style={{fontSize:8,color:T.t3,marginTop:1}}>52W low or recent correction low</div>
              </div>
              <div style={{background:T.bg3,borderRadius:4,padding:"6px 8px"}}>
                <div style={{fontSize:8,color:T.t3}}>Current CMP (₹)</div>
                <div style={{fontFamily:"monospace",fontSize:14,color:T.amber,marginTop:4}}>₹{n2(data.price)}</div>
                <div style={{fontSize:8,color:T.t3,marginTop:1}}>from Excel</div>
              </div>
            </div>

            {/* Fibonacci levels */}
            {fibValid ? (
              <div style={{background:T.bg3,borderRadius:5,padding:"10px 12px"}}>
                <div style={{fontSize:9,color:"#ec4899",fontWeight:600,marginBottom:10}}>
                  FIBONACCI LEVELS (High ₹{n2(fibH)} → Low ₹{n2(fibL)} — Range ₹{n2(fibRange.toFixed(0))})
                </div>
                {fibLevels.map((lvl,i)=>{
                  const barPct = (1-i/6)*100;
                  const isCurrent = data.price && Math.abs(data.price-lvl.price)<fibRange*0.03;
                  const isBestEntry = lvl.pct===61.8;
                  const isOptimal = lvl.pct===50||lvl.pct===61.8;
                  return (
                    <div key={i} style={{marginBottom:8,padding:"7px 9px",borderRadius:4,
                      background:isBestEntry?"#ec489920":isCurrent?T.amberDim+"44":T.bg2,
                      border:`0.5px solid ${isBestEntry?"#ec4899":isCurrent?T.amber:T.border}`}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                        <div>
                          <span style={{fontSize:10,fontWeight:isBestEntry?700:500,
                            color:isBestEntry?"#ec4899":isOptimal?T.amber:T.t1}}>{lvl.lbl}</span>
                          {isCurrent&&<span style={{fontSize:8,color:T.amber,marginLeft:8,fontFamily:"monospace"}}>← CMP ≈ HERE</span>}
                          {isBestEntry&&<span style={{fontSize:8,color:"#ec4899",marginLeft:8,fontFamily:"monospace"}}>★ BEST ENTRY</span>}
                        </div>
                        <span style={{fontFamily:"monospace",fontSize:13,fontWeight:600,
                          color:isBestEntry?"#ec4899":isOptimal?T.amber:T.t1}}>₹{n2(lvl.price.toFixed(0))}</span>
                      </div>
                      <div style={{height:4,background:T.bg1,borderRadius:2,overflow:"hidden",marginBottom:4}}>
                        <div style={{height:"100%",width:`${barPct}%`,
                          background:isBestEntry?"#ec4899":isOptimal?T.amber:T.t3,borderRadius:2}}/>
                      </div>
                      <div style={{display:"flex",justifyContent:"space-between"}}>
                        <span style={{fontSize:8,color:T.t3}}>{lvl.note}</span>
                        {data.price&&<span style={{fontSize:8,color:T.t3,fontFamily:"monospace"}}>
                          {((data.price/lvl.price-1)*100).toFixed(1)}% from CMP
                        </span>}
                      </div>
                    </div>
                  );
                })}

                {/* Cross-check with DCF */}
                <div style={{background:T.bg2,borderRadius:4,padding:"8px 10px",marginTop:8}}>
                  <div style={{fontSize:9,color:"#ec4899",fontWeight:600,marginBottom:6}}>MENTOR CROSS-CHECK</div>
                  {[
                    {lbl:"61.8% Fib level",price:fibH-0.618*fibRange},
                    {lbl:"DCF fair value (base avg)",price:data.mktCap&&sharesOutCr>0?toPrice(avgMcap("base")):null},
                    {lbl:"Current CMP",price:data.price},
                  ].filter(l=>l.price).map((l,i)=>(
                    <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",
                      borderBottom:`0.5px solid ${T.border}`}}>
                      <span style={{fontSize:10,color:T.t2}}>{l.lbl}</span>
                      <span style={{fontFamily:"monospace",fontSize:11,fontWeight:600,color:T.amber}}>₹{n0(l.price)}</span>
                    </div>
                  ))}
                  {(()=>{
                    const fib618 = fibH-0.618*fibRange;
                    const dcfBase = data.mktCap&&sharesOutCr>0?toPrice(avgMcap("base")):null;
                    const aligned = dcfBase&&Math.abs(fib618-dcfBase)<fib618*0.1;
                    return (
                      <div style={{marginTop:8,fontSize:10,color:aligned?T.green:T.amber,lineHeight:1.8}}>
                        {aligned
                          ?"✓ Fibonacci 61.8% and DCF fair value are converging — HIGH CONVICTION entry zone. Set TradingView alert at this level."
                          :"~ Fibonacci and DCF targets differ. Use whichever is more conservative as the entry trigger."}
                      </div>
                    );
                  })()}
                </div>
              </div>
            ) : (
              <div style={{textAlign:"center",padding:"30px",color:T.t3,fontFamily:"monospace",fontSize:10}}>
                Enter the recent Swing High and Swing Low to calculate Fibonacci levels.<br/>
                <span style={{fontSize:9,color:T.t3,marginTop:4,display:"block"}}>
                  Get these from TradingView weekly chart (set timeframe to 1W, identify last major high and low)
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          TAB 10 — TAX & BALANCE SHEET
         ════════════════════════════════════════════════════════════ */}
      {tab==="tax"&&(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <div style={{background:T.bg2,border:`0.5px solid ${T.border}`,borderRadius:6,padding:"10px 12px"}}>
            <SectionTitle color={T.red}>TAX FORENSICS</SectionTitle>
            <TrendTable years={years} rows={[
              ["PBT (₹Cr)", pl.pbt, T.amber],
              ["Tax (₹Cr)", pl.tax, T.red],
              ["Tax Rate %", pl.pbt.map((p,i)=>p&&p>0&&pl.tax[i]!=null?pl.tax[i]/p*100:null),null,v=>`${v.toFixed(1)}%`],
              ["PAT (₹Cr)", pl.pat, T.green],
            ]}/>
            {(()=>{
              const validRates=pl.pbt.map((p,i)=>p&&p>0&&pl.tax[i]!=null?pl.tax[i]/p*100:null);
              const last3rates=validRates.slice(-3).filter(v=>v!=null);
              const avgTax3=last3rates.length?last3rates.reduce((a,b)=>a+b,0)/last3rates.length:null;
              const highTax=avgTax3&&avgTax3>30;
              const taxTrend=validRates[last]&&validRates[last-1]?validRates[last]-validRates[last-1]:null;
              return (
                <div style={{marginTop:8,display:"flex",flexDirection:"column",gap:6}}>
                  <Flag label="Avg tax rate last 3Y vs industry 26%" ok={!highTax}
                    value={`${avgTax3?.toFixed(1)}%`}
                    detail={highTax?"Higher than industry — investigate cause":"Within normal range"}/>
                  <Flag label="Tax rate YoY trend" ok={taxTrend<=0}
                    value={taxTrend!=null?`${taxTrend>=0?"+":""}${taxTrend.toFixed(1)}% YoY`:"—"}/>
                  {highTax&&(
                    <div style={{background:T.redDim,border:`0.5px solid ${T.red}`,borderRadius:6,padding:"10px 12px"}}>
                      <div style={{fontSize:10,color:T.red,fontWeight:600,marginBottom:6}}>⚠ HIGH TAX — INVESTIGATE</div>
                      {[
                        {n:"1",l:"Foreign subsidiary taxed at higher rate",d:"Check Standalone vs Consolidated revenue. Overseas profits taxed at 35-40%."},
                        {n:"2",l:"Deferred tax liability reversal",d:"Old tax benefits reversing. Check Notes → Deferred Tax schedule in Annual Report."},
                        {n:"3",l:"Non-deductible expenses / penalties",d:"Certain expenses disallowed. Check effective tax reconciliation."},
                        {n:"4",l:"Loss-making subsidiary (no offset)",d:"Profitable parent paying full tax while subsidiary losses not offsetting."},
                      ].map(item=>(
                        <div key={item.n} style={{background:T.bg2,borderRadius:4,padding:"7px 9px",marginBottom:5}}>
                          <div style={{fontSize:10,color:T.amber,fontWeight:500,marginBottom:2}}>{item.n}. {item.l}</div>
                          <div style={{fontSize:9,color:T.t2,lineHeight:1.6}}>{item.d}</div>
                        </div>
                      ))}
                      <button onClick={()=>{setTab("ai");setAiQuery(`${data.company} — why is effective tax rate ${avgTax3?.toFixed(1)}% vs industry 26%? Check: 1) Standalone vs Consolidated revenue gap, 2) Deferred tax liability schedule, 3) Overseas subsidiaries and their profitability. Use all public sources.`);}}
                        style={{width:"100%",marginTop:6,fontFamily:"monospace",fontSize:9,padding:"7px",
                          background:T.blue,border:"none",borderRadius:4,color:T.t0,cursor:"pointer",fontWeight:600}}>
                        🔍 Investigate Tax with AI →
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
          <div style={{background:T.bg2,border:`0.5px solid ${T.border}`,borderRadius:6,padding:"10px 12px"}}>
            <SectionTitle>BALANCE SHEET FORENSICS</SectionTitle>
            <TrendTable years={years} rows={[
              ["Capital Employed",   f.capEmployed, T.blue, v=>`₹${Math.round(v).toLocaleString("en-IN")}`],
              ["Debt/Equity (x)",    f.de,          null,   v=>`${v.toFixed(2)}x`],
              ["Borrowings (₹Cr)",   bs.borrowings, T.red],
              ["Other Assets (₹Cr)", bs.otherAssets,T.amber],
              ["Other Liab (₹Cr)",   bs.otherLiab,  T.t2],
              ["Current Ratio",      f.cr,          T.blue, v=>`${v.toFixed(2)}x`],
            ]}/>
            {(()=>{
              const deNow=f.de[last],crNow=f.cr[last],crPrev=f.cr[last-1];
              const otherAssetNow=bs.otherAssets[last],otherAsset5ago=bs.otherAssets[Math.max(last-4,0)];
              const otherAssetCagr=otherAsset5ago&&otherAssetNow?((otherAssetNow/otherAsset5ago)**(1/4)-1)*100:null;
              const salesCagrR=pl.sales[last]&&pl.sales[last-4]?((pl.sales[last]/pl.sales[last-4])**(1/4)-1)*100:null;
              const otherAssetVsSales=otherAssetCagr&&salesCagrR?otherAssetCagr>salesCagrR+5:null;
              const equityNow=(bs.equity[last]||0)+(bs.reserves[last]||0);
              const equity5ago=(bs.equity[Math.max(last-4,0)]||0)+(bs.reserves[Math.max(last-4,0)]||0);
              const equityCagr=equity5ago&&equityNow?((equityNow/equity5ago)**(1/4)-1)*100:null;
              const isEquityDilution=equityCagr&&salesCagrR&&equityCagr>salesCagrR+5;
              return (
                <div style={{marginTop:8,display:"flex",flexDirection:"column",gap:6}}>
                  <Flag label="Debt/Equity" ok={deNow<=1} value={`${deNow?.toFixed(2)}x`}
                    detail={deNow<=0.5?"Near debt-free":deNow<=1?"Below 1x":deNow<=2?"Acceptable":"High leverage"}/>
                  <Flag label="Current Ratio" ok={crNow>=1.5} value={`${crNow?.toFixed(2)}x (prev ${crPrev?.toFixed(2)}x)`}/>
                  <Flag label="Other Assets CAGR vs Sales CAGR" ok={!otherAssetVsSales}
                    value={`Other Assets ${otherAssetCagr?.toFixed(1)}% vs Sales ${salesCagrR?.toFixed(1)}%`}
                    detail={otherAssetVsSales?"RED FLAG — Loans/Advances growing much faster than sales. Check related party loans, capital advances.":"Growing in line with sales — no anomaly"}/>
                  <Flag label="Equity dilution check" ok={!isEquityDilution}
                    value={`Equity ${equityCagr?.toFixed(1)}% vs Sales ${salesCagrR?.toFixed(1)}%`}
                    detail={isEquityDilution?"Equity growing faster — possible QIP/rights/ESOP dilution. Check corporate actions.":"No excessive dilution detected"}/>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          TAB 11 — AI RESEARCH
         ════════════════════════════════════════════════════════════ */}
      {tab==="ai"&&(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <div style={{background:"#0a1020",border:`1.5px solid ${T.blue}`,borderRadius:8,padding:"12px 14px"}}>
            <div style={{fontFamily:"monospace",fontSize:11,fontWeight:600,color:T.blue,marginBottom:4}}>🧠 OVERALL AI ASSESSMENT</div>
            <div style={{fontSize:9,color:T.t2,marginBottom:8}}>Claude reads ALL computed forensic values and gives a holistic investment verdict</div>
            <button onClick={()=>runAI(`You are analysing ${data.company} using the mentor forensic framework. Computed data provided above. Give COMPREHENSIVE ASSESSMENT:
1. DUPONT — which lever drives ROE? P&L game or balance sheet game?
2. COMMON SIZE — what are the 2 biggest cost heads and their 5Y trajectory?
3. REVERSE DCF VERDICT — is current valuation demanding too much growth?
4. SCENARIO ANALYSIS — what PAT range is realistic for FY27/FY28?
5. CAPEX EFFICIENCY — is capital deployed earning adequate returns?
6. WC HEALTH — money getting blocked or released?
7. CFO QUALITY — PAT converting to cash reliably?
8. VALUATION — fair value range using 3 methods?
9. KEY RISKS — 3 biggest risks in the numbers?
10. CONVICTION — scale of 1-10 with reasoning?
Be specific with numbers. Use web search for latest business context.`)}
              disabled={aiLoading}
              style={{width:"100%",padding:"9px",fontFamily:"monospace",fontSize:10,fontWeight:600,
                background:aiLoading?T.bg3:T.blue,border:"none",borderRadius:4,color:T.t0,cursor:"pointer"}}>
              {aiLoading?"Analysing...":"🔍 Run Full Assessment (reads all metrics)"}
            </button>
          </div>

          {/* Document upload */}
          <div style={{background:T.bg2,border:`0.5px solid ${T.border}`,borderRadius:6,padding:"10px 12px"}}>
            <SectionTitle color={T.purple}>ATTACH DOCUMENTS</SectionTitle>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
              {[["Annual Report","AR PDF"],["Concall Transcript","Q4/Q3 concall"],["Quarterly Results","Latest QR PDF"],["Analyst Report","Broker report"]].map(([l,hint])=>(
                <div key={l} style={{background:T.bg3,borderRadius:4,padding:"5px 8px",fontSize:8,color:T.t3,border:`0.5px solid ${T.border}`}}>
                  <b style={{color:T.t2}}>{l}</b><br/>{hint}
                </div>
              ))}
            </div>
            <div onClick={()=>docInputRef.current.click()}
              style={{border:`1.5px dashed ${T.border}`,borderRadius:6,padding:"14px",textAlign:"center",cursor:"pointer",background:T.bg3,marginBottom:8}}
              onDragOver={e=>e.preventDefault()}
              onDrop={e=>{e.preventDefault();handleDocUpload(e.dataTransfer.files);}}>
              <div style={{fontSize:16,marginBottom:3}}>📎</div>
              <div style={{fontSize:10,color:T.t1}}>Drop PDF / TXT here or click</div>
              <input ref={docInputRef} type="file" multiple accept=".pdf,.txt" style={{display:"none"}}
                onChange={e=>handleDocUpload(e.target.files)}/>
            </div>
            {attachedDocs.length>0&&(
              <div style={{display:"flex",flexDirection:"column",gap:4}}>
                {attachedDocs.map((doc,i)=>(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                    background:T.bg3,borderRadius:4,padding:"5px 8px"}}>
                    <span style={{fontSize:9,color:T.t1,fontFamily:"monospace"}}>📄 {doc.name} <span style={{color:T.t3}}>({(doc.size/1024).toFixed(0)}KB)</span></span>
                    <button onClick={()=>setAttachedDocs(d=>d.filter((_,j)=>j!==i))}
                      style={{fontSize:9,color:T.red,background:"none",border:"none",cursor:"pointer"}}>✕</button>
                  </div>
                ))}
                <button onClick={()=>runAI(`Analyse attached documents for ${data.company}: 1) Revenue/margin guidance, 2) CAPEX plan & funding, 3) WC commentary, 4) Employee/OMC cost trajectory, 5) Forward guidance. Cross-reference with computed forensic data above.`)}
                  disabled={aiLoading}
                  style={{width:"100%",padding:"7px",fontFamily:"monospace",fontSize:9,fontWeight:600,
                    background:aiLoading?T.bg3:T.purple,border:"none",borderRadius:4,color:T.t0,cursor:"pointer",marginTop:4}}>
                  🔍 Analyse Attached Documents
                </button>
              </div>
            )}
          </div>

          {/* ── CONCALL GUIDANCE — 8 focused queries ── */}
          <div style={{background:T.bg2,border:`0.5px solid ${T.teal}`,borderRadius:6,padding:"10px 12px"}}>
            <SectionTitle color={T.teal}>CONCALL GUIDANCE CHECKER — 8 KEY QUERIES</SectionTitle>
            <div style={{fontSize:9,color:T.t2,marginBottom:8,lineHeight:1.8}}>
              Attach concall transcript PDF above, then click any query. Results feed directly into
              your Projection tab assumptions (OPM%, Emp%, OMC%, Sales growth).
              <span style={{color:T.teal}}> Mode: </span>
              {[["web","Web"],["docs","Docs Only"],["both","Web+Docs"]].map(([k,l])=>(
                <button key={k} onClick={()=>setAiMode(k)}
                  style={{fontFamily:"monospace",fontSize:8,padding:"2px 8px",borderRadius:3,cursor:"pointer",marginLeft:4,
                    background:aiMode===k?T.teal:T.bg3,border:`0.5px solid ${aiMode===k?T.teal:T.border}`,
                    color:aiMode===k?T.bg0:T.t2}}>{l}</button>
              ))}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4,marginBottom:8}}>
              {[
                {
                  label:"OPM Guidance",
                  icon:"📊",
                  q:`${data.company} — from the latest concall/investor presentation, what is the specific management guidance on OPM (Operating Profit Margin) for FY26, FY27, FY28? Any percentage target or range mentioned? If no direct OPM guidance, what are the margin levers management has discussed? Present as a table: FY26E / FY27E / FY28E.`,
                  color:T.amber,
                },
                {
                  label:"Employee Cost %",
                  icon:"👥",
                  q:`${data.company} — management guidance on employee cost trajectory as % of sales for next 2-3 years. Key questions: Is workforce reduction planned? When is next wage revision? What is the expected headcount trend? Will employee cost % fall below current ${f.empPct[last]?.toFixed(1)||"—"}%? Use latest concall and annual report.`,
                  color:T.blue,
                },
                {
                  label:"OMC / Contract Cost",
                  icon:"⚙️",
                  q:`${data.company} — management commentary on Other Manufacturing Cost (OMC) / contract mining (MDO) cost as % of sales. Is this cost structural or cyclical? What % of production is now via MDO vs captive? Expected OMC % for FY26/FY27/FY28. Current OMC% is ${f.otherMfrPct[last]?.toFixed(1)||"—"}% of sales.`,
                  color:T.purple,
                },
                {
                  label:"CAPEX Plan",
                  icon:"🏗️",
                  q:`${data.company} — detailed CAPEX plan from latest concall: 1) Total planned CAPEX for FY26, FY27, FY28 in ₹ Cr, 2) Key projects and completion timeline, 3) Maintenance vs growth CAPEX split, 4) Funding mechanism (internal accruals / debt / equity?), 5) When will new CAPEX start contributing to revenue? Current avg CAPEX is ₹${n0(avg(f.capex.filter(Boolean).slice(-3)))} Cr/year.`,
                  color:T.amber,
                },
                {
                  label:"Revenue Guidance",
                  icon:"📈",
                  q:`${data.company} — management guidance on revenue/sales growth for FY26, FY27, FY28. Break down by: volume growth %, price/realisation per unit trend, product mix shift. Create a Bear/Base/Bull table with sales figures in ₹ Cr. Current Sales: ₹${n0(pl.sales[last])} Cr.`,
                  color:T.green,
                },
                {
                  label:"Working Capital",
                  icon:"🔄",
                  q:`${data.company} — concall commentary on working capital: 1) Reasons for inventory buildup (current ${f.inventoryDays[last]?.toFixed(0)||"—"} days), 2) Debtor quality and collection timeline (${f.debtorDays[last]?.toFixed(0)||"—"} days), 3) Any guidance on WC improvement for FY27/FY28, 4) Impact of railway evacuation infrastructure / first-mile connectivity on inventory normalisation?`,
                  color:T.blue,
                },
                {
                  label:"Dividend Policy",
                  icon:"💰",
                  q:`${data.company} — management commentary on dividend policy: 1) Stated payout ratio target (current: ${pl.dividend[last]&&pl.pat[last]?(pl.dividend[last]/pl.pat[last]*100).toFixed(0):"—"}%), 2) Any buyback plans?, 3) Special dividend history?, 4) Is dividend sustainable if PAT falls in bear case?, 5) What is the minimum dividend floor management has guided?`,
                  color:T.teal,
                },
                {
                  label:"3-Scenario Table",
                  icon:"🎯",
                  q:`${data.company} — based on all management guidance from latest concall and investor presentations, create a comprehensive 3-scenario (Bear/Base/Bull) projection table for FY27 and FY28 showing: Sales (₹Cr), OPM%, Employee cost%, OMC%, EBITDA (₹Cr), PAT (₹Cr), PAT CAGR from current TTM PAT ₹${n0(ttmPAT)} Cr. Show assumptions for each scenario. This should match the mentor forensic framework.`,
                  color:T.green,
                },
              ].map(({label,icon,q,color})=>(
                <button key={label}
                  onClick={()=>{ setAiQuery(q); }}
                  style={{display:"flex",alignItems:"center",gap:6,padding:"7px 10px",
                    background:T.bg3,border:`0.5px solid ${color}22`,borderRadius:4,
                    cursor:"pointer",textAlign:"left"}}>
                  <span style={{fontSize:14,flexShrink:0}}>{icon}</span>
                  <div>
                    <div style={{fontFamily:"monospace",fontSize:9,fontWeight:600,color}}>{label}</div>
                    <div style={{fontSize:8,color:T.t3,marginTop:1,lineHeight:1.4}}>{q.slice(0,60)}...</div>
                  </div>
                </button>
              ))}
            </div>
            <div style={{fontSize:8,color:T.t3,fontStyle:"italic",marginBottom:8}}>
              ↑ Click any card to pre-fill the query box below. Switch mode to "Docs Only" if transcript is attached.
            </div>
          </div>

          {/* ── WEB RESEARCH — general queries ── */}
          <div style={{background:T.bg2,border:`0.5px solid ${T.border}`,borderRadius:6,padding:"10px 12px"}}>
            <SectionTitle color={T.blue}>WEB RESEARCH — SPECIFIC QUESTIONS</SectionTitle>
            <div style={{display:"flex",gap:4,marginBottom:8,alignItems:"center"}}>
              <span style={{fontSize:9,color:T.t2}}>Mode:</span>
              {[["web","Web"],["docs","Docs Only"],["both","Web+Docs"]].map(([k,l])=>(
                <button key={k} onClick={()=>setAiMode(k)}
                  style={{fontFamily:"monospace",fontSize:8,padding:"3px 10px",borderRadius:3,cursor:"pointer",
                    background:aiMode===k?T.blue:T.bg3,border:`0.5px solid ${aiMode===k?T.blue:T.border}`,
                    color:aiMode===k?T.t0:T.t2}}>{l}</button>
              ))}
            </div>
            <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:8}}>
              {[
                [`Segment analysis — revenue breakdown, growth %, ROCE by segment for ${data.company}`,"Segment"],
                [`Is ${data.company} cyclical or structural? Key business drivers and risks`,"Cyclical?"],
                [`Why is ${data.company} effective tax rate higher than 26% industry standard?`,"Tax Reason"],
                [`${data.company} shareholding pattern — promoter%, FII%, DII%, pledged shares %, change last 4 quarters`,"Shareholding"],
                [`${data.company} peer comparison — top 5 peers, MCap now vs 3Y ago, PE vs peers, market cap leadership`,"Peers"],
                [`${data.company} reverse DCF — at current PE ${data.mktCap&&pl.pat[last]?(data.mktCap/pl.pat[last]).toFixed(1):"—"}x, what PAT growth is priced in at 25% discount rate?`,"Rev DCF Check"],
              ].map(([q,label])=>(
                <button key={label} onClick={()=>setAiQuery(q)}
                  style={{fontFamily:"monospace",fontSize:8,padding:"3px 8px",borderRadius:3,cursor:"pointer",
                    background:T.bg3,border:`0.5px solid ${T.border}`,color:T.t2}}>{label}</button>
              ))}
            </div>
            <textarea value={aiQuery} onChange={e=>setAiQuery(e.target.value)} rows={4}
              style={{width:"100%",fontFamily:"monospace",fontSize:10,padding:"8px",
                background:T.bg3,border:`0.5px solid ${T.border}`,borderRadius:4,color:T.t1,
                resize:"vertical",boxSizing:"border-box"}}/>
            <div style={{display:"flex",gap:6,marginTop:6}}>
              <button onClick={()=>runAI()} disabled={aiLoading||!aiQuery}
                style={{flex:1,fontFamily:"monospace",fontSize:10,padding:"8px",
                  background:aiLoading?T.bg3:T.blue,border:"none",borderRadius:4,
                  color:aiLoading?T.t2:T.t0,cursor:"pointer",fontWeight:600}}>
                {aiLoading?"Processing...":"🔍 Run AI Research"}
              </button>
              <button onClick={async()=>{
                const q=`Give a concise investment snapshot of ${data.company}: 1) Business description (2 lines), 2) Competitive moat, 3) Growth drivers next 3 years, 4) Key risks, 5) Shareholding — promoter%, FII%, DII%, pledge concerns, 6) Peer comparison — MCap rank, PE vs peers.`;
                setAiQuery(q); await runAI(q); setAiSummary(aiResult);
              }} disabled={aiLoading}
                style={{fontFamily:"monospace",fontSize:9,padding:"8px 12px",whiteSpace:"nowrap",
                  background:T.greenDim,border:`0.5px solid ${T.green}`,
                  borderRadius:4,color:T.green,cursor:"pointer",fontWeight:600}}>
                📋 Save to Overview
              </button>
            </div>
          </div>

          {aiResult&&(
            <div style={{background:T.bg2,border:`0.5px solid ${T.border}`,borderRadius:6,padding:"10px 12px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                <SectionTitle>AI RESEARCH RESULT</SectionTitle>
                <button onClick={()=>setAiResult(null)} style={{fontSize:9,color:T.t3,background:"none",border:"none",cursor:"pointer"}}>✕ Clear</button>
              </div>
              <div style={{fontSize:11,color:T.t1,lineHeight:1.9,whiteSpace:"pre-wrap",maxHeight:500,overflowY:"auto"}}>
                {aiResult}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          TAB 12 — VERDICT
         ════════════════════════════════════════════════════════════ */}
      {tab==="verdict"&&(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>

          {/* Engine classification */}
          {(()=>{
            const reinv=f.capexCum&&f.cfoCum?f.capexCum/f.cfoCum:0;
            const fcfYield=data.mktCap&&f.fcf[last]?f.fcf[last]/data.mktCap*100:0;
            const roceGood=f.roce[last]>=15,deGood=f.de[last]<=1;
            let engineType,engineColor,engineDesc,engineAction;
            if (reinv<0.5&&fcfYield>2&&roceGood) {
              engineType="🏆 FCF GENERATOR";engineColor=T.green;
              engineDesc="Generates free cash after CAPEX. High ROCE. Can self-fund growth and return cash.";
              engineAction="Check dividend/buyback history. Reverse DCF: is growth priced in?";
            } else if (reinv>=0.7&&roceGood&&deGood) {
              engineType="⚙️ CAPITAL COMPOUNDER";engineColor=T.blue;
              engineDesc="Consumes capital but earns good returns. Funded by CFO. Classic infrastructure play.";
              engineAction="Verify CAPEX plan and funding. Check ROCE on incremental investment.";
            } else if (reinv>=0.7&&!roceGood) {
              engineType="⚠️ CAPITAL DESTROYER";engineColor=T.amber;
              engineDesc="High CAPEX but poor ROCE. Consuming shareholder money without adequate returns.";
              engineAction="Avoid unless ROCE improvement path is clear.";
            } else if (reinv<0.3&&fcfYield>3) {
              engineType="💰 CASH MACHINE";engineColor=T.teal;
              engineDesc="Low CAPEX, high FCF. Asset-light. Scalable without proportional capital.";
              engineAction="Check moat sustainability. Is low CAPEX structural or under-investment?";
            } else {
              engineType="📊 TRANSITIONING";engineColor=T.purple;
              engineDesc="Business in transition — CAPEX phase, margin compression, or segment mix shift.";
              engineAction="Use AI Research for CAPEX guidance, margin trajectory, and segment growth.";
            }
            return (
              <div style={{background:engineColor+"11",border:`1.5px solid ${engineColor}`,borderRadius:8,padding:"12px 14px"}}>
                <div style={{fontFamily:"monospace",fontSize:14,fontWeight:600,color:engineColor,marginBottom:6}}>{engineType}</div>
                <div style={{fontSize:10,color:T.t1,lineHeight:1.8,marginBottom:8}}>{engineDesc}</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,marginBottom:8}}>
                  {[["Reinvestment",`${(reinv*100).toFixed(0)}%`,reinv<0.6?T.green:T.amber],
                    ["FCF Yield",`${fcfYield.toFixed(2)}%`,fcfYield>2?T.green:T.amber],
                    ["ROCE",`${f.roce[last]?.toFixed(1)}%`,roceGood?T.green:T.red],
                    ["D/E",`${f.de[last]?.toFixed(2)}x`,deGood?T.green:T.amber],
                  ].map(([l,v,c])=>(
                    <div key={l} style={{background:T.bg2,borderRadius:4,padding:"5px 7px"}}>
                      <div style={{fontSize:8,color:T.t3}}>{l}</div>
                      <div style={{fontFamily:"monospace",fontSize:10,fontWeight:500,color:c}}>{v}</div>
                    </div>
                  ))}
                </div>
                <div style={{fontSize:9,color:engineColor,fontWeight:600}}>NEXT STEP: {engineAction}</div>
              </div>
            );
          })()}

          {/* Module scorecard */}
          <div style={{background:T.bg2,border:`0.5px solid ${T.border}`,borderRadius:6,padding:"10px 12px"}}>
            <SectionTitle>MODULE SCORECARD</SectionTitle>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6}}>
              {[
                {m:"Rev DCF",   ok:pat5CagrDisplay&&impl5?parseFloat(pat5CagrDisplay)>parseFloat(impl5):null,v:`${pat5CagrDisplay||"—"}% vs ${impl5||"—"}%`},
                {m:"DuPont",   ok:f.roe[last]>=15, v:`ROE ${f.roe[last]?.toFixed(1)}% | ROCE ${f.roce[last]?.toFixed(1)}%`},
                {m:"CommonSz", ok:f.opm[last]>=15, v:`OPM ${f.opm[last]?.toFixed(1)}%`},
                {m:"Scenario", ok:parseFloat(cagrSc(sBase.pat)||0)>parseFloat(impl5||0), v:`Base PAT CAGR ${cagrSc(sBase.pat)||"—"}%`},
                {m:"WC Cycle", ok:f.opCycle[last]<f.opCycle[last-1], v:`${f.opCycle[last]?.toFixed(0)}d vs ${f.opCycle[last-1]?.toFixed(0)}d`},
                {m:"CFO/PAT",  ok:f.cfoPat[last]>=80, v:`${f.cfoPat[last]?.toFixed(0)}%`},
                {m:"FCF",      ok:f.fcf[last]>0, v:`₹${n0(f.fcf[last])} Cr`},
                {m:"ROCE",     ok:f.roce[last]>=15, v:`${f.roce[last]?.toFixed(1)}%`},
                {m:"D/E",      ok:f.de[last]<=1, v:`${f.de[last]?.toFixed(2)}x`},
                {m:"CAPEX",    ok:pl.sales[last]>=f.impliedRevFromCapex, v:`₹${n0(pl.sales[last])} vs ₹${n0(Math.round(f.impliedRevFromCapex))} Cr`},
                {m:"Val. (Base avg)",ok:data.price&&toPrice(avgMcap("base"))>0?data.price<toPrice(avgMcap("base")):null,v:`CMP ₹${n2(data.price)} vs ₹${n0(toPrice(avgMcap("base")))}`},
                {m:"Tax Rate", ok:avg(f.taxRate.filter((_,i)=>pl.pbt[i]>0).slice(-3))<30, v:`${avg(f.taxRate.filter((_,i)=>pl.pbt[i]>0).slice(-3))?.toFixed(1)}%`},
              ].map(({m,ok,v})=>{
                const col=ok===true?T.green:ok===false?T.red:T.amber;
                return (
                  <div key={m} style={{background:T.bg3,borderRadius:4,padding:"6px 8px",border:`0.5px solid ${col}22`}}>
                    <div style={{fontSize:8,color:T.t3,marginBottom:2}}>{m}</div>
                    <div style={{fontFamily:"monospace",fontSize:10,fontWeight:600,color:col}}>
                      {ok===true?"✓":ok===false?"✗":"~"} {v}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Reverse DCF verdict */}
          <div style={{background:T.bg2,border:`0.5px solid ${T.border}`,borderRadius:6,padding:"10px 12px"}}>
            <SectionTitle>REVERSE DCF VERDICT</SectionTitle>
            <Flag label="5Y Implied vs Actual"
              ok={f.pat5Cagr&&impl5?parseFloat(f.pat5Cagr)>parseFloat(impl5):null}
              value={`Implied ${impl5}% vs Actual ${f.pat5Cagr}%`}
              detail={parseFloat(f.pat5Cagr)>parseFloat(impl5)?"Company historically grew faster than market demands — margin of safety":"Cannot meet implied growth at current price — overvalued"}/>
            <Flag label="3Y Implied vs Actual"
              ok={f.pat3Cagr&&impl3?parseFloat(f.pat3Cagr)>parseFloat(impl3):null}
              value={`Implied ${impl3}% vs Actual ${f.pat3Cagr}%`}/>
          </div>

          {aiSummary&&(
            <div style={{background:T.bg2,border:`0.5px solid ${T.green}`,borderRadius:6,padding:"10px 12px"}}>
              <SectionTitle color={T.green}>AI INVESTMENT SNAPSHOT</SectionTitle>
              <div style={{fontSize:11,color:T.t1,lineHeight:1.9,whiteSpace:"pre-wrap"}}>{aiSummary}</div>
            </div>
          )}
          {!aiSummary&&(
            <div style={{background:T.bg3,borderRadius:6,padding:"10px 12px",textAlign:"center"}}>
              <div style={{fontSize:10,color:T.t3,marginBottom:6}}>No AI summary yet — run AI Research to generate</div>
              <button onClick={()=>setTab("ai")}
                style={{fontFamily:"monospace",fontSize:9,padding:"6px 14px",background:T.blue,
                  border:"none",borderRadius:3,color:T.t0,cursor:"pointer"}}>
                Go to AI Research →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
