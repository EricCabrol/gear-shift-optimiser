import { useState, useMemo, useCallback } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from "recharts";

const GEAR_COLORS = ["#f59e0b","#10b981","#3b82f6","#a855f7","#ef4444","#f97316"];
const DEFAULT_TORQUE = [
  {rpm:1000,torque:80},{rpm:2000,torque:100},{rpm:3000,torque:115},
  {rpm:4000,torque:118},{rpm:5000,torque:115},{rpm:6000,torque:105},
  {rpm:7000,torque:90},{rpm:8000,torque:70},{rpm:8500,torque:55}
];
const DEFAULT_GEARS = [
  {ratio:3.136},{ratio:1.888},{ratio:1.330},{ratio:1.000},{ratio:0.814}
];
const DEFAULT_CONFIG = { finalDrive:4.1, tyreWidth:185, tyreProfile:60, rimDiameter:13, numGears:5 };

function lerp(x, x0, x1, y0, y1) { return y0 + (y1 - y0) * (x - x0) / (x1 - x0); }

function getTorqueAt(rpm, curve) {
  if (rpm <= curve[0].rpm) return curve[0].torque;
  if (rpm >= curve[curve.length-1].rpm) return curve[curve.length-1].torque;
  for (let i=0; i<curve.length-1; i++) {
    if (rpm >= curve[i].rpm && rpm <= curve[i+1].rpm)
      return lerp(rpm, curve[i].rpm, curve[i+1].rpm, curve[i].torque, curve[i+1].torque);
  }
  return 0;
}

function calcTyreCircumference(width, profile, rim) {
  const sidewall = (width * profile / 100) / 25.4; // mm to inches
  const diameter = rim + 2 * sidewall;
  return diameter * Math.PI; // inches
}

function rpmToSpeed(rpm, gearRatio, finalDrive, circumInches) {
  return rpm * 60 * circumInches / 63360 / (gearRatio * finalDrive);
}

function findIntersection(speeds1, torques1, speeds2, torques2) {
  // Both arrays sampled at same RPM points; we need to find where torque curves cross vs speed
  // We'll sample at fine speed resolution
  const allSpeeds = [...speeds1, ...speeds2].sort((a,b)=>a-b);
  const minS = Math.max(Math.min(...speeds1), Math.min(...speeds2));
  const maxS = Math.min(Math.max(...speeds1), Math.max(...speeds2));
  if (minS >= maxS) return null;

  // Interpolate torque at common speed points
  function torqueAtSpeed(speed, spArr, tArr) {
    if (speed < spArr[0] || speed > spArr[spArr.length-1]) return null;
    for (let i=0; i<spArr.length-1; i++) {
      if (speed >= spArr[i] && speed <= spArr[i+1])
        return lerp(speed, spArr[i], spArr[i+1], tArr[i], tArr[i+1]);
    }
    return null;
  }

  let prevDiff = null, prevSpeed = null;
  for (let s = minS; s <= maxS; s += 0.1) {
    const t1 = torqueAtSpeed(s, speeds1, torques1);
    const t2 = torqueAtSpeed(s, speeds2, torques2);
    if (t1 === null || t2 === null) continue;
    const diff = t1 - t2;
    if (prevDiff !== null && prevDiff * diff < 0) {
      // Sign change — interpolate crossing
      const crossSpeed = lerp(0, prevDiff, diff, prevSpeed, s);
      return crossSpeed;
    }
    prevDiff = diff; prevSpeed = s;
  }
  return null;
}

