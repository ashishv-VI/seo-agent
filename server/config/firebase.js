const admin      = require("firebase-admin");
const { Firestore, FieldValue } = require("@google-cloud/firestore");

// ── Build credentials object ──────────────────────────────────────────────────
function getCredentials() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    return {
      client_email: sa.client_email,
      private_key:  sa.private_key,
      projectId:    sa.project_id,
    };
  }
  return {
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    private_key:  process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    projectId:    process.env.FIREBASE_PROJECT_ID,
  };
}

const creds = getCredentials();

// ── Firebase Admin (for Auth only — REST based, works fine) ───────────────────
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      type:          "service_account",
      project_id:    creds.projectId,
      private_key:   creds.private_key,
      client_email:  creds.client_email,
    }),
    projectId: creds.projectId,
  });
  console.log("✅ Firebase Admin (Auth) initialized — project:", creds.projectId);
}

// ── Firestore via @google-cloud/firestore directly (bypasses firebase-admin) ──
const db = new Firestore({
  projectId:   creds.projectId,
  credentials: {
    client_email: creds.client_email,
    private_key:  creds.private_key,
  },
  preferRest: true,
});

console.log("✅ Firestore client initialized (REST mode)");

const auth = admin.auth();

module.exports = { admin, db, auth, FieldValue };
