import { useState } from "react";

// ─── CONFIGURACIÓN HORARIA ────────────────────────────────────────────────
// Para cambiar temporada, simplemente cambiá ACTIVE_SEASON a "invierno"
const ACTIVE_SEASON = "verano";

const SCHEDULES = {
  verano: {
    label: "Verano 🌞",
    blocks: [
      { label: "Mañana", from: "07:00", to: "10:30" },
      { label: "Tarde",  from: "18:00", to: "20:00" },
    ],
  },
  invierno: {
    label: "Invierno 🧥",
    blocks: [
      { label: "Mañana", from: "08:00", to: "11:30" },
      { label: "Tarde",  from: "16:00", to: "19:00" },
    ],
  },
};

const DURATIONS = [
  { value: 30,  label: "30 min",  icon: "⚡" },
  { value: 45,  label: "45 min",  icon: "🕐" },
  { value: 60,  label: "1 hora",  icon: "🦮" },
  { value: 90,  label: "1h 30m",  icon: "⭐" },
  { value: 120, label: "2 horas", icon: "🏆" },
];

const SERVICES = [
  { id: "paseo",      label: "Paseo",            icon: "🦮", color: "#FF6B35", desc: "Individual o hasta 2 perros del mismo dueño" },
  { id: "peluqueria", label: "Peluquería Canina", icon: "✂️", color: "#9B5DE5", desc: "Baño, corte y styling personalizado" },
];

const BARRIOS = ["Palermo","Belgrano","Recoleta","Colegiales","Villa Urquiza","Caballito","Flores","Almagro","Villa Crespo","Núñez","Saavedra","Devoto","Otro"];

const DAYS_ES   = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];
const MONTHS_ES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

// ─── HELPERS HORARIOS ─────────────────────────────────────────────────────
function timeToMin(t) { const [h,m]=t.split(":").map(Number); return h*60+m; }

function generateSlots(fromStr, toStr) {
  const slots = [];
  let cur = timeToMin(fromStr);
  const end = timeToMin(toStr);
  while (cur <= end) {
    slots.push(`${String(Math.floor(cur/60)).padStart(2,"0")}:${String(cur%60).padStart(2,"0")}`);
    cur += 15;
  }
  return slots;
}

function getDaySlots() {
  let all = [];
  for (const block of SCHEDULES[ACTIVE_SEASON].blocks)
    all = all.concat(generateSlots(block.from, block.to));
  return [...new Set(all)].sort();
}

// Chequea si el slot+duración cabe en algún bloque y no colisiona con reservas
function getSlotStatus(slotTime, duration, existingBookings) {
  const slotMin = timeToMin(slotTime);
  const slotEnd = slotMin + duration;
  const BUFFER  = 20; // minutos de traslado entre turnos

  // ¿Cabe en un bloque horario?
  const fits = SCHEDULES[ACTIVE_SEASON].blocks.some(bl =>
    slotMin >= timeToMin(bl.from) && slotEnd <= timeToMin(bl.to) + 1
  );
  if (!fits) return "out";

  // ¿Colisiona con alguna reserva (incluyendo buffer)?
  for (const b of existingBookings) {
    const bStart = timeToMin(b.time);
    const bEnd   = bStart + (b.duration || 60);
    if (slotMin < bEnd + BUFFER && slotEnd + BUFFER > bStart) return "blocked";
  }
  return "available";
}

function getDaysInMonth(y, m) { return new Date(y, m+1, 0).getDate(); }
function getFirstDay(y, m)    { return new Date(y, m, 1).getDay(); }
function formatDate(y, m, d)  { return `${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`; }

// ─── DATOS DEMO ───────────────────────────────────────────────────────────
const DEMO_BOOKINGS = [
  { id:1, service:"paseo",      date:"2026-03-03", time:"07:00", duration:60,  name:"Ana López",   phone:"11 1234-5678", dog:"Luna",  dog2:"",    breed:"Labrador", barrio:"Palermo",    notes:"",                   sharedOk:false },
  { id:2, service:"paseo",      date:"2026-03-03", time:"08:30", duration:45,  name:"Carlos Ruiz", phone:"11 8765-4321", dog:"Max",   dog2:"Coco",breed:"Golden",   barrio:"Belgrano",   notes:"Max no quiere correa",sharedOk:true  },
  { id:3, service:"peluqueria", date:"2026-03-05", time:"07:00", duration:90,  name:"Laura Sosa",  phone:"11 9999-0000", dog:"Bicho", dog2:"",    breed:"Caniche",  barrio:"Colegiales", notes:"Le gusta mucho el secador", sharedOk:false },
];

