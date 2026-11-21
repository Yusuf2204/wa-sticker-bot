const { MessageMedia } = require('whatsapp-web.js');
const { createSticker } = require('../services/sticker.service');
const { deleteAfter } = require('../utils/cleanup.util');
const config = require('../config/bot.config');
const logger = require('../utils/logger.util');

module.exports = {
  async execute({ msg, client, args = [] }) {
    let media = null;
    let stickerPath = null;
    let targetMsg = null;

    if (msg.hasMedia) {
      targetMsg = msg;
    } else if (msg.hasQuotedMsg) {
      try {
        targetMsg = await msg.getQuotedMessage();
      } catch (err) {
        logger.warn(`[STICKER] Failed to get quoted message: ${err.message}`);
      }
    }

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
      logger.info(`[STICKER] Downloading media for msg id=${targetMsg.id?._serialized || targetMsg.id?.$1}, type=${targetMsg.type}`);
      media = await targetMsg.downloadMedia();

      // Fallback: Jika downloadMedia() gagal pada quoted message (karena diskrepansi @c.us vs @lid),
      // coba unduh menggunakan stanza ID dengan JID chat asal (msg.from)
      if ((!media || !media.data) && msg.hasQuotedMsg && targetMsg.id) {
        const stanzaId = targetMsg.id.id;
        const fromMe = targetMsg.id.fromMe ? 'true' : 'false';
        const altId = `${fromMe}_${msg.from}_${stanzaId}`;
        const currentId = targetMsg.id._serialized || targetMsg.id.$1;

        if (altId !== currentId && client && client.pupPage) {
          logger.info(`[STICKER] Retrying download with alternate mapped ID: ${altId}`);
          const altResult = await client.pupPage.evaluate(async (mappedId) => {
            const resolved = await window.WWebJS.resolveMediaBlob(mappedId);
            if (!resolved) return null;
            const data = await window.WWebJS.arrayBufferToBase64Async(
              await resolved.blob.arrayBuffer()
            );
            return {
              data,
              mimetype: resolved.mimetype,
              filename: resolved.filename,
              filesize: resolved.filesize
            };
          }, altId);

          if (altResult && altResult.data) {
            media = new MessageMedia(altResult.mimetype, altResult.data, altResult.filename, altResult.filesize);
            logger.info(`[STICKER] Alternate mapped download succeeded: mimetype=${media.mimetype}, size=${media.data.length}`);
          }
        }
      }
    } catch (err) {
      logger.error(`[ERROR downloadMedia] ${err.message}`);
    }

    if (!media || !media.data) {
      return msg.reply('❌ Gagal mengunduh media dari WhatsApp. Pastikan media masih tersedia dan coba kirim ulang.');
    }

    logger.info(`[STICKER] Media ready for processing (mimetype: ${media.mimetype}, size: ${media.data.length} chars)`);

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
