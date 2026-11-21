const config = require('../config/bot.config');

module.exports = {
  async execute({ msg }) {
    const p = config.prefix || '!';
    const maxDur = config.sticker?.video?.maxDuration || 7;
    const rateLimit = config.rateLimit?.maxRequests || 5;

    const helpText = 
      `🤖 *BANTUAN & PANDUAN BOT STIKER*\n\n` +
      `📋 *Daftar Perintah:*\n` +
      `• *${p}sticker*\n` +
      `  Kirim atau reply media (Gambar / GIF / Video) untuk dijadikan stiker.\n` +
      `• *${p}sticker [Pack] | [Author]*\n` +
      `  Buat stiker dengan metadata kustom (Nama Paket & Pembuat).\n` +
      `  _Contoh:_ \`${p}sticker Lucu Banget | Yusuf\`\n` +
      `• *${p}help*\n` +
      `  Menampilkan panduan dan informasi bot ini.\n\n` +
      `⚙️ *Ketentuan & Batasan:*\n` +
      `• *Format Didukung:* JPG, PNG, GIF, MP4 / Video pendek.\n` +
      `• *Durasi Video:* Maksimal *${maxDur} detik*.\n` +
      `• *Batas Kuota:* *${rateLimit} stiker / menit* per pengguna.\n` +
      `• *Antrean:* Jika server sibuk, stiker akan diproses sesuai antrean.\n\n` +
      `💡 *Tips:* Jika video gagal dikonversi, coba potong durasi menjadi lebih pendek atau gunakan resolusi standar.`;

    await msg.reply(helpText);
  }
};
