const { parseCommand } = require('../utils/command.util');
const logger = require('../utils/logger.util');
const config = require('../config/bot.config');
const queueService = require('../services/queue.service');
const rateLimitService = require('../services/rateLimit.service');
const stickerBatchService = require('../services/stickerBatch.service');

const sticker = require('../commands/sticker');
const help = require('../commands/help');
const ig = require('../commands/ig');
const tw = require('../commands/tw');
const tt = require('../commands/tt');
const fb = require('../commands/fb');
const reminder = require('../commands/reminder');

const COMMANDS = {
  sticker,
  help,
  ig,
  instagram: ig,
  tw,
  twitter: tw,
  x: tw,
  tt,
  tiktok: tt,
  fb,
  facebook: fb,
  reminder,
  remind: reminder,
  ingatkan: reminder
};

async function handleMessage({ msg, client }) {
  console.log('INCOMING MESSAGE:', {
    from: msg.from,
    body: msg.body,
    hasMedia: msg.hasMedia,
    hasQuotedMsg: msg.hasQuotedMsg,
    type: msg.type,
    rawType: msg._data?.type,
    mimetype: msg._data?.mimetype,
    directPath: Boolean(msg._data?.directPath),
    quoted: Boolean(msg._data?.quotedMsg)
  });

  const batchKey = stickerBatchService.getKey(msg);
  const userId = msg.author || msg.from;

  const cmd = parseCommand(msg.body);
  if (!cmd) {
    // Tangkap media lanjutan tanpa caption jika user sedang dalam sesi batch sticker
    const activeSession = stickerBatchService.getSession(batchKey);
    const bodyText = msg.body || '';
    if (
      activeSession &&
      msg.hasMedia &&
      (msg.type === 'image' || msg.type === 'video') &&
      !bodyText.startsWith('✅') &&
      !bodyText.startsWith('📸')
    ) {
      await handleBatchMediaItem({
        msg,
        client,
        command: COMMANDS.sticker,
        batchKey,
        userId
      });
    }
    return;
  }

  const command = COMMANDS[cmd.name];
  if (!command) return;

  // ===== KHUSUS UNTUK COMMAND STICKER SAJA =====
  if (cmd.name === 'sticker') {
    const subCmd = cmd.args[0]?.toLowerCase();
    if (subCmd === 'batch') {
      await handleStickerBatchCommand({
        msg,
        client,
        command,
        args: cmd.args.slice(1),
        batchKey,
        userId
      });
    } else if (['stop', 'cancel', 'batal', 'done', 'selesai'].includes(subCmd)) {
      const ended = stickerBatchService.endSession(batchKey);
      if (ended) {
        if (ended.statusMsg) {
          try {
            await ended.statusMsg.delete(true);
          } catch (_) {}
        }
        await msg.reply(
          `✅ *Sesi Batch Stiker Ditutup.*\n` +
          `Total diproses: *${ended.processedCount}/${ended.max}* stiker.`
        );
      } else {
        await msg.reply('ℹ️ Tidak ada sesi batch stiker yang sedang aktif.');
      }
    } else {
      await handleStickerCommand({ msg, client, command, args: cmd.args });
    }
  } else {
    // Command lain (help, dll) langsung dieksekusi tanpa rate limit & queue
    try {
      await command.execute({ msg, client, args: cmd.args });
    } catch (err) {
      logger.error(err);
      msg.reply('❌ Terjadi kesalahan saat memproses perintah');
    }
  }
}

