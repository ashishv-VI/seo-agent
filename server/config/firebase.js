const admin = require("firebase-admin");

let db, auth;

function initFirebase() {
  if (admin.apps.length > 0) {
    db   = admin.app().firestore();
    auth = admin.app().auth();
    return { db, auth };
  }

  // ── Production: Environment variables use karo ──
  // JSON file ko Render par nahi rakhna — env vars use karo
  const serviceAccount = {
    type:                        "service_account",
    project_id:                  process.env.FIREBASE_PROJECT_ID,
    private_key_id:              process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key:                 process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    client_email:                process.env.FIREBASE_CLIENT_EMAIL,
    client_id:                   process.env.FIREBASE_CLIENT_ID,
    auth_uri:                    "https://accounts.google.com/o/oauth2/auth",
    token_uri:                   "https://oauth2.googleapis.com/token",
    auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
    client_x509_cert_url:        process.env.FIREBASE_CLIENT_CERT_URL,
  };

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  console.log("✅ Firebase Admin initialized — Production");

  db   = admin.firestore();
  auth = admin.auth();
  return { db, auth };
}

initFirebase();

module.exports = { admin, db, auth };