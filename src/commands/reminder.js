const {
  parseReminderTime,
  formatRemaining,
  formatTargetDate,
  TIMEZONE_MAP,
  TIMEZONE_ABBR
} = require('../utils/time.util');
const {
  getUserTimezone,
  setUserTimezone,
  addReminder,
  listReminders,
  cancelReminder
} = require('../services/reminder.service');
const { resolveUserInfo } = require('../utils/user.util');
const logger = require('../utils/logger.util');

module.exports = {
  async execute({ msg, client, args = [] }) {
    const userInfo = await resolveUserInfo(msg, client);
    const userId = userInfo.rawId;
    const chatId = msg.from;
    const isGroup = msg.from.endsWith('@g.us');

    const firstArg = args[0] ? args[0].toLowerCase() : '';

    // 1. Subcommand: TIMEZONE (pengaturan zona waktu pengguna)
    if (['tz', 'timezone', 'zonawaktu'].includes(firstArg)) {
      const targetTzKey = args[1] ? args[1].toLowerCase() : '';
      if (!targetTzKey) {
        const currentTz = getUserTimezone(userId);
        const abbr = TIMEZONE_ABBR[currentTz] || 'WIB';
        return msg.reply(
          `ℹ️ *Pengaturan Zona Waktu:*\n\n` +
          `Zona waktu kamu saat ini: *${abbr}* (${currentTz})\n\n` +
          `Untuk mengubah zona waktu, ketik:\n` +
          `• *!remind tz wib* (Waktu Indonesia Barat / UTC+7)\n` +
          `• *!remind tz wita* (Waktu Indonesia Tengah / UTC+8)\n` +
          `• *!remind tz wit* (Waktu Indonesia Timur / UTC+9)`
        );
      }

      if (!TIMEZONE_MAP[targetTzKey]) {
        return msg.reply(
          `❌ Pilihan zona waktu tidak valid.\n` +
          `Pilihan yang tersedia: *wib*, *wita*, atau *wit*.\n` +
          `_Contoh:_ \`!remind tz wita\``
        );
      }

      const updatedTz = setUserTimezone(userId, targetTzKey);
      const abbr = TIMEZONE_ABBR[updatedTz] || targetTzKey.toUpperCase();
      return msg.reply(`✅ Zona waktu kamu berhasil diatur ke *${abbr}* (${updatedTz}).`);
    }

    // 2. Subcommand: LIST (melihat daftar pengingat)
    if (firstArg === 'list' || firstArg === 'daftar') {
      const userReminders = listReminders(userId);
      if (userReminders.length === 0) {
        return msg.reply(
          `ℹ️ Kamu belum memiliki pengingat aktif yang terpasang.\n\n` +
          `Pasang pengingat dengan: *!remind <durasi/jam> <pesan>*\n` +
          `_Contoh:_ \`!remind 15m Istirahat sebentar\` atau \`!remind 14:30 Jemput adik\``
        );
      }

      let listText = `📋 *DAFTAR PENGINGAT AKTIF KAMU*\n\n`;
      userReminders.forEach((r, idx) => {
        const remainingMs = Math.max(0, r.targetTime - Date.now());
        listText +=
          `${idx + 1}. ⏰ *#${r.id}* — ${formatTargetDate(r.targetTime, r.timeZone)}\n` +
          `   📝 _"${r.message}"_\n` +
          `   ⏳ _Sisa: ${formatRemaining(remainingMs)}_\n\n`;
      });

      listText += `💡 *Tips:* Ketik *!remind cancel <id>* untuk membatalkan (contoh: *!remind cancel ${userReminders[0].id}*).`;
      return msg.reply(listText);
    }

    // 3. Subcommand: CANCEL / BATAL / DELETE
    if (['cancel', 'batal', 'delete', 'hapus'].includes(firstArg)) {
      const targetId = args[1];
      if (!targetId) {
        return msg.reply(
          `ℹ️ Masukkan ID pengingat yang ingin dibatalkan.\n\n` +
          `_Contoh:_ \`!remind cancel a1b2\`\n` +
          `Ketik *!remind list* untuk melihat daftar pengingat dan ID-nya.`
        );
      }

      const success = cancelReminder(userId, targetId);
      if (success) {
        return msg.reply(`✅ Pengingat *#${targetId.replace('#', '')}* berhasil dibatalkan.`);
      } else {
        return msg.reply(
          `❌ Pengingat dengan ID *#${targetId.replace('#', '')}* tidak ditemukan atau sudah selesai.\n` +
          `Ketik *!remind list* untuk mengecek daftar pengingat aktif kamu.`
        );
      }
    }

    // 4. Bantuan Penggunaan
    if (args.length === 0 && !msg.hasQuotedMsg) {
      const userTz = getUserTimezone(userId);
      const abbr = TIMEZONE_ABBR[userTz] || 'WIB';
      return msg.reply(
        `ℹ️ *Cara Menggunakan Pengingat (Reminder):*\n\n` +
        `• *!remind <durasi> <pesan>*\n` +
        `  _Contoh:_ \`!remind 10m Matikan kompor\`\n` +
        `  _Contoh:_ \`!remind 2j Rapat koordinasi\`\n` +
        `  _Contoh:_ \`!remind 45s Cek oven\`\n\n` +
        `• *!remind <jam:menit> [zona] <pesan>*\n` +
        `  _Contoh:_ \`!remind 14:30 Jemput adik di sekolah\`\n` +
        `  _Contoh:_ \`!remind 14:30 wita Rapat divisi\`\n` +
        `  _Contoh:_ \`!remind besok 08:00 Berangkat ke kantor\`\n\n` +
        `• *Reply/Balas Pesan dengan !remind <waktu>*\n` +
        `  _Contoh:_ Reply pesan tugas dengan \`!remind 30m\`\n\n` +
        `• *!remind list* — Lihat daftar pengingat aktif kamu\n` +
        `• *!remind cancel <id>* — Batalkan pengingat\n` +
        `• *!remind tz <wib|wita|wit>* — Atur zona waktu default (saat ini: *${abbr}*)\n\n` +
        `_(Batas maksimal pengingat: 24 jam / 1 hari)_`
      );
    }

    // Ambil zona waktu default pengguna
    const userTimezone = getUserTimezone(userId);

    // Parse waktu
    const parsed = parseReminderTime(args, userTimezone);
    if (parsed.error) {
      return msg.reply(parsed.error);
    }

    // Ambil isi teks pesan
    const messageWords = args.slice(parsed.consumedArgs);
    let reminderMessage = messageWords.join(' ').trim();

    // Jika pesan kosong, periksa apakah me-reply pesan
    if (!reminderMessage && msg.hasQuotedMsg) {
      try {
        const quotedMsg = await msg.getQuotedMessage();
        if (quotedMsg && quotedMsg.body) {
          reminderMessage = quotedMsg.body;
        }
      } catch (err) {
        logger.warn(`[REMINDER] Failed to read quoted message: ${err.message}`);
      }
    }

    if (!reminderMessage) {
      return msg.reply(
        `⚠️ *Pesan pengingat tidak boleh kosong!*\n\n` +
        `_Contoh:_ \`!remind 15m Matikan kompor\`\n` +
        `Atau balas pesan chat yang ingin diingatkan dengan \`!remind 15m\``
      );
    }

    try {
      const reminder = addReminder({
        client,
        userId,
        chatId,
        isGroup,
        message: reminderMessage,
        targetTime: parsed.targetTime,
        displayName: userInfo.displayName,
        phoneNumber: userInfo.phoneNumber,
        timeZone: parsed.timeZone
      });

      const targetDateStr = formatTargetDate(reminder.targetTime, reminder.timeZone);
      const remainingStr = formatRemaining(parsed.durationMs);

      const replyText =
        `✅ *Pengingat Berhasil Dipasang!*\n\n` +
        `📝 *Pesan:* ${reminder.message}\n` +
        `⏰ *Waktu:* ${targetDateStr}\n` +
        `⏳ *Sisa Waktu:* ${remainingStr}\n` +
        `🆔 *ID:* #${reminder.id}\n\n` +
        `_Ketik *!remind list* untuk melihat daftar atau *!remind cancel ${reminder.id}* untuk membatalkan._`;

      await msg.reply(replyText);
    } catch (err) {
      logger.error(`[REMINDER] Error adding reminder: ${err.message}`);
      await msg.reply(`❌ Gagal memasang pengingat: ${err.message}`);
    }
  }
};
