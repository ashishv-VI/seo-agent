const { db, FieldValue } = require("../config/firebase");

const COLLECTION = "shared_state";

async function saveState(clientId, agentId, data) {
  const ref = db.collection(COLLECTION).doc(clientId);
  await ref.set({
    [agentId]: { ...data, updatedAt: FieldValue.serverTimestamp() }
  }, { merge: true });
}

async function getState(clientId, agentId) {
  const doc = await db.collection(COLLECTION).doc(clientId).get();
  if (!doc.exists) return null;
  return doc.data()[agentId] || null;
}

async function getClientState(clientId) {
  const doc = await db.collection(COLLECTION).doc(clientId).get();
  if (!doc.exists) return {};
  return doc.data();
}

async function deleteClientState(clientId) {
  await db.collection(COLLECTION).doc(clientId).delete();
}

async function deleteState(clientId, agentId) {
  const ref = db.collection(COLLECTION).doc(clientId);
  await ref.update({ [agentId]: FieldValue.delete() }).catch(() => {});
}

async function updateState(clientId, agentId, partialData) {
  const ref     = db.collection(COLLECTION).doc(clientId);
  const doc     = await ref.get();
  const updates = {};
  for (const [key, value] of Object.entries(partialData)) {
    updates[`${agentId}.${key}`] = value;
  }
  updates[`${agentId}.updatedAt`] = FieldValue.serverTimestamp();
  if (doc.exists) {
    await ref.update(updates);
  } else {
    await ref.set({ [agentId]: { ...partialData, updatedAt: FieldValue.serverTimestamp() } }, { merge: true });
  }
}

module.exports = { saveState, updateState, getState, getClientState, deleteClientState, deleteState };
