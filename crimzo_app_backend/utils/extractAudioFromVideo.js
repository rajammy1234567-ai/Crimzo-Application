const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

let ffmpegPath = null;
try {
  ffmpegPath = require('ffmpeg-static');
} catch {
  ffmpegPath = null;
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) {
      return reject(new Error('ffmpeg is not available on this server'));
    }

    const proc = spawn(ffmpegPath, args, { windowsHide: true });
    let stderr = '';

    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) return resolve(stderr);
      reject(new Error(stderr.trim() || 'Audio extraction failed'));
    });
  });
}

async function safeUnlink(filePath) {
  try {
    await fs.promises.unlink(filePath);
  } catch {
    // ignore cleanup errors
  }
}

/** Extract AAC audio track from a video buffer (returns .m4a buffer). */
async function extractAudioFromVideo(videoBuffer) {
  if (!videoBuffer?.length) {
    throw new Error('Video file is empty');
  }

  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const inputPath = path.join(os.tmpdir(), `crimzo_import_${stamp}.mp4`);
  const outputPath = path.join(os.tmpdir(), `crimzo_audio_${stamp}.m4a`);

  await fs.promises.writeFile(inputPath, videoBuffer);

  try {
    await runFfmpeg([
      '-i', inputPath,
      '-vn',
      '-acodec', 'aac',
      '-b:a', '192k',
      '-movflags', '+faststart',
      '-y',
      outputPath,
    ]);

    const audioBuffer = await fs.promises.readFile(outputPath);
    if (!audioBuffer?.length) {
      throw new Error('No audio found in this video');
    }

    return audioBuffer;
  } finally {
    await safeUnlink(inputPath);
    await safeUnlink(outputPath);
  }
}

module.exports = { extractAudioFromVideo, hasFfmpeg: !!ffmpegPath };