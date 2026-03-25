import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { auth } from "../config/firebase";

const AuthContext = createContext(null);
const provider   = new GoogleAuthProvider();
const API        = "https://seo-agent-backend-8mfz.onrender.com";

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  const login          = (e, p)    => signInWithEmailAndPassword(auth, e, p);
  const loginWithGoogle= ()        => signInWithPopup(auth, provider);
  const logout         = ()        => signOut(auth);
  const register       = async (e, p, n) => {
    const r = await createUserWithEmailAndPassword(auth, e, p);
    try {
      const t = await r.user.getIdToken();
      await fetch(API + "/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + t },
        body: JSON.stringify({ email: e, password: p, name: n }),
      });
    } catch(_) {}
    return r;
  };

  if (loading) return <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#0a0a0a",color:"#fff"}}>Loading...</div>;

  return (
    <AuthContext.Provider value={{ user, login, register, loginWithGoogle, logout, API }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}