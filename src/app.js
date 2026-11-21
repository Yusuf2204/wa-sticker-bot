const fs = require('fs');
const path = require('path');
const config = require('./config/bot.config');
const { initWhatsApp } = require('./client/whatsapp');
const { handleMessage } = require('./handlers/message.handler');
const logger = require('./utils/logger.util');

process.on('unhandledRejection', (reason, promise) => {
  console.error('[UNHANDLED REJECTION]', reason);
});

process.on('uncaughtException', err => {
  console.error('[UNCAUGHT EXCEPTION]', err);
});

function cleanTempDirOnBoot() {
  const tempDir = path.resolve(__dirname, '../', config.paths?.temp || 'temp');
  if (fs.existsSync(tempDir)) {
    try {
      const files = fs.readdirSync(tempDir);
      let count = 0;
      for (const file of files) {
        if (file === '.gitkeep') continue;
        const filePath = path.join(tempDir, file);
        if (fs.statSync(filePath).isFile()) {
          fs.unlinkSync(filePath);
          count++;
        }
      }
      if (count > 0) {
        logger.info(`[STARTUP] Cleaned ${count} orphaned temporary file(s)`);
      }
    } catch (err) {
      logger.warn(`[STARTUP] Failed to clean temp dir: ${err.message}`);
    }
  }
}

cleanTempDirOnBoot();

const client = initWhatsApp();

client.on('message_create', msg => {
  handleMessage({ msg, client });
});

client.initialize().catch(err => {
  logger.error(err);
});
