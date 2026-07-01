const Level = require('../models/Level');
const User = require('../models/User');
const { normalizeUserLevelFields } = require('../utils/levelDefaults');

function mapLevelForUser(level, userState) {
  const num = level.level_number;
  const owned = userState.owned_levels.includes(num);
  const nextLevel = userState.user_level + 1;
  return {
    id: level.id || level._id?.toString(),
    level_number: num,
    name: level.name,
    description: level.description || '',
    price_diamonds: level.price_diamonds || 0,
    showcase_type: level.showcase_type,
    showcase_emoji: level.showcase_emoji,
    showcase_image_url: level.showcase_image_url || null,
    showcase_model_key: level.showcase_model_key || null,
    icon_name: level.icon_name,
    badge_color: level.badge_color,
    is_default: !!level.is_default,
    owned,
    equipped: userState.equipped_level === num,
    is_next: num === nextLevel,
    can_purchase: !owned && num === nextLevel,
    locked: !owned && num > nextLevel,
  };
}

async function loadUserLevelState(userId) {
  const user = await User.findById(userId).select('user_level equipped_level owned_levels diamonds').lean();
  if (!user) return null;
  return {
    ...normalizeUserLevelFields(user),
    diamonds: user.diamonds || 0,
  };
}

async function getLevelMeta(levelNumber) {
  return Level.findOne({ level_number: levelNumber, is_active: true }).lean();
}

exports.getLevels = async (req, res) => {
  try {
    const userState = await loadUserLevelState(req.user.id);
    if (!userState) return res.status(404).json({ error: 'User not found' });

    const levels = await Level.find({ is_active: true }).sort({ sort_order: 1, level_number: 1 }).lean();
    const equipped = await getLevelMeta(userState.equipped_level);

    res.json({
      success: true,
      user_level: userState.user_level,
      equipped_level: userState.equipped_level,
      owned_levels: userState.owned_levels,
      diamonds: userState.diamonds,
      next_level: userState.user_level + 1,
      equipped_level_info: equipped ? {
        level_number: equipped.level_number,
        name: equipped.name,
        badge_color: equipped.badge_color,
        showcase_emoji: equipped.showcase_emoji,
        showcase_type: equipped.showcase_type,
      } : null,
      levels: levels.map((l) => mapLevelForUser(l, userState)),
    });
  } catch (error) {
    console.error('Get levels error:', error);
    res.status(500).json({ error: 'Failed to load levels' });
  }
};

exports.getShowcase = async (req, res) => {
  try {
    const userState = await loadUserLevelState(req.user.id);
    if (!userState) return res.status(404).json({ error: 'User not found' });

    const ownedLevels = await Level.find({
      level_number: { $in: userState.owned_levels },
      is_active: true,
    }).sort({ level_number: 1 }).lean();

    res.json({
      success: true,
      equipped_level: userState.equipped_level,
      showcase: ownedLevels.map((l) => mapLevelForUser(l, userState)),
    });
  } catch (error) {
    console.error('Get showcase error:', error);
    res.status(500).json({ error: 'Failed to load showcase' });
  }
};

exports.purchaseLevel = async (req, res) => {
  try {
    const levelNumber = Number(req.params.levelNumber);
    if (!Number.isFinite(levelNumber) || levelNumber < 2) {
      return res.status(400).json({ error: 'Invalid level' });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const state = normalizeUserLevelFields(user);
    if (state.owned_levels.includes(levelNumber)) {
      return res.status(400).json({ error: 'You already own this level', code: 'ALREADY_OWNED' });
    }
    if (levelNumber !== state.user_level + 1) {
      return res.status(400).json({
        error: `Unlock Level ${state.user_level + 1} first`,
        code: 'SEQUENTIAL_REQUIRED',
        next_level: state.user_level + 1,
      });
    }

    const level = await Level.findOne({ level_number: levelNumber, is_active: true });
    if (!level) return res.status(404).json({ error: 'Level not found' });

    const price = level.price_diamonds || 0;
    if ((user.diamonds || 0) < price) {
      return res.status(400).json({
        error: 'Insufficient diamonds',
        code: 'INSUFFICIENT_DIAMONDS',
        required: price,
        balance: user.diamonds || 0,
      });
    }

    user.diamonds = (user.diamonds || 0) - price;
    user.owned_levels = [...state.owned_levels, levelNumber].sort((a, b) => a - b);
    user.user_level = levelNumber;
    user.equipped_level = levelNumber;
    await user.save();

    res.json({
      success: true,
      message: `Level ${levelNumber} — ${level.name} unlocked!`,
      user_level: user.user_level,
      equipped_level: user.equipped_level,
      owned_levels: user.owned_levels,
      diamonds: user.diamonds,
      level: mapLevelForUser(level.toJSON(), normalizeUserLevelFields(user)),
    });
  } catch (error) {
    console.error('Purchase level error:', error);
    res.status(500).json({ error: 'Failed to purchase level' });
  }
};

exports.equipLevel = async (req, res) => {
  try {
    const levelNumber = Number(req.body?.level_number);
    if (!Number.isFinite(levelNumber) || levelNumber < 1) {
      return res.status(400).json({ error: 'Invalid level' });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const state = normalizeUserLevelFields(user);
    if (!state.owned_levels.includes(levelNumber)) {
      return res.status(400).json({ error: 'You do not own this level', code: 'NOT_OWNED' });
    }

    user.equipped_level = levelNumber;
    await user.save();

    const level = await getLevelMeta(levelNumber);
    res.json({
      success: true,
      equipped_level: levelNumber,
      level: level ? mapLevelForUser(level, { ...state, equipped_level: levelNumber }) : null,
    });
  } catch (error) {
    console.error('Equip level error:', error);
    res.status(500).json({ error: 'Failed to equip level' });
  }
};

exports.getPublicLevelInfo = async (userId) => {
  const user = await User.findById(userId).select('user_level equipped_level owned_levels').lean();
  if (!user) return null;
  const state = normalizeUserLevelFields(user);
  const equipped = await getLevelMeta(state.equipped_level);
  if (!equipped) return { user_level: state.user_level, equipped_level: state.equipped_level };
  return {
    user_level: state.user_level,
    equipped_level: state.equipped_level,
    level_name: equipped.name,
    level_badge_color: equipped.badge_color,
    showcase_emoji: equipped.showcase_emoji,
    showcase_type: equipped.showcase_type,
    icon_name: equipped.icon_name,
  };
};