async function handleStickerBatchCommand({ msg, client, command, args, batchKey, userId }) {
  const subArg = args[0]?.toLowerCase();
  if (['stop', 'cancel', 'batal', 'done', 'selesai'].includes(subArg)) {
    const ended = stickerBatchService.endSession(batchKey);
    if (ended) {
      if (ended.statusMsg) {
        try {
          await ended.statusMsg.delete(true);
        } catch (_) {}
      }
      return msg.reply(
        `✅ *Sesi Batch Stiker Ditutup.*\n` +
        `Total diproses: *${ended.processedCount}/${ended.max}* stiker.`
      );
    }
    return msg.reply('ℹ️ Tidak ada sesi batch stiker yang sedang aktif.');
  }

  const status = rateLimitService.getStatus(userId);
  const maxLimit = config.rateLimit?.maxRequests || 5;
  if (status.remaining <= 0) {
    return msg.reply(
      `⚠️ *Rate Limit Exceeded*\n\n` +
      `Kamu sudah menggunakan ${status.totalUsed} stiker dalam 1 menit.\n` +
      `Mohon tunggu *${status.resetInSeconds} detik* lagi sebelum memulai batch baru.\n\n` +
      `Limit: *${maxLimit} sticker/menit/user*`
    );
  }

  const maxItems = Math.min(stickerBatchService.MAX_BATCH_ITEMS, status.remaining);

  // Opsi 1: Auto-Album Capture (kirim media + caption !sticker batch)
  if (msg.hasMedia) {
    let statusMsg = null;
    try {
      statusMsg = await msg.reply(
        `⏳ *Memproses Batch Stiker (maks ${maxItems} media)...*\n` +
        `_Mohon tunggu, stiker akan dikirim satu per satu._`
      );
    } catch (err) {
      logger.warn(`Could not send batch status message: ${err.message}`);
    }

    stickerBatchService.startSession({
      key: batchKey,
      chatId: msg.from,
      senderId: userId,
      max: maxItems,
      customArgs: args,
      mode: 'album',
      statusMsg,
      onExpire: async (expiredSession) => {
        if (expiredSession.statusMsg) {
          try {
            await expiredSession.statusMsg.delete(true);
          } catch (_) {}
        }
      }
    });

    await handleBatchMediaItem({ msg, client, command, batchKey, userId });
    return;
  }

  // Cek apakah me-reply pesan media dengan !sticker batch
  if (msg.hasQuotedMsg) {
    try {
      const quotedMsg = await msg.getQuotedMessage();
      if (quotedMsg && quotedMsg.hasMedia) {
        stickerBatchService.startSession({
          key: batchKey,
          chatId: msg.from,
          senderId: userId,
          max: maxItems,
          customArgs: args,
          mode: 'interactive'
        });

        await handleBatchMediaItem({ msg, client, command, batchKey, userId });

        if (maxItems > 1) {
          await msg.reply(
            `📦 *Mode Batch Stiker Aktif!* (1/${maxItems} diproses)\n\n` +
            `Kamu bisa kirim hingga *${maxItems - 1} gambar/video* lagi tanpa caption dalam 60 detik.\n` +
            `🛑 Ketik *!sticker stop* jika sudah selesai.`
          );
        }
        return;
      }
    } catch (err) {
      logger.warn(`[BATCH_STICKER] Failed to inspect quoted message: ${err.message}`);
    }
  }

  // Opsi 2: Interactive Batch Session (teks !sticker batch tanpa media)
  stickerBatchService.startSession({
    key: batchKey,
    chatId: msg.from,
    senderId: userId,
    max: maxItems,
    customArgs: args,
    mode: 'interactive',
    onExpire: async (expiredSession) => {
      if (expiredSession.processedCount > 0) {
        try {
          await client.sendMessage(
            expiredSession.chatId,
            `⏱️ *Sesi Batch Stiker Berakhir.* (${expiredSession.processedCount}/${expiredSession.max} stiker diproses).`
          );
        } catch (_) {}
      }
    }
  });

  await msg.reply(
    `📦 *Mode Batch Stiker Aktif!*\n\n` +
    `Silakan kirim hingga *${maxItems} gambar/video* (bisa pilih banyak sekaligus dari galeri atau kirim satu per satu tanpa caption).\n\n` +
    `⏳ *Waktu tunggu:* 60 detik\n` +
    `🛑 Ketik *!sticker stop* jika sudah selesai lebih awal.`
  );
}

