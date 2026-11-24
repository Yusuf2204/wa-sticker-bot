const config = require('../config/bot.config');

module.exports = {
  async execute({ msg }) {
    const p = config.prefix || '!';

    const helpText =
      `🤖 *DAFTAR PERINTAH BOT*\n\n` +
      `🎨 *STICKER MAKER*\n` +
      `• *${p}sticker*\n` +
      `  Buat stiker dari gambar, GIF, atau video (kirim/reply media).\n` +
      `  _Format kustom: \`${p}sticker NamaPack | NamaAuthor\`_\n\n` +
      `📥 *MEDIA DOWNLOADER*\n` +
      `• *${p}ig <link>*\n` +
      `  Download Reels, video, dan foto carousel Instagram.\n` +
      `• *${p}tw <link>*\n` +
      `  Download video, GIF, dan foto dari Twitter / X.\n` +
      `• *${p}tt <link>*\n` +
      `  Download video (No Watermark) dan foto slide TikTok.\n` +
      `• *${p}fb <link>*\n` +
      `  Download video (Reels/Watch) dan foto Facebook.\n\n` +
      `⏰ *PENGINGAT & UTILITY*\n` +
      `• *${p}remind <waktu> <pesan>*\n` +
      `  Pasang pengingat otomatis (maks 24 jam).\n` +
      `  _Contoh: \`${p}remind 15m Istirahat\` atau \`${p}remind 14:30 Jemput adik\`_\n` +
      `• *${p}remind list* — Lihat daftar pengingat aktif\n` +
      `• *${p}remind cancel <id>* — Batalkan pengingat\n\n` +
      `ℹ️ *UMUM & BANTUAN*\n` +
      `• *${p}help*\n` +
      `  Menampilkan daftar menu bantuan ini.\n\n` +
      `────────────────────────\n` +
      `💡 *Tips:* Kamu bisa balas/reply media hasil unduhan apa pun dengan *${p}sticker* untuk langsung menjadikannya stiker!`;

    await msg.reply(helpText);
  }
};
