/**
 * Time utility for Reminder Bot
 * Supports durations (s, m, h, j, d, detik, menit, jam, hari) and clock times (HH:mm)
 * Multi-timezone support (WIB, WITA, WIT)
 * Strictly constrained to a maximum of 24 hours (1 day).
 */

const MAX_DURATION_MS = 24 * 60 * 60 * 1000; // 24 jam dalam milidetik
const MIN_DURATION_MS = 5 * 1000; // Minimal 5 detik

const TIMEZONE_MAP = {
  wib: 'Asia/Jakarta',
  wita: 'Asia/Makassar',
  wit: 'Asia/Jayapura'
};

const TIMEZONE_ABBR = {
  'Asia/Jakarta': 'WIB',
  'Asia/Makassar': 'WITA',
  'Asia/Jayapura': 'WIT'
};

const TIMEZONE_OFFSETS = {
  'Asia/Jakarta': 7 * 3600000,
  'Asia/Makassar': 8 * 3600000,
  'Asia/Jayapura': 9 * 3600000
};

/**
 * Calculate target timestamp from HH:mm in specific timezone
 */
function getTargetTimestamp(hours, minutes, isTomorrow = false, timeZone = 'Asia/Jakarta') {
  const now = new Date();
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const [year, month, day] = dtf.format(now).split('-').map(Number);
  const offsetMs = TIMEZONE_OFFSETS[timeZone] || (7 * 3600000);
  const todayMidnightUtc = Date.UTC(year, month - 1, day) - offsetMs;
  let targetTime = todayMidnightUtc + (hours * 3600 + minutes * 60) * 1000;

  if (isTomorrow) {
    targetTime += 24 * 3600000;
  } else if (targetTime <= now.getTime() + MIN_DURATION_MS) {
    targetTime += 24 * 3600000;
  }
  return targetTime;
}

/**
 * Parse time input string into target timestamp and remaining milliseconds
 * @param {Array<string>} args - Command arguments
 * @param {string} defaultTimezone - e.g. "Asia/Jakarta"
 * @returns {{ targetTime: number, durationMs: number, consumedArgs: number, timeZone: string, error?: string }}
 */
function parseReminderTime(args, defaultTimezone = 'Asia/Jakarta') {
  if (!args || args.length === 0) {
    return { error: 'Waktu pengingat tidak boleh kosong.' };
  }

  const now = Date.now();
  const first = args[0].toLowerCase().trim();
  const second = args[1] ? args[1].toLowerCase().trim() : '';
  const third = args[2] ? args[2].toLowerCase().trim() : '';

  // 1. Cek format "besok HH:mm [tz]" (misal: "besok 08:00" atau "besok 08:00 wita")
  if ((first === 'besok' || first === 'tomorrow') && second) {
    const timeMatch = second.match(/^([01]?[0-9]|2[0-3])[:.]([0-5][0-9])$/);
    if (timeMatch) {
      const hours = parseInt(timeMatch[1], 10);
      const minutes = parseInt(timeMatch[2], 10);

      let targetTimezone = defaultTimezone;
      let consumedArgs = 2;
      if (third && TIMEZONE_MAP[third]) {
        targetTimezone = TIMEZONE_MAP[third];
        consumedArgs = 3;
      }

      const targetTime = getTargetTimestamp(hours, minutes, true, targetTimezone);
      const diff = targetTime - now;

      if (diff > MAX_DURATION_MS) {
        return { error: 'Waktu pengingat melebihi batas maksimal 24 jam (1 hari).' };
      }
      if (diff < MIN_DURATION_MS) {
        return { error: 'Waktu pengingat sudah berlalu atau terlalu dekat (minimal 5 detik).' };
      }

      return {
        targetTime,
        durationMs: diff,
        consumedArgs,
        timeZone: targetTimezone
      };
    }
  }

  // 2. Cek format jam spesifik "HH:mm [tz]" (misal: "14:30", "14:30 wita", "08.00")
  const clockMatch = first.match(/^([01]?[0-9]|2[0-3])[:.]([0-5][0-9])$/);
  if (clockMatch) {
    const hours = parseInt(clockMatch[1], 10);
    const minutes = parseInt(clockMatch[2], 10);

    let targetTimezone = defaultTimezone;
    let consumedArgs = 1;
    if (second && TIMEZONE_MAP[second]) {
      targetTimezone = TIMEZONE_MAP[second];
      consumedArgs = 2;
    }

    const targetTime = getTargetTimestamp(hours, minutes, false, targetTimezone);
    const diff = targetTime - now;

    if (diff > MAX_DURATION_MS) {
      return { error: 'Waktu pengingat melebihi batas maksimal 24 jam (1 hari).' };
    }
    if (diff < MIN_DURATION_MS) {
      return { error: 'Waktu pengingat terlalu dekat (minimal 5 detik).' };
    }

    return {
      targetTime,
      durationMs: diff,
      consumedArgs,
      timeZone: targetTimezone
    };
  }

  // 3. Cek format durasi relatif (misal: "10m", "2j", "30s", "15menit", "2jam")
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

    let targetTimezone = defaultTimezone;
    let consumedArgs = 1;
    if (second && TIMEZONE_MAP[second]) {
      targetTimezone = TIMEZONE_MAP[second];
      consumedArgs = 2;
    }

    return {
      targetTime: now + diff,
      durationMs: diff,
      consumedArgs,
      timeZone: targetTimezone
    };
  }

  return {
    error:
      `Format waktu tidak valid!\n` +
      `Contoh penggunaan:\n` +
      `• *10m* (10 menit)\n` +
      `• *2j* atau *2h* (2 jam)\n` +
      `• *30s* (30 detik)\n` +
      `• *14:30* (jam 14:30 WIB)\n` +
      `• *14:30 wita* (jam 14:30 WITA)\n` +
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
 * Format timestamp into Indonesian friendly date/time with timezone
 * @param {number} timestamp 
 * @param {string} [timeZone='Asia/Jakarta']
 * @returns {string} e.g. "Hari ini, pukul 14:30 WIB" atau "Besok, pukul 08:00 WIB"
 */
function formatTargetDate(timestamp, timeZone = 'Asia/Jakarta') {
  const tzAbbr = TIMEZONE_ABBR[timeZone] || 'WIB';

  const dtfTime = new Intl.DateTimeFormat('id-ID', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  const timeStr = `${dtfTime.format(new Date(timestamp)).replace('.', ':')} ${tzAbbr}`;

  const dtfDate = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const targetDateStr = dtfDate.format(new Date(timestamp));
  const nowDateStr = dtfDate.format(new Date());

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowDateStr = dtfDate.format(tomorrow);

  if (targetDateStr === nowDateStr) {
    return `Hari ini, pukul ${timeStr}`;
  }
  if (targetDateStr === tomorrowDateStr) {
    return `Besok, pukul ${timeStr}`;
  }

  const dtfFull = new Intl.DateTimeFormat('id-ID', {
    timeZone,
    day: 'numeric',
    month: 'short'
  });
  return `${dtfFull.format(new Date(timestamp))}, pukul ${timeStr}`;
}

module.exports = {
  MAX_DURATION_MS,
  MIN_DURATION_MS,
  TIMEZONE_MAP,
  TIMEZONE_ABBR,
  parseReminderTime,
  formatRemaining,
  formatTargetDate
};
