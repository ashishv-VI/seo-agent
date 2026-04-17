import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { auth } from "../config/firebase";

const AuthContext = createContext(null);
const provider   = new GoogleAuthProvider();
provider.addScope("https://www.googleapis.com/auth/webmasters.readonly");
provider.addScope("https://www.googleapis.com/auth/business.manage");
provider.addScope("https://www.googleapis.com/auth/analytics.readonly");
provider.addScope("https://www.googleapis.com/auth/analytics.manage.users.readonly");
const API        = import.meta.env.VITE_API_URL || "https://seo-agent-backend-8m1z.onrender.com";

const GSC_TOKEN_KEY    = "seo_gsc_token";
const GSC_TOKEN_EXPIRY = "seo_gsc_token_expiry";

function saveGoogleToken(token) {
  try {
    sessionStorage.setItem(GSC_TOKEN_KEY, token);
    // Google OAuth tokens expire in 1 hour; we treat them as valid for 55 minutes
    sessionStorage.setItem(GSC_TOKEN_EXPIRY, String(Date.now() + 55 * 60 * 1000));
  } catch { /* sessionStorage unavailable */ }
}

function loadGoogleToken() {
  try {
    const expiry = parseInt(sessionStorage.getItem(GSC_TOKEN_EXPIRY) || "0", 10);
    if (expiry > Date.now()) {
      return sessionStorage.getItem(GSC_TOKEN_KEY) || null;
    }
    sessionStorage.removeItem(GSC_TOKEN_KEY);
    sessionStorage.removeItem(GSC_TOKEN_EXPIRY);
  } catch { /* sessionStorage unavailable */ }
  return null;
}

function clearGoogleToken() {
  try {
    sessionStorage.removeItem(GSC_TOKEN_KEY);
    sessionStorage.removeItem(GSC_TOKEN_EXPIRY);
  } catch { /* sessionStorage unavailable */ }
}

export function AuthProvider({ children }) {
  const [user,        setUser]        = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [googleToken, setGoogleToken] = useState(() => loadGoogleToken());

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
      if (!u) { clearGoogleToken(); setGoogleToken(null); }
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
    const token = credential?.accessToken || null;
    if (token) saveGoogleToken(token);
    setGoogleToken(token);
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
    // Upsert Firestore user doc — must not silently fail or the account is broken.
    // Retry once; if still failing, sign the user out and surface the error.
    let lastErr = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const t = await r.user.getIdToken(/* forceRefresh */ attempt > 0);
        const res = await fetch(API + "/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + t },
          body: JSON.stringify({ email: e, password: p, name: n }),
        });
        if (res.ok) { lastErr = null; break; }
        const body = await res.json().catch(() => ({}));
        lastErr = new Error(body.error || `Registration failed (${res.status})`);
      } catch (err) {
        lastErr = err;
      }
    }
    if (lastErr) {
      // Firestore doc creation failed — sign out so the user is not stuck in a broken state
      await signOut(auth).catch(() => {});
      throw lastErr;
    }
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