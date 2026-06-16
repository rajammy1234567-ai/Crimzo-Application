const Notification = require('../models/Notification');

exports.getNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = Math.min(Number(req.query.limit) || 40, 60);
    const notifications = await Notification.find({ user_id: userId })
      .sort({ created_at: -1 })
      .limit(limit)
      .lean();

    const unreadCount = await Notification.countDocuments({ user_id: userId, is_read: false });

    res.json({
      success: true,
      notifications: notifications.map((n) => ({
        id: n._id.toString(),
        type: n.type,
        title: n.title,
        body: n.body,
        actor_id: n.actor_id ? String(n.actor_id) : null,
        actor_username: n.actor_username,
        actor_avatar: n.actor_avatar,
        reference_id: n.reference_id,
        is_read: n.is_read,
        created_at: n.created_at,
      })),
      unreadCount,
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
};

exports.getUnreadCount = async (req, res) => {
  try {
    const count = await Notification.countDocuments({
      user_id: req.user.id,
      is_read: false,
    });
    res.json({ success: true, unreadCount: count });
  } catch (error) {
    console.error('Unread count error:', error);
    res.status(500).json({ error: 'Failed to get unread count' });
  }
};

exports.markRead = async (req, res) => {
  try {
    const { notificationId } = req.body;
    if (notificationId) {
      await Notification.updateOne(
        { _id: notificationId, user_id: req.user.id },
        { is_read: true },
      );
    } else {
      await Notification.updateMany(
        { user_id: req.user.id, is_read: false },
        { is_read: true },
      );
    }
    const unreadCount = await Notification.countDocuments({
      user_id: req.user.id,
      is_read: false,
    });
    res.json({ success: true, unreadCount });
  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({ error: 'Failed to mark notification' });
  }
};