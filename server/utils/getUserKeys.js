const { db } = require("../config/firebase");

async function getUserKeys(uid) {
  const doc = await db.collection("users").doc(uid).get();
  const userKeys = doc.data()?.apiKeys || {};

  // Fall back to server default keys if user hasn't set their own
  return {
    groq:         userKeys.groq         || process.env.GROQ_API_KEY       || null,
    gemini:       userKeys.gemini       || process.env.GEMINI_API_KEY     || null,
    openrouter:   userKeys.openrouter   || process.env.OPENROUTER_API_KEY || null,
    serp:         userKeys.serp         || userKeys.serpapi || process.env.SERP_API_KEY || null,
    serpapi:      userKeys.serpapi      || userKeys.serp    || process.env.SERP_API_KEY || null,
    seranking:    userKeys.seranking    || process.env.SERANKING_API_KEY  || null,
    dataforseo:   userKeys.dataforseo   || process.env.DATAFORSEO_KEY     || null,
    semrush:      userKeys.semrush      || process.env.SEMRUSH_API_KEY    || null,
    google:       userKeys.google       || process.env.GOOGLE_API_KEY     || null,
    gaPropertyId: userKeys.gaPropertyId || process.env.GA_PROPERTY_ID    || null,

    // ── Extra rotation keys — picked up from Render env vars ─────────────
    // LLM utility uses these to rotate across multiple free-tier keys
    groq2:        process.env.GROQ_API_KEY_2         || null,
    groq3:        process.env.GROQ_API_KEY_3         || null,
    groq4:        process.env.GROQ_API_KEY_4         || null,
    gemini2:      process.env.GEMINI_API_KEY_2       || null,
    gemini3:      process.env.GEMINI_API_KEY_3       || null,
    openrouter2:  process.env.OPENROUTER_API_KEY_2   || null,
    openrouter3:  process.env.OPENROUTER_API_KEY_3   || null,
  };
}

module.exports = { getUserKeys };
