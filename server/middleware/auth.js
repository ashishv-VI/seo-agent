const { admin } = require("../config/firebase");

async function verifyToken(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No token provided" });
    }
    const token   = header.split("Bearer ")[1];
    const decoded = await admin.auth().verifyIdToken(token);
    req.user      = decoded;
    req.uid       = decoded.uid;
    req.email     = decoded.email;
    next();
  } catch (err) {
    console.error("Auth middleware error:", err.message);
    return res.status(401).json({ error: "Invalid token" });
  }
}

module.exports = { verifyToken };