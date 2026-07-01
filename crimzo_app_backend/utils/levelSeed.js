const Level = require('../models/Level');

const DEFAULT_LEVELS = [
  {
    level_number: 1,
    name: 'Rookie',
    description: 'Welcome to Crimzo — your journey starts here.',
    price_diamonds: 0,
    showcase_type: 'scooter',
    showcase_emoji: '🛵',
    icon_name: 'bicycle',
    badge_color: '#6B7280',
    is_default: true,
    sort_order: 1,
  },
  {
    level_number: 2,
    name: 'Rider',
    description: 'Sport bike unlocked — ride in style.',
    price_diamonds: 500,
    showcase_type: 'bike',
    showcase_emoji: '🏍️',
    icon_name: 'bicycle',
    badge_color: '#22C55E',
    sort_order: 2,
  },
  {
    level_number: 3,
    name: 'Driver',
    description: 'Sports car for the fast lane.',
    price_diamonds: 2000,
    showcase_type: 'car',
    showcase_model_key: 'golf_gti',
    showcase_emoji: '🚗',
    icon_name: 'car-sport',
    badge_color: '#3B82F6',
    sort_order: 3,
  },
  {
    level_number: 4,
    name: 'Royal',
    description: 'Raja ka Rath — royal entry guaranteed.',
    price_diamonds: 5000,
    showcase_type: 'rath',
    showcase_emoji: '🐎',
    icon_name: 'shield',
    badge_color: '#A855F7',
    sort_order: 4,
  },
  {
    level_number: 5,
    name: 'Elite',
    description: 'Supercar status — elite showcase.',
    price_diamonds: 15000,
    showcase_type: 'supercar',
    showcase_model_key: 'golf_gti',
    showcase_emoji: '🏎️',
    icon_name: 'flash',
    badge_color: '#F59E0B',
    sort_order: 5,
  },
  {
    level_number: 6,
    name: 'Emperor',
    description: 'Luxury yacht on the open sea.',
    price_diamonds: 50000,
    showcase_type: 'yacht',
    showcase_emoji: '🛥️',
    icon_name: 'boat',
    badge_color: '#06B6D4',
    sort_order: 6,
  },
  {
    level_number: 7,
    name: 'Legend',
    description: 'Private jet — sky is yours.',
    price_diamonds: 150000,
    showcase_type: 'jet',
    showcase_emoji: '🚁',
    icon_name: 'airplane',
    badge_color: '#EC4899',
    sort_order: 7,
  },
  {
    level_number: 8,
    name: 'Crimzo King',
    description: 'Golden throne — ultimate prestige.',
    price_diamonds: 500000,
    showcase_type: 'throne',
    showcase_emoji: '👑',
    icon_name: 'trophy',
    badge_color: '#FFD700',
    sort_order: 8,
  },
];

async function seedDefaultLevels() {
  let changed = false;
  for (const level of DEFAULT_LEVELS) {
    const existing = await Level.findOne({ level_number: level.level_number });
    if (existing) {
      const updates = {};
      for (const key of Object.keys(level)) {
        if (key === 'level_number') continue;
        if (existing[key] !== level[key]) updates[key] = level[key];
      }
      if (Object.keys(updates).length) {
        await Level.updateOne({ _id: existing._id }, { $set: updates });
        changed = true;
      }
    } else {
      await Level.create(level);
      changed = true;
    }
  }
  if (changed) console.log('✅ Level catalog synced');
  return changed;
}

module.exports = { DEFAULT_LEVELS, seedDefaultLevels };