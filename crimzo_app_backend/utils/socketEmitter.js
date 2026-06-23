let _io = null;

function setIo(io) {
  _io = io;
}

function getIo() {
  return _io;
}

function userRoom(userId) {
  return `user_${String(userId)}`;
}

function liveRoom(sessionId) {
  return `live_${String(sessionId)}`;
}

function emitStreamEnded(sessionId, message = 'This stream was ended by moderation.', reason = 'admin') {
  if (!_io || !sessionId) return;
  _io.to(liveRoom(sessionId)).emit('stream_ended', {
    sessionId: String(sessionId),
    message,
    reason,
  });
}

function emitUserBanned(userId, message = 'Your account has been suspended by an administrator.') {
  if (!_io || !userId) return;
  _io.to(userRoom(userId)).emit('user_banned', { message });
}

function emitDiamondUpdate(userId, diamonds) {
  if (!_io || !userId) return;
  _io.to(userRoom(userId)).emit('diamond_update', { diamonds });
}

function emitBeanUpdate(userId, beans) {
  if (!_io || !userId) return;
  _io.to(userRoom(userId)).emit('bean_update', { beans });
}

function emitBalanceUpdate(userId, { diamonds, beans } = {}) {
  if (!_io || !userId) return;
  if (typeof diamonds === 'number') emitDiamondUpdate(userId, diamonds);
  if (typeof beans === 'number') emitBeanUpdate(userId, beans);
}

function emitReelDeleted(reelId) {
  if (!_io || !reelId) return;
  _io.emit('reel_deleted', { reelId: String(reelId) });
}

function emitStickersUpdated() {
  if (!_io) return;
  _io.emit('stickers_updated', { at: Date.now() });
}

function emitLiveStreamsUpdated() {
  if (!_io) return;
  _io.emit('live_streams_updated', { at: Date.now() });
}

function emitFollowUpdated(userId, counts = {}) {
  if (!_io || !userId) return;
  _io.to(userRoom(userId)).emit('follow_updated', {
    userId: String(userId),
    ...counts,
    at: Date.now(),
  });
}

/** Tell a user their relationship with targetId changed (e.g. request accepted). */
function emitFollowStatusChanged(userId, payload = {}) {
  if (!_io || !userId) return;
  _io.to(userRoom(userId)).emit('follow_status_changed', {
    at: Date.now(),
    ...payload,
  });
}

function emitOnlineCountUpdate(count) {
  if (!_io) return;
  const safeCount = Math.max(0, Number(count) || 0);
  _io.emit('online_count_update', { count: safeCount, at: Date.now() });
}

function emitNewMessage(userId, message) {
  if (!_io || !userId || !message) return;
  _io.to(userRoom(userId)).emit('new_message', message);
}

module.exports = {
  setIo,
  getIo,
  userRoom,
  liveRoom,
  emitStreamEnded,
  emitUserBanned,
  emitDiamondUpdate,
  emitBeanUpdate,
  emitBalanceUpdate,
  emitReelDeleted,
  emitStickersUpdated,
  emitLiveStreamsUpdated,
  emitFollowUpdated,
  emitFollowStatusChanged,
  emitOnlineCountUpdate,
  emitNewMessage,
};