import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey:            "AIzaSyAxGUMeO4lNtd7eBgK2h8sjkMUSJXZbJzM",
  authDomain:        "seo-agent-3e40f.firebaseapp.com",
  projectId:         "seo-agent-3e40f",
  storageBucket:     "seo-agent-3e40f.firebasestorage.app",
  messagingSenderId: "636538211185",
  appId:             "1:636538211185:web:6586cc66db16f52381404d0",
};

const app        = initializeApp(firebaseConfig);
export const auth = getAuth(app);