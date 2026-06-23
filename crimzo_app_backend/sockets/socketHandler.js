const mongoose = require('mongoose');
const User = require('../models/User');
const LiveSession = require('../models/LiveSession');
const { getBillingSettings } = require('../utils/billingSettings');
const { userCanChatOnLive } = require('../controllers/liveTalkController');
const { finalizeLiveSessionEnd } = require('../controllers/liveController');
const PKBattle = require('../models/PKBattle');
const Sticker = require('../models/Sticker');
const GiftHistory = require('../models/GiftHistory');
const { userRoom, emitBalanceUpdate, emitOnlineCountUpdate } = require('../utils/socketEmitter');
const {
  registerPresence,
  touchPresence,
  unregisterPresence,
  pruneStalePresence,
} = require('../utils/presenceTracker');
const { attachSocketAuth } = require('../middleware/socketAuth');
const { transferGift } = require('../utils/diamondTransfer');
const { assertCanInteract } = require('../utils/followPermissions');

function isValidStickerObjectId(id) {
  if (id == null || id === '') return false;
  const str = String(id);
  return mongoose.Types.ObjectId.isValid(str) && str.length === 24;
}

/** PK gifts use numeric ids (1–4); only real Mongo sticker ids are valid here */
async function resolveStickerId(stickerId, giftValue) {
  if (isValidStickerObjectId(stickerId)) {
    const sticker = await Sticker.findById(stickerId).select('_id');
    if (sticker) return sticker._id;
  }

  const amount = Number(giftValue);
  const pkIconsByValue = {
    10: ['flower', 'rose'],
    50: ['heart'],
    100: ['trophy'],
    500: ['rocket'],
  };
  const icons = pkIconsByValue[amount];
  if (icons?.length) {
    const byIcon = await Sticker.findOne({ icon_name: { $in: icons } }).select('_id');
    if (byIcon) return byIcon._id;
  }

  if (Number.isFinite(amount)) {
    const byPrice = await Sticker.findOne({ price: amount }).select('_id');
    if (byPrice) return byPrice._id;
  }

  return null;
}

// All DB operations now use Mongoose models directly for proper persistence

