/**
 * Offline verification for 1-on-1 call channel naming, UID hashing, and rate resolution.
 * Run: node scripts/verify-call-flow.js
 */
const { deriveAgoraUid } = require('../utils/agoraUid');

function isVideoCallChannel(channelName) {
  const ch = String(channelName || '');
  return ch.startsWith('vc_live_vid_')
    || (ch.startsWith('vc_') && !ch.startsWith('vc_voice_') && !ch.startsWith('vc_live_'));
}

function frontendToAgoraUid(userId) {
  if (typeof userId === 'number' && userId > 0 && userId < 4294967295) return userId;
  const str = String(userId || '').trim();
  if (!str) return (Date.now() % 1000000) + 10001;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  const uid = (hash % 0x7ffffffe) + 1;
  return uid > 0 ? uid : 10001;
}

const samples = [
  '507f1f77bcf86cd799439011',
  '674a1b2c3d4e5f6789012345',
  'user-abc-123',
  42,
];

let failed = 0;
for (const id of samples) {
  const be = deriveAgoraUid(id);
  const fe = frontendToAgoraUid(id);
  if (be !== fe) {
    console.error(`UID MISMATCH for ${id}: backend=${be} frontend=${fe}`);
    failed += 1;
  }
}

const channels = [
  ['vc_voice_123_a_b', false],
  ['vc_123_a_b', true],
  ['vc_live_abc_viewer', false],
  ['vc_live_vid_abc_viewer', true],
];

for (const [ch, expectVideo] of channels) {
  const isVideo = isVideoCallChannel(ch);
  if (isVideo !== expectVideo) {
    console.error(`CHANNEL RATE MISMATCH ${ch}: got video=${isVideo} expected=${expectVideo}`);
    failed += 1;
  }
}

if (failed === 0) {
  console.log('OK: call flow verification passed (UID hash + channel rate detection).');
  process.exit(0);
}

console.error(`FAILED: ${failed} check(s)`);
process.exit(1);