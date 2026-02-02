const { MessageMedia } = require('whatsapp-web.js');
const { createSticker } = require('../services/sticker.service');
const { deleteAfter } = require('../utils/cleanup.util');

module.exports = {
  async execute({ msg }) {
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

      const stickerMedia = MessageMedia.fromFilePath(stickerPath);
      await msg.reply(stickerMedia, undefined, {
        sendMediaAsSticker: true
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
