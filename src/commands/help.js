module.exports = {
  async execute({ msg }) {
    msg.reply(
      `Perintah tersedia:
!sticker      → gambar/gif/video ke stiker
!help         → bantuan`
    );
  }
};
