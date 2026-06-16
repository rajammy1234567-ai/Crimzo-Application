const Notification = require('../models/Notification');
const { getIo, userRoom } = require('./socketEmitter');

async function pushNotification({
  userId,
  type,
  title,
  body = '',
  actor = null,
  referenceId = null,
}) {
  const doc = await Notification.create({
    user_id: userId,
    type,
    title,
    body,
    actor_id: actor?.id || actor?._id || null,
    actor_username: actor?.username || null,
    actor_avatar: actor?.avatar || null,
    reference_id: referenceId ? String(referenceId) : null,
  });

  const payload = {
    id: doc.id,
    type: doc.type,
    title: doc.title,
    body: doc.body,
    actor_id: doc.actor_id ? String(doc.actor_id) : null,
    actor_username: doc.actor_username,
    actor_avatar: doc.actor_avatar,
    reference_id: doc.reference_id,
    is_read: false,
    created_at: doc.created_at,
  };

  const io = getIo();
  if (io) {
    io.to(userRoom(userId)).emit('new_notification', payload);
  }

  return payload;
}

module.exports = { pushNotification };