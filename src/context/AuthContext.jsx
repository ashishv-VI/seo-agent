import { createContext, useContext, useEffect, useState } from "react";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import { auth, googleProvider } from "../config/firebase";

const AuthContext = createContext(null);

const API = import.meta.env.VITE_API_URL || "https://seo-agent-backend-8mfz.onrender.com";

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser || null);
      setLoading(false);
    });
    return unsub;
  }, []);

  async function login(email, password) {
    return signInWithEmailAndPassword(auth, email, password);
  }

  async function register(email, password, name) {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    // Backend mein save karo
    try {
      const token = await result.user.getIdToken();
      await fetch(`${API}/api/auth/register`, {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ email, password, name }),
      });
    } catch(e) {
      console.log("Backend save failed:", e.message);
    }
    return result;
  }

  async function loginWithGoogle() {
    const result = await signInWithPopup(auth, googleProvider);
    try {
      const token = await result.user.getIdToken();
      await fetch(`${API}/api/auth/register`, {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          email:    result.user.email,
          password: "google-" + result.user.uid,
          name:     result.user.displayName || "User",
        }),
      });
    } catch(e) {
      console.log("Backend save failed:", e.message);
    }
    return result;
  }

  async function logout() {
    return signOut(auth);
  }

  const value = { user, loading, login, register, loginWithGoogle, logout, API };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}

export default AuthContext;