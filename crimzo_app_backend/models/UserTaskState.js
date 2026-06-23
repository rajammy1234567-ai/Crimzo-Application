const mongoose = require('mongoose');

const userTaskStateSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  last_checkin: { type: String, default: null },
  checkin_streak: { type: Number, default: 0 },
  longest_streak: { type: Number, default: 0 },
  /** How many 30-day blocks already rewarded on the current streak cycle */
  streak_milestones_claimed: { type: Number, default: 0 },
  pending_reward: { type: Number, default: 0 },
  pending_diamonds: { type: Number, default: 0 },
  progress: {
    type: Map,
    of: {
      current: { type: Number, default: 0 },
      claimed: { type: Number, default: 0 },
      partial: { type: Number, default: 0 },
      last_reset: { type: String, default: null },
    },
    default: {},
  },
  updated_at: { type: Date, default: Date.now },
}, { timestamps: false });

module.exports = mongoose.model('UserTaskState', userTaskStateSchema);