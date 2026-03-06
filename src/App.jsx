import { useState } from "react";
import { supabase } from './supabase';

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
  { value: 30,  label: "30/45 min", icon: "⚡" },
  { value: 60,  label: "1 hora",    icon: "🦮" },
  { value: 90,  label: "1h 30min",  icon: "⭐" },
];

const SERVICES = [
  { id: "paseo",      label: "Paseo",            icon: "🦮", color: "#c187a4", desc: "Individual o excepciones hasta 2 perros", enabled: true },
  { id: "doble",      label: "2 Paseos Seguidos", icon: "🐕🐕", color: "#dd8279", desc: "2 perros del mismo dueño, paseos uno tras otro", enabled: true },
  { id: "peluqueria", label: "Peluquería Canina", icon: "✂️", color: "#a3c97e", desc: "Baño, corte y styling personalizado", enabled: false },
];

const BARRIOS = [
  "Abilene","Alberdi","Banda Norte","Bimaco","Buena Vista",
  "Centro","Cispren","Fénix","General Paz","Golf Club",
  "Jardín","Las Quintas","Obrero","Universitario","Villa Dalcar",
  "Otro (especificar en notas)"
];

const DAYS_ES   = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];
const MONTHS_ES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

// ─── PRECIOS ──────────────────────────────────────────────────────────────
const PRECIOS_BASE = { 30: 6500, 60: 8000, 90: 12000 };

function calcularPrecio({ service, duration, duration2, twoDogs, isNewClient, weeklyCount, monthlyCount }) {
  let precio1 = PRECIOS_BASE[duration] || 8000;
  let precio2 = 0;
  let descuentos = [];

  if (service === "doble") {
    precio2 = PRECIOS_BASE[duration2] || 8000;
    const descP2 = Math.round(precio2 * 0.20);
    precio2 -= descP2;
    descuentos.push({ label: "20% desc. 2do perro", monto: -descP2 });
  } else if (twoDogs) {
    precio2 = PRECIOS_BASE[duration] || 8000;
    const descP2 = Math.round(precio2 * 0.20);
    precio2 -= descP2;
    descuentos.push({ label: "20% desc. 2do perro", monto: -descP2 });
  }

  let subtotal = precio1 + precio2;

  if (isNewClient) {
    const d = Math.round(subtotal * 0.10);
    subtotal -= d;
    descuentos.push({ label: "10% primer paseo (cliente nuevo 🎉)", monto: -d });
  }

  const esFrecuente = (weeklyCount >= 2) || (monthlyCount >= 11);
  if (esFrecuente && !isNewClient) {
    const d = Math.round(subtotal * 0.15);
    subtotal -= d;
    descuentos.push({ label: "15% desc. cliente frecuente ⭐", monto: -d });
  }

  return { precio1, precio2, subtotal, descuentos };
}

function formatPeso(n) { return `$${n.toLocaleString("es-AR")}`; }

// Días sin turno: sábado (6) y domingo (0)
// En reprogramaciones por lluvia se habilita sábado a la mañana
const RAIN_SAT_BLOCKS = [{ label: "Mañana", from: "08:00", to: "11:00" }];

// Colores de la paleta
const C = {
  bg:       "#f5f0fb",      // fondo principal muy claro
  bgCard:   "#ffffff",      // tarjetas blancas
  bgCard2:  "#fdf7ff",      // tarjetas suaves
  primary:  "#c187a4",      // rosa lila — botones principales, acentos
  secondary:"#dd8279",      // salmón — secundario
  accent:   "#a3c97e",      // verde claro — disponible, confirmado
  soft:     "#c0aec3",      // lila gris — textos suaves
  dark:     "#3a2c4d",      // morado oscuro — textos principales
  light:    "#e6daf4",      // lavanda muy claro — fondos suaves
  white:    "#ffffff",
};

function timeToMin(t) { const [h,m]=t.split(":").map(Number); return h*60+m; }
function minToTime(m) { return `${String(Math.floor(m/60)).padStart(2,"0")}:${String(m%60).padStart(2,"0")}`; }

function generateSlots(fromStr, toStr) {
  const slots = [];
  let cur = timeToMin(fromStr);
  const end = timeToMin(toStr);
  while (cur <= end) { slots.push(minToTime(cur)); cur += 15; }
  return slots;
}

function getDaySlots() {
  let all = [];
  for (const block of SCHEDULES[ACTIVE_SEASON].blocks)
    all = all.concat(generateSlots(block.from, block.to));
  return [...new Set(all)].sort();
}

function getSlotStatus(slotTime, duration, existingBookings, ignoreShared = false) {
  const slotMin = timeToMin(slotTime);
  const slotEnd = slotMin + duration;
  const BUFFER  = 20;

  const fits = SCHEDULES[ACTIVE_SEASON].blocks.some(bl =>
    slotMin >= timeToMin(bl.from) && slotEnd <= timeToMin(bl.to) + 1
  );
  if (!fits) return "out";

  for (const b of existingBookings) {
    const bStart = timeToMin(b.time);
    const bEnd   = bStart + (b.duration || 60);
    // si el turno existente acepta compartido y no ignoramos compartidos → marcar como "shared"
    if (!ignoreShared && b.sharedOk && slotMin === bStart) return "shared";
    if (slotMin < bEnd + BUFFER && slotEnd + BUFFER > bStart) return "blocked";
  }
  return "available";
}

function getDaysInMonth(y, m) { return new Date(y, m+1, 0).getDate(); }
function getFirstDay(y, m)    { return new Date(y, m, 1).getDay(); }
function formatDate(y, m, d)  { return `${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`; }

const DEMO_BOOKINGS = [
  { id:1, service:"paseo", date:"2026-03-10", time:"07:00", duration:60, name:"Ana López", phone:"358 123-4567", dog:"Luna", dog2:"", breed:"Labrador", breed2:"", barrio:"Centro", notes:"", sharedOk:true },
  { id:2, service:"paseo", date:"2026-03-10", time:"08:30", duration:60, name:"Carlos Ruiz", phone:"358 765-4321", dog:"Max", dog2:"Coco", breed:"Golden", breed2:"Beagle", barrio:"Banda Norte", notes:"Max no quiere correa", sharedOk:false },
];

