const config = require('../config/bot.config');

module.exports = {
  async execute({ msg }) {
    const p = config.prefix || '!';

    const helpText =
      `🤖 *MENU BOT*\n\n` +
      `• *${p}sticker*\n` +
      `  Buat stiker dari gambar/video (kirim/reply media).\n` +
      `  _Kustom nama: \`${p}sticker Paket | Pembuat\`_\n\n` +
      `• *${p}ig <link>*\n` +
      `  Download reels, video, atau foto Instagram.\n\n` +
      `• *${p}tw <link>*\n` +
      `  Download video dari Twitter / X.\n\n` +
      `• *${p}tt <link>*\n` +
      `  Download video / slide TikTok tanpa watermark.\n\n` +
      `• *${p}help*\n` +
      `  Menampilkan menu bantuan ini.\n\n` +
      `_💡 Tips: Reply media hasil download dengan ${p}sticker untuk dijadikan stiker!_`;

    await msg.reply(helpText);
  }
};
