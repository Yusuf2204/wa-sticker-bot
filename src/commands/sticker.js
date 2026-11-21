const { MessageMedia } = require('whatsapp-web.js');
const { createSticker } = require('../services/sticker.service');
const { deleteAfter } = require('../utils/cleanup.util');
const config = require('../config/bot.config');

module.exports = {
  async execute({ msg, args = [] }) {
    let media = null;
    let stickerPath = null;

    try {
      // 1️⃣ Jika pesan ini sendiri mengandung media
      if (msg.hasMedia) {
        media = await msg.downloadMedia();
      }

      // 2️⃣ Jika reply ke pesan lain (GRUP / DM)
      else if (msg.hasQuotedMsg) {
        const quotedMsg = await msg.getQuotedMessage();
        media = await quotedMsg.downloadMedia();
      }
    } catch {
      media = null;
    }

    // 3️⃣ Tidak ada media sama sekali
    if (!media) {
      return msg.reply(
        'Reply pesan berisi gambar / GIF / video dengan `!sticker`'
      );
    }

    try {
      stickerPath = await createSticker(media);

      // Metadata stiker kustom atau default
      let packName = config.sticker?.packName || 'wa-sticker-bot';
      let author = config.sticker?.author || 'JJ HomeServer';

      if (args && args.length > 0) {
        const fullArgs = args.join(' ');
        if (fullArgs.includes('|')) {
          const parts = fullArgs.split('|');
          if (parts[0].trim()) packName = parts[0].trim();
          if (parts[1].trim()) author = parts[1].trim();
        } else if (fullArgs.trim()) {
          packName = fullArgs.trim();
        }
      }

      const stickerMedia = MessageMedia.fromFilePath(stickerPath);
      await msg.reply(stickerMedia, undefined, {
        sendMediaAsSticker: true,
        stickerName: packName,
        stickerAuthor: author
      });

    } catch (err) {
      return msg.reply(
        '❌ Media terlalu kompleks untuk dijadikan stiker.\n' +
        'Coba durasi lebih pendek atau gerakan lebih sedikit.'
      );

    } finally {
      deleteAfter(stickerPath, 5000);
    }
  }
};
