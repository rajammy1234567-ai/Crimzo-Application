/** Tracks active app users — multiple sockets per user allowed (reconnect-safe). */
const PRESENCE_TTL_MS = 90 * 1000;

/** userId -> Map<socketId, lastSeen> */
const activeUsers = new Map();

function registerPresence(userId, socketId) {
  const key = String(userId);
  if (!key || !socketId) {
    return { count: getActiveCount(), userWasOffline: false };
  }
  const userWasOffline = !activeUsers.has(key) || activeUsers.get(key).size === 0;
  if (!activeUsers.has(key)) activeUsers.set(key, new Map());
  activeUsers.get(key).set(socketId, Date.now());
  return { count: getActiveCount(), userWasOffline };
}

function touchPresence(userId, socketId) {
  const key = String(userId);
  const sockets = activeUsers.get(key);
  if (!sockets || !sockets.has(socketId)) return getActiveCount();
  sockets.set(socketId, Date.now());
  return getActiveCount();
}

function unregisterPresence(userId, socketId) {
  const key = String(userId);
  const sockets = activeUsers.get(key);
  if (!sockets || !sockets.has(socketId)) {
    return { count: getActiveCount(), userFullyOffline: false };
  }
  sockets.delete(socketId);
  const userFullyOffline = sockets.size === 0;
  if (userFullyOffline) activeUsers.delete(key);
  return { count: getActiveCount(), userFullyOffline };
}

function pruneStalePresence() {
  const now = Date.now();
  const removedUserIds = [];
  for (const [userId, sockets] of activeUsers.entries()) {
    for (const [socketId, lastSeen] of sockets.entries()) {
      if (now - lastSeen > PRESENCE_TTL_MS) sockets.delete(socketId);
    }
    if (sockets.size === 0) {
      activeUsers.delete(userId);
      removedUserIds.push(userId);
    }
  }
  return { count: getActiveCount(), removedUserIds };
}

function getActiveCount() {
  return activeUsers.size;
}

function clearAllPresence() {
  activeUsers.clear();
}

module.exports = {
  registerPresence,
  touchPresence,
  unregisterPresence,
  pruneStalePresence,
  getActiveCount,
  clearAllPresence,
  PRESENCE_TTL_MS,
};