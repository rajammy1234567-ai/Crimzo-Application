const mongoose = require('mongoose');

const liveTalkSessionSchema = new mongoose.Schema({
  session_id: { type: mongoose.Schema.Types.ObjectId, ref: 'LiveSession', required: true, index: true },
  talker_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  host_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  request_id: { type: mongoose.Schema.Types.ObjectId, ref: 'LiveTalkRequest', default: null },
  rate_per_min: { type: Number, default: 1 },
  minutes_charged: { type: Number, default: 0 },
  total_charged: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ['active', 'ended', 'ended_insufficient'],
    default: 'active',
  },
  started_at: { type: Date, default: Date.now },
  last_tick_at: { type: Date, default: Date.now },
  ended_at: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model('LiveTalkSession', liveTalkSessionSchema);