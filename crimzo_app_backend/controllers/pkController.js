const { v4: uuidv4 } = require('uuid');
const PKBattle = require('../models/PKBattle');
const User = require('../models/User');
const LiveSession = require('../models/LiveSession');
const agoraUidUtil = require('../utils/agoraUid');

function safeAgoraUid(userId) {
  const fn = agoraUidUtil.toAgoraUid || agoraUidUtil.deriveAgoraUid;
  if (typeof fn === 'function') {
    try {
      return fn(userId);
    } catch (_) { /* fall through */ }
  }
  const uidStr = String(userId || '').replace(/[^0-9]/g, '');
  const parsed = parseInt(uidStr.slice(-9) || '0', 10);
  if (parsed > 0) return parsed;
  return (Date.now() % 1000000) + 10000;
}
const { getIo } = require('../utils/socketEmitter');

require('../models/PkMonthlyStats');
require('../models/PkMonthlyReward');

function getPkRanking() {
  return require('../utils/pkRanking');
}

const MIN_BATTLE_DURATION = 60;
const MAX_BATTLE_DURATION = 3600;
const DEFAULT_BATTLE_DURATION = 300;
const PRESET_DURATIONS = [180, 300, 600];

function normalizeBattleDuration(raw) {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n)) return DEFAULT_BATTLE_DURATION;
  return Math.min(MAX_BATTLE_DURATION, Math.max(MIN_BATTLE_DURATION, n));
}

function getRemainingSeconds(battle) {
  if (!battle) return 300;
  if (battle.status !== 'active' || !battle.started_at) {
    return battle.duration || 300;
  }
  const elapsed = Math.floor((Date.now() - new Date(battle.started_at).getTime()) / 1000);
  return Math.max(0, (battle.duration || 300) - elapsed);
}

function battleTimerPayload(battle) {
  return {
    duration: battle.duration || 300,
    started_at: battle.started_at || null,
    remainingSeconds: getRemainingSeconds(battle),
  };
}

function emitPkBattlesUpdated() {
  const io = getIo();
  if (io) io.emit('pk_battles_updated');
}

async function autoEndExpiredBattles() {
  const active = await PKBattle.find({ status: 'active', started_at: { $ne: null } });
  for (const battle of active) {
    if (getRemainingSeconds(battle) <= 0) {
      await exports.endBattleInternal(battle);
    }
  }
}

// Helper: build Agora token (only if credentials are configured)
function buildAgoraToken(channelName, uid, role = 'publisher') {
  try {
    const { RtcTokenBuilder, RtcRole } = require('agora-access-token');
    const appId = process.env.AGORA_APP_ID;
    const appCertificate = process.env.AGORA_APP_CERTIFICATE;
    if (!appId || !appCertificate) return null;
    const numericUid = safeAgoraUid(uid);
    const privilegeExpiredTs = Math.floor(Date.now() / 1000) + 3600;
    const rtcRole = role === 'subscriber' ? RtcRole.SUBSCRIBER : RtcRole.PUBLISHER;
    return RtcTokenBuilder.buildTokenWithUid(appId, appCertificate, channelName, numericUid, rtcRole, privilegeExpiredTs);
  } catch (e) {
    console.warn('Agora token build skipped:', e.message);
    return null;
  }
}

// No need for ensurePKTable - Mongoose model + PKBattle schema handles structure and indexes.

