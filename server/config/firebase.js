const admin = require("firebase-admin");

if (!admin.apps.length) {
  try {
    let credential;

    // ── Option 1: Full JSON (Render env var) ──────────────────────────────
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      credential = admin.credential.cert(sa);
      console.log("✅ Firebase: using FIREBASE_SERVICE_ACCOUNT JSON");

    // ── Option 2: Individual env vars (.env file) ─────────────────────────
    } else if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      credential = admin.credential.cert({
        type:                        "service_account",
        project_id:                  process.env.FIREBASE_PROJECT_ID,
        private_key_id:              process.env.FIREBASE_PRIVATE_KEY_ID,
        private_key:                 process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
        client_email:                process.env.FIREBASE_CLIENT_EMAIL,
        client_id:                   process.env.FIREBASE_CLIENT_ID,
        auth_uri:                    "https://accounts.google.com/o/oauth2/auth",
        token_uri:                   "https://oauth2.googleapis.com/token",
        auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
        client_x509_cert_url:        process.env.FIREBASE_CLIENT_CERT_URL,
      });
      console.log("✅ Firebase: using individual env vars");

    } else {
      console.error("❌ No Firebase credentials found.");
      process.exit(1);
    }

    admin.initializeApp({
      credential,
      projectId: process.env.FIREBASE_PROJECT_ID
        || (process.env.FIREBASE_SERVICE_ACCOUNT && JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT).project_id),
    });

    console.log("✅ Firebase Admin initialized — project:", process.env.FIREBASE_PROJECT_ID);
  } catch (err) {
    console.error("❌ Firebase init failed:", err.message);
    process.exit(1);
  }
}

const db         = admin.firestore();
const auth       = admin.auth();
const FieldValue = admin.firestore.FieldValue;

module.exports = { admin, db, auth, FieldValue };
