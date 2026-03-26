import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";

/* ─── Global styles & animations ─────────────────────────────────────────── */
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }

  @keyframes float-up   { 0%,100%{ transform:translateY(0) rotate(0deg);  } 50%{ transform:translateY(-20px) rotate(2deg);  } }
  @keyframes float-down { 0%,100%{ transform:translateY(0) rotate(0deg);  } 50%{ transform:translateY(-14px) rotate(-2deg); } }

  @keyframes pulse-orb  {
    0%,100%{ opacity:0.45; transform:scale(1);    }
    50%    { opacity:0.85; transform:scale(1.12); }
  }
  @keyframes shimmer {
    0%  { background-position: -300% center; }
    100%{ background-position:  300% center; }
  }
  @keyframes fade-up {
    from{ opacity:0; transform:translateY(20px); }
    to  { opacity:1; transform:translateY(0);    }
  }
  @keyframes scan-line {
    0%  { top:-2px; opacity:0.6; }
    50% { opacity:1;             }
    100%{ top:100%; opacity:0;   }
  }
  @keyframes ticker-scroll {
    from{ transform:translateX(0);     }
    to  { transform:translateX(-50%);  }
  }
  @keyframes spin-ring {
    from{ transform:rotate(0deg);   }
    to  { transform:rotate(360deg); }
  }
  @keyframes bar-pop {
    from{ height:0; }
  }
  @keyframes count-up {
    from{ opacity:0; transform:translateY(8px); }
    to  { opacity:1; transform:translateY(0);   }
  }
  @keyframes glow-border {
    0%,100%{ border-color:rgba(68,61,203,0.35); box-shadow:0 0 0 rgba(68,61,203,0); }
    50%    { border-color:rgba(68,61,203,0.7);  box-shadow:0 0 30px rgba(68,61,203,0.15); }
  }
  @keyframes city-flicker {
    0%,100%{ opacity:0.7; } 45%{ opacity:1; } 50%{ opacity:0.5; } 55%{ opacity:1; }
  }

  /* ── Inputs ──────────────────────────────────── */
  .l-input {
    width:100%; padding:13px 16px;
    border-radius:12px;
    border:1.5px solid rgba(255,255,255,0.08);
    background:rgba(255,255,255,0.04);
    color:#f0f0f0; font-size:14px; outline:none;
    font-family:'Inter',sans-serif;
    transition:border-color .2s,background .2s,box-shadow .2s;
  }
  .l-input::placeholder{ color:rgba(255,255,255,0.2); }
  .l-input:focus{
    border-color:rgba(68,61,203,0.65);
    background:rgba(68,61,203,0.05);
    box-shadow:0 0 0 3px rgba(68,61,203,0.1);
  }

  /* ── Buttons ─────────────────────────────────── */
  .btn-main{
    width:100%; padding:14px; border-radius:12px; border:none;
    background:linear-gradient(135deg,#443DCB 0%,#6D28D9 50%,#3730B8 100%);
    color:#fff; font-weight:700; font-size:14.5px; letter-spacing:.3px;
    cursor:pointer; font-family:'Inter',sans-serif;
    position:relative; overflow:hidden;
    transition:transform .15s,box-shadow .2s,opacity .2s;
    box-shadow:0 4px 28px rgba(68,61,203,0.4);
  }
  .btn-main::before{
    content:''; position:absolute; inset:0;
    background:linear-gradient(90deg,transparent 0%,rgba(255,255,255,0.15) 50%,transparent 100%);
    background-size:300% auto;
    animation:shimmer 2.5s linear infinite;
  }
  .btn-main:hover:not(:disabled){ transform:translateY(-2px); box-shadow:0 8px 36px rgba(68,61,203,0.5); opacity:.95; }
  .btn-main:active:not(:disabled){ transform:translateY(0); }
  .btn-main:disabled{ opacity:.4; cursor:not-allowed; }

  .btn-goog{
    width:100%; padding:13px; border-radius:12px;
    border:1.5px solid rgba(255,255,255,0.1);
    background:rgba(255,255,255,0.04);
    color:#d0d0d0; font-weight:600; font-size:13.5px;
    cursor:pointer; font-family:'Inter',sans-serif;
    display:flex; align-items:center; justify-content:center; gap:10px;
    transition:background .2s,border-color .2s,box-shadow .2s;
  }
  .btn-goog:hover:not(:disabled){
    background:rgba(255,255,255,0.07);
    border-color:rgba(255,255,255,0.2);
    box-shadow:0 2px 16px rgba(0,0,0,0.3);
  }
  .btn-goog:disabled{ opacity:.4; cursor:not-allowed; }

  /* ── Floating glass card ─────────────────────── */
  .glass-card{
    position:absolute;
    background:rgba(15,15,30,0.65);
    backdrop-filter:blur(20px);
    -webkit-backdrop-filter:blur(20px);
    border:1px solid rgba(255,255,255,0.1);
    border-radius:16px;
    padding:14px 18px;
    color:#fff;
    white-space:nowrap;
    box-shadow:0 8px 32px rgba(0,0,0,0.4);
  }

  /* ── Feature item ────────────────────────────── */
  .feat-item{
    display:flex; align-items:flex-start; gap:14px;
    animation:fade-up .5s ease forwards; opacity:0;
  }

  /* ── Ticker ──────────────────────────────────── */
  .ticker-track{ display:flex; gap:0; animation:ticker-scroll 22s linear infinite; }
  .ticker-track:hover{ animation-play-state:paused; }

  /* ── Responsive ──────────────────────────────── */
  @media(max-width:960px){
    .brand-panel{ display:none !important; }
    .form-side  { width:100% !important; justify-content:center !important; padding:32px 24px !important; }
  }
  @media(max-width:480px){
    .form-card  { padding:28px 20px !important; border-radius:20px !important; }
  }
`;

/* ─── Google icon ────────────────────────────────────────────────────────── */
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.1l6.7-6.7C35.8 2.5 30.3 0 24 0 14.7 0 6.7 5.4 2.7 13.3l7.8 6C12.4 13 17.8 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4 7.1-9.9 7.1-17z"/>
      <path fill="#FBBC05" d="M10.5 28.7c-.6-1.8-1-3.7-1-5.7s.4-3.9 1-5.7l-7.8-6C1 14.3 0 19 0 24s1 9.7 2.7 13.7l7.8-6z"/>
      <path fill="#34A853" d="M24 48c6.3 0 11.6-2.1 15.4-5.7l-7.5-5.8c-2.1 1.4-4.8 2.2-7.9 2.2-6.2 0-11.5-4.2-13.5-9.9l-7.8 6C6.7 42.6 14.7 48 24 48z"/>
    </svg>
  );
}

/* ─── Mini bar chart ─────────────────────────────────────────────────────── */
function MiniBarChart({ color = "#A78BFA" }) {
  const bars = [30, 50, 38, 70, 55, 82, 65, 90, 74, 100];
  return (
    <div style={{ display:"flex", alignItems:"flex-end", gap:3, height:38 }}>
      {bars.map((h,i) => (
        <div key={i} style={{
          width:5, height:`${h}%`, borderRadius:3,
          background: i >= bars.length - 3
            ? `linear-gradient(180deg, ${color}, ${color}88)`
            : `rgba(99,88,219,${0.15 + i*0.06})`,
          animation:`bar-pop .6s ease ${i*.05}s both`,
        }}/>
      ))}
    </div>
  );
}

/* ─── CSS donut chart ────────────────────────────────────────────────────── */
function DonutChart({ value = 73, size = 54, color = "#EA2227", label }) {
  const deg = (value / 100) * 360;
  return (
    <div style={{ display:"flex", alignItems:"center", gap:12 }}>
      <div style={{
        width:size, height:size, borderRadius:"50%", flexShrink:0,
        background:`conic-gradient(${color} ${deg}deg, rgba(255,255,255,0.08) 0deg)`,
        display:"flex", alignItems:"center", justifyContent:"center",
      }}>
        <div style={{
          width:size-14, height:size-14, borderRadius:"50%",
          background:"rgba(10,10,20,0.9)",
          display:"flex", alignItems:"center", justifyContent:"center",
          fontSize:13, fontWeight:800, color:"#fff",
        }}>{value}%</div>
      </div>
      <div>
        <div style={{ fontSize:10, color:"rgba(255,255,255,0.45)", marginBottom:2 }}>{label}</div>
        <div style={{ display:"flex", gap:3, alignItems:"center" }}>
          <div style={{ width:6, height:6, borderRadius:"50%", background:color }}/>
          <span style={{ fontSize:9, color:"rgba(255,255,255,0.3)" }}>vs last month</span>
        </div>
      </div>
    </div>
  );
}

/* ─── Ticker bar ─────────────────────────────────────────────────────────── */
const TICKER_ITEMS = [
  "🚀 AI Pipeline", "📈 600% Traffic Growth", "🔑 Keyword Clusters",
  "⚡ Core Web Vitals", "🏆 Competitor Intel", "🌍 Local SEO",
  "📊 Client Reports", "🤖 9 AI Agents", "✅ Schema Markup",
];
function Ticker() {
  const doubled = [...TICKER_ITEMS, ...TICKER_ITEMS];
  return (
    <div style={{ overflow:"hidden", borderBottom:"1px solid rgba(255,255,255,0.06)", paddingBottom:10, marginBottom:32 }}>
      <div className="ticker-track">
        {doubled.map((t, i) => (
          <span key={i} style={{ fontSize:11, color:"rgba(255,255,255,0.3)", marginRight:32, whiteSpace:"nowrap", fontWeight:500 }}>
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ─── Circuit trace SVG overlay ──────────────────────────────────────────── */
function CircuitOverlay() {
  return (
    <svg
      style={{ position:"absolute", inset:0, width:"100%", height:"100%", opacity:0.06, pointerEvents:"none" }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <pattern id="circuit" x="0" y="0" width="120" height="120" patternUnits="userSpaceOnUse">
          {/* Horizontal traces */}
          <line x1="0" y1="30" x2="50" y2="30" stroke="#A78BFA" strokeWidth="1"/>
          <line x1="70" y1="30" x2="120" y2="30" stroke="#A78BFA" strokeWidth="1"/>
          <line x1="0" y1="90" x2="40" y2="90" stroke="#818CF8" strokeWidth="1"/>
          <line x1="80" y1="90" x2="120" y2="90" stroke="#818CF8" strokeWidth="1"/>
          {/* Vertical traces */}
          <line x1="30" y1="0" x2="30" y2="20" stroke="#A78BFA" strokeWidth="1"/>
          <line x1="30" y1="40" x2="30" y2="80" stroke="#A78BFA" strokeWidth="1"/>
          <line x1="90" y1="0" x2="90" y2="60" stroke="#818CF8" strokeWidth="1"/>
          <line x1="90" y1="100" x2="90" y2="120" stroke="#818CF8" strokeWidth="1"/>
          {/* Nodes */}
          <circle cx="30" cy="30" r="3" fill="none" stroke="#A78BFA" strokeWidth="1"/>
          <circle cx="90" cy="90" r="3" fill="none" stroke="#818CF8" strokeWidth="1"/>
          <circle cx="30" cy="90" r="2" fill="#A78BFA" opacity="0.5"/>
          <circle cx="90" cy="30" r="2" fill="#818CF8" opacity="0.5"/>
          {/* Corner traces */}
          <path d="M50,30 Q60,30 60,40 L60,80 Q60,90 70,90" fill="none" stroke="#A78BFA" strokeWidth="1"/>
          <path d="M40,90 Q40,60 50,60 L70,60 Q80,60 80,30" fill="none" stroke="#818CF8" strokeWidth="1"/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#circuit)"/>
    </svg>
  );
}

/* ─── City bokeh spots ───────────────────────────────────────────────────── */
function CityLights() {
  const spots = [
    { top:"8%",  left:"15%",  size:6,  color:"#EA2227", anim:"city-flicker 3s .2s infinite" },
    { top:"12%", left:"45%",  size:4,  color:"#F97316", anim:"city-flicker 4s 1s infinite" },
    { top:"18%", left:"72%",  size:8,  color:"#3B82F6", anim:"city-flicker 2.5s .5s infinite" },
    { top:"25%", left:"28%",  size:5,  color:"#A78BFA", anim:"city-flicker 5s 0s infinite" },
    { top:"55%", left:"10%",  size:7,  color:"#F59E0B", anim:"city-flicker 3.5s .8s infinite" },
    { top:"62%", left:"55%",  size:4,  color:"#EA2227", anim:"city-flicker 4.5s .3s infinite" },
    { top:"70%", left:"80%",  size:6,  color:"#10B981", anim:"city-flicker 3s 1.5s infinite" },
    { top:"80%", left:"35%",  size:5,  color:"#3B82F6", anim:"city-flicker 2s .7s infinite" },
    { top:"85%", left:"65%",  size:8,  color:"#F97316", anim:"city-flicker 4s .2s infinite" },
    { top:"40%", left:"88%",  size:4,  color:"#A78BFA", anim:"city-flicker 3.5s 1.2s infinite" },
    { top:"50%", left:"3%",   size:5,  color:"#EA2227", anim:"city-flicker 5s .6s infinite" },
    { top:"33%", left:"62%",  size:3,  color:"#F59E0B", anim:"city-flicker 2.5s .9s infinite" },
  ];
  return (
    <>
      {spots.map((s, i) => (
        <div key={i} style={{
          position:"absolute", top:s.top, left:s.left,
          width:s.size, height:s.size, borderRadius:"50%",
          background:s.color,
          boxShadow:`0 0 ${s.size*4}px ${s.size*2}px ${s.color}66`,
          animation:s.anim,
          pointerEvents:"none",
        }}/>
      ))}
    </>
  );
}

/* ─── Main component ─────────────────────────────────────────────────────── */
export default function Login() {
  const { login, register, loginWithGoogle } = useAuth();
  const [isLogin,  setIsLogin]  = useState(true);
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [name,     setName]     = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");
  const [mounted,  setMounted]  = useState(false);

  useEffect(() => { setTimeout(() => setMounted(true), 60); }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      if (isLogin) {
        await login(email, password);
      } else {
        if (password.length < 6) { setError("Password must be at least 6 characters"); setLoading(false); return; }
        await register(email, password, name);
      }
    } catch (err) {
      setError(
        err.code === "auth/user-not-found"        ? "No account found with this email"  :
        err.code === "auth/wrong-password"         ? "Incorrect password"                :
        err.code === "auth/email-already-in-use"   ? "Email already registered"          :
        err.code === "auth/invalid-email"          ? "Invalid email address"             :
        err.code === "auth/invalid-credential"     ? "Invalid email or password"         :
        err.message || "Something went wrong"
      );
    }
    setLoading(false);
  }

  async function handleGoogle() {
    setError(""); setLoading(true);
    try { await loginWithGoogle(); }
    catch (err) { setError(err.message || "Google sign-in failed"); }
    setLoading(false);
  }

  const features = [
    { icon:"🤖", title:"Full AI Automation",     desc:"9 agents audit, research, fix & report — completely on autopilot" },
    { icon:"📈", title:"Impact-Scored Actions",   desc:"Every issue ranked by business impact so you fix the right things first" },
    { icon:"⚡", title:"One-Click Pipeline",      desc:"Single button triggers the entire SEO workflow end-to-end" },
  ];

  return (
    <>
      <style>{CSS}</style>

      <div style={{ minHeight:"100vh", display:"flex", fontFamily:"'Inter',sans-serif", background:"#07070f", overflow:"hidden" }}>

        {/* ════════════════ LEFT BRAND PANEL ════════════════ */}
        <div className="brand-panel" style={{
          flex:"0 0 56%", position:"relative", overflow:"hidden",
          display:"flex", flexDirection:"column", justifyContent:"center",
          padding:"52px 56px 52px 52px",
        }}>

          {/* ── Deep background ── */}
          <div style={{ position:"absolute", inset:0, background:"linear-gradient(145deg,#080818 0%,#0e0b24 45%,#08081a 100%)" }}/>

          {/* ── City lights bokeh (bottom third) ── */}
          <div style={{ position:"absolute", bottom:0, left:0, right:0, height:"45%", overflow:"hidden" }}>
            {/* Blurred city haze */}
            <div style={{
              position:"absolute", bottom:-40, left:0, right:0, height:"120px",
              background:"linear-gradient(180deg, transparent, rgba(30,10,60,0.5))",
            }}/>
            <CityLights/>
          </div>

          {/* ── Large purple orb — top-right ── */}
          <div style={{
            position:"absolute", top:-140, right:-100,
            width:520, height:520, borderRadius:"50%",
            background:"radial-gradient(circle, rgba(68,61,203,0.32) 0%, rgba(55,48,184,0.12) 50%, transparent 70%)",
            animation:"pulse-orb 5s ease-in-out infinite",
          }}/>

          {/* ── Cyan orb — bottom-left ── */}
          <div style={{
            position:"absolute", bottom:-100, left:-80,
            width:400, height:400, borderRadius:"50%",
            background:"radial-gradient(circle, rgba(6,182,212,0.18) 0%, rgba(59,130,246,0.08) 50%, transparent 70%)",
            animation:"pulse-orb 7s ease-in-out 2s infinite",
          }}/>

          {/* ── Pink accent orb — mid-right ── */}
          <div style={{
            position:"absolute", top:"38%", right:"5%",
            width:200, height:200, borderRadius:"50%",
            background:"radial-gradient(circle, rgba(234,34,39,0.14) 0%, transparent 70%)",
            animation:"pulse-orb 4.5s ease-in-out 1s infinite",
          }}/>

          {/* ── Circuit traces ── */}
          <CircuitOverlay/>

          {/* ── Scan line ── */}
          <div style={{
            position:"absolute", left:0, right:0, height:1,
            background:"linear-gradient(90deg, transparent, rgba(68,61,203,0.6), rgba(99,88,219,0.8), rgba(68,61,203,0.6), transparent)",
            animation:"scan-line 6s linear infinite",
            pointerEvents:"none",
          }}/>

          {/* ══ Floating glass cards ══ */}

          {/* Card 1 — Traffic growth */}
          <div className="glass-card" style={{ top:"9%", right:"6%", animation:"float-up 4.5s ease-in-out 0s infinite" }}>
            <div style={{ fontSize:10, color:"rgba(255,255,255,0.4)", marginBottom:4, letterSpacing:.6 }}>📊 Avg. Traffic Growth</div>
            <div style={{ fontSize:26, fontWeight:900, background:"linear-gradient(90deg,#fff,#A78BFA)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>600%</div>
            <div style={{ fontSize:9, color:"#10B981", marginTop:2, fontWeight:600 }}>↑ +128% vs last quarter</div>
          </div>

          {/* Card 2 — Keywords */}
          <div className="glass-card" style={{ top:"27%", right:"1%", animation:"float-down 5s ease-in-out .7s infinite" }}>
            <div style={{ fontSize:10, color:"rgba(255,255,255,0.4)", marginBottom:4 }}>🔑 Keywords Tracked</div>
            <div style={{ fontSize:24, fontWeight:800, color:"#fff" }}>500+</div>
          </div>

          {/* Card 3 — Donut chart */}
          <div className="glass-card" style={{ bottom:"24%", right:"8%", animation:"float-up 5.5s ease-in-out .4s infinite" }}>
            <div style={{ fontSize:10, color:"rgba(255,255,255,0.4)", marginBottom:10 }}>🎯 Keyword Win Rate</div>
            <DonutChart value={73} size={52} color="#EA2227" label="Ranked in top 10"/>
          </div>

          {/* Card 4 — Mini chart */}
          <div className="glass-card" style={{ bottom:"8%", left:"4%", minWidth:190, animation:"float-down 4.5s ease-in-out 1.1s infinite" }}>
            <div style={{ fontSize:10, color:"rgba(255,255,255,0.4)", marginBottom:8 }}>📈 Organic Clicks</div>
            <MiniBarChart color="#A78BFA"/>
            <div style={{ fontSize:9, color:"#10B981", marginTop:6, fontWeight:600 }}>↑ 300% this quarter</div>
          </div>

          {/* Card 5 — Speed */}
          <div className="glass-card" style={{ top:"50%", left:"2%", animation:"float-up 6s ease-in-out .3s infinite" }}>
            <div style={{ fontSize:10, color:"rgba(255,255,255,0.4)", marginBottom:4 }}>⚡ Audit Speed</div>
            <div style={{ fontSize:22, fontWeight:800, background:"linear-gradient(90deg,#FCD34D,#F97316)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>5×</div>
            <div style={{ fontSize:9, color:"rgba(255,255,255,0.3)" }}>faster than manual</div>
          </div>

          {/* ══ Main content ══ */}
          <div style={{ position:"relative", zIndex:3, maxWidth:500 }}>

            {/* Ticker */}
            <Ticker/>

            {/* Logo */}
            <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:36 }}>
              <div style={{
                width:46, height:46, borderRadius:14,
                background:"linear-gradient(135deg,#443DCB,#3730B8)",
                display:"flex", alignItems:"center", justifyContent:"center",
                fontSize:22, fontWeight:900, color:"#fff",
                boxShadow:"0 4px 24px rgba(68,61,203,0.55), inset 0 1px 0 rgba(255,255,255,0.2)",
              }}>S</div>
              <div>
                <div style={{ fontSize:17, fontWeight:800, color:"#f5f5f5", letterSpacing:.2 }}>SEO Agent</div>
                <div style={{ fontSize:10, color:"#443DCB", fontWeight:700, letterSpacing:1.5, textTransform:"uppercase" }}>AI-Powered Platform</div>
              </div>
            </div>

            {/* Headline */}
            <h1 style={{
              fontSize:44, fontWeight:900, lineHeight:1.12, marginBottom:18,
              background:"linear-gradient(135deg, #ffffff 0%, #e0d4ff 30%, #c084fc 60%, #818cf8 100%)",
              WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent",
              letterSpacing:"-0.5px",
            }}>
              Your AI SEO<br/>Team. 24/7.<br/>On Autopilot.
            </h1>

            <p style={{ fontSize:14.5, color:"rgba(255,255,255,0.42)", lineHeight:1.75, marginBottom:36, fontWeight:400, maxWidth:400 }}>
              9 AI agents run in parallel — from technical audit to keyword
              research, content briefs, schema markup and strategy reports.
              Zero manual work.
            </p>

            {/* Feature list */}
            <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
              {features.map((f,i) => (
                <div key={i} className="feat-item" style={{ animationDelay:`${.1+i*.12}s` }}>
                  <div style={{
                    width:42, height:42, borderRadius:11, flexShrink:0,
                    background:"rgba(68,61,203,0.12)",
                    border:"1px solid rgba(68,61,203,0.22)",
                    display:"flex", alignItems:"center", justifyContent:"center",
                    fontSize:19,
                    boxShadow:"0 2px 12px rgba(68,61,203,0.1)",
                  }}>{f.icon}</div>
                  <div>
                    <div style={{ fontSize:13.5, fontWeight:700, color:"#e8e8e8", marginBottom:3 }}>{f.title}</div>
                    <div style={{ fontSize:12, color:"rgba(255,255,255,0.32)", lineHeight:1.55 }}>{f.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ════════════════ RIGHT FORM PANEL ════════════════ */}
        <div className="form-side" style={{
          flex:1, display:"flex", alignItems:"center", justifyContent:"flex-start",
          padding:"40px 52px", position:"relative",
          background:"linear-gradient(170deg, #08080f 0%, #0c0b1a 60%, #090914 100%)",
          borderLeft:"1px solid rgba(255,255,255,0.045)",
        }}>
          {/* Background glow */}
          <div style={{
            position:"absolute", top:-80, right:-80,
            width:320, height:320, borderRadius:"50%",
            background:"radial-gradient(circle, rgba(55,48,184,0.1) 0%, transparent 70%)",
            pointerEvents:"none",
          }}/>
          <div style={{
            position:"absolute", bottom:-60, left:-60,
            width:260, height:260, borderRadius:"50%",
            background:"radial-gradient(circle, rgba(234,34,39,0.07) 0%, transparent 70%)",
            pointerEvents:"none",
          }}/>

          {/* Form card */}
          <div className="form-card" style={{
            width:"100%", maxWidth:420,
            background:"rgba(255,255,255,0.028)",
            border:"1px solid rgba(255,255,255,0.08)",
            borderRadius:24, padding:"42px 38px",
            backdropFilter:"blur(24px)",
            WebkitBackdropFilter:"blur(24px)",
            boxShadow:"0 28px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(68,61,203,0.06), inset 0 1px 0 rgba(255,255,255,0.07)",
            animation: mounted ? "fade-up .55s ease forwards" : "none",
            opacity: mounted ? undefined : 0,
            ...(mounted ? { animation:"glow-border 4s ease-in-out infinite" } : {}),
          }}>

            {/* Card header */}
            <div style={{ marginBottom:30 }}>
              {/* Small logo on mobile */}
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:18 }}>
                <div style={{
                  width:32, height:32, borderRadius:9,
                  background:"linear-gradient(135deg,#443DCB,#3730B8)",
                  display:"flex", alignItems:"center", justifyContent:"center",
                  fontSize:14, fontWeight:900, color:"#fff",
                }}>S</div>
                <span style={{ fontSize:13, fontWeight:700, color:"rgba(255,255,255,0.5)" }}>SEO Agent</span>
              </div>

              <div style={{ fontSize:23, fontWeight:800, color:"#f0f0f0", marginBottom:7, letterSpacing:"-0.3px" }}>
                {isLogin ? "Welcome back" : "Get started free"}
              </div>
              <div style={{ fontSize:13.5, color:"rgba(255,255,255,0.32)", lineHeight:1.5 }}>
                {isLogin
                  ? "Sign in to your dashboard and run the pipeline"
                  : "Create your account — no credit card needed"}
              </div>
            </div>

            {/* Error */}
            {error && (
              <div style={{
                background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.22)",
                borderRadius:11, padding:"11px 14px",
                fontSize:13, color:"#FCA5A5", marginBottom:20,
                display:"flex", alignItems:"center", gap:8,
              }}>
                <span style={{ fontSize:15 }}>⚠️</span> {error}
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} style={{ display:"flex", flexDirection:"column", gap:15 }}>
              {!isLogin && (
                <div>
                  <label style={{ fontSize:12, color:"rgba(255,255,255,0.4)", fontWeight:600, display:"block", marginBottom:7, letterSpacing:.3 }}>FULL NAME</label>
                  <input className="l-input" value={name} onChange={e=>setName(e.target.value)} required={!isLogin} placeholder="Jane Smith" autoComplete="name"/>
                </div>
              )}
              <div>
                <label style={{ fontSize:12, color:"rgba(255,255,255,0.4)", fontWeight:600, display:"block", marginBottom:7, letterSpacing:.3 }}>EMAIL ADDRESS</label>
                <input className="l-input" type="email" value={email} onChange={e=>setEmail(e.target.value)} required placeholder="you@company.com" autoComplete="email"/>
              </div>
              <div>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:7 }}>
                  <label style={{ fontSize:12, color:"rgba(255,255,255,0.4)", fontWeight:600, letterSpacing:.3 }}>PASSWORD</label>
                  {isLogin && (
                    <span style={{ fontSize:11.5, color:"#A78BFA", cursor:"pointer", fontWeight:600 }}>Forgot?</span>
                  )}
                </div>
                <input
                  className="l-input" type="password" value={password}
                  onChange={e=>setPassword(e.target.value)} required
                  placeholder={isLogin ? "Enter password" : "Min. 6 characters"}
                  autoComplete={isLogin ? "current-password" : "new-password"}
                />
              </div>

              <button type="submit" disabled={loading} className="btn-main" style={{ marginTop:4 }}>
                {loading ? "Please wait…" : isLogin ? "Sign in →" : "Create Account →"}
              </button>
            </form>

            {/* Divider */}
            <div style={{ display:"flex", alignItems:"center", gap:12, margin:"20px 0" }}>
              <div style={{ flex:1, height:1, background:"rgba(255,255,255,0.06)" }}/>
              <span style={{ fontSize:11, color:"rgba(255,255,255,0.18)", fontWeight:600, letterSpacing:1 }}>OR</span>
              <div style={{ flex:1, height:1, background:"rgba(255,255,255,0.06)" }}/>
            </div>

            {/* Google */}
            <button onClick={handleGoogle} disabled={loading} className="btn-goog">
              <GoogleIcon/>
              Continue with Google
            </button>

            {/* Toggle */}
            <div style={{ textAlign:"center", fontSize:13, color:"rgba(255,255,255,0.28)", marginTop:24 }}>
              {isLogin ? "New here? " : "Have an account? "}
              <span
                onClick={()=>{ setIsLogin(!isLogin); setError(""); }}
                style={{ color:"#A78BFA", cursor:"pointer", fontWeight:700 }}
              >
                {isLogin ? "Create free account" : "Sign in"}
              </span>
            </div>

            {/* Trust badges */}
            <div style={{ display:"flex", justifyContent:"center", gap:16, marginTop:20, paddingTop:16, borderTop:"1px solid rgba(255,255,255,0.05)" }}>
              {["🔒 SSL Secure","🛡️ GDPR Ready","⚡ Free Plan"].map(t => (
                <span key={t} style={{ fontSize:10.5, color:"rgba(255,255,255,0.2)", fontWeight:500 }}>{t}</span>
              ))}
            </div>
          </div>
        </div>

      </div>
    </>
  );
}
