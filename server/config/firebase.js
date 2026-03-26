const admin = require("firebase-admin");
const { Firestore, FieldValue } = require("@google-cloud/firestore");

if (!admin.apps.length) {
  try {
    // Parse full service account JSON — pass directly to cert()
    const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

    admin.initializeApp({
      credential: admin.credential.cert(sa),
      projectId:  sa.project_id,
    });

    console.log("✅ Firebase Admin initialized — project:", sa.project_id);
  } catch (err) {
    console.error("❌ Firebase init failed:", err.message);
    process.exit(1);
  }
}

const sa   = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const db   = new Firestore({
  projectId:   sa.project_id,
  credentials: { client_email: sa.client_email, private_key: sa.private_key },
  preferRest:  true,
});

console.log("✅ Firestore client initialized (REST mode)");

const auth = admin.auth();

module.exports = { admin, db, auth, FieldValue };