async function handleBatchMediaItem({ msg, client, command, batchKey, userId }) {
  const rateLimit = rateLimitService.check(userId);
  const maxLimit = config.rateLimit?.maxRequests || 5;

  if (!rateLimit.allowed) {
    const ended = stickerBatchService.endSession(batchKey);
    if (ended?.statusMsg) {
      try {
        await ended.statusMsg.delete(true);
      } catch (_) {}
    }
    const status = rateLimitService.getStatus(userId);
    return msg.reply(
      `⚠️ *Rate Limit Exceeded*\n\n` +
      `Kamu sudah membuat ${status.totalUsed} stiker dalam 1 menit.\n` +
      `Mohon tunggu *${rateLimit.resetInSeconds} detik* lagi sebelum mencoba kembali.\n\n` +
      `Limit: *${maxLimit} sticker/menit/user*`
    );
  }

  const consumed = stickerBatchService.consumeItem(batchKey);
  if (!consumed) return;

  const { session, index, isLast } = consumed;

  try {
    await queueService.add(async () => {
      await command.execute({ msg, client, args: session.customArgs });

      if (isLast) {
        if (session.statusMsg) {
          try {
            await session.statusMsg.delete(true);
          } catch (_) {}
        }

        if (session.mode === 'interactive' || index > 1) {
          await msg.reply(
            `✅ *Batch Stiker Selesai!* (${index}/${session.max} stiker berhasil dibuat).`
          );
        }
      }
    }, { userId });
  } catch (err) {
    logger.error(`[BATCH_STICKER] Error processing item ${index}/${session.max}: ${err.message}`);
    let errorMessage = `❌ Gagal memproses media ke-${index}`;
    if (err.message && err.message.includes('timeout')) {
      errorMessage = `⏰ *Timeout!* Proses media ke-${index} terlalu lama.`;
    } else if (err.message) {
      errorMessage = `❌ Media ke-${index}: ${err.message}`;
    }
    await msg.reply(errorMessage);
  }
}

// Fungsi terpisah untuk handle sticker dengan rate limit & queue
async function handleStickerCommand({ msg, client, command, args }) {
  // ===== RATE LIMIT CHECK =====
  const userId = msg.from;
  const rateLimit = rateLimitService.check(userId);
  const maxLimit = config.rateLimit?.maxRequests || 5;
  
  if (!rateLimit.allowed) {
    const status = rateLimitService.getStatus(userId);
    return msg.reply(
      `⚠️ *Rate Limit Exceeded*\n\n` +
      `Kamu sudah membuat ${status.totalUsed} stiker dalam 1 menit.\n` +
      `Mohon tunggu *${rateLimit.resetInSeconds} detik* lagi sebelum mencoba kembali.\n\n` +
      `Limit: *${maxLimit} sticker/menit/user*`
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
    
    let statusMsg = null;
    try {
      statusMsg = await msg.reply(queueMessage);
    } catch (err) {
      logger.warn(`Could not send queue status message: ${err.message}`);
    }
    
    // Tambahkan ke queue
    await queueService.add(async () => {
      try {
        await command.execute({ msg, client, args });
        
        // Update status message safely
        if (statusMsg) {
          try {
            await statusMsg.delete(true);
          } catch (_) {
            // Abaikan jika bot bukan admin di grup atau pesan sudah tidak bisa dihapus
          }
        }
        
        // Show remaining quota (optional, bisa dihapus jika dianggap spam)
        const remaining = rateLimitService.getStatus(userId);
        if (remaining.remaining > 0 && remaining.remaining % 3 === 0) {
          // Hanya tampilkan setiap 3 sticker, tidak setiap kali
          await msg.reply(
            `✅ *Stiker berhasil dibuat!*\n\n` +
            `Sisa kuota: *${remaining.remaining}* dari ${maxLimit} sticker/menit`
          );
        } else if (remaining.remaining === 1) {
          // Peringatan terakhir
          await msg.reply(
            `⚠️ *Peringatan!*\n\n` +
            `Ini adalah stiker terakhir dari kuota ${maxLimit} sticker/menit.\n` +
            `Silakan tunggu 1 menit untuk melanjutkan.`
          );
        }
        
      } catch (error) {
        // Update status message on error safely
        if (statusMsg) {
          try {
            await statusMsg.delete(true);
          } catch (_) {}
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