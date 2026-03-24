import React, { createContext, useContext, useEffect, useState } from "react";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
} from "firebase/auth";
import { auth } from "../config/firebase";

const AuthContext = createContext({});

const googleProvider = new GoogleAuthProvider();

const API_URL = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL
  : "https://seo-agent-backend-8mfz.onrender.com";

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, function(firebaseUser) {
      if (firebaseUser) {
        setUser(firebaseUser);
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return function() { unsubscribe(); };
  }, []);

  function login(email, password) {
    return signInWithEmailAndPassword(auth, email, password);
  }

  async function register(email, password, name) {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    try {
      const token = await result.user.getIdToken();
      await fetch(API_URL + "/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + token,
        },
        body: JSON.stringify({ email: email, password: password, name: name }),
      });
    } catch(err) {
      console.log("Backend error:", err.message);
    }
    return result;
  }

  async function loginWithGoogle() {
    const result = await signInWithPopup(auth, googleProvider);
    try {
      const token = await result.user.getIdToken();
      await fetch(API_URL + "/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + token,
        },
        body: JSON.stringify({
          email: result.user.email,
          password: "google-" + result.user.uid,
          name: result.user.displayName || "User",
        }),
      });
    } catch(err) {
      console.log("Google backend error:", err.message);
    }
    return result;
  }

  function logout() {
    return signOut(auth);
  }

  const value = {
    user: user,
    loading: loading,
    login: login,
    register: register,
    loginWithGoogle: loginWithGoogle,
    logout: logout,
    API: API_URL,
  };

  if (loading) {
    return React.createElement("div", {
      style: {
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0a0a0a",
        color: "#e8e8e8",
        fontSize: 14,
        fontFamily: "Inter, sans-serif",
      }
    }, "Loading...");
  }

  return React.createElement(
    AuthContext.Provider,
    { value: value },
    children
  );
}

export function useAuth() {
  return useContext(AuthContext);
}