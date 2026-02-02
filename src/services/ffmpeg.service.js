const ffmpeg = require('fluent-ffmpeg');
const config = require('../config/bot.config');

function imageToWebp(input, output) {
  return new Promise((resolve, reject) => {
    ffmpeg(input)
      .outputOptions([
        '-vcodec libwebp',
        `-vf scale=${config.sticker.image.size}:${config.sticker.image.size}:force_original_aspect_ratio=decrease`
      ])
      .save(output)
      .on('end', resolve)
      .on('error', reject);
  });
}

function videoToWebp(input, output, options = {}) {
  const {
    qscale = 60,
    fps = 12,
    compressionLevel = 6
  } = options;

  return new Promise((resolve, reject) => {
    ffmpeg(input)
      .outputOptions([
        '-vcodec libwebp',
        '-an',
        '-loop 0',

        // COMPRESSION (ADAPTIVE)
        '-lossless 0',
        `-qscale ${qscale}`,
        `-compression_level ${compressionLevel}`,

        // FILTER WA-FRIENDLY
        `-vf scale=${config.sticker.video.size}:${config.sticker.video.size}:force_original_aspect_ratio=decrease,` +
        `pad=${config.sticker.video.size}:${config.sticker.video.size}:(ow-iw)/2:(oh-ih)/2:color=0x00000000,` +
        `fps=${fps},setsar=1`,

        `-t ${config.sticker.video.maxDuration}`
      ])
      .save(output)
      .on('end', resolve)
      .on('error', reject);
  });
}

module.exports = { imageToWebp, videoToWebp };