export default function App() {
  const today = new Date();

  // ─── AUTH ───────────────────────────────────────────────────────────────
  const [authUser,     setAuthUser]     = useState(null);
  const [authView,     setAuthView]     = useState(null); // null | "login" | "register" | "profile"
  const [authEmail,    setAuthEmail]    = useState("");
  const [authPass,     setAuthPass]     = useState("");
  const [authName,     setAuthName]     = useState("");
  const [authPhone,    setAuthPhone]    = useState("");
  const [authError,    setAuthError]    = useState("");
  const [authLoading,  setAuthLoading]  = useState(false);

  const handleRegister = async () => {
    setAuthLoading(true); setAuthError("");
    const { data, error } = await supabase.auth.signUp({
      email: authEmail, password: authPass,
      options: { data: { full_name: authName, phone: authPhone } }
    });
    if (error) { setAuthError(error.message); }
    else { setAuthUser(data.user); setAuthView(null); }
    setAuthLoading(false);
  };

  const handleLogin = async () => {
    setAuthLoading(true); setAuthError("");
    const { data, error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPass });
    if (error) { setAuthError("Email o contraseña incorrectos"); }
    else { setAuthUser(data.user); setAuthView(null); }
    setAuthLoading(false);
  };

  const handleGoogle = async () => {
    await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.href } });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setAuthUser(null); setAuthView(null);
  };

  // ─── BOOKING STATES ─────────────────────────────────────────────────────
  const [step,         setStep]         = useState(0);
  const [service,      setService]      = useState(null);
  const [duration,     setDuration]     = useState(60);
  const [duration2,    setDuration2]    = useState(60);
  const [viewMonth,    setViewMonth]    = useState(today.getMonth());
  const [viewYear,     setViewYear]     = useState(today.getFullYear());
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTime, setSelectedTime] = useState(null);
  const [twoDogs,      setTwoDogs]      = useState(false);
  const [sharedMatch,  setSharedMatch]  = useState(null);
  const [form, setForm] = useState({
    name:  authUser?.user_metadata?.full_name || "",
    phone: authUser?.user_metadata?.phone || "",
    dog:"", dog2:"", breed:"", breed2:"", barrio:"", notes:"", sharedOk:false
  });
  const [allBookings,  setAllBookings]  = useState(DEMO_BOOKINGS);
  const [paw,  setPaw]  = useState({ x:0, y:0, show:false });
  const [rainMode,       setRainMode]       = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminView,      setAdminView]      = useState(false);
  const [adminPass,      setAdminPass]      = useState("");
  const [adminTab,       setAdminTab]       = useState("turnos");

  const serviceObj  = SERVICES.find(s => s.id === service);
  const durationObj = DURATIONS.find(d => d.value === duration);
  const duration2Obj = DURATIONS.find(d => d.value === duration2);
  const allDaySlots = getDaySlots();
  const dayBookings = selectedDate ? allBookings.filter(b => b.date === selectedDate) : [];

  const slotsWithStatus = allDaySlots.map(t => ({
    time: t,
    status: selectedDate ? getSlotStatus(t, duration, dayBookings) : "available",
    sharedBooking: selectedDate ? dayBookings.find(b => b.sharedOk && b.time === t) : null,
  }));

  const isPast     = (day) => new Date(viewYear,viewMonth,day) < new Date(today.getFullYear(),today.getMonth(),today.getDate());
  const isToday    = (day) => day===today.getDate() && viewMonth===today.getMonth() && viewYear===today.getFullYear();
  const isWeekend  = (day) => { const dow = new Date(viewYear,viewMonth,day).getDay(); return dow===0 || (dow===6 && !rainMode); };
  const daysInMonth = getDaysInMonth(viewYear,viewMonth);
  const firstDay    = getFirstDay(viewYear,viewMonth);

  // Calcular historial del cliente para descuentos
  const clientKey = authUser?.email || form.phone;
  const clientBookings = allBookings.filter(b => b.email === clientKey || b.phone === clientKey);
  const isNewClient = clientBookings.length === 0;
  const now = new Date();
  const startOfWeek = new Date(now); startOfWeek.setDate(now.getDate() - now.getDay());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const weeklyCount  = clientBookings.filter(b => new Date(b.date) >= startOfWeek).length;
  const monthlyCount = clientBookings.filter(b => new Date(b.date) >= startOfMonth).length;

  const pricing = calcularPrecio({ service, duration, duration2, twoDogs: twoDogs || service==="doble", isNewClient, weeklyCount, monthlyCount });

  // Hora de fin del primer paseo en modo doble
  const dobleEndTime = selectedTime ? minToTime(timeToMin(selectedTime) + duration) : null;

  const submitBooking = async () => {
    const totalDuration = service === "doble" ? duration + duration2 : duration;
    const newBooking = {
      id: Date.now(), service, duration: totalDuration, date: selectedDate, time: selectedTime, ...form,
      dog2: (twoDogs || service === "doble") ? form.dog2 : "",
      breed2: (twoDogs || service === "doble") ? form.breed2 : "",
      sharedOk: twoDogs || service === "doble" ? false : form.sharedOk,
      duration2: service === "doble" ? duration2 : null,
    };
    setAllBookings(prev => [...prev, newBooking]);
    await supabase.from('turnos').insert([{
      nombre: form.name,
      telefono: form.phone,
      barrio: form.barrio,
      servicio: service,
      duracion: totalDuration,
      fecha: selectedDate,
      hora: selectedTime,
      perro1: form.dog,
      perro2: (twoDogs || service === "doble") ? form.dog2 : "",
      notas: form.notes,
    }]);
    setStep(5);
  };

  const handleTimeSelect = (time, status, sharedBooking) => {
    if (status === "blocked" || status === "out") return;
    setSelectedTime(time);
    if (status === "shared" && sharedBooking) {
      setSharedMatch(sharedBooking);
    } else {
      setSharedMatch(null);
    }
  };

  const reset = () => {
    setStep(0); setService(null); setDuration(60); setDuration2(60); setTwoDogs(false);
    setSelectedDate(null); setSelectedTime(null); setSharedMatch(null); setRainMode(false);
    setForm({
      name:  authUser?.user_metadata?.full_name || "",
      phone: authUser?.user_metadata?.phone || "",
      dog:"", dog2:"", breed:"", breed2:"", barrio:"", notes:"", sharedOk:false
    });
  };

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=Fredoka+One&display=swap');
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:${C.bg}}
    .paw{position:fixed;pointer-events:none;font-size:18px;transform:translate(-50%,-50%);z-index:9999}
    .card{background:${C.bgCard};border-radius:20px;border:1px solid ${C.light};box-shadow:0 2px 12px rgba(58,44,77,.07)}
    .card2{background:${C.light};border-radius:16px;border:1px solid ${C.soft}33}
    .btn-p{background:linear-gradient(135deg,${C.primary},${C.secondary});color:${C.white};font-weight:900;border:none;border-radius:50px;padding:13px 30px;cursor:pointer;font-size:15px;font-family:'Nunito',sans-serif;transition:transform .2s,box-shadow .2s;box-shadow:0 4px 14px ${C.primary}55}
    .btn-p:hover{transform:translateY(-2px);box-shadow:0 8px 24px ${C.primary}66}
    .btn-p:disabled{opacity:.35;cursor:default;transform:none;box-shadow:none}
    .btn-s{background:${C.light};color:${C.dark};font-weight:700;border:1px solid ${C.soft}66;border-radius:50px;padding:8px 18px;cursor:pointer;font-size:13px;font-family:'Nunito',sans-serif;transition:background .2s}
    .btn-s:hover{background:${C.soft}44}
    .inp{background:${C.bgCard2};border:1.5px solid ${C.light};border-radius:12px;padding:11px 14px;color:${C.dark};font-size:14px;font-family:'Nunito',sans-serif;width:100%;outline:none;transition:border .2s}
    .inp:focus{border-color:${C.primary}}
    .inp::placeholder{color:${C.soft}}
    select.inp option{background:${C.bgCard}}
    .svc-card{transition:transform .2s,box-shadow .2s}
    .svc-card.enabled{cursor:pointer}
    .svc-card.enabled:hover{transform:translateY(-4px);box-shadow:0 12px 28px rgba(58,44,77,.13)}
    .svc-card.disabled{opacity:.55;cursor:not-allowed}
    .coming-soon{display:inline-block;margin-top:6px;background:${C.light};border:1px solid ${C.soft}66;color:${C.soft};border-radius:20px;padding:3px 11px;font-size:10px;font-weight:800;letter-spacing:.5px}
    .day{width:40px;height:40px;display:flex;align-items:center;justify-content:center;border-radius:50%;cursor:pointer;font-weight:800;font-size:13px;transition:background .15s,transform .12s;position:relative;user-select:none;color:${C.dark}}
    .day:hover:not(.past):not(.empty){background:${C.light};transform:scale(1.1)}
    .day.today{border:2px solid ${C.primary}}
    .day.sel-d{background:linear-gradient(135deg,${C.primary},${C.secondary})!important;color:${C.white}!important}
    .day.past{opacity:.25;cursor:default}
    .day.has-b::after{content:'';position:absolute;bottom:4px;left:50%;transform:translateX(-50%);width:5px;height:5px;border-radius:50%;background:${C.accent}}
    .slot{padding:10px 4px;border-radius:10px;border:1.5px solid ${C.light};cursor:pointer;font-weight:800;text-align:center;font-size:13px;transition:all .15s;line-height:1.3;color:${C.dark};background:${C.bgCard}}
    .slot:hover:not(.sl-b):not(.sl-o){background:${C.light};border-color:${C.primary}}
    .slot.sl-sel{background:linear-gradient(135deg,${C.primary},${C.secondary});color:${C.white};border-color:transparent}
    .slot.sl-b{opacity:.3;cursor:not-allowed;text-decoration:line-through;background:${C.light}}
    .slot.sl-o{opacity:.1;cursor:default}
    .slot.sl-shared{border-color:${C.accent};background:${C.accent}22;color:${C.dark}}
    .slot.sl-shared:hover{background:${C.accent}44}
    .dur-btn{padding:11px 8px;border-radius:12px;border:1.5px solid ${C.light};cursor:pointer;font-weight:800;text-align:center;font-size:13px;transition:all .15s;color:${C.dark};background:${C.bgCard}}
    .dur-btn:hover{background:${C.light};border-color:${C.primary}}
    .dur-btn.dur-sel{background:linear-gradient(135deg,${C.primary},${C.secondary});color:${C.white};border-color:transparent}
    .toggle-bar{display:flex;background:${C.light};border-radius:50px;padding:3px;gap:3px}
    .tog-opt{flex:1;padding:8px 0;border-radius:50px;text-align:center;cursor:pointer;font-size:12px;font-weight:800;transition:all .2s;color:${C.soft}}
    .tog-opt.act{background:linear-gradient(135deg,${C.primary},${C.secondary});color:${C.white}}
    .chk{width:20px;height:20px;border-radius:6px;border:2px solid ${C.soft}66;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all .2s;flex-shrink:0;background:${C.bgCard}}
    .chk.on{background:${C.accent};border-color:${C.accent}}
    .bk-row{padding:14px;border-radius:14px;background:${C.bgCard2};margin-bottom:10px;border-left:3px solid ${C.primary}}
    @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
    @keyframes pop{0%,100%{transform:scale(1)}50%{transform:scale(1.18)}}
    .ani{animation:fadeUp .32s ease forwards}
    .pop-anim{animation:pop .45s ease}
    .lbl{font-size:11px;font-weight:800;color:${C.soft};letter-spacing:.8px;display:block;margin-bottom:5px}
  `;

  return (
    <div
      onMouseMove={e => setPaw({ x:e.clientX, y:e.clientY, show:true })}
      onMouseLeave={() => setPaw(p => ({...p, show:false}))}
      style={{ minHeight:"100vh", background:C.bg, fontFamily:"'Nunito',sans-serif", color:C.dark, position:"relative", overflowX:"hidden" }}
    >
      <style>{css}</style>

      {paw.show && <div className="paw" style={{left:paw.x,top:paw.y}}>🐾</div>}

      {/* BG decoration */}
      <div style={{position:"fixed",top:-100,right:-100,width:380,height:380,borderRadius:"50%",background:`radial-gradient(circle,${C.light},transparent)`,pointerEvents:"none",opacity:.7}}/>
      <div style={{position:"fixed",bottom:-80,left:-80,width:320,height:320,borderRadius:"50%",background:`radial-gradient(circle,${C.light},transparent)`,pointerEvents:"none",opacity:.5}}/>

      {/* HEADER */}
      <div style={{padding:"22px 20px 0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:30}}>🐶</span>
          <div>
            <div style={{fontFamily:"'Fredoka One',cursive",fontSize:22,color:C.primary,letterSpacing:.5}}>Paseos con Guada</div>
            <div style={{fontSize:10,color:C.soft,letterSpacing:1.2,fontWeight:800}}>AGENDA TU TURNO</div>
          </div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <span style={{display:"inline-block",borderRadius:20,padding:"3px 11px",fontSize:10,fontWeight:800,background:`${C.accent}22`,color:C.accent,border:`1px solid ${C.accent}55`}}>
            {SCHEDULES[ACTIVE_SEASON].label}
          </span>
          {authUser ? (
            <button className="btn-s" style={{fontSize:11,padding:"7px 13px"}} onClick={()=>setAuthView("profile")}>
              👤 {authUser.user_metadata?.full_name?.split(" ")[0] || "Mi perfil"}
            </button>
          ) : (
            <button className="btn-s" style={{fontSize:11,padding:"7px 13px",background:`${C.primary}18`,borderColor:`${C.primary}55`,color:C.primary}} onClick={()=>setAuthView("login")}>
              🔑 Ingresar
            </button>
          )}
          <button className="btn-s" style={{fontSize:11,padding:"7px 13px"}} onClick={()=>setShowAdminModal(true)}>⚙️ Admin</button>
        </div>
      </div>

      {/* STEP DOTS */}
      {step < 5 && (
        <div style={{display:"flex",justifyContent:"center",gap:8,padding:"18px 0 0"}}>
          {["Servicio","Duración","Fecha","Horario","Datos"].map((label,i)=>(
            <div key={i} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
              <div style={{width:i===step?12:7,height:i===step?12:7,borderRadius:"50%",background:i<=step?`linear-gradient(135deg,${C.primary},${C.secondary})`:C.light,transition:"all .3s"}}/>
              <span style={{fontSize:9,color:i<=step?C.primary:C.soft,fontWeight:800}}>{label}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{maxWidth:480,margin:"0 auto",padding:"22px 18px 54px"}}>

        {/* STEP 0: Servicio */}
        {step===0 && (
          <div className="ani">
            <h2 style={{fontFamily:"'Fredoka One',cursive",fontSize:26,textAlign:"center",marginBottom:6,color:C.dark}}>¿Qué servicio necesitás?</h2>
            <p style={{textAlign:"center",color:C.soft,fontSize:13,marginBottom:24}}>Seleccioná para tu mejor amigo 🐾</p>
            <div style={{display:"grid",gap:14}}>
              {SERVICES.map(s=>(
                <div key={s.id}
                  className={`card svc-card ${s.enabled?"enabled":"disabled"}`}
                  onClick={()=>{ if(!s.enabled) return; setService(s.id); setStep(1); }}
                  style={{padding:22,display:"flex",alignItems:"center",gap:18}}
                >
                  <span style={{fontSize:40}}>{s.icon}</span>
                  <div style={{flex:1}}>
                    <div style={{fontFamily:"'Fredoka One',cursive",fontSize:19,color:s.color}}>{s.label}</div>
                    <div style={{color:C.soft,fontSize:12,marginTop:3}}>{s.desc}</div>
                    {!s.enabled && <span className="coming-soon">🔜 Próximamente disponible</span>}
                  </div>
                  {s.enabled && <span style={{color:C.soft,fontSize:22}}>›</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* STEP 1: Duración */}
        {step===1 && (
          <div className="ani">
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:18}}>
              <button className="btn-s" style={{padding:"7px 12px"}} onClick={()=>setStep(0)}>‹</button>
              <h2 style={{fontFamily:"'Fredoka One',cursive",fontSize:24,color:C.dark}}>
                {service==="doble" ? "Duración de cada paseo ⏱" : "¿Cuánto tiempo? ⏱"}
              </h2>
            </div>

            {/* Duración paseo 1 */}
            <div style={{marginBottom:8}}>
              {service==="doble" && <div style={{fontWeight:800,color:C.primary,fontSize:13,marginBottom:8}}>🐕 Perro 1 — primer paseo</div>}
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom: service==="doble"?16:22}}>
                {DURATIONS.map(d=>(
                  <div key={d.value} className={`dur-btn ${duration===d.value?"dur-sel":""}`} onClick={()=>setDuration(d.value)}>
                    <div style={{fontSize:22,marginBottom:4}}>{d.icon}</div>
                    <div>{d.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Duración paseo 2 — solo en modo doble */}
            {service==="doble" && (
              <div style={{marginBottom:22}}>
                <div style={{fontWeight:800,color:C.secondary,fontSize:13,marginBottom:8}}>🐕 Perro 2 — segundo paseo</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
                  {DURATIONS.map(d=>(
                    <div key={d.value} className={`dur-btn ${duration2===d.value?"dur-sel":""}`}
                      style={duration2===d.value?{background:`linear-gradient(135deg,${C.secondary},${C.primary})`}:{}}
                      onClick={()=>setDuration2(d.value)}>
                      <div style={{fontSize:22,marginBottom:4}}>{d.icon}</div>
                      <div>{d.label}</div>
                    </div>
                  ))}
                </div>
                <div style={{marginTop:10,padding:"10px 14px",borderRadius:12,background:`${C.accent}18`,border:`1px solid ${C.accent}44`,fontSize:12,color:C.dark}}>
                  ⏱ Tiempo total: <strong>{duration + duration2} min</strong> — el segundo paseo empieza justo al terminar el primero
                </div>
              </div>
            )}

            {/* Precios */}
            <div className="card" style={{padding:16,marginBottom:14}}>
              <div style={{fontWeight:800,color:C.primary,fontSize:13,marginBottom:10}}>💰 Precios</div>
              <div style={{display:"grid",gap:6}}>
                {DURATIONS.map(d=>(
                  <div key={d.value} style={{display:"flex",justifyContent:"space-between",fontSize:13,padding:"6px 0",borderBottom:`1px solid ${C.light}`}}>
                    <span style={{color:C.soft,fontWeight:700}}>{d.icon} {d.label}</span>
                    <span style={{fontWeight:800,color:C.dark}}>{formatPeso(PRECIOS_BASE[d.value])}</span>
                  </div>
                ))}
                <div style={{fontSize:11,color:C.soft,marginTop:6,lineHeight:1.7}}>
                  🐕 2do perro: <strong>20% de descuento</strong><br/>
                  🎉 Primer paseo (cliente nuevo): <strong>10% de descuento</strong><br/>
                  ⭐ 3+ paseos/semana o 12+/mes: <strong>15% de descuento</strong>
                </div>
              </div>
            </div>

            {/* Preview precio según selección actual */}
            {(service==="paseo"||service==="doble") && (
              <div style={{marginBottom:14,padding:"12px 16px",borderRadius:14,background:`${C.primary}12`,border:`1px solid ${C.primary}33`}}>
                <div style={{fontWeight:800,color:C.primary,fontSize:13,marginBottom:6}}>🧮 Estimación para tu turno</div>
                {pricing.descuentos.length > 0 && pricing.descuentos.map((d,i)=>(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:12,color:C.soft}}>
                    <span>{d.label}</span><span style={{color:C.secondary}}>{formatPeso(d.monto)}</span>
                  </div>
                ))}
                <div style={{display:"flex",justifyContent:"space-between",fontSize:15,fontWeight:900,color:C.dark,marginTop:6,paddingTop:6,borderTop:`1px solid ${C.light}`}}>
                  <span>Total estimado</span>
                  <span style={{color:C.primary}}>{formatPeso(pricing.subtotal)}</span>
                </div>
                <div style={{fontSize:10,color:C.soft,marginTop:4}}>* El precio final puede variar según historial confirmado</div>
              </div>
            )}

            {/* 2 perros — solo en modo paseo simple */}
            {service==="paseo" && (
              <div className="card" style={{padding:18,marginBottom:14}}>
                <div style={{fontWeight:800,color:C.primary,fontSize:13,marginBottom:10}}>🐕 ¿Cuántos perros?</div>
                <div className="toggle-bar">
                  <div className={`tog-opt ${!twoDogs?"act":""}`} onClick={()=>setTwoDogs(false)}>1 perro</div>
                  <div className={`tog-opt ${twoDogs?"act":""}`}  onClick={()=>setTwoDogs(true)}>2 perros (mismo dueño)</div>
                </div>
                {twoDogs && (
                  <div style={{marginTop:10,fontSize:12,color:C.soft,background:`${C.accent}15`,borderRadius:10,padding:"8px 12px"}}>
                    💡 Podés traer hasta 2 perros tuyos en el mismo turno
                  </div>
                )}
              </div>
            )}

            {/* Paseo compartido */}
            {service==="paseo" && !twoDogs && (
              <div className="card" style={{padding:18,marginBottom:22}}>
                <div style={{display:"flex",alignItems:"flex-start",gap:12}}>
                  <div className={`chk ${form.sharedOk?"on":""}`} onClick={()=>setForm(f=>({...f,sharedOk:!f.sharedOk}))}>
                    {form.sharedOk && <span style={{fontSize:12,fontWeight:900,color:C.white}}>✓</span>}
                  </div>
                  <div>
                    <div style={{fontWeight:800,fontSize:13,color:C.primary,marginBottom:3}}>¿Aceptás paseo compartido?</div>
                    <div style={{fontSize:12,color:C.soft,lineHeight:1.5}}>
                      Si vivís cerca de otro cliente y los perros son compatibles, podemos hacer el paseo juntos
                    </div>
                  </div>
                </div>
              </div>
            )}

            {service==="paseo" && twoDogs && (
              <div style={{marginBottom:22,padding:"12px 16px",borderRadius:14,background:`${C.light}`,border:`1px solid ${C.soft}44`,fontSize:12,color:C.soft}}>
                ℹ️ El paseo compartido no está disponible cuando traés 2 perros.
              </div>
            )}

            <div style={{textAlign:"center"}}>
              <button className="btn-p" onClick={()=>setStep(2)}>Elegir fecha →</button>
            </div>
          </div>
        )}

        {/* STEP 2: Calendario */}
        {step===2 && (
          <div className="ani">
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:18}}>
              <button className="btn-s" style={{padding:"7px 12px"}} onClick={()=>setStep(1)}>‹</button>
              <h2 style={{fontFamily:"'Fredoka One',cursive",fontSize:24,color:C.dark}}>Elegí la fecha 📅</h2>
            </div>

            <div className="card" style={{padding:18,marginBottom:14}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                <button className="btn-s" style={{padding:"5px 12px"}} onClick={()=>{ if(viewMonth===0){setViewMonth(11);setViewYear(y=>y-1);}else setViewMonth(m=>m-1); }}>‹</button>
                <span style={{fontFamily:"'Fredoka One',cursive",fontSize:17,color:C.dark}}>{MONTHS_ES[viewMonth]} {viewYear}</span>
                <button className="btn-s" style={{padding:"5px 12px"}} onClick={()=>{ if(viewMonth===11){setViewMonth(0);setViewYear(y=>y+1);}else setViewMonth(m=>m+1); }}>›</button>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:6}}>
                {DAYS_ES.map(d=><div key={d} style={{textAlign:"center",fontSize:10,fontWeight:800,color:C.soft,padding:"3px 0"}}>{d}</div>)}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2}}>
                {Array(firstDay).fill(null).map((_,i)=><div key={`e${i}`} className="day empty"/>)}
                {Array(daysInMonth).fill(null).map((_,i)=>{
                  const day=i+1;
                  const d=formatDate(viewYear,viewMonth,day);
                  const bkCount=allBookings.filter(b=>b.date===d).length;
                  const weekend = isWeekend(day);
                  return (
                    <div key={day}
                      className={`day ${isPast(day)||weekend?"past":""} ${isToday(day)?"today":""} ${selectedDate===d?"sel-d":""} ${bkCount>0&&!isPast(day)&&!weekend?"has-b":""}`}
                      style={weekend?{opacity:.2,cursor:"not-allowed"}:{}}
                      onClick={()=>{ if(isPast(day)||weekend)return; setSelectedDate(d); setSelectedTime(null); setSharedMatch(null); setStep(3); }}
                    >{day}</div>
                  );
                })}
              </div>
              <div style={{marginTop:12,display:"flex",gap:16,fontSize:11,color:C.soft}}>
                <span>🟣 Hoy</span>
                <span style={{color:C.accent}}>● Tiene turnos</span>
                <span style={{opacity:.4}}>No disponible: sáb/dom</span>
              </div>
            </div>

            {/* Modo reprogramación por lluvia */}
            <div style={{marginBottom:14,padding:"12px 16px",borderRadius:14,background:rainMode?`${C.secondary}18`:C.light,border:`1px solid ${rainMode?C.secondary:C.soft}44`,display:"flex",alignItems:"center",gap:12}}>
              <div className={`chk ${rainMode?"on":""}`} style={rainMode?{background:C.secondary,borderColor:C.secondary}:{}} onClick={()=>setRainMode(r=>!r)}>
                {rainMode && <span style={{fontSize:12,fontWeight:900,color:C.white}}>✓</span>}
              </div>
              <div>
                <div style={{fontWeight:800,fontSize:13,color:rainMode?C.secondary:C.dark}}>🌧️ Reprogramación por lluvia</div>
                <div style={{fontSize:11,color:C.soft}}>Habilita turnos el sábado a la mañana (8:00–11:00)</div>
              </div>
            </div>

            <div style={{padding:"12px 16px",borderRadius:14,background:`${C.accent}15`,border:`1px solid ${C.accent}44`,fontSize:12,color:C.dark}}>
              🕐 <strong style={{color:C.accent}}>Horarios {SCHEDULES[ACTIVE_SEASON].label}:</strong>{" "}
              {SCHEDULES[ACTIVE_SEASON].blocks.map(b=>`${b.label}: ${b.from}–${b.to}`).join(" · ")}
            </div>
          </div>
        )}

        {/* STEP 3: Horario */}
        {step===3 && (
          <div className="ani">
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
              <button className="btn-s" style={{padding:"7px 12px"}} onClick={()=>setStep(2)}>‹</button>
              <h2 style={{fontFamily:"'Fredoka One',cursive",fontSize:24,color:C.dark}}>Elegí el horario 🕐</h2>
            </div>
            <p style={{color:C.soft,fontSize:12,marginBottom:4,marginLeft:46}}>
              📅 {selectedDate?.split("-").reverse().join("/")} · {serviceObj?.icon} {serviceObj?.label} · ⏱ {service==="doble"?`${duration}+${duration2} min`:(durationObj?.label)}
            </p>
            <p style={{color:C.soft,fontSize:11,marginBottom:16,marginLeft:46,opacity:.7}}>
              🚶 Buffer entre turnos: ~20 min de traslado
            </p>

            {/* Leyenda slots compartidos */}
            <div style={{marginBottom:14,padding:"10px 14px",borderRadius:12,background:`${C.accent}15`,border:`1px solid ${C.accent}44`,fontSize:12,color:C.dark}}>
              <span style={{fontWeight:800,color:C.accent}}>🟢 Verde</span> = turno disponible para compartir con otro cliente
            </div>

            {SCHEDULES[ACTIVE_SEASON].blocks.map(block=>{
              const blockSlots = slotsWithStatus.filter(s=>{
                const m=timeToMin(s.time);
                return m>=timeToMin(block.from) && m<=timeToMin(block.to);
              });
              const avail = blockSlots.filter(s=>s.status==="available"||s.status==="shared").length;
              return (
                <div key={block.label} style={{marginBottom:22}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                    <div style={{fontSize:12,fontWeight:800,color:C.soft,letterSpacing:.8}}>
                      ☀️ {block.label.toUpperCase()} · {block.from}–{block.to}
                    </div>
                    <span style={{fontSize:11,color:C.accent,fontWeight:800}}>{avail} disponibles</span>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
                    {blockSlots.map(({time,status,sharedBooking})=>(
                      <div key={time}
                        className={`slot ${status==="blocked"?"sl-b":""} ${status==="out"?"sl-o":""} ${status==="shared"?"sl-shared":""} ${selectedTime===time?"sl-sel":""}`}
                        onClick={()=>handleTimeSelect(time, status, sharedBooking)}
                      >
                        <div>{time}</div>
                        {status==="blocked" && <div style={{fontSize:9,marginTop:1,opacity:.6}}>ocupado</div>}
                        {status==="shared" && <div style={{fontSize:9,marginTop:1,color:C.accent,fontWeight:800}}>compartir</div>}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Info paseo doble */}
            {service==="doble" && selectedTime && (
              <div style={{marginBottom:14,padding:"12px 16px",borderRadius:14,background:`${C.secondary}18`,border:`1px solid ${C.secondary}44`,fontSize:13,color:C.dark}}>
                🐕 <strong>Paseo 1:</strong> {selectedTime} → {dobleEndTime} ({duration} min)<br/>
                🐕 <strong>Paseo 2:</strong> {dobleEndTime} → {minToTime(timeToMin(dobleEndTime||"00:00")+duration2)} ({duration2} min)
              </div>
            )}

            {/* Info paseo compartido matcheado */}
            {sharedMatch && selectedTime && (
              <div style={{marginBottom:14,padding:"14px 16px",borderRadius:14,background:`${C.accent}15`,border:`1px solid ${C.accent}55`,fontSize:13,color:C.dark}}>
                <div style={{fontWeight:800,color:C.accent,marginBottom:6}}>🐾 ¡Hay un turno compartido disponible!</div>
                <div>Tu paseo sería junto a <strong>{sharedMatch.dog}</strong> ({sharedMatch.breed || "raza no especificada"}), con quien vive en <strong>{sharedMatch.barrio}</strong>.</div>
                <div style={{marginTop:6,fontSize:12,color:C.soft}}>Si aceptás, te avisamos cuando se confirme el match 🌿</div>
              </div>
            )}

            {selectedTime && (
              <div style={{textAlign:"center",marginTop:4}}>
                <button className="btn-p" onClick={()=>setStep(4)}>Continuar con {selectedTime} →</button>
              </div>
            )}
          </div>
        )}

        {/* STEP 4: Formulario — requiere login */}
        {step===4 && (
          <div className="ani">
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:18}}>
              <button className="btn-s" style={{padding:"7px 12px"}} onClick={()=>setStep(3)}>‹</button>
              <h2 style={{fontFamily:"'Fredoka One',cursive",fontSize:24,color:C.dark}}>Tus datos 🐾</h2>
            </div>

            {/* MURO DE LOGIN */}
            {!authUser ? (
              <div style={{textAlign:"center",padding:"30px 20px"}}>
                <div style={{fontSize:54,marginBottom:14}}>🔐</div>
                <h3 style={{fontFamily:"'Fredoka One',cursive",fontSize:22,color:C.primary,marginBottom:8}}>¡Ya casi está!</h3>
                <p style={{color:C.soft,fontSize:14,marginBottom:24,lineHeight:1.6}}>
                  Para confirmar tu turno necesitás ingresar o crear una cuenta. Es rápido y gratis 🐾
                </p>
                <div style={{display:"flex",flexDirection:"column",gap:10,maxWidth:280,margin:"0 auto"}}>
                  <button className="btn-p" onClick={()=>setAuthView("register")}>🎉 Crear cuenta (10% desc.)</button>
                  <button className="btn-s" style={{padding:"12px 0",fontSize:14}} onClick={()=>setAuthView("login")}>🔑 Ya tengo cuenta</button>
                </div>
                <p style={{marginTop:20,fontSize:11,color:C.soft}}>Tu servicio, duración y horario ya están guardados 👆</p>
              </div>
            ) : (
              <>
                <div className="card" style={{padding:14,marginBottom:20,display:"flex",gap:12,alignItems:"center"}}>
                  <span style={{fontSize:26}}>{serviceObj?.icon}</span>
                  <div>
                    <div style={{fontWeight:800,color:serviceObj?.color,fontSize:14}}>{serviceObj?.label} · {service==="doble"?`${duration}+${duration2} min`:(durationObj?.label)}</div>
                    <div style={{fontSize:12,color:C.soft}}>📅 {selectedDate?.split("-").reverse().join("/")} a las {selectedTime}</div>
                  </div>
                </div>

                <div style={{marginBottom:18,padding:"12px 16px",borderRadius:14,background:`${C.light}`,border:`1px solid ${C.soft}44`,fontSize:12,color:C.soft,lineHeight:1.6}}>
                  <strong style={{color:C.primary}}>📋 Política de cancelación:</strong> Las cancelaciones deben realizarse con al menos <strong>12 horas de anticipación</strong>. En caso contrario se abona el 50% del valor del paseo. Se evalúan excepciones por emergencias o urgencias.
                </div>

                <div style={{display:"grid",gap:13}}>
                  <div>
                    <label className="lbl">TU NOMBRE *</label>
                    <input className="inp" placeholder="Ej: María González" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/>
                  </div>
                  <div>
                    <label className="lbl">TELÉFONO / WHATSAPP *</label>
                    <input className="inp" placeholder="Ej: 358 123-4567" value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))}/>
                  </div>
                  <div>
                    <label className="lbl">BARRIO (Río Cuarto) *</label>
                    <select className="inp" value={form.barrio} onChange={e=>setForm(f=>({...f,barrio:e.target.value}))}>
                      <option value="">Seleccioná tu barrio...</option>
                      {BARRIOS.map(b=><option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                    <div>
                      <label className="lbl">{(twoDogs||service==="doble")?"PERRO 1 - NOMBRE *":"NOMBRE DEL PERRO *"}</label>
                      <input className="inp" placeholder="Ej: Rocky" value={form.dog} onChange={e=>setForm(f=>({...f,dog:e.target.value}))}/>
                    </div>
                    <div>
                      <label className="lbl">{(twoDogs||service==="doble")?"PERRO 1 - RAZA":"RAZA"}</label>
                      <input className="inp" placeholder="Ej: Labrador" value={form.breed} onChange={e=>setForm(f=>({...f,breed:e.target.value}))}/>
                    </div>
                  </div>
                  {(twoDogs || service==="doble") && (
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                      <div>
                        <label className="lbl">PERRO 2 - NOMBRE *</label>
                        <input className="inp" placeholder="Nombre del segundo perro" value={form.dog2} onChange={e=>setForm(f=>({...f,dog2:e.target.value}))}/>
                      </div>
                      <div>
                        <label className="lbl">PERRO 2 - RAZA</label>
                        <input className="inp" placeholder="Ej: Beagle" value={form.breed2} onChange={e=>setForm(f=>({...f,breed2:e.target.value}))}/>
                      </div>
                    </div>
                  )}
                  {service==="paseo" && !twoDogs && (
                    <div style={{padding:"13px 16px",borderRadius:14,background:`${C.accent}10`,border:`1px solid ${C.accent}44`}}>
                      <div style={{display:"flex",alignItems:"center",gap:11}}>
                        <div className={`chk ${form.sharedOk?"on":""}`} onClick={()=>setForm(f=>({...f,sharedOk:!f.sharedOk}))}>
                          {form.sharedOk && <span style={{fontSize:12,fontWeight:900,color:C.white}}>✓</span>}
                        </div>
                        <div style={{fontSize:13,fontWeight:700,color:C.dark}}>Acepto paseo compartido con otro perro (si hay compatibilidad y vivo cerca)</div>
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
                    disabled={!form.name||!form.phone||!form.dog||!form.barrio||((twoDogs||service==="doble")&&!form.dog2)}
                    onClick={submitBooking}
                  >🐾 Confirmar Turno</button>
                </div>
              </>
            )}
          </div>
        )}

        {/* STEP 5: Confirmación */}
        {step===5 && (
          <div className="ani" style={{textAlign:"center"}}>
            <div style={{fontSize:72,marginBottom:12}} className="pop-anim">🎉</div>
            <h2 style={{fontFamily:"'Fredoka One',cursive",fontSize:30,color:C.primary,marginBottom:6}}>¡Turno confirmado!</h2>
            <p style={{color:C.soft,marginBottom:26,fontSize:14}}>
              Te esperamos con {form.dog}{(twoDogs||service==="doble")&&form.dog2?` y ${form.dog2}`:""} 🐾
            </p>

            <div className="card" style={{padding:22,textAlign:"left",marginBottom:16}}>
              {[
                ["Servicio",  `${serviceObj?.icon} ${serviceObj?.label}`],
                ["Duración",  service==="doble"?`${duration} min + ${duration2} min`:(durationObj?.label)],
                ["Fecha",     selectedDate?.split("-").reverse().join("/")],
                ["Horario",   selectedTime],
                ...(service==="doble"?[["2do paseo", dobleEndTime]]:[]),
                ["Cliente",   form.name],
                ["Teléfono",  form.phone],
                ["Barrio",    form.barrio],
                ["Perro 1",   `${form.dog}${form.breed?` (${form.breed})`:""}`],
                ...((twoDogs||service==="doble")&&form.dog2?[["Perro 2", `${form.dog2}${form.breed2?` (${form.breed2})`:""}`]]:[]),
                ...(service==="paseo"&&!twoDogs&&form.sharedOk?[["Paseo compartido","✅ Acepta"]]:[]),
                ...(sharedMatch?[["Match compartido",`🐾 Con ${sharedMatch.dog} (${sharedMatch.barrio})`]]:[]),
                ...(form.notes?[["Notas",form.notes]]:[]),
              ].map(([k,v])=>(
                <div key={k} style={{display:"flex",justifyContent:"space-between",gap:12,borderBottom:`1px solid ${C.light}`,padding:"10px 0"}}>
                  <span style={{color:C.soft,fontSize:12,fontWeight:700}}>{k}</span>
                  <span style={{fontWeight:800,fontSize:13,textAlign:"right",maxWidth:"62%",color:C.dark}}>{v}</span>
                </div>
              ))}
            </div>

            {/* Resumen de precio */}
            <div className="card" style={{padding:18,textAlign:"left",marginBottom:16,border:`1px solid ${C.primary}44`}}>
              <div style={{fontWeight:800,color:C.primary,fontSize:13,marginBottom:10}}>💰 Resumen de pago</div>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:13,padding:"6px 0",borderBottom:`1px solid ${C.light}`}}>
                <span style={{color:C.soft}}>Paseo base</span>
                <span style={{fontWeight:700,color:C.dark}}>{formatPeso(pricing.precio1)}</span>
              </div>
              {pricing.precio2 > 0 && (
                <div style={{display:"flex",justifyContent:"space-between",fontSize:13,padding:"6px 0",borderBottom:`1px solid ${C.light}`}}>
                  <span style={{color:C.soft}}>2do perro (con desc.)</span>
                  <span style={{fontWeight:700,color:C.dark}}>{formatPeso(pricing.precio2)}</span>
                </div>
              )}
              {pricing.descuentos.map((d,i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"5px 0",borderBottom:`1px solid ${C.light}`}}>
                  <span style={{color:C.accent}}>{d.label}</span>
                  <span style={{fontWeight:700,color:C.accent}}>{formatPeso(d.monto)}</span>
                </div>
              ))}
              <div style={{display:"flex",justifyContent:"space-between",fontSize:16,fontWeight:900,padding:"10px 0 0"}}>
                <span style={{color:C.dark}}>Total</span>
                <span style={{color:C.primary}}>{formatPeso(pricing.subtotal)}</span>
              </div>
            </div>

            {/* Recordatorio política cancelación */}
            <div style={{marginBottom:20,padding:"12px 16px",borderRadius:14,background:C.light,border:`1px solid ${C.soft}44`,fontSize:12,color:C.soft,textAlign:"left",lineHeight:1.6}}>
              ⚠️ Recordá: cancelaciones con menos de 12hs de anticipación abonan el 50% del paseo.
            </div>

            <button className="btn-p" onClick={reset}>+ Agendar otro turno</button>
          </div>
        )}
      </div>

      {/* ADMIN MODAL */}
      {showAdminModal && !adminView && (
        <div style={{position:"fixed",inset:0,background:"rgba(58,44,77,.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,padding:20}}>
          <div className="card ani" style={{padding:30,width:"100%",maxWidth:360}}>
            <h3 style={{fontFamily:"'Fredoka One',cursive",fontSize:20,marginBottom:18,textAlign:"center",color:C.dark}}>🔐 Panel Admin</h3>
            <input className="inp" type="password" placeholder="Contraseña" value={adminPass}
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

      {/* ADMIN PANEL */}
      {adminView && (
        <div style={{position:"fixed",inset:0,background:C.bg,zIndex:200,overflowY:"auto",padding:"20px 16px 40px"}}>
          <div style={{maxWidth:560,margin:"0 auto"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
              <div style={{fontFamily:"'Fredoka One',cursive",fontSize:24,color:C.primary}}>⚙️ Panel Admin</div>
              <button className="btn-s" onClick={()=>{setAdminView(false);setAdminPass("");}}>✕ Cerrar</button>
            </div>

            <div className="toggle-bar" style={{marginBottom:22}}>
              {[["turnos","📋 Turnos"],["horarios","🕐 Horarios & Zonas"]].map(([id,label])=>(
                <div key={id} className={`tog-opt ${adminTab===id?"act":""}`} onClick={()=>setAdminTab(id)}>{label}</div>
              ))}
            </div>

            {adminTab==="turnos" && (
              <div>
                <div style={{color:C.soft,fontSize:12,marginBottom:14}}>{allBookings.length} turno(s) registrados</div>
                {allBookings.length===0 && (
                  <div style={{textAlign:"center",color:C.soft,padding:40}}>
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
                        <span style={{color:C.soft,fontSize:12}}>{b.date?.split("-").reverse().join("/")} · {b.time}</span>
                      </div>
                      <div style={{fontSize:12,color:C.soft,marginBottom:3}}>
                        ⏱ {b.duration} min · 📍 {b.barrio}
                        {!b.dog2&&b.sharedOk && <span style={{color:C.accent,marginLeft:8,fontSize:11}}>✓ Compartido OK</span>}
                      </div>
                      <div style={{fontSize:12,color:C.dark}}>
                        👤 {b.name} · 📱 {b.phone}
                      </div>
                      <div style={{fontSize:12,color:C.dark}}>
                        🐶 {b.dog}{b.breed?` (${b.breed})`:""}{b.dog2?` + ${b.dog2}${b.breed2?` (${b.breed2})`:""}`:""} 
                      </div>
                      {b.notes && <div style={{fontSize:11,color:C.soft,marginTop:4}}>💬 {b.notes}</div>}
                    </div>
                  );
                })}
              </div>
            )}

            {adminTab==="horarios" && (
              <div>
                <div style={{color:C.soft,fontSize:13,marginBottom:18,lineHeight:1.7}}>
                  Temporada activa: <strong style={{color:C.primary}}>{SCHEDULES[ACTIVE_SEASON].label}</strong>.
                  Para cambiar, modificá <code style={{color:C.accent,background:`${C.accent}18`,padding:"1px 7px",borderRadius:6}}>ACTIVE_SEASON</code> en el código.
                </div>
                {Object.entries(SCHEDULES).map(([key,sch])=>(
                  <div key={key} className="card" style={{padding:18,marginBottom:14,borderColor:key===ACTIVE_SEASON?`${C.primary}55`:C.light}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                      <span style={{fontFamily:"'Fredoka One',cursive",fontSize:17,color:C.dark}}>{sch.label}</span>
                      {key===ACTIVE_SEASON && <span style={{display:"inline-block",borderRadius:20,padding:"2px 10px",fontSize:10,fontWeight:800,background:`${C.primary}18`,color:C.primary}}>ACTIVA</span>}
                    </div>
                    {sch.blocks.map(b=>(
                      <div key={b.label} style={{display:"flex",justifyContent:"space-between",padding:"8px 12px",borderRadius:10,background:C.light,marginBottom:7}}>
                        <span style={{fontWeight:700,color:C.soft,fontSize:13}}>{b.label}</span>
                        <span style={{fontWeight:800,color:C.primary,fontSize:13}}>{b.from} – {b.to}</span>
                      </div>
                    ))}
                    <div style={{fontSize:11,color:C.soft,marginTop:6}}>Slots cada 15 min · Buffer entre turnos: 20 min</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* AUTH MODAL — Login / Register */}
      {authView === "login" || authView === "register" ? (
        <div style={{position:"fixed",inset:0,background:"rgba(58,44,77,.45)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,padding:20}}>
          <div className="card ani" style={{padding:30,width:"100%",maxWidth:380}}>
            <div style={{textAlign:"center",marginBottom:20}}>
              <div style={{fontSize:36,marginBottom:6}}>🐾</div>
              <h3 style={{fontFamily:"'Fredoka One',cursive",fontSize:22,color:C.primary}}>
                {authView==="login" ? "¡Bienvenida de vuelta!" : "Crear cuenta"}
              </h3>
              <p style={{fontSize:12,color:C.soft,marginTop:4}}>
                {authView==="login" ? "Ingresá para ver tus paseos y descuentos" : "Registrate para acceder a tus descuentos"}
              </p>
            </div>

            {/* Google */}
            <button onClick={handleGoogle} style={{width:"100%",padding:"11px 0",borderRadius:12,border:`1.5px solid ${C.light}`,background:C.bgCard,cursor:"pointer",fontFamily:"'Nunito',sans-serif",fontWeight:800,fontSize:14,color:C.dark,display:"flex",alignItems:"center",justifyContent:"center",gap:10,marginBottom:14,transition:"background .2s"}}
              onMouseEnter={e=>e.target.style.background=C.light} onMouseLeave={e=>e.target.style.background=C.bgCard}>
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width={18} height={18} alt="Google"/>
              Continuar con Google
            </button>

            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
              <div style={{flex:1,height:1,background:C.light}}/>
              <span style={{fontSize:11,color:C.soft,fontWeight:700}}>o con email</span>
              <div style={{flex:1,height:1,background:C.light}}/>
            </div>

            <div style={{display:"grid",gap:10}}>
              {authView==="register" && (
                <input className="inp" placeholder="Tu nombre completo" value={authName} onChange={e=>setAuthName(e.target.value)}/>
              )}
              {authView==="register" && (
                <input className="inp" type="tel" placeholder="WhatsApp (Ej: 358 123-4567)" value={authPhone} onChange={e=>setAuthPhone(e.target.value)}/>
              )}
              <input className="inp" type="email" placeholder="Email" value={authEmail} onChange={e=>setAuthEmail(e.target.value)}/>
              <input className="inp" type="password" placeholder="Contraseña" value={authPass} onChange={e=>setAuthPass(e.target.value)}
                onKeyDown={e=>{ if(e.key==="Enter") authView==="login"?handleLogin():handleRegister(); }}/>
            </div>

            {authError && (
              <div style={{marginTop:10,padding:"8px 12px",borderRadius:10,background:`${C.secondary}18`,border:`1px solid ${C.secondary}44`,fontSize:12,color:C.secondary,fontWeight:700}}>
                ⚠️ {authError}
              </div>
            )}

            {/* Descuento nuevo cliente */}
            {authView==="register" && (
              <div style={{marginTop:10,padding:"8px 12px",borderRadius:10,background:`${C.accent}15`,border:`1px solid ${C.accent}44`,fontSize:12,color:C.dark}}>
                🎉 <strong>¡10% de descuento</strong> en tu primer paseo al registrarte!
              </div>
            )}

            <button className="btn-p" style={{width:"100%",marginTop:14,padding:"12px 0"}}
              disabled={authLoading}
              onClick={authView==="login"?handleLogin:handleRegister}>
              {authLoading ? "Cargando..." : authView==="login" ? "Ingresar" : "Crear cuenta"}
            </button>

            <div style={{textAlign:"center",marginTop:14,fontSize:12,color:C.soft}}>
              {authView==="login" ? (
                <>¿No tenés cuenta? <span style={{color:C.primary,fontWeight:800,cursor:"pointer"}} onClick={()=>{setAuthView("register");setAuthError("");}}>Registrate</span></>
              ) : (
                <>¿Ya tenés cuenta? <span style={{color:C.primary,fontWeight:800,cursor:"pointer"}} onClick={()=>{setAuthView("login");setAuthError("");}}>Ingresá</span></>
              )}
            </div>

            <div style={{textAlign:"center",marginTop:10}}>
              <span style={{fontSize:12,color:C.soft,cursor:"pointer"}} onClick={()=>{setAuthView(null);setAuthError("");}}>✕ Cancelar</span>
            </div>
          </div>
        </div>
      ) : null}

      {/* PERFIL DE USUARIO */}
      {authView==="profile" && authUser && (
        <div style={{position:"fixed",inset:0,background:C.bg,zIndex:200,overflowY:"auto",padding:"20px 16px 40px"}}>
          <div style={{maxWidth:480,margin:"0 auto"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
              <div style={{fontFamily:"'Fredoka One',cursive",fontSize:24,color:C.primary}}>👤 Mi perfil</div>
              <button className="btn-s" onClick={()=>setAuthView(null)}>✕ Cerrar</button>
            </div>

            {/* Info del usuario */}
            <div className="card" style={{padding:22,marginBottom:14}}>
              <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:16}}>
                <div style={{width:54,height:54,borderRadius:"50%",background:`linear-gradient(135deg,${C.primary},${C.secondary})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,color:C.white,flexShrink:0}}>
                  {authUser.user_metadata?.full_name?.[0]?.toUpperCase() || "🐾"}
                </div>
                <div>
                  <div style={{fontWeight:900,fontSize:17,color:C.dark}}>{authUser.user_metadata?.full_name || "Sin nombre"}</div>
                  <div style={{fontSize:12,color:C.soft}}>{authUser.email}</div>
                  {authUser.user_metadata?.phone && <div style={{fontSize:12,color:C.soft}}>📱 {authUser.user_metadata.phone}</div>}
                  <div style={{fontSize:11,color:C.soft,marginTop:3}}>
                    🗓 Cliente desde {new Date(authUser.created_at).toLocaleDateString("es-AR",{day:"2-digit",month:"long",year:"numeric"})}
                  </div>
                </div>
              </div>

              {/* Descuentos vigentes */}
              <div style={{fontWeight:800,color:C.primary,fontSize:12,marginBottom:8,letterSpacing:.5}}>🏷️ DESCUENTOS VIGENTES</div>
              <div style={{display:"grid",gap:7}}>
                {isNewClient && (
                  <div style={{padding:"10px 14px",borderRadius:12,background:`${C.accent}18`,border:`1px solid ${C.accent}44`,fontSize:13,color:C.dark}}>
                    🎉 <strong style={{color:C.accent}}>10% — Primer paseo</strong> · ¡Sos clienta nueva!
                  </div>
                )}
                {!isNewClient && (weeklyCount >= 2 || monthlyCount >= 11) && (
                  <div style={{padding:"10px 14px",borderRadius:12,background:`${C.primary}12`,border:`1px solid ${C.primary}33`,fontSize:13,color:C.dark}}>
                    ⭐ <strong style={{color:C.primary}}>15% — Cliente frecuente</strong> · {weeklyCount >= 2 ? `${weeklyCount+1}+ paseos esta semana` : `${monthlyCount+1}+ paseos este mes`}
                  </div>
                )}
                <div style={{padding:"10px 14px",borderRadius:12,background:`${C.secondary}12`,border:`1px solid ${C.secondary}33`,fontSize:13,color:C.dark}}>
                  🐕 <strong style={{color:C.secondary}}>20% — 2do perro</strong> · Siempre aplicado al traer 2 perros
                </div>
                {!isNewClient && weeklyCount < 2 && monthlyCount < 11 && (
                  <div style={{padding:"8px 14px",borderRadius:12,background:C.light,fontSize:11,color:C.soft}}>
                    📊 Paseos esta semana: <strong>{weeklyCount}</strong> · Este mes: <strong>{monthlyCount}</strong>
                    <br/>Con 3+/semana o 12+/mes obtenés 15% de descuento
                  </div>
                )}
              </div>
            </div>

            {/* Mis perros (del último turno) */}
            {clientBookings.length > 0 && (() => {
              const ultimo = clientBookings[clientBookings.length - 1];
              return (
                <div className="card" style={{padding:18,marginBottom:14}}>
                  <div style={{fontWeight:800,color:C.primary,fontSize:12,marginBottom:10,letterSpacing:.5}}>🐶 MIS PERROS</div>
                  <div style={{display:"grid",gap:8}}>
                    <div style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",borderRadius:12,background:C.light}}>
                      <span style={{fontSize:22}}>🐕</span>
                      <div>
                        <div style={{fontWeight:800,fontSize:14,color:C.dark}}>{ultimo.dog}</div>
                        {ultimo.breed && <div style={{fontSize:12,color:C.soft}}>{ultimo.breed}</div>} 
                        {ultimo.notes && <div style={{fontSize:11,color:C.soft,marginTop:2}}>📝 {ultimo.notes}</div>}
                      </div>
                    </div>
                    {ultimo.dog2 && (
                      <div style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",borderRadius:12,background:C.light}}>
                        <span style={{fontSize:22}}>🐕</span>
                        <div>
                          <div style={{fontWeight:800,fontSize:14,color:C.dark}}>{ultimo.dog2}</div>
                          {ultimo.breed2 && <div style={{fontSize:12,color:C.soft}}>{ultimo.breed2}</div>}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Historial de paseos */}
            <div style={{fontFamily:"'Fredoka One',cursive",fontSize:18,color:C.dark,marginBottom:12}}>🦮 Mis paseos</div>
            {clientBookings.length === 0 ? (
              <div style={{textAlign:"center",padding:36,color:C.soft}}>
                <div style={{fontSize:40,marginBottom:10}}>🐾</div>
                <div style={{fontWeight:700}}>Todavía no tenés paseos agendados</div>
                <button className="btn-p" style={{marginTop:16}} onClick={()=>setAuthView(null)}>¡Agendá tu primer turno!</button>
              </div>
            ) : (
              clientBookings.slice().reverse().map(b=>{
                const svc = SERVICES.find(s=>s.id===b.service);
                const dur = DURATIONS.find(d=>d.value===b.duration);
                return (
                  <div key={b.id} className="bk-row" style={{borderLeftColor:svc?.color}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                      <span style={{fontWeight:800,color:svc?.color,fontSize:13}}>{svc?.icon} {svc?.label}</span>
                      <span style={{color:C.soft,fontSize:12}}>{b.date?.split("-").reverse().join("/")} · {b.time}</span>
                    </div>
                    <div style={{fontSize:12,color:C.dark,marginBottom:2}}>
                      🐶 <strong>{b.dog}</strong>{b.breed?` (${b.breed})`:""}{b.dog2?` + ${b.dog2}${b.breed2?` (${b.breed2})`:""}`:""} 
                    </div>
                    <div style={{fontSize:12,color:C.soft}}>⏱ {b.duration} min · 📍 {b.barrio}</div>
                    {b.notes && <div style={{fontSize:11,color:C.soft,marginTop:3}}>💬 {b.notes}</div>}
                  </div>
                );
              })
            )}

            <div style={{marginTop:22,textAlign:"center"}}>
              <button className="btn-s" style={{color:C.secondary,borderColor:`${C.secondary}55`}} onClick={handleLogout}>
                🚪 Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}