// Create PK Battle
exports.createBattle = async (req, res) => {
  try {
    const userId = req.user.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Clean up old stale waiting battles by this user (older than 10 min)
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
    await PKBattle.updateMany(
      { host1_id: userId, status: 'waiting', created_at: { $lt: tenMinAgo } },
      { status: 'ended', ended_at: new Date() }
    );

    const duration = normalizeBattleDuration(req.body?.duration);

    const battleId = uuidv4();
    const channelName = `pk_${battleId}`;

    const uid = safeAgoraUid(userId);
    const token = buildAgoraToken(channelName, uid);

    let battle;
    try {
      battle = await PKBattle.create({
        battle_id: battleId,
        host1_id: userId,
        channel_name: channelName,
        status: 'waiting',
        duration,
      });
    } catch (dbErr) {
      console.error('PKBattle.create failed:', dbErr);
      throw new Error(dbErr?.message || 'Database error creating battle');
    }

    try {
      await User.findByIdAndUpdate(userId, { status: 'pk_waiting' });
    } catch (statusErr) {
      console.log('User status update note:', statusErr.message);
    }

    // Get host info
    const host = await User.findById(userId).select('username avatar').lean();

    res.json({
      success: true,
      battleId,
      channelName,
      token,
      uid,
      appId: process.env.AGORA_APP_ID || null,
      status: 'waiting',
      host1: { id: String(userId), username: host?.username, avatar: host?.avatar, agoraUid: uid },
      duration,
      ...battleTimerPayload(battle),
    });
    emitPkBattlesUpdated();
  } catch (error) {
    console.error('Create PK error:', error);
    const details = error?.message || String(error);
    res.status(500).json({
      error: 'Failed to create PK battle',
      details,
      hint: details.includes('toAgoraUid')
        ? 'Backend needs latest agoraUid.js — redeploy the server'
        : undefined,
    });
  }
};

// Get active PK battles
exports.getActiveBattles = async (req, res) => {
  try {
    // Auto-end stale waiting battles older than 15 min
    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000);
    await PKBattle.updateMany(
      { status: 'waiting', created_at: { $lt: fifteenMinAgo } },
      { status: 'ended', ended_at: new Date() }
    );

    await autoEndExpiredBattles();

    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
    const battles = await PKBattle.find({
      $or: [
        { status: { $in: ['waiting', 'active'] } },
        { status: 'ended', ended_at: { $gte: thirtyMinAgo } },
      ],
    })
      .sort({ created_at: -1 })
      .limit(20)
      .populate('host1_id', 'username avatar')
      .populate('host2_id', 'username avatar')
      .populate('winner_id', 'username avatar')
      .lean();

    const formatted = battles.map((b) => ({
      ...b,
      host1_username: b.host1_id?.username,
      host1_avatar: b.host1_id?.avatar,
      host2_username: b.host2_id?.username,
      host2_avatar: b.host2_id?.avatar,
      host1_id: b.host1_id?._id || b.host1_id,
      host2_id: b.host2_id?._id || b.host2_id,
      winner_id: b.winner_id?._id || b.winner_id || null,
      winner_username: b.winner_id?.username || null,
      remainingSeconds: getRemainingSeconds(b),
    }));

    res.json({ success: true, battles: formatted });
  } catch (error) {
    console.error('Get PK battles error:', error);
    res.status(500).json({ error: 'Failed to get PK battles', details: error.message });
  }
};

