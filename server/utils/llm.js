/**
 * LLM Utility — tries Groq first (fast/cheap), falls back to Gemini
 * Returns plain text response
 */
async function callLLM(prompt, keys, options = {}) {
  // ── Groq ──────────────────────────────────────────
  if (keys.groq) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method:  "POST",
        headers: { "Authorization": `Bearer ${keys.groq}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model:       options.model || "llama-3.1-8b-instant",
          messages:    [
            ...(options.systemPrompt ? [{ role: "system", content: options.systemPrompt }] : []),
            { role: "user", content: prompt },
          ],
          max_tokens:  options.maxTokens || 3000,
          temperature: options.temperature || 0.3,
        }),
        signal: AbortSignal.timeout(30000),
      });
      const data = await res.json();
      if (data.choices?.[0]?.message?.content) {
        return data.choices[0].message.content;
      }
    } catch (e) {
      console.warn("Groq failed:", e.message);
    }
  }

  // ── Gemini Fallback ───────────────────────────────
  if (keys.gemini) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${keys.gemini}`,
        {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(options.systemPrompt ? { systemInstruction: { parts: [{ text: options.systemPrompt }] } } : {}),
            contents:         [{ parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: options.maxTokens || 3000, temperature: options.temperature || 0.3 },
          }),
          signal: AbortSignal.timeout(30000),
        }
      );
      const data = await res.json();
      if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
        return data.candidates[0].content.parts[0].text;
      }
    } catch (e) {
      console.warn("Gemini failed:", e.message);
    }
  }

  throw new Error("No LLM key available — add Groq or Gemini key in Settings");
}

/**
 * Parse JSON from LLM response (handles markdown code blocks)
 */
function parseJSON(text) {
  try {
    // Remove markdown code blocks if present
    const clean = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(clean);
  } catch {
    // Try to extract JSON from text
    const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]);
    throw new Error("Could not parse LLM response as JSON");
  }
}

module.exports = { callLLM, parseJSON };
