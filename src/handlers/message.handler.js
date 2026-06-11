const { parseCommand } = require('../utils/command.util');
const logger = require('../utils/logger.util');
const queueService = require('../services/queue.service');
const rateLimitService = require('../services/rateLimit.service');

const sticker = require('../commands/sticker');
const help = require('../commands/help');

const COMMANDS = {
  sticker,
  help
};

async function handleMessage({ msg, client }) {
  console.log('INCOMING MESSAGE:', {
    from: msg.from,
    body: msg.body,
    hasMedia: msg.hasMedia,
    type: msg.type
  });

  const cmd = parseCommand(msg.body);
  if (!cmd) return;

  const command = COMMANDS[cmd.name];
  if (!command) return;

  // ===== KHUSUS UNTUK COMMAND STICKER SAJA =====
  if (cmd.name === 'sticker') {
    await handleStickerCommand({ msg, client, command });
  } else {
    // Command lain (help, dll) langsung dieksekusi tanpa rate limit & queue
    try {
      await command.execute({ msg, client });
    } catch (err) {
      logger.error(err);
      msg.reply('❌ Terjadi kesalahan saat memproses perintah');
    }
  }
}

// Fungsi terpisah untuk handle sticker dengan rate limit & queue
async function handleStickerCommand({ msg, client, command }) {
  // ===== RATE LIMIT CHECK =====
  const userId = msg.from;
  const rateLimit = rateLimitService.check(userId);
  
  if (!rateLimit.allowed) {
    const status = rateLimitService.getStatus(userId);
    return msg.reply(
      `⚠️ *Rate Limit Exceeded*\n\n` +
      `Kamu sudah membuat ${status.totalUsed} stiker dalam 1 menit.\n` +
      `Mohon tunggu *${rateLimit.resetInSeconds} detik* lagi sebelum mencoba kembali.\n\n` +
      `Limit: *10 sticker/menit/user*`
    );
  }

  // ===== QUEUE SYSTEM =====
  try {
    // Kirim pesan antrean
    const queueStatus = queueService.getStats();
    let queueMessage = `⏳ *Memproses stiker...*\n\n`;
    
    if (queueStatus.pending > 0) {
      queueMessage += `Antrean saat ini: *${queueStatus.pending}* tugas\n`;
      queueMessage += `Aktif: *${queueStatus.active}* proses\n`;
      queueMessage += `Posisi kamu: ~${queueStatus.pending + 1}\n\n`;
      queueMessage += `_Mohon tunggu, stiker akan segera terkirim._`;
    } else {
      queueMessage += `Sedang memproses stiker kamu...\n`;
      queueMessage += `_Bisa memakan waktu beberapa detik._`;
    }
    
    const statusMsg = await msg.reply(queueMessage);
    
    // Tambahkan ke queue
    await queueService.add(async () => {
      try {
        await command.execute({ msg, client });
        
        // Update status message
        if (statusMsg) {
          await statusMsg.delete(true);
        }
        
        // Show remaining quota (optional, bisa dihapus jika dianggap spam)
        const remaining = rateLimitService.getStatus(userId);
        if (remaining.remaining > 0 && remaining.remaining % 3 === 0) {
          // Hanya tampilkan setiap 3 sticker, tidak setiap kali
          await msg.reply(
            `✅ *Stiker berhasil dibuat!*\n\n` +
            `Sisa kuota: *${remaining.remaining}* dari 10 sticker/menit`
          );
        } else if (remaining.remaining === 1) {
          // Peringatan terakhir
          await msg.reply(
            `⚠️ *Peringatan!*\n\n` +
            `Ini adalah stiker terakhir dari kuota 10 sticker/menit.\n` +
            `Silakan tunggu 1 menit untuk melanjutkan.`
          );
        }
        
      } catch (error) {
        // Update status message on error
        if (statusMsg) {
          await statusMsg.delete(true);
        }
        throw error;
      }
    }, { userId });
    
  } catch (err) {
    logger.error(err);
    
    let errorMessage = '❌ Terjadi kesalahan saat memproses stiker';
    
    if (err.message && err.message.includes('timeout')) {
      errorMessage = '⏰ *Timeout!* Proses stiker terlalu lama. Silakan coba lagi.';
    } else if (err.message) {
      errorMessage = `❌ ${err.message}`;
    }
    
    msg.reply(errorMessage);
  }
}

// Optional: Periodic cleanup rate limit records (every 5 minutes)
setInterval(() => {
  rateLimitService.cleanup();
  logger.info('[CLEANUP] Rate limit records cleaned');
}, 5 * 60 * 1000);

// Optional: Log queue stats periodically
setInterval(() => {
  const stats = queueService.getStats();
  logger.info('[QUEUE_STATS]', stats);
}, 60 * 1000);

module.exports = { handleMessage };