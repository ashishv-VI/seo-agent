const { db } = require("../config/firebase");

async function getUserKeys(uid) {
  const doc = await db.collection("users").doc(uid).get();
  const userKeys = doc.data()?.apiKeys || {};

  // Fall back to server default keys if user hasn't set their own
  return {
    groq:    userKeys.groq    || process.env.GROQ_API_KEY    || null,
    gemini:  userKeys.gemini  || process.env.GEMINI_API_KEY  || null,
    serp:    userKeys.serp    || process.env.SERP_API_KEY     || null,
  };
}

module.exports = { getUserKeys };
