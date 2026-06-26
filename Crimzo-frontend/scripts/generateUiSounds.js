/**
 * Generates UI notification WAV files + lib/uiSoundAssets.ts
 * Run: node scripts/generateUiSounds.js
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dir = path.join(root, 'assets', 'sounds');

function createWavBuffer(samples, sampleRate = 22050) {
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  return buffer;
}

function synthTone(sampleRate, freq, startSec, durationSec, volume, type = 'sine') {
  const start = Math.floor(startSec * sampleRate);
  const len = Math.floor(durationSec * sampleRate);
  const out = new Float32Array(start + len);
  for (let i = 0; i < len; i++) {
    const t = i / sampleRate;
    const env = Math.exp(-t * 9) * (1 - Math.exp(-t * 120));
    let wave;
    const phase = 2 * Math.PI * freq * t;
    if (type === 'triangle') {
      wave = (2 / Math.PI) * Math.asin(Math.sin(phase));
    } else {
      wave = Math.sin(phase);
    }
    const harmonic = Math.sin(phase * 2) * 0.18 + Math.sin(phase * 3) * 0.06;
    out[start + i] += (wave + harmonic) * volume * env;
  }
  return out;
}

function synthNoiseBurst(sampleRate, startSec, durationSec, volume) {
  const start = Math.floor(startSec * sampleRate);
  const len = Math.floor(durationSec * sampleRate);
  const out = new Float32Array(start + len);
  for (let i = 0; i < len; i++) {
    const t = i / sampleRate;
    const env = Math.exp(-t * 22);
    out[start + i] += (Math.random() * 2 - 1) * volume * env;
  }
  return out;
}

function mergeLayers(sampleRate, durationSec, layers) {
  const total = Math.floor(durationSec * sampleRate);
  const mix = new Float32Array(total);
  for (const layer of layers) {
    const buf = layer(sampleRate);
    for (let i = 0; i < Math.min(buf.length, total); i++) {
      mix[i] += buf[i];
    }
  }
  let peak = 0;
  for (let i = 0; i < mix.length; i++) peak = Math.max(peak, Math.abs(mix[i]));
  const gain = peak > 0 ? Math.min(1, 0.92 / peak) : 1;
  return Array.from(mix, (v) => v * gain);
}

function writeSynth(fileName, durationSec, layers) {
  const sampleRate = 22050;
  const samples = mergeLayers(sampleRate, durationSec, layers);
  fs.writeFileSync(path.join(dir, fileName), createWavBuffer(samples, sampleRate));
}

function generateAllSounds() {
  fs.mkdirSync(dir, { recursive: true });

  writeSynth('message_send.wav', 0.14, [
    (sr) => synthTone(sr, 740, 0, 0.1, 0.42),
    (sr) => synthTone(sr, 988, 0.03, 0.1, 0.28),
  ]);

  writeSynth('message_receive.wav', 0.22, [
    (sr) => synthTone(sr, 587, 0, 0.14, 0.38),
    (sr) => synthTone(sr, 784, 0.06, 0.16, 0.32, 'triangle'),
  ]);

  writeSynth('gift_pop.wav', 0.42, [
    (sr) => synthTone(sr, 523, 0, 0.22, 0.45),
    (sr) => synthTone(sr, 659, 0.08, 0.2, 0.38),
    (sr) => synthTone(sr, 784, 0.16, 0.24, 0.34),
    (sr) => synthNoiseBurst(sr, 0.02, 0.08, 0.12),
  ]);

  writeSynth('gift_send.wav', 0.55, [
    (sr) => synthTone(sr, 523, 0, 0.18, 0.5),
    (sr) => synthTone(sr, 659, 0.1, 0.18, 0.48),
    (sr) => synthTone(sr, 784, 0.2, 0.2, 0.46),
    (sr) => synthTone(sr, 1047, 0.32, 0.22, 0.55),
    (sr) => synthNoiseBurst(sr, 0.34, 0.12, 0.14),
    (sr) => synthTone(sr, 1319, 0.36, 0.14, 0.22),
  ]);

  writeSynth('gift_receive.wav', 0.48, [
    (sr) => synthTone(sr, 880, 0, 0.2, 0.52),
    (sr) => synthTone(sr, 1175, 0.14, 0.24, 0.5),
    (sr) => synthTone(sr, 1568, 0.22, 0.18, 0.28),
    (sr) => synthNoiseBurst(sr, 0.05, 0.1, 0.1),
  ]);

  writeSynth('gift_mega.wav', 0.95, [
    (sr) => synthTone(sr, 262, 0, 0.35, 0.35),
    (sr) => synthTone(sr, 392, 0.05, 0.3, 0.32),
    (sr) => synthTone(sr, 523, 0.12, 0.28, 0.5),
    (sr) => synthTone(sr, 659, 0.22, 0.28, 0.48),
    (sr) => synthTone(sr, 784, 0.32, 0.3, 0.46),
    (sr) => synthTone(sr, 1047, 0.44, 0.35, 0.58),
    (sr) => synthTone(sr, 1319, 0.56, 0.32, 0.42),
    (sr) => synthNoiseBurst(sr, 0.5, 0.2, 0.16),
    (sr) => synthTone(sr, 1568, 0.62, 0.28, 0.35),
  ]);
}

const map = {
  message_send: 'messageSendWavBase64',
  message_receive: 'messageReceiveWavBase64',
  gift_pop: 'giftPopWavBase64',
  gift_send: 'giftSendWavBase64',
  gift_receive: 'giftReceiveWavBase64',
  gift_mega: 'giftMegaWavBase64',
};

generateAllSounds();

let out = '// Auto-generated UI sound payloads (base64 WAV). Run: node scripts/generateUiSounds.js\n';
for (const [file, exportName] of Object.entries(map)) {
  const wavPath = path.join(dir, `${file}.wav`);
  const b = fs.readFileSync(wavPath);
  out += `export const ${exportName} = ${JSON.stringify(b.toString('base64'))};\n`;
}
fs.writeFileSync(path.join(root, 'lib', 'uiSoundAssets.ts'), out);
console.log('Generated sounds + lib/uiSoundAssets.ts');