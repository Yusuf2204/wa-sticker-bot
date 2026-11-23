const fs = require('fs');
const { MessageMedia } = require('whatsapp-web.js');
const { downloadTwitter } = require('../services/downloader.service');
const { deleteAfter } = require('../utils/cleanup.util');
const logger = require('../utils/logger.util');

const TWITTER_REGEX =
  /https?:\/\/(?:(?:www|mobile)\.)?(?:twitter\.com|x\.com)\/(?:#!\/)?[a-zA-Z0-9_]+\/status\/[0-9]+/i;

module.exports = {
  async execute({ msg, client, args = [] }) {
    let targetUrl = null;

    // 1. Cari URL dari argumen perintah
    if (args.length > 0) {
      const match = args.join(' ').match(TWITTER_REGEX);
      if (match) {
        targetUrl = match[0];
      }
    }

    // 2. Jika tidak ada di argumen, cek apakah me-reply pesan yang berisi link Twitter/X
    if (!targetUrl && msg.hasQuotedMsg) {
      try {
        const quotedMsg = await msg.getQuotedMessage();
        if (quotedMsg && quotedMsg.body) {
          const match = quotedMsg.body.match(TWITTER_REGEX);
          if (match) {
            targetUrl = match[0];
          }
        }
      } catch (err) {
        logger.warn(`[TW] Failed to get quoted message: ${err.message}`);
      }
    }

    // 3. Validasi URL
    if (!targetUrl) {
      return msg.reply(
        `ℹ️ *Cara Menggunakan Downloader Twitter / X:*\n\n` +
        `Ketik: *!tw <link twitter/x>*\n` +
        `_Contoh:_ \`!tw https://x.com/user/status/123456789\`\n\n` +
        `Atau balas/reply pesan yang berisi link Twitter/X dengan mengetik *!tw*`
      );
    }

    let statusMsg = null;
    try {
      statusMsg = await msg.reply('⏳ *Sedang memproses dan mengunduh media Twitter/X...*\n_Mohon tunggu sebentar._');
    } catch (_) {}

    try {
      logger.info(`[TW] Starting download for: ${targetUrl}`);
      const result = await downloadTwitter(targetUrl);

      const items = result.items || (result.filePath ? [result] : []);
      if (items.length === 0) {
        throw new Error('Tidak ada media yang berhasil diunduh.');
      }

      const total = items.length;
      for (let i = 0; i < total; i++) {
        const item = items[i];
        if (!item.filePath || !fs.existsSync(item.filePath)) continue;

        const media = MessageMedia.fromFilePath(item.filePath);
        let caption = undefined;

        if (total === 1) {
          caption =
            `✅ *Twitter / X Downloader*\n\n` +
            `🔗 *Link:* ${targetUrl}\n` +
            `💡 *Tips:* Balas/reply media ini dengan *!sticker* untuk menjadikannya stiker!`;
        } else {
          caption = `📸 *Slide ${i + 1}/${total}*`;
          if (i === 0) {
            caption += `\n\n🔗 *Link:* ${targetUrl}\n💡 *Tips:* Balas media ini dengan *!sticker* untuk menjadikannya stiker!`;
          }
        }

        await msg.reply(media, undefined, { caption });

        // Hapus file sementara setelah 20 detik
        deleteAfter(item.filePath, 20000);
      }

      // Hapus pesan status loading jika bisa
      if (statusMsg) {
        try {
          await statusMsg.delete(true);
        } catch (_) {}
      }
    } catch (err) {
      logger.error(`[TW] Error downloading: ${err.message}`);
      if (statusMsg) {
        try {
          await statusMsg.delete(true);
        } catch (_) {}
      }
      await msg.reply(`❌ *Gagal Mengunduh:*\n\n${err.message}`);
    }
  }
};
