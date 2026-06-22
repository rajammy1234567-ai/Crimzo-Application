const User = require('../models/User');
const LiveSession = require('../models/LiveSession');
const { getBillingSettings } = require('../utils/billingSettings');
const { userCanChatOnLive } = require('../controllers/liveTalkController');
const { finalizeLiveSessionEnd } = require('../controllers/liveController');
const PKBattle = require('../models/PKBattle');
const Sticker = require('../models/Sticker');
const GiftHistory = require('../models/GiftHistory');
const { userRoom } = require('../utils/socketEmitter');

// All DB operations now use Mongoose models directly for proper persistence

module.exports = (io) => {
  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join_user', (data) => {
      const { userId } = data || {};
      if (!userId) return;
      socket.join(userRoom(userId));
      socket.crimzoUserId = String(userId);
      console.log(`User ${userId} joined personal room`);
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
      const { battleId, hostId, giftValue, senderId, stickerId } = data;
      
      try {
        if (!senderId || !giftValue) return;

        // Check sender has enough diamonds (using model)
        const sender = await User.findById(senderId).select('diamonds');
        if (!sender || (sender.diamonds || 0) < giftValue) {
          socket.emit('gift_error', { message: 'Not enough diamonds' });
          return;
        }

        const battle = await PKBattle.findOne({ battle_id: battleId });
        if (battle) {
          // Deduct diamonds from sender
          await User.findByIdAndUpdate(senderId, { $inc: { diamonds: -giftValue } });

          if (hostId) {
            await User.findByIdAndUpdate(hostId, { $inc: { diamonds: giftValue } });
          }

          // Log to gift_history
          try {
            let finalStickerId = stickerId;
            if (stickerId) {
              const stickerCheck = await Sticker.findById(stickerId);
              if (!stickerCheck) {
                const fallback = await Sticker.findOne().select('_id');
                finalStickerId = fallback ? fallback._id : null;
              }
            }
            if (finalStickerId) {
              await GiftHistory.create({
                sender_id: senderId,
                receiver_id: hostId || null,
                sticker_id: finalStickerId,
                diamonds_spent: giftValue,
                beans_earned: 0,
                session_id: battleId
              });
            }
          } catch (e) {
            console.log('Gift history log note:', e.message);
          }

          // Update PK battle score
          const isHost1 = String(hostId) === String(battle.host1_id);
          if (isHost1) {
            battle.host1_score = (battle.host1_score || 0) + giftValue;
          } else {
            battle.host2_score = (battle.host2_score || 0) + giftValue;
          }
          await battle.save();

          io.to(battleId).emit('score_update', {
            battleId,
            host1_score: battle.host1_score,
            host2_score: battle.host2_score
          });

          // Notify sender of updated diamond balance
          const updatedSender = await User.findById(senderId).select('diamonds');
          const balance = { diamonds: updatedSender?.diamonds || 0 };
          socket.emit('diamond_update', balance);
          io.to(userRoom(senderId)).emit('diamond_update', balance);
        }
      } catch (error) {
        console.error('Send gift error:', error);
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
        const sticker = await Sticker.findById(stickerId).select('icon_name icon_color bg_color');
        if (sticker) {
          icon_name = sticker.icon_name || 'gift';
          icon_color = sticker.icon_color || '#FFF';
          bg_color = sticker.bg_color || '#FF2D55';
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
      const { sessionId, userId, username, stickerId, emoji, stickerName } = data;
      console.log(`[Live Sticker] ${username} sent ${stickerName}`);

      let icon_name = 'gift', icon_color = '#FFF', bg_color = '#FF2D55';
      try {
        const sticker = await Sticker.findById(stickerId).select('icon_name icon_color bg_color');
        if (sticker) {
          icon_name = sticker.icon_name || 'gift';
          icon_color = sticker.icon_color || '#FFF';
          bg_color = sticker.bg_color || '#FF2D55';
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
      const { calleeId, callerId, callerName, callerAvatar, channelName } = data || {};
      if (!calleeId || !callerId || !channelName) return;

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
