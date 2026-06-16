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

module.exports = {
  setIo,
  getIo,
  userRoom,
  liveRoom,
  emitStreamEnded,
  emitUserBanned,
  emitDiamondUpdate,
  emitReelDeleted,
  emitStickersUpdated,
  emitLiveStreamsUpdated,
};