// Join PK Battle
exports.joinBattle = async (req, res) => {
  try {
    const { battleId } = req.params;
    const userId = req.user.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const battle = await PKBattle.findOneAndUpdate(
      {
        battle_id: battleId,
        status: 'waiting',
        host1_id: { $ne: userId },
        $or: [{ host2_id: null }, { host2_id: { $exists: false } }],
      },
      { host2_id: userId, status: 'active', started_at: new Date() },
      { new: true },
    );

    if (!battle) {
      const existing = await PKBattle.findOne({ battle_id: battleId }).lean();
      if (existing && String(existing.host1_id) === String(userId)) {
        return res.status(400).json({ error: 'Cannot join your own battle' });
      }
      return res.status(404).json({ error: 'Battle not found or already started' });
    }

    const uid = safeAgoraUid(userId);
    const host1AgoraUid = safeAgoraUid(battle.host1_id);
    const token = buildAgoraToken(battle.channel_name, uid);

    await User.updateMany(
      { _id: { $in: [userId, battle.host1_id] } },
      { status: 'pk_battle' }
    );

    // Get both hosts info
    const host1 = await User.findById(battle.host1_id).select('username avatar').lean();
    const host2 = await User.findById(userId).select('username avatar').lean();

    res.json({
      success: true,
      battleId,
      channelName: battle.channel_name,
      token,
      uid,
      appId: process.env.AGORA_APP_ID || null,
      status: 'active',
      host1: { id: String(battle.host1_id), username: host1?.username, avatar: host1?.avatar, agoraUid: host1AgoraUid },
      host2: { id: String(userId), username: host2?.username, avatar: host2?.avatar, agoraUid: uid },
      ...battleTimerPayload(battle),
    });

    const io = getIo();
    if (io) {
      io.to(battleId).emit('pk_battle_started', {
        battleId,
        ...battleTimerPayload(battle),
      });
      emitPkBattlesUpdated();
    }
  } catch (error) {
    console.error('Join PK error:', error);
    res.status(500).json({ error: 'Failed to join PK battle', details: error.message });
  }
};

// Resume PK Battle (creator or joined host re-enters)
exports.resumeBattle = async (req, res) => {
  try {
    const { battleId } = req.params;
    const userId = req.user.id;

    const battle = await PKBattle.findOne({
      battle_id: battleId,
      status: { $in: ['waiting', 'active'] },
    });
    if (!battle) {
      return res.status(404).json({ error: 'Battle not found or already ended' });
    }

    const isHost1 = String(battle.host1_id) === String(userId);
    const isHost2 = battle.host2_id && String(battle.host2_id) === String(userId);
    if (!isHost1 && !isHost2) {
      return res.status(403).json({ error: 'You are not a participant in this battle' });
    }

    const uid = safeAgoraUid(userId);
    const host1AgoraUid = safeAgoraUid(battle.host1_id);
    const host2AgoraUid = battle.host2_id ? safeAgoraUid(battle.host2_id) : null;
    const token = buildAgoraToken(battle.channel_name, uid);

    const host1 = await User.findById(battle.host1_id).select('username avatar').lean();
    let host2 = null;
    if (battle.host2_id) {
      host2 = await User.findById(battle.host2_id).select('username avatar').lean();
    }

    res.json({
      success: true,
      battleId: battle.battle_id,
      channelName: battle.channel_name,
      token,
      uid,
      appId: process.env.AGORA_APP_ID || null,
      status: battle.status,
      role: isHost1 ? 'host1' : 'host2',
      host1_score: battle.host1_score,
      host2_score: battle.host2_score,
      host1: { id: String(battle.host1_id), username: host1?.username, avatar: host1?.avatar, agoraUid: host1AgoraUid },
      host2: host2 ? { id: String(battle.host2_id), username: host2.username, avatar: host2.avatar, agoraUid: host2AgoraUid } : null,
      duration: battle.duration,
      ...battleTimerPayload(battle),
    });
  } catch (error) {
    console.error('Resume PK error:', error);
    res.status(500).json({ error: 'Failed to resume PK battle', details: error.message });
  }
};

