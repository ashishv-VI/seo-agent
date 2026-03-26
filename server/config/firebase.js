const fs   = require("fs");
const path = require("path");
const os   = require("os");

// ── STEP 1: Write credentials to file BEFORE loading firebase-admin ──────────
// gRPC resolves GOOGLE_APPLICATION_CREDENTIALS at load time, not runtime.
// Setting the env var after require() is too late.
if (process.env.FIREBASE_SERVICE_ACCOUNT && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  try {
    const tmpFile = path.join(os.tmpdir(), "gcp-sa.json");
    fs.writeFileSync(tmpFile, process.env.FIREBASE_SERVICE_ACCOUNT);
    process.env.GOOGLE_APPLICATION_CREDENTIALS = tmpFile;
    console.log("✅ GOOGLE_APPLICATION_CREDENTIALS set:", tmpFile);
  } catch (e) {
    console.error("❌ Could not write credentials file:", e.message);
    process.exit(1);
  }
}

// ── STEP 2: NOW load firebase-admin (gRPC sees the env var) ──────────────────
const admin = require("firebase-admin");

if (!admin.apps.length) {
  try {
    let projectId;
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      projectId = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT).project_id;
    } else if (process.env.FIREBASE_PROJECT_ID) {
      projectId = process.env.FIREBASE_PROJECT_ID;
    } else {
      console.error("❌ No Firebase project ID found.");
      process.exit(1);
    }

    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId,
    });
    console.log("✅ Firebase Admin initialized — project:", projectId);
  } catch (err) {
    console.error("❌ Firebase init failed:", err.message);
    process.exit(1);
  }
}

const db         = admin.firestore();
const auth       = admin.auth();
const FieldValue = admin.firestore.FieldValue;

module.exports = { admin, db, auth, FieldValue };
