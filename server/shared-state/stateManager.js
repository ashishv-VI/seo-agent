const { db, admin } = require("../config/firebase");

const COLLECTION = "shared_state";

// Save agent output for a client
async function saveState(clientId, agentId, data) {
  const ref = db.collection(COLLECTION).doc(clientId);
  await ref.set({
    [agentId]: {
      ...data,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }
  }, { merge: true });
}

// Get specific agent output for a client
async function getState(clientId, agentId) {
  const doc = await db.collection(COLLECTION).doc(clientId).get();
  if (!doc.exists) return null;
  return doc.data()[agentId] || null;
}

// Get all agent outputs for a client
async function getClientState(clientId) {
  const doc = await db.collection(COLLECTION).doc(clientId).get();
  if (!doc.exists) return {};
  return doc.data();
}

// Delete all state for a client
async function deleteClientState(clientId) {
  await db.collection(COLLECTION).doc(clientId).delete();
}

// Merge partial data into existing agent state (preserves existing fields)
async function updateState(clientId, agentId, partialData) {
  const ref  = db.collection(COLLECTION).doc(clientId);
  const doc  = await ref.get();
  const updates = {};
  for (const [key, value] of Object.entries(partialData)) {
    updates[`${agentId}.${key}`] = value;
  }
  updates[`${agentId}.updatedAt`] = admin.firestore.FieldValue.serverTimestamp();
  // use set+merge if doc doesn't exist yet, update if it does
  if (doc.exists) {
    await ref.update(updates);
  } else {
    const setData = { [agentId]: { ...partialData, updatedAt: admin.firestore.FieldValue.serverTimestamp() } };
    await ref.set(setData, { merge: true });
  }
}

module.exports = { saveState, updateState, getState, getClientState, deleteClientState };
