const { db } = require("../config/firebase");

async function getUserKeys(uid) {
  const doc = await db.collection("users").doc(uid).get();
  return doc.data()?.apiKeys || {};
}

module.exports = { getUserKeys };
