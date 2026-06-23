const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  section: { type: String, enum: ['newbie', 'daily', 'monthly'], required: true },
  reward_type: { type: String, enum: ['beans', 'diamonds'], default: 'beans' },
  reward_amount: { type: Number, default: 10 },
  max_count: { type: Number, default: 1 },
  action_type: {
    type: String,
    enum: ['manual', 'spend_diamonds', 'buy_diamonds', 'watch_live', 'send_gift', 'follow', 'invite', 'like_moment', 'live_message'],
    default: 'manual',
  },
  action_target: { type: Number, default: 1 },
  deep_link: { type: String, default: '' },
  is_active: { type: Boolean, default: true },
  sort_order: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('Task', taskSchema);