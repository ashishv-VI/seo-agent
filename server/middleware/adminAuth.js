const { auth } = require("../config/firebase");

// Only allows the admin UID (set ADMIN_UID in Render env vars)
async function verifyAdmin(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No token provided" });
    }
    const token   = header.split("Bearer ")[1];
    const decoded = await auth.verifyIdToken(token);
    req.uid   = decoded.uid;
    req.email = decoded.email;

    const adminUid = process.env.ADMIN_UID;
    if (!adminUid) {
      return res.status(500).json({ error: "ADMIN_UID not configured on server" });
    }
    if (decoded.uid !== adminUid) {
      return res.status(403).json({ error: "Admin access only" });
    }
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

module.exports = { verifyAdmin };
