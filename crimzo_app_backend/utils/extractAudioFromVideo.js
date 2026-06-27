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

const MIME_EXT = {
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/x-m4v': '.m4v',
  'video/3gpp': '.3gp',
  'video/3gpp2': '.3g2',
  'video/webm': '.webm',
  'video/x-matroska': '.mkv',
  'video/mpeg': '.mpeg',
  'application/octet-stream': '.mp4',
};

function guessInputExtension(mimeType, originalName) {
  if (originalName) {
    const ext = path.extname(String(originalName)).toLowerCase();
    if (ext && ext.length <= 6) return ext;
  }
  const mime = String(mimeType || '').toLowerCase().split(';')[0].trim();
  return MIME_EXT[mime] || '.mp4';
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
    // ignore
  }
}

async function tryExtract(inputPath, outputPath, args) {
  await runFfmpeg(['-i', inputPath, ...args, '-y', outputPath]);
  const audioBuffer = await fs.promises.readFile(outputPath);
  if (!audioBuffer?.length) {
    throw new Error('No audio found in this video');
  }
  return audioBuffer;
}

/** Extract audio track from a video buffer (returns .m4a or .mp3 buffer). */
async function extractAudioFromVideo(videoBuffer, opts = {}) {
  if (!videoBuffer?.length) {
    throw new Error('Video file is empty');
  }

  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const inputExt = guessInputExtension(opts.mimeType, opts.originalName);
  const inputPath = path.join(os.tmpdir(), `crimzo_import_${stamp}${inputExt}`);
  const m4aPath = path.join(os.tmpdir(), `crimzo_audio_${stamp}.m4a`);
  const mp3Path = path.join(os.tmpdir(), `crimzo_audio_${stamp}.mp3`);

  await fs.promises.writeFile(inputPath, videoBuffer);

  const strategies = [
    {
      out: m4aPath,
      args: ['-vn', '-map', '0:a:0?', '-acodec', 'aac', '-b:a', '192k', '-movflags', '+faststart'],
    },
    {
      out: mp3Path,
      args: ['-vn', '-map', '0:a:0?', '-acodec', 'libmp3lame', '-q:a', '2'],
    },
    {
      out: m4aPath,
      args: ['-vn', '-map', '0:a:0?', '-acodec', 'copy'],
    },
  ];

  let lastError = null;

  try {
    for (const strategy of strategies) {
      await safeUnlink(strategy.out);
      try {
        return await tryExtract(inputPath, strategy.out, strategy.args);
      } catch (err) {
        lastError = err;
        const msg = String(err.message || '').toLowerCase();
        if (/does not contain any stream|invalid data found|no audio|output file is empty/i.test(msg)) {
          throw new Error('This video has no audio track to extract');
        }
      }
    }
    throw lastError || new Error('Could not extract audio from video');
  } finally {
    await safeUnlink(inputPath);
    await safeUnlink(m4aPath);
    await safeUnlink(mp3Path);
  }
}

module.exports = { extractAudioFromVideo, hasFfmpeg: !!ffmpegPath, guessInputExtension };