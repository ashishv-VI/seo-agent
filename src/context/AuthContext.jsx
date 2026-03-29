import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { auth } from "../config/firebase";

const AuthContext = createContext(null);
const provider   = new GoogleAuthProvider();
provider.addScope("https://www.googleapis.com/auth/webmasters.readonly");
const API        = "https://seo-agent-backend-8m1z.onrender.com";

export function AuthProvider({ children }) {
  const [user,        setUser]        = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [googleToken, setGoogleToken] = useState(null);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  // Fire-and-forget: records login/register event for admin activity log
  async function recordLoginEvent(user, provider, method) {
    try {
      const t = await user.getIdToken();
      await fetch(API + "/api/admin/login-event", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + t },
        body: JSON.stringify({ provider, method }),
      });
    } catch(_) {} // non-blocking
  }

  const login = async (e, p) => {
    const result = await signInWithEmailAndPassword(auth, e, p);
    recordLoginEvent(result.user, "email", "login");
    return result;
  };

  const loginWithGoogle = async () => {
    const result     = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    setGoogleToken(credential?.accessToken || null);
    // Auto-create user document if first Google login
    try {
      const t = await result.user.getIdToken();
      await fetch(API + "/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + t },
        body: JSON.stringify({
          email: result.user.email,
          password: "google-oauth-" + result.user.uid,
          name: result.user.displayName || result.user.email,
        }),
      });
    } catch(_) {}
    recordLoginEvent(result.user, "google", "login");
    return result;
  };

  const logout   = () => { setGoogleToken(null); return signOut(auth); };

  const register = async (e, p, n) => {
    const r = await createUserWithEmailAndPassword(auth, e, p);
    try {
      const t = await r.user.getIdToken();
      await fetch(API + "/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + t },
        body: JSON.stringify({ email: e, password: p, name: n }),
      });
    } catch(_) {}
    recordLoginEvent(r.user, "email", "register");
    return r;
  };

  if (loading) return <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#0a0a0a",color:"#fff"}}>Loading...</div>;

  return (
    <AuthContext.Provider value={{ user, login, register, loginWithGoogle, logout, API, googleToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}