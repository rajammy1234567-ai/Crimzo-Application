const mongoose = require('mongoose');

const appSettingsSchema = new mongoose.Schema({
  key: { type: String, unique: true, required: true },
  video_call_rate_per_min_inr: { type: Number, default: 1, min: 0, max: 10000 },
  live_talk_rate_per_min_inr: { type: Number, default: 1, min: 0, max: 10000 },
  video_call_billing_enabled: { type: Boolean, default: true },
  live_talk_billing_enabled: { type: Boolean, default: true },
  /** Cumulative platform (owner) beans from call commission */
  platform_beans_earned: { type: Number, default: 0, min: 0 },
  call_receiver_share: { type: Number, default: 0.7, min: 0, max: 1 },
  call_platform_share: { type: Number, default: 0.3, min: 0, max: 1 },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

module.exports = mongoose.model('AppSettings', appSettingsSchema);