module.exports = (io) => {
  attachSocketAuth(io);

  setInterval(async () => {
    const { count, removedUserIds } = pruneStalePresence();
    if (!removedUserIds.length) return;
    emitOnlineCountUpdate(count);
    try {
      await User.updateMany(
        { _id: { $in: removedUserIds } },
        { $set: { is_online: false, status: 'offline' } },
      );
    } catch (err) {
      console.error('presence prune db sync error:', err.message);
    }
  }, 30 * 1000);

  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join_user', () => {
      const uid = socket.authenticatedUserId;
      if (!uid) return;
      socket.join(userRoom(uid));
      socket.crimzoUserId = uid;
      console.log(`User ${uid} joined personal room`);
    });

    socket.on('app_presence', async () => {
      const uid = socket.authenticatedUserId;
      if (!uid) return;
      socket.crimzoPresenceUserId = uid;
      const { count, userWasOffline } = registerPresence(uid, socket.id);
      emitOnlineCountUpdate(count);
      socket.emit('online_count_update', { count, at: Date.now() });
      console.log(`User ${uid} app presence (${count} active)`);

      if (userWasOffline) {
        try {
          await User.findByIdAndUpdate(uid, { is_online: true, status: 'online' });
        } catch (err) {
          console.error('app_presence update error:', err.message);
        }
      }
    });

    socket.on('presence_heartbeat', () => {
      if (!socket.crimzoPresenceUserId) return;
      touchPresence(socket.crimzoPresenceUserId, socket.id);
    });

    socket.on('join_battle', async (data) => {
      const { battleId } = data;
      socket.join(battleId);
      console.log(`User ${socket.id} joined battle ${battleId}`);
      
      // Update viewer count for PK battle
      const clients = await io.in(battleId).fetchSockets();
      io.to(battleId).emit('pk_viewer_count', { count: clients.length });
    });

    socket.on('leave_battle', async (data) => {
      const { battleId } = data;
      socket.leave(battleId);
      console.log(`User ${socket.id} left battle ${battleId}`);
      
      // Update viewer count for PK battle
      const clients = await io.in(battleId).fetchSockets();
      io.to(battleId).emit('pk_viewer_count', { count: clients.length });
    });

    socket.on('send_gift', async (data) => {
      const { battleId, hostId, giftValue, stickerId } = data;
      const senderId = socket.authenticatedUserId;

      try {
        if (!senderId || !giftValue || !battleId) return;

        const battle = await PKBattle.findOne({ battle_id: battleId });
        if (!battle) {
          socket.emit('gift_error', { message: 'Battle not found' });
          return;
        }

        if (battle.status !== 'active') {
          socket.emit('gift_error', { message: 'Battle is not active' });
          return;
        }

        if (!hostId) {
          socket.emit('gift_error', { message: 'Invalid gift target' });
          return;
        }

        const isHost1 = String(hostId) === String(battle.host1_id);
        const isHost2 = battle.host2_id && String(hostId) === String(battle.host2_id);
        if (!isHost1 && !isHost2) {
          socket.emit('gift_error', { message: 'Invalid gift target' });
          return;
        }

        const amount = Math.floor(Number(giftValue));
        if (!Number.isFinite(amount) || amount < 1) {
          socket.emit('gift_error', { message: 'Invalid gift amount' });
          return;
        }

        const transfer = await transferGift(senderId, hostId, amount);

        const finalStickerId = await resolveStickerId(stickerId, amount);
        await GiftHistory.create({
          sender_id: senderId,
          receiver_id: hostId,
          sticker_id: finalStickerId || undefined,
          diamonds_spent: amount,
          beans_earned: transfer.beansEarned,
          session_id: battleId,
        });

        if (isHost1) {
          battle.host1_score = (battle.host1_score || 0) + amount;
        } else {
          battle.host2_score = (battle.host2_score || 0) + amount;
        }
        await battle.save();

        const scorePayload = {
          battleId,
          host1_score: battle.host1_score,
          host2_score: battle.host2_score,
        };

        io.to(battleId).emit('score_update', scorePayload);
        io.to(battleId).emit('gift_sent', {
          ...scorePayload,
          hostId: String(hostId),
          side: isHost1 ? 'host1' : 'host2',
          giftValue: amount,
          senderId: String(senderId),
          senderDiamonds: transfer.senderDiamonds,
        });

        emitBalanceUpdate(senderId, { diamonds: transfer.senderDiamonds });
        emitBalanceUpdate(hostId, { beans: transfer.receiverBeans });
        socket.emit('diamond_update', { diamonds: transfer.senderDiamonds });
      } catch (error) {
        console.error('Send gift error:', error);
        const msg = error.message || 'Gift failed';
        socket.emit('gift_error', {
          message: msg.includes('Insufficient') || msg.includes('Not enough') ? 'Not enough diamonds' : msg,
        });
      }
    });

    // PK Battle: opponent joined notification
    socket.on('pk_opponent_joined', (data) => {
      const { battleId, user: joinedUser } = data;
      io.to(battleId).emit('pk_opponent_joined', { battleId, user: joinedUser });
    });

    // PK Battle: battle ended notification
    socket.on('pk_battle_ended', (data) => {
      const { battleId, winner, host1Score, host2Score } = data;
      io.to(battleId).emit('pk_battle_ended', { battleId, winner, host1Score, host2Score });
    });

    // PK Battle: chat message
    socket.on('pk_chat_message', (data) => {
      const { battleId, userId, username, message } = data;
      console.log(`[PK Chat] ${username}: ${message}`);
      io.to(battleId).emit('pk_chat_message', {
        id: `pk_msg_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        type: 'text',
        userId,
        username,
        message,
        timestamp: Date.now()
      });
    });

    // PK Battle: sticker sent in chat
    socket.on('pk_send_sticker', async (data) => {
      const { battleId, userId, username, stickerId, emoji, stickerName } = data;
      console.log(`[PK Sticker] ${username} sent ${stickerName}`);

      let icon_name = 'gift', icon_color = '#FFF', bg_color = '#FF2D55';
      try {
        if (isValidStickerObjectId(stickerId)) {
          const sticker = await Sticker.findById(stickerId).select('icon_name icon_color bg_color');
          if (sticker) {
            icon_name = sticker.icon_name || 'gift';
            icon_color = sticker.icon_color || '#FFF';
            bg_color = sticker.bg_color || '#FF2D55';
          }
        }
      } catch (e) {
        console.error('Fetch sticker icon error:', e);
      }

      io.to(battleId).emit('pk_chat_message', {
        id: `pk_stk_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        type: 'sticker',
        userId,
        username,
        stickerId,
        emoji,
        stickerName,
        icon_name,
        icon_color,
        bg_color,
        timestamp: Date.now()
      });
    });

    // ── Live stream events ──
    socket.on('join_live', async (data) => {
      const { sessionId, userId, username } = data;
      if (!sessionId) return;
      socket.join(`live_${sessionId}`);
      socket.userId = userId;
      socket.crimzoUserId = userId != null ? String(userId) : undefined;
      socket.liveSessionId = String(sessionId);
      socket.username = username;
      console.log(`User ${username} joined live_${sessionId}`);

      try {
        const session = await LiveSession.findById(sessionId).select('user_id status');
        if (session?.status === 'active' && String(session.user_id) === String(userId)) {
          socket.isLiveHost = true;
        }
        const clients = await io.in(`live_${sessionId}`).fetchSockets();
        const count = clients.length;
        await LiveSession.findByIdAndUpdate(sessionId, { viewers_count: count });
        io.to(`live_${sessionId}`).emit('viewer_count_update', { count });
      } catch (err) {
        console.error('join_live error:', err.message);
      }

      io.to(`live_${sessionId}`).emit('live_system_message', {
        type: 'join',
        username: username || 'Someone',
        message: `${username || 'Someone'} joined the stream`
      });
    });

    socket.on('leave_live', async (data) => {
      const { sessionId } = data;
      if (!sessionId) return;
      socket.leave(`live_${sessionId}`);

      try {
        const LiveSession = require('../models/LiveSession');
        const clients = await io.in(`live_${sessionId}`).fetchSockets();
        const count = clients.length;
        await LiveSession.findByIdAndUpdate(sessionId, { viewers_count: count });
        io.to(`live_${sessionId}`).emit('viewer_count_update', { count });
      } catch (err) {
        console.error('leave_live error:', err.message);
      }
    });

    socket.on('live_chat_message', async (data) => {
      const { sessionId, userId, username, message } = data;
      if (!sessionId || !userId || !message?.trim()) return;

      try {
        const allowed = await userCanChatOnLive(sessionId, userId);
        if (!allowed) {
          socket.emit('live_chat_error', {
            code: 'TALK_NOT_ACTIVE',
            message: 'Please send a request to the host and recharge your wallet first. Then you can chat.',
          });
          return;
        }
      } catch (err) {
        console.error('[Live Chat] permission check failed:', err);
        socket.emit('live_chat_error', { code: 'PERMISSION_CHECK_FAILED', message: 'Could not verify chat permission' });
        return;
      }

      console.log(`[Live Chat] ${username}: ${message}`);
      io.to(`live_${sessionId}`).emit('live_chat_message', {
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        type: 'text',
        userId,
        username,
        message: message.trim(),
        timestamp: Date.now()
      });
    });

    socket.on('live_send_sticker', async (data) => {
      const { sessionId, stickerId, emoji, stickerName } = data || {};
      const userId = socket.authenticatedUserId;
      const username = socket.authenticatedUsername;
      if (!sessionId || !userId) return;

      try {
        const allowed = await userCanChatOnLive(sessionId, userId);
        if (!allowed) {
          socket.emit('live_chat_error', {
            code: 'TALK_NOT_ACTIVE',
            message: 'Please send a request to the host and recharge your wallet first. Then you can chat.',
          });
          return;
        }
      } catch (err) {
        console.error('[Live Sticker] permission check failed:', err);
        socket.emit('live_chat_error', { code: 'PERMISSION_CHECK_FAILED', message: 'Could not verify chat permission' });
        return;
      }

      console.log(`[Live Sticker] ${username} sent ${stickerName}`);

      let icon_name = 'gift', icon_color = '#FFF', bg_color = '#FF2D55';
      try {
        if (isValidStickerObjectId(stickerId)) {
          const sticker = await Sticker.findById(stickerId).select('icon_name icon_color bg_color');
          if (sticker) {
            icon_name = sticker.icon_name || 'gift';
            icon_color = sticker.icon_color || '#FFF';
            bg_color = sticker.bg_color || '#FF2D55';
          }
        }
      } catch (e) {
        console.error('Fetch sticker icon error:', e);
      }

      io.to(`live_${sessionId}`).emit('live_chat_message', {
        id: `stk_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        type: 'sticker',
        userId,
        username,
        stickerId,
        emoji,
        stickerName,
        icon_name,
        icon_color,
        bg_color,
        timestamp: Date.now()
      });
    });

    // Legacy viewer events (backward compat)
    socket.on('viewer_join', async (data) => {
      const { sessionId } = data;
      socket.join(`live_${sessionId}`);
      const clients = await io.in(`live_${sessionId}`).fetchSockets();
      io.to(`live_${sessionId}`).emit('viewer_count_update', {
        count: clients.length
      });
    });

    socket.on('viewer_leave', async (data) => {
      const { sessionId } = data;
      socket.leave(`live_${sessionId}`);
      const clients = await io.in(`live_${sessionId}`).fetchSockets();
      io.to(`live_${sessionId}`).emit('viewer_count_update', {
        count: clients.length
      });
    });

    // ── 1-on-1 video call signaling ──
    socket.on('video_call_invite', async (data) => {
      const { calleeId, callerAvatar, channelName } = data || {};
      const callerId = socket.authenticatedUserId;
      const callerName = socket.authenticatedUsername;
      if (!calleeId || !callerId || !channelName) return;

      try {
        await assertCanInteract(callerId, calleeId);
      } catch (permErr) {
        socket.emit('video_call_error', {
          code: permErr.code || 'FOLLOW_REQUIRED',
          message: permErr.message || 'Follow this user and wait until they accept your request.',
        });
        return;
      }

      let callRate = 1;
      try {
        const billingSettings = await getBillingSettings();
        callRate = billingSettings.videoCallRatePerMin;
        if (billingSettings.videoCallBillingEnabled && callRate > 0) {
          const caller = await User.findById(callerId).select('wallet_balance username');
          const balance = caller?.wallet_balance || 0;
          if (balance < callRate) {
            socket.emit('video_call_error', {
              code: 'INSUFFICIENT_BALANCE',
              message: `Please recharge your wallet first. Video call costs ₹${callRate}/min.`,
              ratePerMin: callRate,
              wallet_balance: balance,
              minRequired: callRate,
            });
            return;
          }
        }
      } catch (err) {
        console.error('[VideoCall] balance check failed:', err);
        socket.emit('video_call_error', { code: 'BALANCE_CHECK_FAILED', message: 'Could not verify wallet balance' });
        return;
      }

      io.to(userRoom(calleeId)).emit('video_call_incoming', {
        callerId,
        callerName: callerName || 'Someone',
        callerAvatar: callerAvatar || null,
        channelName,
        ratePerMin: callRate,
      });
      console.log(`[VideoCall] ${callerName} → user ${calleeId} channel=${channelName}`);
    });

    socket.on('video_call_accept', (data) => {
      const { callerId, calleeId, calleeName, channelName } = data || {};
      if (!callerId || !channelName) return;
      io.to(userRoom(callerId)).emit('video_call_accepted', {
        calleeId,
        calleeName: calleeName || 'User',
        channelName,
      });
    });

    socket.on('video_call_reject', (data) => {
      const { callerId, reason } = data || {};
      if (!callerId) return;
      io.to(userRoom(callerId)).emit('video_call_rejected', { reason: reason || 'declined' });
    });

    socket.on('video_call_end', (data) => {
      const { otherUserId, channelName } = data || {};
      if (!otherUserId) return;
      io.to(userRoom(otherUserId)).emit('video_call_ended', { channelName });
    });

    socket.on('disconnect', async () => {
      console.log('User disconnected:', socket.id);
      const sessionId = socket.liveSessionId;
      const userId = socket.crimzoUserId;
      const presenceUserId = socket.crimzoPresenceUserId;

      if (presenceUserId) {
        const { count, userFullyOffline } = unregisterPresence(presenceUserId, socket.id);
        emitOnlineCountUpdate(count);
        console.log(`User ${presenceUserId} left app presence (${count} active)`);

        if (userFullyOffline) {
          try {
            await User.findByIdAndUpdate(presenceUserId, { is_online: false, status: 'offline' });
          } catch (err) {
            console.error('disconnect presence update error:', err.message);
          }
        }
      }

      if (!sessionId || !userId) return;

      try {
        const session = await LiveSession.findById(sessionId).select('user_id status');
        if (session?.status === 'active' && String(session.user_id) === String(userId)) {
          const clients = await io.in(`live_${sessionId}`).fetchSockets();
          const hostStillPresent = clients.some(
            (client) => String(client.crimzoUserId) === String(userId),
          );
          if (!hostStillPresent) {
            await finalizeLiveSessionEnd(sessionId, io, {
              message: 'The host has ended the live stream.',
            });
          }
        } else {
          const clients = await io.in(`live_${sessionId}`).fetchSockets();
          await LiveSession.findByIdAndUpdate(sessionId, { viewers_count: clients.length });
          io.to(`live_${sessionId}`).emit('viewer_count_update', { count: clients.length });
        }
      } catch (err) {
        console.error('disconnect live cleanup error:', err.message);
      }
    });
  });
};
