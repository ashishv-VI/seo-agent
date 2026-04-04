const admin = require("firebase-admin");
const { Firestore, FieldValue } = require("@google-cloud/firestore");

if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.error("❌ FIREBASE_SERVICE_ACCOUNT env var is missing — set it in Render Dashboard → Environment");
  process.exit(1);
}

let sa;
try {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;

  // Try direct parse first
  try {
    sa = JSON.parse(raw);
  } catch {
    // Render Dashboard sometimes stores private_key with literal newlines
    // instead of escaped \n — this breaks JSON.parse. Fix and retry.
    const fixed = raw.replace(/("private_key"\s*:\s*")([\s\S]*?)("(?:\s*,|\s*\}))/g, (_, p1, p2, p3) => {
      return p1 + p2.replace(/\r?\n/g, "\\n") + p3;
    });
    sa = JSON.parse(fixed);
    console.log("✅ FIREBASE_SERVICE_ACCOUNT parsed after newline fix");
  }
} catch (err) {
  console.error("❌ FIREBASE_SERVICE_ACCOUNT is not valid JSON:", err.message);
  console.error("   Hint: In Render Dashboard, make sure the entire value is valid JSON");
  process.exit(1);
}

if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert(sa),
      projectId:  sa.project_id,
    });
    console.log("✅ Firebase Admin initialized — project:", sa.project_id);
  } catch (err) {
    console.error("❌ Firebase Admin init failed:", err.message);
    process.exit(1);
  }
}

const db = new Firestore({
  projectId:   sa.project_id,
  credentials: { client_email: sa.client_email, private_key: sa.private_key },
  preferRest:  true,
});

console.log("✅ Firestore client initialized (REST mode)");

const auth = admin.auth();

module.exports = { admin, db, auth, FieldValue };
