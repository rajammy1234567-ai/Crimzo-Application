const mongoose = require('mongoose');

const videoCallSessionSchema = new mongoose.Schema({
  channelName: { type: String, required: true, index: true },
  payerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  peerId: { type: String, default: null },
  ratePerMin: { type: Number, default: 1 },
  minutesCharged: { type: Number, default: 0 },
  totalCharged: { type: Number, default: 0 },
  peer_beans_earned: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ['active', 'ended', 'ended_insufficient'],
    default: 'active',
  },
  startedAt: { type: Date, default: Date.now },
  lastTickAt: { type: Date, default: Date.now },
  endedAt: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model('VideoCallSession', videoCallSessionSchema);