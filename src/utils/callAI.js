/**
 * Shared AI call helper — routes through POST /api/ai/chat so provider
 * keys never leave the server. Used by all frontend tool components.
 *
 * @param {string} prompt
 * @param {string} model  - "groq" | "gemini" | "deepseek" | "mistral"
 * @param {Function} getToken - () => Promise<string>  (Firebase getIdToken)
 * @param {string} API    - backend base URL
 * @returns {Promise<string|null>}
 */
import { API_BASE } from "./apiBase";

const DEFAULT_API = API_BASE;

export async function callAIBackend(prompt, model, getToken, API = DEFAULT_API) {
  const token = await getToken();
  const res = await fetch(`${API}/api/ai/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ model, prompt }),
    signal: AbortSignal.timeout(50000),
  });
  const d = await res.json();
  if (!res.ok) throw new Error(d.error || `AI request failed (${res.status})`);
  return d.text || null;
}
