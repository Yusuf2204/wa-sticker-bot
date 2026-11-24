/**
 * Time utility for Reminder Bot
 * Supports durations (s, m, h, j, d, detik, menit, jam, hari) and clock times (HH:mm)
 * Strictly constrained to a maximum of 24 hours (1 day).
 */

const MAX_DURATION_MS = 24 * 60 * 60 * 1000; // 24 jam dalam milidetik
const MIN_DURATION_MS = 5 * 1000; // Minimal 5 detik

/**
 * Parse time input string into target timestamp and remaining milliseconds
 * @param {string} timeStr - e.g. "10m", "2h", "14:30", "besok 08:00", "45s"
 * @param {string} [nextArg] - optional next argument if user typed "besok 08:00"
 * @returns {{ targetTime: number, durationMs: number, consumedArgs: number, error?: string }}
 */
function parseReminderTime(args) {
  if (!args || args.length === 0) {
    return { error: 'Waktu pengingat tidak boleh kosong.' };
  }

  const now = Date.now();
  const first = args[0].toLowerCase().trim();
  const second = args[1] ? args[1].toLowerCase().trim() : '';

  // 1. Cek format "besok HH:mm" (misal: "besok 08:00" atau "besok 08.00")
  if ((first === 'besok' || first === 'tomorrow') && second) {
    const timeMatch = second.match(/^([01]?[0-9]|2[0-3])[:.]([0-5][0-9])$/);
    if (timeMatch) {
      const hours = parseInt(timeMatch[1], 10);
      const minutes = parseInt(timeMatch[2], 10);

      const target = new Date(now);
      target.setDate(target.getDate() + 1);
      target.setHours(hours, minutes, 0, 0);

      const diff = target.getTime() - now;
      if (diff > MAX_DURATION_MS) {
        return { error: 'Waktu pengingat melebihi batas maksimal 24 jam (1 hari).' };
      }
      if (diff < MIN_DURATION_MS) {
        return { error: 'Waktu pengingat sudah berlalu atau terlalu dekat (minimal 5 detik).' };
      }

      return {
        targetTime: target.getTime(),
        durationMs: diff,
        consumedArgs: 2
      };
    }
  }

  // 2. Cek format jam spesifik "HH:mm" (misal: "14:30", "08.00")
  const clockMatch = first.match(/^([01]?[0-9]|2[0-3])[:.]([0-5][0-9])$/);
  if (clockMatch) {
    const hours = parseInt(clockMatch[1], 10);
    const minutes = parseInt(clockMatch[2], 10);

    const target = new Date(now);
    target.setHours(hours, minutes, 0, 0);

    // Jika waktu tersebut sudah lewat hari ini, jadwalkan untuk besok di jam yang sama
    if (target.getTime() <= now + MIN_DURATION_MS) {
      target.setDate(target.getDate() + 1);
    }

    const diff = target.getTime() - now;
    if (diff > MAX_DURATION_MS) {
      return { error: 'Waktu pengingat melebihi batas maksimal 24 jam (1 hari).' };
    }
    if (diff < MIN_DURATION_MS) {
      return { error: 'Waktu pengingat terlalu dekat (minimal 5 detik).' };
    }

    return {
      targetTime: target.getTime(),
      durationMs: diff,
      consumedArgs: 1
    };
  }

  // 3. Cek format durasi relatif (misal: "10m", "2h", "30s", "1j", "15menit", "2jam")
  const durationMatch = first.match(/^(\d+)\s*(s|sec|detik|m|min|menit|h|j|jam|hour|d|hari|day)$/i);
  if (durationMatch) {
    const value = parseInt(durationMatch[1], 10);
    const unit = durationMatch[2].toLowerCase();

    let multiplier = 1000; // default detik
    if (['m', 'min', 'menit'].includes(unit)) {
      multiplier = 60 * 1000;
    } else if (['h', 'j', 'jam', 'hour'].includes(unit)) {
      multiplier = 60 * 60 * 1000;
    } else if (['d', 'hari', 'day'].includes(unit)) {
      multiplier = 24 * 60 * 60 * 1000;
    }

    const diff = value * multiplier;

    if (diff > MAX_DURATION_MS) {
      return { error: 'Waktu pengingat melebihi batas maksimal 24 jam (1 hari).' };
    }
    if (diff < MIN_DURATION_MS) {
      return { error: 'Waktu pengingat terlalu singkat (minimal 5 detik).' };
    }

    return {
      targetTime: now + diff,
      durationMs: diff,
      consumedArgs: 1
    };
  }

  return {
    error:
      `Format waktu tidak valid!\n` +
      `Contoh penggunaan:\n` +
      `• *10m* (10 menit)\n` +
      `• *2j* atau *2h* (2 jam)\n` +
      `• *30s* (30 detik)\n` +
      `• *14:30* (jam 14:30 hari ini/besok)\n` +
      `_(Maksimal durasi 24 jam)_`
  };
}

/**
 * Format milliseconds into friendly Indonesian duration string
 * @param {number} ms 
 * @returns {string} e.g. "1 jam 30 menit", "45 menit", "10 detik"
 */
function formatRemaining(ms) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts = [];
  if (hours > 0) parts.push(`${hours} jam`);
  if (minutes > 0) parts.push(`${minutes} menit`);
  if (seconds > 0 && hours === 0) parts.push(`${seconds} detik`);

  return parts.length > 0 ? parts.join(' ') : 'beberapa saat';
}

/**
 * Format timestamp into Indonesian friendly date/time
 * @param {number} timestamp 
 * @returns {string} e.g. "Hari ini, 14:30 WIB" atau "Besok, 08:00 WIB"
 */
function formatTargetDate(timestamp) {
  const target = new Date(timestamp);
  const now = new Date();

  const isToday =
    target.getDate() === now.getDate() &&
    target.getMonth() === now.getMonth() &&
    target.getFullYear() === now.getFullYear();

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow =
    target.getDate() === tomorrow.getDate() &&
    target.getMonth() === tomorrow.getMonth() &&
    target.getFullYear() === tomorrow.getFullYear();

  const pad = n => String(n).padStart(2, '0');
  const timeStr = `${pad(target.getHours())}:${pad(target.getMinutes())} WIB`;

  if (isToday) {
    return `Hari ini, pukul ${timeStr}`;
  }
  if (isTomorrow) {
    return `Besok, pukul ${timeStr}`;
  }

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${target.getDate()} ${months[target.getMonth()]}, pukul ${timeStr}`;
}

module.exports = {
  MAX_DURATION_MS,
  MIN_DURATION_MS,
  parseReminderTime,
  formatRemaining,
  formatTargetDate
};
