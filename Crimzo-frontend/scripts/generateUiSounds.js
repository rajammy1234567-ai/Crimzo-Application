/**
 * Regenerates lib/uiSoundAssets.ts from assets/sounds/*.wav
 * Run: node scripts/generateUiSounds.js
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dir = path.join(root, 'assets', 'sounds');
const map = {
  message_send: 'messageSendWavBase64',
  message_receive: 'messageReceiveWavBase64',
  gift_pop: 'giftPopWavBase64',
};

let out = '// Auto-generated UI sound payloads (base64 WAV). Run: node scripts/generateUiSounds.js\n';
for (const [file, exportName] of Object.entries(map)) {
  const wavPath = path.join(dir, `${file}.wav`);
  if (!fs.existsSync(wavPath)) {
    console.error(`Missing: ${wavPath}`);
    process.exit(1);
  }
  const b = fs.readFileSync(wavPath);
  out += `export const ${exportName} = ${JSON.stringify(b.toString('base64'))};\n`;
}
fs.writeFileSync(path.join(root, 'lib', 'uiSoundAssets.ts'), out);
console.log('Wrote lib/uiSoundAssets.ts');