const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('../utils/logger.util');
const { formatTargetDate, TIMEZONE_MAP, TIMEZONE_ABBR } = require('../utils/time.util');

const DATA_DIR = path.resolve(__dirname, '../../data');
const DATA_FILE = path.join(DATA_DIR, 'reminders.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'user_settings.json');

// Memory map of active timers: reminderId -> NodeJS.Timeout
const activeTimers = new Map();

/**
 * Ensure data directory and files exist
 */
function ensureStorage() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, '[]', 'utf8');
  }
  if (!fs.existsSync(SETTINGS_FILE)) {
    fs.writeFileSync(SETTINGS_FILE, '{}', 'utf8');
  }
}

/**
 * Load all reminders from disk
 * @returns {Array<Object>}
 */
function loadReminders() {
  try {
    ensureStorage();
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw || '[]');
  } catch (err) {
    logger.error(`[REMINDER] Failed to load reminders: ${err.message}`);
    return [];
  }
}

/**
 * Save all reminders to disk
 * @param {Array<Object>} list 
 */
function saveReminders(list) {
  try {
    ensureStorage();
    fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch (err) {
    logger.error(`[REMINDER] Failed to save reminders: ${err.message}`);
  }
}

/**
 * Load user settings (e.g. timezone preferences)
 * @returns {Object}
 */
function loadUserSettings() {
  try {
    ensureStorage();
    const raw = fs.readFileSync(SETTINGS_FILE, 'utf8');
    return JSON.parse(raw || '{}');
  } catch (err) {
    logger.error(`[REMINDER] Failed to load user settings: ${err.message}`);
    return {};
  }
}

/**
 * Save user settings
 * @param {Object} settings 
 */
function saveUserSettings(settings) {
  try {
    ensureStorage();
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
  } catch (err) {
    logger.error(`[REMINDER] Failed to save user settings: ${err.message}`);
  }
}

/**
 * Get preferred timezone for a user
 * @param {string} userId 
 * @returns {string} e.g. "Asia/Jakarta"
 */
function getUserTimezone(userId) {
  const settings = loadUserSettings();
  return settings[userId]?.timeZone || 'Asia/Jakarta';
}

/**
 * Set preferred timezone for a user
 * @param {string} userId 
 * @param {string} tzKey - 'wib', 'wita', or 'wit'
 * @returns {string|null} e.g. "Asia/Jakarta" or null if invalid
 */
function setUserTimezone(userId, tzKey) {
  const cleanKey = tzKey.toLowerCase().trim();
  const timeZone = TIMEZONE_MAP[cleanKey];
  if (!timeZone) return null;

  const settings = loadUserSettings();
  if (!settings[userId]) settings[userId] = {};
  settings[userId].timeZone = timeZone;
  saveUserSettings(settings);

  return timeZone;
}

/**
 * Trigger and send the reminder message to WhatsApp
 */
async function triggerReminder(client, reminder) {
  logger.info(`[REMINDER] Triggering reminder #${reminder.id} for user ${reminder.userId}`);

  // 1. Bersihkan timer
  if (activeTimers.has(reminder.id)) {
    clearTimeout(activeTimers.get(reminder.id));
    activeTimers.delete(reminder.id);
  }

  // 2. Hapus dari database JSON
  const currentList = loadReminders();
  const updatedList = currentList.filter(r => r.id !== reminder.id);
  saveReminders(updatedList);

  // 3. Susun salam yang rapi & sopan (tanpa ID mentah @lid di chat pribadi)
  let greeting = '';
  if (reminder.isGroup) {
    const mentionTag = reminder.phoneNumber ? `@${reminder.phoneNumber}` : `@${reminder.displayName || 'kamu'}`;
    greeting = `Halo ${mentionTag}, ini pengingat kamu:`;
  } else {
    // Chat Pribadi
    if (reminder.displayName && reminder.phoneNumber) {
      greeting = `Halo *${reminder.displayName}* (+${reminder.phoneNumber}), ini pengingat kamu:`;
    } else if (reminder.phoneNumber) {
      greeting = `Halo *+${reminder.phoneNumber}*, ini pengingat kamu:`;
    } else if (reminder.displayName) {
      greeting = `Halo *${reminder.displayName}*, ini pengingat kamu:`;
    } else {
      greeting = `Halo, ini pengingat kamu:`;
    }
  }

  const createdDateStr = formatTargetDate(reminder.createdAt, reminder.timeZone);
  const text =
    `⏰ *PENGINGAT WAKTU TIBA!*\n\n` +
    `${greeting}\n\n` +
    `📝 *Pesan:* ${reminder.message}\n` +
    `🕒 *Dipasang:* ${createdDateStr}\n\n` +
    `_Semoga harimu menyenangkan! ✨_`;

  try {
    const sendOptions = {};
    if (reminder.isGroup) {
      sendOptions.mentions = [reminder.userId];
    }

    await client.sendMessage(reminder.chatId, text, sendOptions);
    logger.info(`[REMINDER] Reminder #${reminder.id} successfully sent`);
  } catch (err) {
    logger.error(`[REMINDER] Failed to send reminder #${reminder.id}: ${err.message}`);
  }
}

/**
 * Schedule a reminder timer in memory
 */
function scheduleReminder(client, reminder) {
  const now = Date.now();
  const delay = Math.max(0, reminder.targetTime - now);

  // Batalkan timer lama jika ada
  if (activeTimers.has(reminder.id)) {
    clearTimeout(activeTimers.get(reminder.id));
    activeTimers.delete(reminder.id);
  }

  const timer = setTimeout(() => {
    triggerReminder(client, reminder);
  }, delay);

  activeTimers.set(reminder.id, timer);
  logger.info(`[REMINDER] Scheduled reminder #${reminder.id} in ${Math.round(delay / 1000)}s`);
}

/**
 * Initialize all reminders on bot startup
 */
async function init(client) {
  logger.info('[REMINDER] Initializing reminder scheduler...');
  const reminders = loadReminders();
  const now = Date.now();
  const remaining = [];

  for (const reminder of reminders) {
    if (reminder.targetTime <= now) {
      // Reminder terlewat saat bot offline
      logger.warn(`[REMINDER] Reminder #${reminder.id} missed while offline`);
      const createdDateStr = formatTargetDate(reminder.targetTime, reminder.timeZone);
      
      let greeting = '';
      if (reminder.isGroup) {
        const mentionTag = reminder.phoneNumber ? `@${reminder.phoneNumber}` : `@${reminder.displayName || 'kamu'}`;
        greeting = `Halo ${mentionTag},`;
      } else {
        const nameStr = reminder.displayName || (reminder.phoneNumber ? `+${reminder.phoneNumber}` : 'kamu');
        greeting = `Halo *${nameStr}*,`;
      }

      const missedText =
        `⚠️ *PENGINGAT TERLEWAT*\n\n` +
        `${greeting} pengingat ini seharusnya tiba pada:\n` +
        `🕒 ${createdDateStr}\n\n` +
        `📝 *Pesan:* ${reminder.message}\n\n` +
        `_Mohon maaf pengingat terlewat karena bot sempat offline atau sedang maintenance._`;

      try {
        const sendOptions = {};
        if (reminder.isGroup) {
          sendOptions.mentions = [reminder.userId];
        }
        await client.sendMessage(reminder.chatId, missedText, sendOptions);
      } catch (err) {
        logger.error(`[REMINDER] Failed to send missed notification #${reminder.id}: ${err.message}`);
      }
    } else {
      // Masih valid, jadwalkan kembali
      scheduleReminder(client, reminder);
      remaining.push(reminder);
    }
  }

  saveReminders(remaining);
  logger.info(`[REMINDER] ${remaining.length} active reminder(s) restored`);
}

/**
 * Add a new reminder
 * @returns {Object} reminder object
 */
function addReminder({ client, userId, chatId, isGroup, message, targetTime, displayName, phoneNumber, timeZone }) {
  const list = loadReminders();

  // Buat ID singkat (4 karakter hex acak yang unik)
  let id = crypto.randomBytes(2).toString('hex');
  while (list.some(r => r.id === id)) {
    id = crypto.randomBytes(2).toString('hex');
  }

  const reminder = {
    id,
    userId,
    chatId,
    isGroup,
    message,
    createdAt: Date.now(),
    targetTime,
    displayName: displayName || null,
    phoneNumber: phoneNumber || null,
    timeZone: timeZone || 'Asia/Jakarta'
  };

  list.push(reminder);
  saveReminders(list);

  // Jadwalkan timer
  scheduleReminder(client, reminder);

  return reminder;
}

/**
 * List active reminders for a specific user
 * @param {string} userId 
 * @returns {Array<Object>}
 */
function listReminders(userId) {
  const list = loadReminders();
  return list
    .filter(r => r.userId === userId)
    .sort((a, b) => a.targetTime - b.targetTime);
}

/**
 * Cancel a reminder by user and reminder ID
 * @param {string} userId 
 * @param {string} reminderId 
 * @returns {boolean} true if deleted
 */
function cancelReminder(userId, reminderId) {
  const list = loadReminders();
  const cleanId = reminderId.trim().toLowerCase().replace('#', '');

  const index = list.findIndex(r => r.userId === userId && r.id.toLowerCase() === cleanId);
  if (index === -1) {
    return false;
  }

  const [removed] = list.splice(index, 1);
  saveReminders(list);

  if (activeTimers.has(removed.id)) {
    clearTimeout(activeTimers.get(removed.id));
    activeTimers.delete(removed.id);
  }

  logger.info(`[REMINDER] Reminder #${removed.id} cancelled by ${userId}`);
  return true;
}

module.exports = {
  init,
  getUserTimezone,
  setUserTimezone,
  addReminder,
  listReminders,
  cancelReminder
};
