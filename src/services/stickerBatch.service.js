const logger = require('../utils/logger.util');

const MAX_BATCH_ITEMS = 5;
const ALBUM_WINDOW_MS = 15000;
const INTERACTIVE_WINDOW_MS = 60000;
const INTERACTIVE_REFRESH_MS = 30000;

class StickerBatchService {
  constructor() {
    this.sessions = new Map();
    this.MAX_BATCH_ITEMS = MAX_BATCH_ITEMS;
    this.ALBUM_WINDOW_MS = ALBUM_WINDOW_MS;
    this.INTERACTIVE_WINDOW_MS = INTERACTIVE_WINDOW_MS;
  }

  /**
   * Build unique session key per chat and sender
   * @param {Object} msg
   * @returns {string}
   */
  getKey(msg) {
    const chatId = msg.from;
    const senderId = msg.author || msg.from;
    return `${chatId}_${senderId}`;
  }

  /**
   * Schedule or refresh auto-expiration timer for a session
   */
  _scheduleTimeout(session, durationMs) {
    if (session.timer) {
      clearTimeout(session.timer);
    }

    session.expiresAt = Date.now() + durationMs;
    session.timer = setTimeout(() => {
      const current = this.sessions.get(session.key);
      if (!current) return;

      this.sessions.delete(session.key);
      logger.info(`[BATCH_STICKER] Session expired for ${session.key} (processed: ${current.processedCount}/${current.max})`);

      if (typeof current.onExpire === 'function') {
        try {
          current.onExpire(current);
        } catch (err) {
          logger.warn(`[BATCH_STICKER] onExpire callback error: ${err.message}`);
        }
      }
    }, durationMs);
  }

  /**
   * Start a new batch sticker session
   */
  startSession({
    key,
    chatId,
    senderId,
    max = MAX_BATCH_ITEMS,
    customArgs = [],
    mode = 'interactive',
    statusMsg = null,
    onExpire = null
  }) {
    if (this.sessions.has(key)) {
      this.endSession(key);
    }

    const durationMs = mode === 'album' ? ALBUM_WINDOW_MS : INTERACTIVE_WINDOW_MS;
    const session = {
      key,
      chatId,
      senderId,
      max,
      processedCount: 0,
      customArgs,
      mode,
      statusMsg,
      onExpire,
      createdAt: Date.now(),
      expiresAt: Date.now() + durationMs,
      timer: null
    };

    this.sessions.set(key, session);
    this._scheduleTimeout(session, durationMs);
    logger.info(`[BATCH_STICKER] Started ${mode} session for ${key} (max=${max}, window=${durationMs}ms)`);

    return session;
  }

  /**
   * Retrieve active session if still within quota
   */
  getSession(key) {
    const session = this.sessions.get(key);
    if (!session) return null;
    if (session.processedCount >= session.max) {
      this.endSession(key);
      return null;
    }
    return session;
  }

  /**
   * Increment processed count and conclude or refresh session
   */
  consumeItem(key) {
    const session = this.getSession(key);
    if (!session) return null;

    session.processedCount += 1;
    const isLast = session.processedCount >= session.max;

    if (isLast) {
      if (session.timer) {
        clearTimeout(session.timer);
        session.timer = null;
      }
      this.sessions.delete(key);
      logger.info(`[BATCH_STICKER] Completed session for ${key} (${session.processedCount}/${session.max})`);
    } else if (session.mode === 'interactive') {
      this._scheduleTimeout(session, INTERACTIVE_REFRESH_MS);
    }

    return {
      session,
      index: session.processedCount,
      isLast
    };
  }

  /**
   * Manually terminate an active session
   */
  endSession(key) {
    const session = this.sessions.get(key);
    if (!session) return null;

    if (session.timer) {
      clearTimeout(session.timer);
      session.timer = null;
    }
    this.sessions.delete(key);
    logger.info(`[BATCH_STICKER] Ended session for ${key} (processed: ${session.processedCount}/${session.max})`);
    return session;
  }
}

module.exports = new StickerBatchService();