// Watch PK Battle (viewer gets subscriber token)
exports.watchBattle = async (req, res) => {
  try {
    const { battleId } = req.params;
    const userId = req.user.id;

    const battle = await PKBattle.findOne({ battle_id: battleId, status: { $in: ['active', 'waiting'] } });
    if (!battle) {
      return res.status(404).json({ error: 'Battle not found or already ended' });
    }

    const uid = safeAgoraUid(userId);
    const host1AgoraUid = safeAgoraUid(battle.host1_id);
    const host2AgoraUid = battle.host2_id ? safeAgoraUid(battle.host2_id) : null;
    const token = buildAgoraToken(battle.channel_name, uid, 'subscriber');

    // Get host info
    const host1 = await User.findById(battle.host1_id).select('username avatar').lean();
    let host2 = null;
    if (battle.host2_id) {
      host2 = await User.findById(battle.host2_id).select('username avatar').lean();
    }

    res.json({
      success: true,
      battleId,
      channelName: battle.channel_name,
      token,
      uid,
      appId: process.env.AGORA_APP_ID || null,
      status: battle.status,
      host1_score: battle.host1_score,
      host2_score: battle.host2_score,
      host1: { id: String(battle.host1_id), username: host1?.username, avatar: host1?.avatar, agoraUid: host1AgoraUid },
      host2: host2 ? { id: String(battle.host2_id), username: host2.username, avatar: host2.avatar, agoraUid: host2AgoraUid } : null,
      duration: battle.duration,
      ...battleTimerPayload(battle),
    });
  } catch (error) {
    console.error('Watch PK error:', error);
    res.status(500).json({ error: 'Failed to get battle info', details: error.message });
  }
};

exports.endBattleInternal = async (battle) => {
  if (!battle || battle.status === 'ended') return null;

  let winnerId = null;
  if (battle.host1_score > battle.host2_score) {
    winnerId = battle.host1_id;
  } else if (battle.host2_score > battle.host1_score) {
    winnerId = battle.host2_id;
  }

  battle.status = 'ended';
  battle.winner_id = winnerId;
  battle.ended_at = new Date();
  await battle.save();

  try {
    const { recordBattleStats } = getPkRanking();
    await recordBattleStats(battle);
  } catch (statsErr) {
    console.error('PK stats update error:', statsErr.message);
  }

  const userIds = [battle.host1_id, battle.host2_id].filter(Boolean);
  if (userIds.length > 0) {
    await User.updateMany({ _id: { $in: userIds } }, { status: 'online' });
  }

  const result = {
    success: true,
    winnerId: winnerId ? String(winnerId) : null,
    host1_score: battle.host1_score,
    host2_score: battle.host2_score,
    message: winnerId ? 'Battle ended - winner decided!' : 'Battle ended - draw!',
  };

  const io = getIo();
  if (io) {
    io.to(battle.battle_id).emit('pk_battle_ended', {
      battleId: battle.battle_id,
      winner: winnerId ? String(winnerId) : null,
      host1Score: battle.host1_score,
      host2Score: battle.host2_score,
    });
    emitPkBattlesUpdated();
  }

  return result;
};

exports.getLeaderboard = async (req, res) => {
  try {
    const month = typeof req.query?.month === 'string' ? req.query.month : undefined;
    const { getRankingInfo } = getPkRanking();
    const info = await getRankingInfo(req.user?.id, month);
    res.json({ success: true, ...info });
  } catch (error) {
    console.error('PK leaderboard error:', error);
    const { monthKey, formatMonthLabel } = require('../utils/dateKeys');
    const month = monthKey();
    res.json({
      success: true,
      month,
      monthLabel: formatMonthLabel(month),
      rewardDiamonds: 10000,
      rewardDay: 3,
      nextAnnouncement: null,
      nextAnnouncementLabel: '3rd of every month',
      rankingNote: 'Ranked by wins, then total PK score',
      lastWinner: null,
      myRank: { rank: null, wins: 0, total_score: 0, battles_played: 0 },
      leaderboard: [],
      degraded: true,
    });
  }
};

exports.endBattle = async (req, res) => {
  try {
    const { battleId } = req.params;
    const userId = req.user.id;

    const battle = await PKBattle.findOne({ battle_id: battleId });
    if (!battle) {
      return res.status(404).json({ error: 'Battle not found' });
    }

    if (String(battle.host1_id) !== String(userId) && String(battle.host2_id) !== String(userId)) {
      return res.status(403).json({ error: 'Only battle hosts can end the battle' });
    }

    const result = await exports.endBattleInternal(battle);
    res.json(result);
  } catch (error) {
    console.error('End PK error:', error);
    res.status(500).json({ error: 'Failed to end battle', details: error.message });
  }
};