const TabBtn = ({active, onClick, children}) => (
  <button onClick={onClick} className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${active ? 'border-amber-400 text-amber-400 bg-gray-800' : 'border-transparent text-gray-400 hover:text-gray-200'}`}>{children}</button>
);

const Input = ({label, value, onChange, step=0.001, min}) => (
  <div className="flex flex-col gap-1">
    <label className="text-xs text-gray-400">{label}</label>
    <input type="number" value={value} step={step} min={min} onChange={e=>onChange(parseFloat(e.target.value)||0)}
      className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white w-full focus:border-amber-400 focus:outline-none"/>
  </div>
);

export default function App() {
  const [tab, setTab] = useState("inputs");
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [gears, setGears] = useState(DEFAULT_GEARS);
  const [torqueCurve, setTorqueCurve] = useState(DEFAULT_TORQUE);

  const setConf = (k,v) => setConfig(c=>({...c,[k]:v}));

  const updateGear = (i, v) => setGears(g => g.map((x,j)=> j===i ? {ratio:v} : x));
  const updateTorque = (i, k, v) => setTorqueCurve(t => t.map((x,j)=> j===i ? {...x,[k]:v} : x));
  const addTorqueRow = () => setTorqueCurve(t => [...t, {rpm: t[t.length-1].rpm+500, torque:60}]);
  const removeTorqueRow = i => setTorqueCurve(t => t.filter((_,j)=>j!==i));

  const numGears = Math.min(6, Math.max(2, config.numGears));

  const results = useMemo(() => {
    const circ = calcTyreCircumference(config.tyreWidth, config.tyreProfile, config.rimDiameter);
    const sorted = [...torqueCurve].sort((a,b)=>a.rpm-b.rpm);
    const rpmMin = sorted[0].rpm, rpmMax = sorted[sorted.length-1].rpm;
    const RPM_STEP = 50;
    const rpms = [];
    for (let r = rpmMin; r <= rpmMax; r += RPM_STEP) rpms.push(r);

    // Per gear: array of {speed, torqueAtWheel, rpm}
    const gearData = gears.slice(0, numGears).map(g => {
      const overallRatio = g.ratio * config.finalDrive;
      return rpms.map(rpm => ({
        rpm,
        speed: rpmToSpeed(rpm, g.ratio, config.finalDrive, circ),
        wheelTorque: getTorqueAt(rpm, sorted) * overallRatio
      }));
    });

    // Torque vs speed chart data
    const speedMin = 0;
    const speedMax = Math.max(...gearData.map(gd => gd[gd.length-1].speed));
    const SPEED_STEP = 0.5;
    const chartData = [];
    for (let s = speedMin; s <= speedMax + SPEED_STEP; s += SPEED_STEP) {
      const pt = { speed: parseFloat(s.toFixed(1)) };
      gearData.forEach((gd, gi) => {
        const sArr = gd.map(p=>p.speed), tArr = gd.map(p=>p.wheelTorque);
        if (s < sArr[0] || s > sArr[sArr.length-1]) { pt[`g${gi+1}`] = null; return; }
        for (let i=0; i<sArr.length-1; i++) {
          if (s >= sArr[i] && s <= sArr[i+1]) {
            pt[`g${gi+1}`] = parseFloat(lerp(s, sArr[i], sArr[i+1], tArr[i], tArr[i+1]).toFixed(1));
            return;
          }
        }
        pt[`g${gi+1}`] = null;
      });
      chartData.push(pt);
    }

    // RPM vs speed chart data
    const rpmChartData = [];
    for (let s = 0; s <= speedMax + SPEED_STEP; s += SPEED_STEP) {
      const pt = { speed: parseFloat(s.toFixed(1)) };
      gearData.forEach((gd, gi) => {
        const sArr = gd.map(p=>p.speed), rArr = gd.map(p=>p.rpm);
        if (s < sArr[0] || s > sArr[sArr.length-1]) { pt[`g${gi+1}`] = null; return; }
        for (let i=0; i<sArr.length-1; i++) {
          if (s >= sArr[i] && s <= sArr[i+1]) {
            pt[`g${gi+1}`] = parseFloat(lerp(s, sArr[i], sArr[i+1], rArr[i], rArr[i+1]).toFixed(0));
            return;
          }
        }
        pt[`g${gi+1}`] = null;
      });
      rpmChartData.push(pt);
    }

    // Find shift points
    const shiftPoints = [];
    for (let gi = 0; gi < numGears - 1; gi++) {
      const gd1 = gearData[gi], gd2 = gearData[gi+1];
      const s1 = gd1.map(p=>p.speed), t1 = gd1.map(p=>p.wheelTorque);
      const s2 = gd2.map(p=>p.speed), t2 = gd2.map(p=>p.wheelTorque);
      const crossSpeed = findIntersection(s1, t1, s2, t2);
      if (crossSpeed !== null) {
        // RPM in lower gear at crossSpeed
        let upRPM = null;
        for (let i=0; i<s1.length-1; i++) {
          if (crossSpeed >= s1[i] && crossSpeed <= s1[i+1]) {
            upRPM = lerp(crossSpeed, s1[i], s1[i+1], gd1[i].rpm, gd1[i+1].rpm);
            break;
          }
        }
        let downRPM = null;
        for (let i=0; i<s2.length-1; i++) {
          if (crossSpeed >= s2[i] && crossSpeed <= s2[i+1]) {
            downRPM = lerp(crossSpeed, s2[i], s2[i+1], gd2[i].rpm, gd2[i+1].rpm);
            break;
          }
        }
        shiftPoints.push({ fromGear: gi+1, toGear: gi+2, speed: crossSpeed, upRPM, downRPM });
      }
    }

    return { chartData, rpmChartData, shiftPoints, speedMax, rpmMax: rpmMax };
  }, [config, gears, torqueCurve, numGears]);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 font-sans">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-amber-400">🏁 Race Car Gear Shift Optimizer</h1>
          <p className="text-gray-400 text-sm mt-1">Calculate optimal RPM shift points based on your torque curve and gearing</p>
        </div>

        <div className="flex gap-1 mb-0 border-b border-gray-700">
          {["inputs","torque","results","charts"].map(t => (
            <TabBtn key={t} active={tab===t} onClick={()=>setTab(t)}>
              {t==="inputs"?"⚙️ Car Setup":t==="torque"?"📈 Torque Curve":t==="results"?"🏆 Shift Points":"📊 Charts"}
            </TabBtn>
          ))}
        </div>

        <div className="bg-gray-800 rounded-b-xl rounded-tr-xl p-5">

          {/* INPUTS TAB */}
          {tab==="inputs" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-sm font-semibold text-amber-400 uppercase tracking-wide mb-3">Drivetrain</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <Input label="Final Drive Ratio" value={config.finalDrive} onChange={v=>setConf("finalDrive",v)} step={0.01}/>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-400">Number of Gears</label>
                    <select value={config.numGears} onChange={e=>setConf("numGears",parseInt(e.target.value))}
                      className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white focus:border-amber-400 focus:outline-none">
                      {[2,3,4,5,6].map(n=><option key={n}>{n}</option>)}
                    </select>
                  </div>
                </div>
              </div>
              <div>
                <h2 className="text-sm font-semibold text-amber-400 uppercase tracking-wide mb-3">Gear Ratios</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {gears.slice(0,numGears).map((g,i) => (
                    <Input key={i} label={`Gear ${i+1} Ratio`} value={g.ratio} onChange={v=>updateGear(i,v)} step={0.001}/>
                  ))}
                </div>
              </div>
              <div>
                <h2 className="text-sm font-semibold text-amber-400 uppercase tracking-wide mb-3">Tyre Size</h2>
                <div className="grid grid-cols-3 gap-4">
                  <Input label="Width (mm)" value={config.tyreWidth} onChange={v=>setConf("tyreWidth",v)} step={5}/>
                  <Input label="Profile (%)" value={config.tyreProfile} onChange={v=>setConf("tyreProfile",v)} step={5}/>
                  <Input label='Rim (inches)"' value={config.rimDiameter} onChange={v=>setConf("rimDiameter",v)} step={1}/>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Tyre: {config.tyreWidth}/{config.tyreProfile} R{config.rimDiameter} &nbsp;|&nbsp;
                  Circumference: {calcTyreCircumference(config.tyreWidth, config.tyreProfile, config.rimDiameter).toFixed(1)} in
                </p>
              </div>
              <div className="bg-gray-750 border border-gray-700 rounded-lg p-3 text-xs text-gray-400">
                <strong className="text-gray-300">Default:</strong> Mazda MX5 — 5-speed, final drive 4.1, tyres 185/60 R13. Edit above for your car.
              </div>
            </div>
          )}

          {/* TORQUE TAB */}
          {tab==="torque" && (
            <div>
              <div className="flex justify-between items-center mb-3">
                <h2 className="text-sm font-semibold text-amber-400 uppercase tracking-wide">Engine Torque Curve</h2>
                <button onClick={addTorqueRow} className="text-xs bg-amber-500 hover:bg-amber-400 text-black px-3 py-1 rounded font-semibold">+ Add Point</button>
              </div>
              <div className="grid grid-cols-12 gap-2 text-xs text-gray-400 mb-1 px-1">
                <span className="col-span-5">RPM</span><span className="col-span-5">Torque (ft·lb)</span>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {torqueCurve.map((row,i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center">
                    <input type="number" value={row.rpm} step={100} onChange={e=>updateTorque(i,"rpm",parseFloat(e.target.value)||0)}
                      className="col-span-5 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white focus:border-amber-400 focus:outline-none"/>
                    <input type="number" value={row.torque} step={1} onChange={e=>updateTorque(i,"torque",parseFloat(e.target.value)||0)}
                      className="col-span-5 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white focus:border-amber-400 focus:outline-none"/>
                    <button onClick={()=>removeTorqueRow(i)} className="col-span-2 text-red-400 hover:text-red-300 text-lg font-bold leading-none">×</button>
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={[...torqueCurve].sort((a,b)=>a.rpm-b.rpm)} margin={{top:5,right:10,left:0,bottom:5}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151"/>
                    <XAxis dataKey="rpm" tick={{fill:"#9ca3af",fontSize:11}} label={{value:"RPM",position:"insideBottom",offset:-2,fill:"#9ca3af",fontSize:11}}/>
                    <YAxis tick={{fill:"#9ca3af",fontSize:11}} label={{value:"Torque",angle:-90,position:"insideLeft",fill:"#9ca3af",fontSize:11}}/>
                    <Tooltip contentStyle={{background:"#1f2937",border:"1px solid #374151",borderRadius:8}} labelStyle={{color:"#f59e0b"}}/>
                    <Line type="monotone" dataKey="torque" stroke="#f59e0b" strokeWidth={2} dot={{r:3,fill:"#f59e0b"}} name="Torque (ft·lb)"/>
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* RESULTS TAB */}
          {tab==="results" && (
            <div>
              <h2 className="text-sm font-semibold text-amber-400 uppercase tracking-wide mb-4">Optimal Shift Points</h2>
              {results.shiftPoints.length === 0 ? (
                <p className="text-gray-400 text-sm">No intersections found. Check your torque curve and gear ratios.</p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="border-b border-gray-700">
                          <th className="text-left py-2 px-3 text-gray-400 font-medium">Transition</th>
                          <th className="text-right py-2 px-3 text-gray-400 font-medium">Speed (mph)</th>
                          <th className="text-right py-2 px-3 text-green-400 font-medium">⬆ Upshift RPM</th>
                          <th className="text-right py-2 px-3 text-blue-400 font-medium">⬇ Downshift RPM</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.shiftPoints.map((sp,i) => (
                          <tr key={i} className="border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors">
                            <td className="py-3 px-3 font-semibold">
                              <span style={{color:GEAR_COLORS[sp.fromGear-1]}}>G{sp.fromGear}</span>
                              <span className="text-gray-500 mx-2">⟷</span>
                              <span style={{color:GEAR_COLORS[sp.toGear-1]}}>G{sp.toGear}</span>
                            </td>
                            <td className="py-3 px-3 text-right text-white">{sp.speed.toFixed(1)}</td>
                            <td className="py-3 px-3 text-right text-green-300 font-mono">{sp.upRPM ? Math.round(sp.upRPM).toLocaleString() : "—"}</td>
                            <td className="py-3 px-3 text-right text-blue-300 font-mono">{sp.downRPM ? Math.round(sp.downRPM).toLocaleString() : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="bg-green-900/20 border border-green-800/40 rounded-lg p-3">
                      <p className="text-xs font-semibold text-green-400 mb-2">⬆ UPSHIFT — change gear when RPM reaches:</p>
                      <div className="space-y-1">
                        {results.shiftPoints.map((sp,i) => (
                          <div key={i} className="flex justify-between text-sm">
                            <span className="text-gray-300">Gear {sp.fromGear} → {sp.toGear}</span>
                            <span className="font-mono text-green-300 font-bold">{sp.upRPM ? Math.round(sp.upRPM).toLocaleString() : "—"} rpm</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="bg-blue-900/20 border border-blue-800/40 rounded-lg p-3">
                      <p className="text-xs font-semibold text-blue-400 mb-2">⬇ DOWNSHIFT — change down when RPM drops below:</p>
                      <div className="space-y-1">
                        {[...results.shiftPoints].reverse().map((sp,i) => (
                          <div key={i} className="flex justify-between text-sm">
                            <span className="text-gray-300">Gear {sp.toGear} → {sp.fromGear}</span>
                            <span className="font-mono text-blue-300 font-bold">{sp.downRPM ? Math.round(sp.downRPM).toLocaleString() : "—"} rpm</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-3">Shift points are where wheel torque is equal in adjacent gears — the exact RPM of maximum acceleration transfer.</p>
                </>
              )}
            </div>
          )}

          {/* CHARTS TAB */}
          {tab==="charts" && (
            <div className="space-y-8">
              <div>
                <h2 className="text-sm font-semibold text-amber-400 uppercase tracking-wide mb-1">Wheel Torque vs Road Speed</h2>
                <p className="text-xs text-gray-500 mb-3">Shift where curves intersect — the "frontier" is the highest torque available at each speed</p>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={results.chartData} margin={{top:5,right:15,left:0,bottom:20}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151"/>
                    <XAxis dataKey="speed" tick={{fill:"#9ca3af",fontSize:11}} label={{value:"Speed (mph)",position:"insideBottom",offset:-10,fill:"#9ca3af",fontSize:12}}/>
                    <YAxis tick={{fill:"#9ca3af",fontSize:11}} label={{value:"Wheel Torque (ft·lb)",angle:-90,position:"insideLeft",offset:10,fill:"#9ca3af",fontSize:11}}/>
                    <Tooltip contentStyle={{background:"#1f2937",border:"1px solid #374151",borderRadius:8}} labelStyle={{color:"#f59e0b"}} labelFormatter={v=>`${v} mph`}/>
                    <Legend wrapperStyle={{fontSize:12,paddingTop:8}} formatter={(v)=>`Gear ${v.replace("g","")}`}/>
                    {Array.from({length:numGears},(_,i)=>(
                      <Line key={i} type="monotone" dataKey={`g${i+1}`} stroke={GEAR_COLORS[i]} strokeWidth={2} dot={false} name={`g${i+1}`} connectNulls={false}/>
                    ))}
                    {results.shiftPoints.map((sp,i)=>(
                      <ReferenceLine key={i} x={parseFloat(sp.speed.toFixed(1))} stroke="#ffffff22" strokeDasharray="4 4"/>
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div>
                <h2 className="text-sm font-semibold text-amber-400 uppercase tracking-wide mb-1">RPM vs Road Speed per Gear</h2>
                <p className="text-xs text-gray-500 mb-3">Shows RPM drop when changing gear at any given speed</p>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={results.rpmChartData} margin={{top:5,right:15,left:0,bottom:20}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151"/>
                    <XAxis dataKey="speed" tick={{fill:"#9ca3af",fontSize:11}} label={{value:"Speed (mph)",position:"insideBottom",offset:-10,fill:"#9ca3af",fontSize:12}}/>
                    <YAxis tick={{fill:"#9ca3af",fontSize:11}} label={{value:"RPM",angle:-90,position:"insideLeft",offset:10,fill:"#9ca3af",fontSize:11}}/>
                    <Tooltip contentStyle={{background:"#1f2937",border:"1px solid #374151",borderRadius:8}} labelStyle={{color:"#f59e0b"}} labelFormatter={v=>`${v} mph`}/>
                    <Legend wrapperStyle={{fontSize:12,paddingTop:8}} formatter={(v)=>`Gear ${v.replace("g","")}`}/>
                    {Array.from({length:numGears},(_,i)=>(
                      <Line key={i} type="monotone" dataKey={`g${i+1}`} stroke={GEAR_COLORS[i]} strokeWidth={2} dot={false} name={`g${i+1}`} connectNulls={false}/>
                    ))}
                    {results.shiftPoints.map((sp,i)=>(
                      <ReferenceLine key={i} x={parseFloat(sp.speed.toFixed(1))} stroke="#ffffff22" strokeDasharray="4 4"/>
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
