const PROD_API = "https://seo-agent-backend-8m1z.onrender.com";
const LOCAL_API = "http://localhost:5000";

export function getApiBase() {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
  return import.meta.env.DEV ? LOCAL_API : PROD_API;
}

export const API_BASE = getApiBase();
