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
    setError(""); setLoading(true);
    try {
      if (isLogin) {
        await login(email, password);
      } else {
        await register(email, password, name);
      }
    } catch (err) {
      setError(err.message || "Something went wrong");
    }
    setLoading(false);
  }

  async function handleGoogle() {
    setError(""); setLoading(true);
    try {
      await loginWithGoogle();
    } catch (err) {
      setError(err.message || "Google login failed");
    }
    setLoading(false);
  }

  return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#0a0a0a", fontFamily:"Inter,sans-serif" }}>
      <div style={{ width:420, background:"#111", border:"1px solid #222", borderRadius:16, padding:36 }}>

        {/* Logo */}
        <div style={{ textAlign:"center", marginBottom:28 }}>
          <div style={{ width:48, height:48, borderRadius:12, background:"#7C3AED", display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, fontWeight:800, color:"#fff", margin:"0 auto 12px" }}>S</div>
          <div style={{ fontSize:20, fontWeight:700, color:"#e8e8e8" }}>SEO Agent</div>
          <div style={{ fontSize:12, color:"#666", marginTop:4 }}>{isLogin ? "Welcome back!" : "Create your account"}</div>
        </div>

        {/* Error */}
        {error && (
          <div style={{ background:"#DC262622", border:"1px solid #DC262644", borderRadius:8, padding:"10px 14px", fontSize:12, color:"#DC2626", marginBottom:16 }}>
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit}>
          {!isLogin && (
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:12, color:"#888", marginBottom:6 }}>Full Name</div>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                required
                placeholder="Your name"
                style={{ width:"100%", padding:"10px 14px", borderRadius:8, border:"1px solid #222", background:"#1a1a1a", color:"#e8e8e8", fontSize:13, outline:"none", boxSizing:"border-box" }}
              />
            </div>
          )}
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:12, color:"#888", marginBottom:6 }}>Email</div>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
              style={{ width:"100%", padding:"10px 14px", borderRadius:8, border:"1px solid #222", background:"#1a1a1a", color:"#e8e8e8", fontSize:13, outline:"none", boxSizing:"border-box" }}
            />
          </div>
          <div style={{ marginBottom:20 }}>
            <div style={{ fontSize:12, color:"#888", marginBottom:6 }}>Password</div>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              style={{ width:"100%", padding:"10px 14px", borderRadius:8, border:"1px solid #222", background:"#1a1a1a", color:"#e8e8e8", fontSize:13, outline:"none", boxSizing:"border-box" }}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            style={{ width:"100%", padding:"11px", borderRadius:10, border:"none", background:loading?"#333":"#7C3AED", color:loading?"#666":"#fff", fontWeight:700, fontSize:14, cursor:loading?"not-allowed":"pointer", marginBottom:12 }}
          >
            {loading ? "Please wait..." : isLogin ? "Login" : "Create Account"}
          </button>
        </form>

        {/* Google */}
        <button
          onClick={handleGoogle}
          disabled={loading}
          style={{ width:"100%", padding:"11px", borderRadius:10, border:"1px solid #333", background:"transparent", color:"#e8e8e8", fontWeight:600, fontSize:13, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8, marginBottom:20 }}
        >
          <span style={{ fontSize:16 }}>🔵</span> Continue with Google
        </button>

        {/* Toggle */}
        <div style={{ textAlign:"center", fontSize:12, color:"#666" }}>
          {isLogin ? "Don't have an account? " : "Already have an account? "}
          <span
            onClick={() => { setIsLogin(!isLogin); setError(""); }}
            style={{ color:"#A78BFA", cursor:"pointer", fontWeight:600 }}
          >
            {isLogin ? "Sign up" : "Login"}
          </span>
        </div>
      </div>
    </div>
  );
}