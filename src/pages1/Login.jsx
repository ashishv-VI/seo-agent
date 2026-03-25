import { useState } from "react";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { login, register, loginWithGoogle } = useAuth();
  const [isLogin,  setIsLogin]  = useState(true);
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [name,     setName]     = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (isLogin) {
        await login(email, password);
      } else {
        if (password.length < 6) {
          setError("Password must be at least 6 characters");
          setLoading(false);
          return;
        }
        await register(email, password, name);
      }
    } catch (err) {
      const msg = err.code === "auth/user-not-found"    ? "User not found" :
                  err.code === "auth/wrong-password"     ? "Wrong password" :
                  err.code === "auth/email-already-in-use" ? "Email already registered" :
                  err.code === "auth/invalid-email"      ? "Invalid email" :
                  err.message || "Something went wrong";
      setError(msg);
    }
    setLoading(false);
  }

  async function handleGoogle() {
    setError("");
    setLoading(true);
    try {
      await loginWithGoogle();
    } catch (err) {
      setError(err.message || "Google login failed");
    }
    setLoading(false);
  }

  const inp = {
    width: "100%",
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid #333",
    background: "#1a1a1a",
    color: "#e8e8e8",
    fontSize: 13,
    outline: "none",
    boxSizing: "border-box",
    fontFamily: "inherit",
  };

  return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#0a0a0a", fontFamily:"Inter,sans-serif" }}>
      <div style={{ width:420, background:"#111", border:"1px solid #222", borderRadius:16, padding:36 }}>

        {/* Logo */}
        <div style={{ textAlign:"center", marginBottom:28 }}>
          <div style={{ width:48, height:48, borderRadius:12, background:"#7C3AED", display:"flex", alignItems:"center", justifyContent:"center", fontSize:24, fontWeight:800, color:"#fff", margin:"0 auto 12px" }}>
            S
          </div>
          <div style={{ fontSize:22, fontWeight:700, color:"#e8e8e8" }}>SEO Agent</div>
          <div style={{ fontSize:13, color:"#666", marginTop:4 }}>
            {isLogin ? "Welcome back!" : "Create your account"}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{ background:"#DC262622", border:"1px solid #DC262644", borderRadius:8, padding:"10px 14px", fontSize:12, color:"#DC2626", marginBottom:16 }}>
            ⚠️ {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display:"flex", flexDirection:"column", gap:14 }}>
          {!isLogin && (
            <div>
              <div style={{ fontSize:12, color:"#888", marginBottom:6 }}>Full Name</div>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                required={!isLogin}
                placeholder="Your name"
                style={inp}
              />
            </div>
          )}
          <div>
            <div style={{ fontSize:12, color:"#888", marginBottom:6 }}>Email</div>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
              style={inp}
            />
          </div>
          <div>
            <div style={{ fontSize:12, color:"#888", marginBottom:6 }}>Password</div>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              placeholder="Min 6 characters"
              style={inp}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            style={{ padding:"12px", borderRadius:10, border:"none", background:loading?"#333":"#7C3AED", color:loading?"#666":"#fff", fontWeight:700, fontSize:14, cursor:loading?"not-allowed":"pointer", marginTop:4 }}
          >
            {loading ? "Please wait..." : isLogin ? "🔐 Login" : "🚀 Create Account"}
          </button>
        </form>

        {/* Divider */}
        <div style={{ display:"flex", alignItems:"center", gap:10, margin:"16px 0" }}>
          <div style={{ flex:1, height:1, background:"#222" }} />
          <span style={{ fontSize:11, color:"#444" }}>OR</span>
          <div style={{ flex:1, height:1, background:"#222" }} />
        </div>

        {/* Google */}
        <button
          onClick={handleGoogle}
          disabled={loading}
          style={{ width:"100%", padding:"11px", borderRadius:10, border:"1px solid #333", background:"transparent", color:"#e8e8e8", fontWeight:600, fontSize:13, cursor:loading?"not-allowed":"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}
        >
          <span>🔵</span> Continue with Google
        </button>

        {/* Toggle */}
        <div style={{ textAlign:"center", fontSize:12, color:"#666", marginTop:20 }}>
          {isLogin ? "Don't have an account? " : "Already have an account? "}
          <span
            onClick={() => { setIsLogin(!isLogin); setError(""); }}
            style={{ color:"#A78BFA", cursor:"pointer", fontWeight:600 }}
          >
            {isLogin ? "Sign up free" : "Login"}
          </span>
        </div>
      </div>
    </div>
  );
}