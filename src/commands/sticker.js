const { MessageMedia } = require('whatsapp-web.js');
const { createSticker } = require('../services/sticker.service');
const { deleteAfter } = require('../utils/cleanup.util');
const config = require('../config/bot.config');
const logger = require('../utils/logger.util');

module.exports = {
  async execute({ msg, args = [] }) {
    let media = null;
    let stickerPath = null;
    const targetMsg = msg.hasMedia ? msg : (msg.hasQuotedMsg ? await msg.getQuotedMessage().catch(() => null) : null);

    // 1️⃣ Cek apakah ada media di pesan ini atau pesan yang di-reply
    if (!targetMsg || !targetMsg.hasMedia) {
      return msg.reply(
        'ℹ️ *Cara Membuat Stiker:*\n\n' +
        '1. Kirim gambar/video dengan caption `!sticker`\n' +
        '2. Atau reply/balas gambar/video yang sudah ada dengan `!sticker`'
      );
    }

    // 2️⃣ Unduh media
    try {
      media = await targetMsg.downloadMedia();
    } catch (err) {
      console.error('[ERROR downloadMedia]', err);
    }

    if (!media || !media.data) {
      return msg.reply('❌ Gagal mengunduh media dari WhatsApp. Pastikan media masih tersedia dan coba kirim ulang.');
    }

    // 3️⃣ Proses konversi stiker
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
      logger.error(err);
      return msg.reply(
        '❌ Media terlalu kompleks untuk dijadikan stiker.\n' +
        'Coba durasi lebih pendek atau gerakan lebih sedikit.'
      );

    } finally {
      deleteAfter(stickerPath, 5000);
    }
  }
};
