import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";

/* ─── Keyframe injection ───────────────────────────────────────────────── */
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');

  * { box-sizing: border-box; }

  @keyframes float {
    0%, 100% { transform: translateY(0px) rotate(0deg); }
    50%       { transform: translateY(-18px) rotate(2deg); }
  }
  @keyframes floatB {
    0%, 100% { transform: translateY(0px) rotate(0deg); }
    50%       { transform: translateY(-12px) rotate(-2deg); }
  }
  @keyframes pulse-glow {
    0%, 100% { opacity: 0.5; transform: scale(1); }
    50%       { opacity: 0.9; transform: scale(1.08); }
  }
  @keyframes shimmer {
    0%   { background-position: -200% center; }
    100% { background-position:  200% center; }
  }
  @keyframes spin-slow {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
  @keyframes fade-up {
    from { opacity:0; transform:translateY(16px); }
    to   { opacity:1; transform:translateY(0); }
  }
  @keyframes orbit {
    from { transform: rotate(0deg) translateX(60px) rotate(0deg); }
    to   { transform: rotate(360deg) translateX(60px) rotate(-360deg); }
  }
  @keyframes bar-grow {
    from { width: 0; }
  }

  .login-input {
    width: 100%;
    padding: 13px 16px;
    border-radius: 10px;
    border: 1.5px solid rgba(255,255,255,0.08);
    background: rgba(255,255,255,0.04);
    color: #f0f0f0;
    font-size: 14px;
    outline: none;
    font-family: 'Inter', sans-serif;
    transition: border-color 0.2s, background 0.2s;
  }
  .login-input::placeholder { color: #555; }
  .login-input:focus {
    border-color: rgba(124,58,237,0.7);
    background: rgba(124,58,237,0.06);
  }

  .btn-primary {
    width: 100%;
    padding: 13px;
    border-radius: 10px;
    border: none;
    background: linear-gradient(135deg, #7C3AED, #4F46E5);
    color: #fff;
    font-weight: 700;
    font-size: 14px;
    cursor: pointer;
    font-family: 'Inter', sans-serif;
    letter-spacing: 0.3px;
    transition: opacity 0.2s, transform 0.15s, box-shadow 0.2s;
    box-shadow: 0 4px 24px rgba(124,58,237,0.35);
    position: relative;
    overflow: hidden;
  }
  .btn-primary::after {
    content:'';
    position:absolute; inset:0;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent);
    background-size: 200% auto;
    animation: shimmer 2.4s linear infinite;
  }
  .btn-primary:hover:not(:disabled) { opacity:0.92; transform:translateY(-1px); box-shadow:0 6px 30px rgba(124,58,237,0.45); }
  .btn-primary:active:not(:disabled) { transform:translateY(0); }
  .btn-primary:disabled { opacity:0.45; cursor:not-allowed; }

  .btn-google {
    width: 100%;
    padding: 12px;
    border-radius: 10px;
    border: 1.5px solid rgba(255,255,255,0.1);
    background: rgba(255,255,255,0.04);
    color: #ccc;
    font-weight: 600;
    font-size: 13.5px;
    cursor: pointer;
    font-family: 'Inter', sans-serif;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    transition: background 0.2s, border-color 0.2s;
  }
  .btn-google:hover:not(:disabled) { background:rgba(255,255,255,0.08); border-color:rgba(255,255,255,0.2); }
  .btn-google:disabled { opacity:0.4; cursor:not-allowed; }

  .stat-card {
    position: absolute;
    background: rgba(255,255,255,0.07);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 14px;
    padding: 12px 18px;
    color: #fff;
    white-space: nowrap;
  }

  .feature-item {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    animation: fade-up 0.6s ease forwards;
    opacity: 0;
  }

  @media (max-width: 900px) {
    .brand-panel { display: none !important; }
    .form-panel  { width: 100% !important; justify-content: center !important; }
  }

  @media (max-width: 480px) {
    .form-card { padding: 28px 22px !important; border-radius: 20px !important; }
  }
`;

/* ─── Google SVG icon ─────────────────────────────────────────────────── */
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.1l6.7-6.7C35.8 2.5 30.3 0 24 0 14.7 0 6.7 5.4 2.7 13.3l7.8 6C12.4 13 17.8 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4 7.1-9.9 7.1-17z"/>
      <path fill="#FBBC05" d="M10.5 28.7c-.6-1.8-1-3.7-1-5.7s.4-3.9 1-5.7l-7.8-6C1 14.3 0 19 0 24s1 9.7 2.7 13.7l7.8-6z"/>
      <path fill="#34A853" d="M24 48c6.3 0 11.6-2.1 15.4-5.7l-7.5-5.8c-2.1 1.4-4.8 2.2-7.9 2.2-6.2 0-11.5-4.2-13.5-9.9l-7.8 6C6.7 42.6 14.7 48 24 48z"/>
      <path fill="none" d="M0 0h48v48H0z"/>
    </svg>
  );
}

/* ─── Animated stat card ──────────────────────────────────────────────── */
function StatCard({ style, icon, value, label, delay = "0s", floatAnim = "float" }) {
  return (
    <div className="stat-card" style={{ animation: `${floatAnim} 4s ease-in-out ${delay} infinite`, ...style }}>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 3, letterSpacing: 0.5 }}>{icon} {label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, background: "linear-gradient(90deg, #fff, #A78BFA)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
        {value}
      </div>
    </div>
  );
}

/* ─── Mini bar chart decoration ─────────────────────────────────────────  */
function MiniChart() {
  const bars = [40, 65, 45, 80, 55, 90, 70, 95, 75, 100];
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 40 }}>
      {bars.map((h, i) => (
        <div key={i} style={{
          width: 6, height: `${h}%`, borderRadius: 3,
          background: i === bars.length - 1
            ? "linear-gradient(180deg, #A78BFA, #7C3AED)"
            : `rgba(167,139,250,${0.2 + i * 0.07})`,
          animation: `bar-grow 0.8s ease ${i * 0.06}s both`,
        }} />
      ))}
    </div>
  );
}

/* ─── Main component ──────────────────────────────────────────────────── */
export default function Login() {
  const { login, register, loginWithGoogle } = useAuth();
  const [isLogin,  setIsLogin]  = useState(true);
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [name,     setName]     = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");
  const [mounted,  setMounted]  = useState(false);

  useEffect(() => { setMounted(true); }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (isLogin) {
        await login(email, password);
      } else {
        if (password.length < 6) { setError("Password must be at least 6 characters"); setLoading(false); return; }
        await register(email, password, name);
      }
    } catch (err) {
      const msg =
        err.code === "auth/user-not-found"       ? "No account found with this email" :
        err.code === "auth/wrong-password"        ? "Incorrect password" :
        err.code === "auth/email-already-in-use"  ? "Email already registered" :
        err.code === "auth/invalid-email"         ? "Invalid email address" :
        err.code === "auth/invalid-credential"    ? "Invalid email or password" :
        err.message || "Something went wrong";
      setError(msg);
    }
    setLoading(false);
  }

  async function handleGoogle() {
    setError("");
    setLoading(true);
    try { await loginWithGoogle(); }
    catch (err) { setError(err.message || "Google sign-in failed"); }
    setLoading(false);
  }

  const features = [
    { icon: "🤖", title: "AI-Powered Analysis", desc: "9 specialized agents audit, research & optimize your site automatically" },
    { icon: "📈", title: "Real-Time Rank Tracking", desc: "Monitor keyword positions and get alerts when rankings shift" },
    { icon: "⚡", title: "One-Click Full Pipeline", desc: "From technical audit to published report in a single click" },
  ];

  return (
    <>
      <style>{CSS}</style>

      <div style={{
        minHeight: "100vh",
        display: "flex",
        fontFamily: "'Inter', sans-serif",
        background: "#080810",
        overflow: "hidden",
      }}>

        {/* ── LEFT BRAND PANEL ─────────────────────────────────────── */}
        <div
          className="brand-panel"
          style={{
            flex: "0 0 55%",
            position: "relative",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "60px 56px",
          }}
        >
          {/* Deep background gradient */}
          <div style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(135deg, #0d0d1a 0%, #110d2b 40%, #0a0a18 100%)",
          }} />

          {/* Large glowing orb — top right */}
          <div style={{
            position: "absolute", top: -120, right: -120,
            width: 500, height: 500,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(124,58,237,0.35) 0%, rgba(79,70,229,0.15) 45%, transparent 70%)",
            animation: "pulse-glow 5s ease-in-out infinite",
          }} />

          {/* Medium orb — bottom left */}
          <div style={{
            position: "absolute", bottom: -80, left: -60,
            width: 350, height: 350,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(6,182,212,0.2) 0%, rgba(59,130,246,0.1) 50%, transparent 70%)",
            animation: "pulse-glow 6s ease-in-out 2s infinite",
          }} />

          {/* Small accent orb — center */}
          <div style={{
            position: "absolute", top: "45%", right: "20%",
            width: 160, height: 160,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(167,139,250,0.2) 0%, transparent 70%)",
            animation: "pulse-glow 4s ease-in-out 1s infinite",
          }} />

          {/* Grid overlay */}
          <div style={{
            position: "absolute", inset: 0,
            backgroundImage: `
              linear-gradient(rgba(124,58,237,0.05) 1px, transparent 1px),
              linear-gradient(90deg, rgba(124,58,237,0.05) 1px, transparent 1px)
            `,
            backgroundSize: "48px 48px",
          }} />

          {/* Stat cards */}
          <StatCard
            style={{ top: "12%", right: "8%", minWidth: 140 }}
            icon="📊" value="600%" label="Avg. Traffic Growth"
            delay="0s"
          />
          <StatCard
            style={{ top: "30%", right: "2%", minWidth: 130 }}
            icon="🔑" value="500+" label="Keywords Tracked"
            delay="0.8s" floatAnim="floatB"
          />
          <StatCard
            style={{ bottom: "22%", right: "10%", minWidth: 145 }}
            icon="⚡" value="5.0×" label="Faster Audits"
            delay="0.4s"
          />

          {/* Mini chart card */}
          <div className="stat-card" style={{
            bottom: "10%", left: "5%", minWidth: 180,
            animation: "floatB 5s ease-in-out 1.2s infinite",
          }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 8, letterSpacing: 0.5 }}>📈 Organic Clicks</div>
            <MiniChart />
            <div style={{ fontSize: 10, color: "#10B981", marginTop: 6, fontWeight: 600 }}>↑ 300% this quarter</div>
          </div>

          {/* Content */}
          <div style={{ position: "relative", zIndex: 2, maxWidth: 480 }}>

            {/* Logo mark */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 48 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: "linear-gradient(135deg, #7C3AED, #4F46E5)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 20, fontWeight: 800, color: "#fff",
                boxShadow: "0 4px 20px rgba(124,58,237,0.5)",
              }}>S</div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#f0f0f0", letterSpacing: 0.3 }}>SEO Agent</div>
                <div style={{ fontSize: 11, color: "#7C3AED", fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>AI-Powered Platform</div>
              </div>
            </div>

            {/* Headline */}
            <h1 style={{
              fontSize: 42, fontWeight: 800, lineHeight: 1.15, margin: "0 0 16px",
              background: "linear-gradient(135deg, #ffffff 0%, #c4b5fd 60%, #818cf8 100%)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            }}>
              Automate Your<br />SEO. Dominate<br />Search.
            </h1>

            <p style={{ fontSize: 15, color: "rgba(255,255,255,0.45)", lineHeight: 1.7, marginBottom: 40, fontWeight: 400 }}>
              9 AI agents working in parallel — audit, research, optimize,
              and report on autopilot. No spreadsheets, no guesswork.
            </p>

            {/* Feature list */}
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {features.map((f, i) => (
                <div key={i} className="feature-item" style={{ animationDelay: `${0.1 + i * 0.15}s` }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                    background: "rgba(124,58,237,0.15)",
                    border: "1px solid rgba(124,58,237,0.25)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 18,
                  }}>{f.icon}</div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#e0e0e0", marginBottom: 2 }}>{f.title}</div>
                    <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.35)", lineHeight: 1.5 }}>{f.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── RIGHT FORM PANEL ─────────────────────────────────────── */}
        <div
          className="form-panel"
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-start",
            padding: "40px 52px",
            position: "relative",
            background: "linear-gradient(180deg, #09090f 0%, #0d0d18 100%)",
            borderLeft: "1px solid rgba(255,255,255,0.05)",
          }}
        >
          {/* Subtle top-right glow */}
          <div style={{
            position: "absolute", top: -60, right: -60,
            width: 300, height: 300,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(79,70,229,0.12) 0%, transparent 70%)",
            pointerEvents: "none",
          }} />

          <div
            className="form-card"
            style={{
              width: "100%",
              maxWidth: 420,
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 24,
              padding: "40px 36px",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              animation: mounted ? "fade-up 0.5s ease forwards" : "none",
              boxShadow: "0 24px 80px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)",
            }}
          >
            {/* Header */}
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: "#f0f0f0", marginBottom: 6 }}>
                {isLogin ? "Welcome back" : "Create account"}
              </div>
              <div style={{ fontSize: 13.5, color: "rgba(255,255,255,0.35)" }}>
                {isLogin
                  ? "Sign in to your SEO Agent dashboard"
                  : "Start your free SEO Agent account today"}
              </div>
            </div>

            {/* Error */}
            {error && (
              <div style={{
                background: "rgba(220,38,38,0.1)",
                border: "1px solid rgba(220,38,38,0.25)",
                borderRadius: 10, padding: "11px 14px",
                fontSize: 13, color: "#F87171", marginBottom: 20,
                display: "flex", alignItems: "center", gap: 8,
              }}>
                <span>⚠️</span> {error}
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {!isLogin && (
                <div>
                  <label style={{ fontSize: 12.5, color: "rgba(255,255,255,0.45)", fontWeight: 500, display: "block", marginBottom: 7 }}>
                    Full Name
                  </label>
                  <input
                    className="login-input"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    required={!isLogin}
                    placeholder="Jane Smith"
                    autoComplete="name"
                  />
                </div>
              )}

              <div>
                <label style={{ fontSize: 12.5, color: "rgba(255,255,255,0.45)", fontWeight: 500, display: "block", marginBottom: 7 }}>
                  Email address
                </label>
                <input
                  className="login-input"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </div>

              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
                  <label style={{ fontSize: 12.5, color: "rgba(255,255,255,0.45)", fontWeight: 500 }}>
                    Password
                  </label>
                  {isLogin && (
                    <span style={{ fontSize: 12, color: "#7C3AED", cursor: "pointer", fontWeight: 500 }}>
                      Forgot password?
                    </span>
                  )}
                </div>
                <input
                  className="login-input"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  placeholder={isLogin ? "Your password" : "Min. 6 characters"}
                  autoComplete={isLogin ? "current-password" : "new-password"}
                />
              </div>

              <button type="submit" disabled={loading} className="btn-primary" style={{ marginTop: 6 }}>
                {loading ? "Please wait…" : isLogin ? "Sign in →" : "Create Account →"}
              </button>
            </form>

            {/* Divider */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0" }}>
              <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
              <span style={{ fontSize: 11.5, color: "rgba(255,255,255,0.2)", fontWeight: 500, letterSpacing: 0.5 }}>OR</span>
              <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
            </div>

            {/* Google */}
            <button onClick={handleGoogle} disabled={loading} className="btn-google">
              <GoogleIcon />
              Continue with Google
            </button>

            {/* Toggle */}
            <div style={{ textAlign: "center", fontSize: 13, color: "rgba(255,255,255,0.3)", marginTop: 24 }}>
              {isLogin ? "Don't have an account? " : "Already have an account? "}
              <span
                onClick={() => { setIsLogin(!isLogin); setError(""); }}
                style={{ color: "#A78BFA", cursor: "pointer", fontWeight: 600 }}
              >
                {isLogin ? "Sign up free" : "Sign in"}
              </span>
            </div>

            {/* Trust line */}
            {!isLogin && (
              <div style={{ textAlign: "center", fontSize: 11.5, color: "rgba(255,255,255,0.18)", marginTop: 14 }}>
                🔒 No credit card required · Free forever plan
              </div>
            )}
          </div>
        </div>

      </div>
    </>
  );
}
