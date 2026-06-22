const mongoose = require('mongoose');

const liveTalkRequestSchema = new mongoose.Schema({
  session_id: { type: mongoose.Schema.Types.ObjectId, ref: 'LiveSession', required: true, index: true },
  requester_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  host_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected', 'cancelled'],
    default: 'pending',
  },
  responded_at: { type: Date, default: null },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

liveTalkRequestSchema.index({ session_id: 1, requester_id: 1, status: 1 });

module.exports = mongoose.model('LiveTalkRequest', liveTalkRequestSchema);