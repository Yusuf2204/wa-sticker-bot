const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const config = require('../config/bot.config');
const { saveTempFile, removeFile } = require('../utils/file.util');
const { imageToWebp, videoToWebp } = require('./ffmpeg.service');

const MAX_SIZE_KB = 800;

const VIDEO_PRESETS = [
  { qscale: 60, fps: 12, compressionLevel: 6 },
  { qscale: 50, fps: 10, compressionLevel: 6 },
  { qscale: 45, fps: 10, compressionLevel: 6 },
  { qscale: 40, fps: 8,  compressionLevel: 6 }
];

async function createSticker(media) {
  const input = await saveTempFile(media);
  const output = path.join(config.paths.temp, `${uuidv4()}.webp`);

  try {
    // ===== IMAGE STATIS =====
    if (media.mimetype.startsWith('image/') && media.mimetype !== 'image/gif') {
      await imageToWebp(input, output);
      return output;
    }

    // ===== VIDEO & GIF (ADAPTIVE) =====
    if (media.mimetype.startsWith('video/') || media.mimetype === 'image/gif') {
      for (const preset of VIDEO_PRESETS) {
        await videoToWebp(input, output, preset);

        const sizeKB = fs.statSync(output).size / 1024;
        if (sizeKB <= MAX_SIZE_KB) {
          return output; 
        }
      }

      throw new Error('Video terlalu kompleks untuk dijadikan stiker');
    }

    throw new Error('Unsupported media type');
  } finally {
    removeFile(input);
  }
}

module.exports = {
  createSticker
};