// ─── APP ──────────────────────────────────────────────────────────────────
export default function App() {
  const today = new Date();

  const [step,         setStep]         = useState(0);
  const [service,      setService]      = useState(null);
  const [duration,     setDuration]     = useState(60);
  const [viewMonth,    setViewMonth]    = useState(today.getMonth());
  const [viewYear,     setViewYear]     = useState(today.getFullYear());
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTime, setSelectedTime] = useState(null);
  const [twoDogs,      setTwoDogs]      = useState(false);
  const [form, setForm] = useState({ name:"", phone:"", dog:"", dog2:"", breed:"", barrio:"", notes:"", sharedOk:false });
  const [allBookings,  setAllBookings]  = useState(DEMO_BOOKINGS);
  const [paw,  setPaw]  = useState({ x:0, y:0, show:false });
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminView,      setAdminView]      = useState(false);
  const [adminPass,      setAdminPass]      = useState("");
  const [adminTab,       setAdminTab]       = useState("turnos");

  const serviceObj  = SERVICES.find(s => s.id === service);
  const durationObj = DURATIONS.find(d => d.value === duration);
  const allDaySlots = getDaySlots();
  const dayBookings = selectedDate ? allBookings.filter(b => b.date === selectedDate) : [];

  const slotsWithStatus = allDaySlots.map(t => ({
    time: t,
    status: selectedDate ? getSlotStatus(t, duration, dayBookings) : "available",
  }));

  const isPast = (day) => new Date(viewYear,viewMonth,day) < new Date(today.getFullYear(),today.getMonth(),today.getDate());
  const isToday = (day) => day===today.getDate() && viewMonth===today.getMonth() && viewYear===today.getFullYear();
  const daysInMonth = getDaysInMonth(viewYear,viewMonth);
  const firstDay    = getFirstDay(viewYear,viewMonth);

  const submitBooking = () => {
    setAllBookings(prev => [...prev, {
      id: Date.now(), service, duration, date: selectedDate, time: selectedTime, ...form,
      dog2: twoDogs ? form.dog2 : "",
    }]);
    setStep(5);
  };

  const reset = () => {
    setStep(0); setService(null); setDuration(60); setTwoDogs(false);
    setSelectedDate(null); setSelectedTime(null);
    setForm({ name:"", phone:"", dog:"", dog2:"", breed:"", barrio:"", notes:"", sharedOk:false });
  };

  return (
    <div
      onMouseMove={e => setPaw({ x:e.clientX, y:e.clientY, show:true })}
      onMouseLeave={() => setPaw(p => ({...p, show:false}))}
      style={{ minHeight:"100vh", background:"linear-gradient(140deg,#0f0c29 0%,#1A1A2E 55%,#16213E 100%)", fontFamily:"'Nunito',sans-serif", color:"#F7F7FF", position:"relative", overflowX:"hidden" }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=Fredoka+One&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        .paw{position:fixed;pointer-events:none;font-size:18px;transform:translate(-50%,-50%);z-index:9999}
        .card{background:rgba(255,255,255,.06);backdrop-filter:blur(10px);border-radius:20px;border:1px solid rgba(255,255,255,.09)}
        .btn-p{background:linear-gradient(135deg,#FF6B35,#FFD166);color:#1A1A2E;font-weight:900;border:none;border-radius:50px;padding:13px 30px;cursor:pointer;font-size:15px;font-family:'Nunito',sans-serif;transition:transform .2s,box-shadow .2s}
        .btn-p:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(255,107,53,.4)}
        .btn-p:disabled{opacity:.3;cursor:default;transform:none;box-shadow:none}
        .btn-s{background:rgba(255,255,255,.08);color:#fff;font-weight:700;border:1px solid rgba(255,255,255,.15);border-radius:50px;padding:8px 18px;cursor:pointer;font-size:13px;font-family:'Nunito',sans-serif;transition:background .2s}
        .btn-s:hover{background:rgba(255,255,255,.15)}
        .inp{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.13);border-radius:12px;padding:11px 14px;color:#fff;font-size:14px;font-family:'Nunito',sans-serif;width:100%;outline:none;transition:border .2s}
        .inp:focus{border-color:#FF6B35}
        .inp::placeholder{color:rgba(255,255,255,.28)}
        select.inp option{background:#1A1A2E}
        .svc-card{cursor:pointer;transition:transform .2s,box-shadow .2s}
        .svc-card:hover{transform:translateY(-5px);box-shadow:0 14px 30px rgba(0,0,0,.35)}
        .day{width:40px;height:40px;display:flex;align-items:center;justify-content:center;border-radius:50%;cursor:pointer;font-weight:800;font-size:13px;transition:background .15s,transform .12s;position:relative;user-select:none}
        .day:hover:not(.past):not(.empty){background:rgba(255,107,53,.25);transform:scale(1.1)}
        .day.today{border:2px solid #FF6B35}
        .day.sel-d{background:linear-gradient(135deg,#FF6B35,#FFD166)!important;color:#1A1A2E!important}
        .day.past{opacity:.2;cursor:default}
        .day.has-b::after{content:'';position:absolute;bottom:4px;left:50%;transform:translateX(-50%);width:5px;height:5px;border-radius:50%;background:#06D6A0}
        .slot{padding:10px 4px;border-radius:10px;border:1px solid rgba(255,255,255,.12);cursor:pointer;font-weight:800;text-align:center;font-size:13px;transition:all .15s;line-height:1.3}
        .slot:hover:not(.sl-b):not(.sl-o){background:rgba(255,107,53,.2);border-color:#FF6B35}
        .slot.sl-sel{background:linear-gradient(135deg,#FF6B35,#FFD166);color:#1A1A2E;border-color:transparent}
        .slot.sl-b{opacity:.28;cursor:not-allowed;text-decoration:line-through}
        .slot.sl-o{opacity:.1;cursor:default}
        .dur-btn{padding:11px 8px;border-radius:12px;border:1px solid rgba(255,255,255,.12);cursor:pointer;font-weight:800;text-align:center;font-size:13px;transition:all .15s}
        .dur-btn:hover{background:rgba(255,107,53,.18);border-color:#FF6B35}
        .dur-btn.dur-sel{background:linear-gradient(135deg,#FF6B35,#FFD166);color:#1A1A2E;border-color:transparent}
        .toggle-bar{display:flex;background:rgba(255,255,255,.06);border-radius:50px;padding:3px;gap:3px}
        .tog-opt{flex:1;padding:8px 0;border-radius:50px;text-align:center;cursor:pointer;font-size:12px;font-weight:800;transition:all .2s;color:rgba(255,255,255,.4)}
        .tog-opt.act{background:linear-gradient(135deg,#FF6B35,#FFD166);color:#1A1A2E}
        .chk{width:20px;height:20px;border-radius:6px;border:2px solid rgba(255,255,255,.22);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all .2s;flex-shrink:0}
        .chk.on{background:#06D6A0;border-color:#06D6A0}
        .bk-row{padding:14px;border-radius:14px;background:rgba(255,255,255,.04);margin-bottom:10px;border-left:3px solid #FF6B35}
        @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pop{0%,100%{transform:scale(1)}50%{transform:scale(1.18)}}
        .ani{animation:fadeUp .32s ease forwards}
        .pop-anim{animation:pop .45s ease}
        .lbl{font-size:11px;font-weight:800;color:rgba(255,255,255,.35);letter-spacing:.8px;display:block;margin-bottom:5px}
      `}</style>

      {/* Paw cursor */}
      {paw.show && <div className="paw" style={{left:paw.x,top:paw.y}}>🐾</div>}

      {/* BG glows */}
      <div style={{position:"fixed",top:-130,right:-130,width:440,height:440,borderRadius:"50%",background:"radial-gradient(circle,rgba(255,107,53,.11),transparent)",pointerEvents:"none"}}/>
      <div style={{position:"fixed",bottom:-110,left:-110,width:400,height:400,borderRadius:"50%",background:"radial-gradient(circle,rgba(155,93,229,.11),transparent)",pointerEvents:"none"}}/>

      {/* ─── HEADER ─── */}
      <div style={{padding:"22px 20px 0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:30}}>🐶</span>
          <div>
            <div style={{fontFamily:"'Fredoka One',cursive",fontSize:22,color:"#FFD166",letterSpacing:.5}}>PawTime</div>
            <div style={{fontSize:10,color:"rgba(255,255,255,.3)",letterSpacing:1.2}}>AGENDA TU TURNO</div>
          </div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <span style={{display:"inline-block",borderRadius:20,padding:"3px 11px",fontSize:10,fontWeight:800,background:"rgba(6,214,160,.12)",color:"#06D6A0"}}>
            {SCHEDULES[ACTIVE_SEASON].label}
          </span>
          <button className="btn-s" style={{fontSize:11,padding:"7px 13px"}} onClick={()=>setShowAdminModal(true)}>⚙️ Admin</button>
        </div>
      </div>

      {/* ─── STEP DOTS ─── */}
      {step < 5 && (
        <div style={{display:"flex",justifyContent:"center",gap:8,padding:"18px 0 0"}}>
          {["Servicio","Duración","Fecha","Horario","Datos"].map((label,i)=>(
            <div key={i} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
              <div style={{width:i===step?12:7,height:i===step?12:7,borderRadius:"50%",background:i<=step?"linear-gradient(135deg,#FF6B35,#FFD166)":"rgba(255,255,255,.16)",transition:"all .3s"}}/>
              <span style={{fontSize:9,color:i<=step?"#FFD166":"rgba(255,255,255,.22)",fontWeight:800}}>{label}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{maxWidth:480,margin:"0 auto",padding:"22px 18px 54px"}}>

        {/* ─── STEP 0: Servicio ─── */}
        {step===0 && (
          <div className="ani">
            <h2 style={{fontFamily:"'Fredoka One',cursive",fontSize:26,textAlign:"center",marginBottom:6}}>¿Qué servicio necesitás?</h2>
            <p style={{textAlign:"center",color:"rgba(255,255,255,.38)",fontSize:13,marginBottom:24}}>Seleccioná para tu mejor amigo 🐾</p>
            <div style={{display:"grid",gap:14}}>
              {SERVICES.map(s=>(
                <div key={s.id} className="card svc-card" onClick={()=>{setService(s.id);setStep(1);}}
                  style={{padding:22,display:"flex",alignItems:"center",gap:18}}>
                  <span style={{fontSize:44}}>{s.icon}</span>
                  <div style={{flex:1}}>
                    <div style={{fontFamily:"'Fredoka One',cursive",fontSize:20,color:s.color}}>{s.label}</div>
                    <div style={{color:"rgba(255,255,255,.4)",fontSize:12,marginTop:3}}>{s.desc}</div>
                  </div>
                  <span style={{color:"rgba(255,255,255,.2)",fontSize:22}}>›</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── STEP 1: Duración ─── */}
        {step===1 && (
          <div className="ani">
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:18}}>
              <button className="btn-s" style={{padding:"7px 12px"}} onClick={()=>setStep(0)}>‹</button>
              <h2 style={{fontFamily:"'Fredoka One',cursive",fontSize:24}}>¿Cuánto tiempo? ⏱</h2>
            </div>

            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:22}}>
              {DURATIONS.map(d=>(
                <div key={d.value} className={`dur-btn ${duration===d.value?"dur-sel":""}`} onClick={()=>setDuration(d.value)}>
                  <div style={{fontSize:22,marginBottom:4}}>{d.icon}</div>
                  <div>{d.label}</div>
                </div>
              ))}
            </div>

            {/* 2 perros — solo paseo */}
            {service==="paseo" && (
              <div className="card" style={{padding:18,marginBottom:14}}>
                <div style={{fontWeight:800,color:"#FFD166",fontSize:13,marginBottom:10}}>🐕 ¿Cuántos perros?</div>
                <div className="toggle-bar">
                  <div className={`tog-opt ${!twoDogs?"act":""}`} onClick={()=>setTwoDogs(false)}>1 perro</div>
                  <div className={`tog-opt ${twoDogs?"act":""}`}  onClick={()=>setTwoDogs(true)}>2 perros (mismo dueño)</div>
                </div>
                {twoDogs && (
                  <div style={{marginTop:10,fontSize:12,color:"rgba(255,255,255,.4)",background:"rgba(6,214,160,.08)",borderRadius:10,padding:"8px 12px"}}>
                    💡 Podés traer hasta 2 perros tuyos en el mismo turno
                  </div>
                )}
              </div>
            )}

            {/* Paseo compartido */}
            {service==="paseo" && (
              <div className="card" style={{padding:18,marginBottom:22}}>
                <div style={{display:"flex",alignItems:"flex-start",gap:12}}>
                  <div className={`chk ${form.sharedOk?"on":""}`} onClick={()=>setForm(f=>({...f,sharedOk:!f.sharedOk}))}>
                    {form.sharedOk && <span style={{fontSize:12,fontWeight:900,color:"#1A1A2E"}}>✓</span>}
                  </div>
                  <div>
                    <div style={{fontWeight:800,fontSize:13,color:"#FFD166",marginBottom:3}}>¿Aceptás paseo compartido?</div>
                    <div style={{fontSize:12,color:"rgba(255,255,255,.38)",lineHeight:1.5}}>
                      Si vivís cerca de otro cliente y los perros son compatibles, podemos hacer el paseo juntos
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div style={{textAlign:"center"}}>
              <button className="btn-p" onClick={()=>setStep(2)}>Elegir fecha →</button>
            </div>
          </div>
        )}

        {/* ─── STEP 2: Calendario ─── */}
        {step===2 && (
          <div className="ani">
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:18}}>
              <button className="btn-s" style={{padding:"7px 12px"}} onClick={()=>setStep(1)}>‹</button>
              <h2 style={{fontFamily:"'Fredoka One',cursive",fontSize:24}}>Elegí la fecha 📅</h2>
            </div>

            <div className="card" style={{padding:18,marginBottom:14}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                <button className="btn-s" style={{padding:"5px 12px"}} onClick={()=>{ if(viewMonth===0){setViewMonth(11);setViewYear(y=>y-1);}else setViewMonth(m=>m-1); }}>‹</button>
                <span style={{fontFamily:"'Fredoka One',cursive",fontSize:17}}>{MONTHS_ES[viewMonth]} {viewYear}</span>
                <button className="btn-s" style={{padding:"5px 12px"}} onClick={()=>{ if(viewMonth===11){setViewMonth(0);setViewYear(y=>y+1);}else setViewMonth(m=>m+1); }}>›</button>
              </div>

              <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:6}}>
                {DAYS_ES.map(d=><div key={d} style={{textAlign:"center",fontSize:10,fontWeight:800,color:"rgba(255,255,255,.28)",padding:"3px 0"}}>{d}</div>)}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2}}>
                {Array(firstDay).fill(null).map((_,i)=><div key={`e${i}`} className="day empty"/>)}
                {Array(daysInMonth).fill(null).map((_,i)=>{
                  const day=i+1;
                  const d=formatDate(viewYear,viewMonth,day);
                  const bkCount=allBookings.filter(b=>b.date===d).length;
                  return (
                    <div key={day}
                      className={`day ${isPast(day)?"past":""} ${isToday(day)?"today":""} ${selectedDate===d?"sel-d":""} ${bkCount>0&&!isPast(day)?"has-b":""}`}
                      onClick={()=>{ if(isPast(day))return; setSelectedDate(d); setSelectedTime(null); setStep(3); }}
                    >{day}</div>
                  );
                })}
              </div>
              <div style={{marginTop:12,display:"flex",gap:16,fontSize:11,color:"rgba(255,255,255,.3)"}}>
                <span>🟠 Hoy</span>
                <span style={{color:"#06D6A0"}}>● Tiene turnos</span>
              </div>
            </div>

            <div style={{padding:"12px 16px",borderRadius:14,background:"rgba(6,214,160,.07)",border:"1px solid rgba(6,214,160,.18)",fontSize:12,color:"rgba(255,255,255,.5)"}}>
              🕐 <strong style={{color:"#06D6A0"}}>Horarios {SCHEDULES[ACTIVE_SEASON].label}:</strong>{" "}
              {SCHEDULES[ACTIVE_SEASON].blocks.map(b=>`${b.label}: ${b.from}–${b.to}`).join(" · ")}
            </div>
          </div>
        )}

        {/* ─── STEP 3: Horario ─── */}
        {step===3 && (
          <div className="ani">
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
              <button className="btn-s" style={{padding:"7px 12px"}} onClick={()=>setStep(2)}>‹</button>
              <h2 style={{fontFamily:"'Fredoka One',cursive",fontSize:24}}>Elegí el horario 🕐</h2>
            </div>
            <p style={{color:"rgba(255,255,255,.38)",fontSize:12,marginBottom:4,marginLeft:46}}>
              📅 {selectedDate?.split("-").reverse().join("/")} · {serviceObj?.icon} {serviceObj?.label} · ⏱ {durationObj?.label}
            </p>
            <p style={{color:"rgba(255,255,255,.28)",fontSize:11,marginBottom:20,marginLeft:46}}>
              🚶 Buffer entre turnos: ~20 min de traslado
            </p>

            {SCHEDULES[ACTIVE_SEASON].blocks.map(block=>{
              const blockSlots = slotsWithStatus.filter(s=>{
                const m=timeToMin(s.time);
                return m>=timeToMin(block.from) && m<=timeToMin(block.to);
              });
              const avail = blockSlots.filter(s=>s.status==="available").length;
              return (
                <div key={block.label} style={{marginBottom:22}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                    <div style={{fontSize:12,fontWeight:800,color:"rgba(255,255,255,.38)",letterSpacing:.8}}>
                      ☀️ {block.label.toUpperCase()} · {block.from}–{block.to}
                    </div>
                    <span style={{fontSize:11,color:"#06D6A0",fontWeight:800}}>{avail} disponibles</span>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
                    {blockSlots.map(({time,status})=>(
                      <div key={time}
                        className={`slot ${status==="blocked"?"sl-b":""} ${status==="out"?"sl-o":""} ${selectedTime===time?"sl-sel":""}`}
                        onClick={()=>{ if(status!=="available")return; setSelectedTime(time); }}
                      >
                        <div>{time}</div>
                        {status==="blocked" && <div style={{fontSize:9,marginTop:1,opacity:.6}}>ocupado</div>}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {selectedTime && (
              <div style={{textAlign:"center",marginTop:4}}>
                <button className="btn-p" onClick={()=>setStep(4)}>Continuar con {selectedTime} →</button>
              </div>
            )}
          </div>
        )}

        {/* ─── STEP 4: Formulario ─── */}
        {step===4 && (
          <div className="ani">
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:18}}>
              <button className="btn-s" style={{padding:"7px 12px"}} onClick={()=>setStep(3)}>‹</button>
              <h2 style={{fontFamily:"'Fredoka One',cursive",fontSize:24}}>Tus datos 🐾</h2>
            </div>

            {/* Mini resumen */}
            <div className="card" style={{padding:14,marginBottom:20,display:"flex",gap:12,alignItems:"center"}}>
              <span style={{fontSize:26}}>{serviceObj?.icon}</span>
              <div>
                <div style={{fontWeight:800,color:serviceObj?.color,fontSize:14}}>{serviceObj?.label} · {durationObj?.label}</div>
                <div style={{fontSize:12,color:"rgba(255,255,255,.38)"}}>📅 {selectedDate?.split("-").reverse().join("/")} a las {selectedTime}</div>
              </div>
            </div>

            <div style={{display:"grid",gap:13}}>
              <div>
                <label className="lbl">TU NOMBRE *</label>
                <input className="inp" placeholder="Ej: María González" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/>
              </div>
              <div>
                <label className="lbl">TELÉFONO / WHATSAPP *</label>
                <input className="inp" placeholder="Ej: 11 2345-6789" value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))}/>
              </div>
              <div>
                <label className="lbl">BARRIO *</label>
                <select className="inp" value={form.barrio} onChange={e=>setForm(f=>({...f,barrio:e.target.value}))}>
                  <option value="">Seleccioná tu barrio...</option>
                  {BARRIOS.map(b=><option key={b} value={b}>{b}</option>)}
                </select>
              </div>

              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div>
                  <label className="lbl">{twoDogs?"PERRO 1 *":"NOMBRE DEL PERRO *"}</label>
                  <input className="inp" placeholder="Ej: Rocky" value={form.dog} onChange={e=>setForm(f=>({...f,dog:e.target.value}))}/>
                </div>
                <div>
                  <label className="lbl">RAZA</label>
                  <input className="inp" placeholder="Ej: Labrador" value={form.breed} onChange={e=>setForm(f=>({...f,breed:e.target.value}))}/>
                </div>
              </div>

              {twoDogs && (
                <div>
                  <label className="lbl">PERRO 2 *</label>
                  <input className="inp" placeholder="Nombre del segundo perro" value={form.dog2} onChange={e=>setForm(f=>({...f,dog2:e.target.value}))}/>
                </div>
              )}

              {service==="paseo" && (
                <div style={{padding:"13px 16px",borderRadius:14,background:"rgba(6,214,160,.06)",border:"1px solid rgba(6,214,160,.14)"}}>
                  <div style={{display:"flex",alignItems:"center",gap:11}}>
                    <div className={`chk ${form.sharedOk?"on":""}`} onClick={()=>setForm(f=>({...f,sharedOk:!f.sharedOk}))}>
                      {form.sharedOk && <span style={{fontSize:12,fontWeight:900,color:"#1A1A2E"}}>✓</span>}
                    </div>
                    <div style={{fontSize:13,fontWeight:700,color:"rgba(255,255,255,.65)"}}>
                      Acepto paseo compartido con otro perro (si hay compatibilidad y vivo cerca)
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="lbl">NOTAS</label>
                <textarea className="inp" placeholder="Alergias, comportamiento, indicaciones especiales..." rows={3} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} style={{resize:"vertical"}}/>
              </div>
            </div>

            <div style={{marginTop:22,textAlign:"center"}}>
              <button className="btn-p"
                disabled={!form.name||!form.phone||!form.dog||!form.barrio||(twoDogs&&!form.dog2)}
                onClick={submitBooking}
              >🐾 Confirmar Turno</button>
            </div>
          </div>
        )}

        {/* ─── STEP 5: Confirmación ─── */}
        {step===5 && (
          <div className="ani" style={{textAlign:"center"}}>
            <div style={{fontSize:72,marginBottom:12}} className="pop-anim">🎉</div>
            <h2 style={{fontFamily:"'Fredoka One',cursive",fontSize:30,color:"#FFD166",marginBottom:6}}>¡Turno confirmado!</h2>
            <p style={{color:"rgba(255,255,255,.42)",marginBottom:26,fontSize:14}}>
              Te esperamos con {form.dog}{twoDogs&&form.dog2?` y ${form.dog2}`:""} 🐾
            </p>

            <div className="card" style={{padding:22,textAlign:"left",marginBottom:26}}>
              {[
                ["Servicio",  `${serviceObj?.icon} ${serviceObj?.label}`],
                ["Duración",  durationObj?.label],
                ["Fecha",     selectedDate?.split("-").reverse().join("/")],
                ["Horario",   selectedTime],
                ["Cliente",   form.name],
                ["Teléfono",  form.phone],
                ["Barrio",    form.barrio],
                ["Perro/s",   `${form.dog}${twoDogs&&form.dog2?` + ${form.dog2}`:""}${form.breed?` (${form.breed})`:""}`],
                ...(form.sharedOk?[["Paseo compartido","✅ Acepta"]]:[]),
                ...(form.notes?[["Notas",form.notes]]:[]),
              ].map(([k,v])=>(
                <div key={k} style={{display:"flex",justifyContent:"space-between",gap:12,borderBottom:"1px solid rgba(255,255,255,.05)",padding:"10px 0"}}>
                  <span style={{color:"rgba(255,255,255,.32)",fontSize:12,fontWeight:700}}>{k}</span>
                  <span style={{fontWeight:800,fontSize:13,textAlign:"right",maxWidth:"62%"}}>{v}</span>
                </div>
              ))}
            </div>
            <button className="btn-p" onClick={reset}>+ Agendar otro turno</button>
          </div>
        )}
      </div>

      {/* ─── ADMIN MODAL ─── */}
      {showAdminModal && !adminView && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.78)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,padding:20}}>
          <div className="card ani" style={{padding:30,width:"100%",maxWidth:360}}>
            <h3 style={{fontFamily:"'Fredoka One',cursive",fontSize:20,marginBottom:18,textAlign:"center"}}>🔐 Panel Admin</h3>
            <input className="inp" type="password" placeholder="Contraseña (prueba: admin123)" value={adminPass}
              onChange={e=>setAdminPass(e.target.value)}
              onKeyDown={e=>{ if(e.key==="Enter"&&adminPass==="admin123"){setAdminView(true);setShowAdminModal(false);}}}
              style={{marginBottom:14}}/>
            <div style={{display:"flex",gap:10}}>
              <button className="btn-s" style={{flex:1}} onClick={()=>setShowAdminModal(false)}>Cancelar</button>
              <button className="btn-p" style={{flex:1,padding:"11px 0"}} onClick={()=>{
                if(adminPass==="admin123"){setAdminView(true);setShowAdminModal(false);}
                else alert("Contraseña incorrecta");
              }}>Entrar</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── ADMIN PANEL ─── */}
      {adminView && (
        <div style={{position:"fixed",inset:0,background:"#0f0c29",zIndex:200,overflowY:"auto",padding:"20px 16px 40px"}}>
          <div style={{maxWidth:560,margin:"0 auto"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
              <div style={{fontFamily:"'Fredoka One',cursive",fontSize:24,color:"#FFD166"}}>⚙️ Panel Admin</div>
              <button className="btn-s" onClick={()=>{setAdminView(false);setAdminPass("");}}>✕ Cerrar</button>
            </div>

            {/* Tabs */}
            <div className="toggle-bar" style={{marginBottom:22}}>
              {[["turnos","📋 Turnos"],["horarios","🕐 Horarios & Zonas"]].map(([id,label])=>(
                <div key={id} className={`tog-opt ${adminTab===id?"act":""}`} onClick={()=>setAdminTab(id)}>{label}</div>
              ))}
            </div>

            {/* Tab: Turnos */}
            {adminTab==="turnos" && (
              <div>
                <div style={{color:"rgba(255,255,255,.3)",fontSize:12,marginBottom:14}}>{allBookings.length} turno(s) registrados</div>
                {allBookings.length===0 && (
                  <div style={{textAlign:"center",color:"rgba(255,255,255,.22)",padding:40}}>
                    <div style={{fontSize:44,marginBottom:10}}>📭</div>No hay turnos aún
                  </div>
                )}
                {allBookings.slice().reverse().map(b=>{
                  const svc=SERVICES.find(s=>s.id===b.service);
                  const dur=DURATIONS.find(d=>d.value===b.duration);
                  return (
                    <div key={b.id} className="bk-row" style={{borderLeftColor:svc?.color}}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                        <span style={{fontWeight:800,color:svc?.color,fontSize:13}}>{svc?.icon} {svc?.label}</span>
                        <span style={{color:"rgba(255,255,255,.38)",fontSize:12}}>{b.date?.split("-").reverse().join("/")} · {b.time}</span>
                      </div>
                      <div style={{fontSize:12,color:"rgba(255,255,255,.55)",marginBottom:3}}>
                        ⏱ {dur?.label} · 📍 {b.barrio}
                        {b.sharedOk && <span style={{color:"#06D6A0",marginLeft:8,fontSize:11}}>✓ Compartido OK</span>}
                      </div>
                      <div style={{fontSize:12,color:"rgba(255,255,255,.6)"}}>
                        👤 {b.name} · 📱 {b.phone}
                      </div>
                      <div style={{fontSize:12,color:"rgba(255,255,255,.6)"}}>
                        🐶 {b.dog}{b.dog2?` + ${b.dog2}`:""}{b.breed?` (${b.breed})`:""}
                      </div>
                      {b.notes && <div style={{fontSize:11,color:"rgba(255,255,255,.3)",marginTop:4}}>💬 {b.notes}</div>}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Tab: Horarios */}
            {adminTab==="horarios" && (
              <div>
                <div style={{color:"rgba(255,255,255,.45)",fontSize:13,marginBottom:18,lineHeight:1.7}}>
                  Temporada activa: <strong style={{color:"#FFD166"}}>{SCHEDULES[ACTIVE_SEASON].label}</strong>.
                  Para cambiar, modificá <code style={{color:"#06D6A0",background:"rgba(6,214,160,.1)",padding:"1px 7px",borderRadius:6}}>ACTIVE_SEASON</code> en el código.
                </div>

                {Object.entries(SCHEDULES).map(([key,sch])=>(
                  <div key={key} className="card" style={{padding:18,marginBottom:14,borderColor:key===ACTIVE_SEASON?"rgba(255,107,53,.35)":"rgba(255,255,255,.07)"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                      <span style={{fontFamily:"'Fredoka One',cursive",fontSize:17}}>{sch.label}</span>
                      {key===ACTIVE_SEASON && <span style={{display:"inline-block",borderRadius:20,padding:"2px 10px",fontSize:10,fontWeight:800,background:"rgba(255,107,53,.18)",color:"#FF6B35"}}>ACTIVA</span>}
                    </div>
                    {sch.blocks.map(b=>(
                      <div key={b.label} style={{display:"flex",justifyContent:"space-between",padding:"8px 12px",borderRadius:10,background:"rgba(255,255,255,.04)",marginBottom:7}}>
                        <span style={{fontWeight:700,color:"rgba(255,255,255,.5)",fontSize:13}}>{b.label}</span>
                        <span style={{fontWeight:800,color:"#FFD166",fontSize:13}}>{b.from} – {b.to}</span>
                      </div>
                    ))}
                    <div style={{fontSize:11,color:"rgba(255,255,255,.28)",marginTop:6}}>Slots cada 15 min · Buffer entre turnos: 20 min</div>
                  </div>
                ))}

                <div style={{marginTop:20,padding:"14px 16px",borderRadius:14,background:"rgba(155,93,229,.08)",border:"1px solid rgba(155,93,229,.18)",fontSize:12,color:"rgba(255,255,255,.45)",lineHeight:1.7}}>
                  <strong style={{color:"#9B5DE5"}}>📍 Lógica de zonas:</strong> El sistema captura el barrio de cada cliente.
                  Al agendar turnos consecutivos, podés filtrar por barrio en esta vista para planificar recorridos eficientes
                  (ej: todos los Palermo de mañana juntos). Próximamente: agrupación automática por zona.
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

