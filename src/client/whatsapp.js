const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const logger = require('../utils/logger.util');
const fs = require('fs');
const path = require('path');

function cleanupSingletonLocks() {
  const sessionDir = path.resolve(__dirname, '../../.wwebjs_auth/session');
  ['SingletonLock', 'SingletonCookie', 'SingletonSocket'].forEach(file => {
    const filePath = path.join(sessionDir, file);
    try {
      // Gunakan unlinkSync langsung (tanpa existsSync karena SingletonLock adalah broken symlink)
      fs.unlinkSync(filePath);
      logger.info(`Removed stale Chromium lock: ${file}`);
    } catch (err) {
      // Abaikan jika file memang tidak ada
    }
  });
}

function initWhatsApp() {
  cleanupSingletonLocks();

  const client = new Client({
    authStrategy: new LocalAuth(),

    puppeteer: {
      headless: true,

      executablePath:
        process.env.PUPPETEER_EXECUTABLE_PATH,

      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    }
  });

  client.on('qr', qr => {
    qrcode.generate(qr, { small: true });
    console.log('\nRAW QR STRING:\n', qr);
  });

  client.on('loading_screen', (percent, message) => {
    console.log(`[LOADING] ${percent}% - ${message}`);
  });

  client.on('change_state', state => {
    console.log(`[STATE] ${state}`);
  });

  client.on('ready', () => {
    logger.info('WhatsApp client ready');
  });

  client.on('authenticated', () => {
    console.log('✅ Berhasil diautentikasi');
  });

  client.on('auth_failure', msg => {
    logger.error(`AUTH FAILED: ${msg}`);
  });

  client.on('disconnected', (reason) => {
    logger.warn(`DISCONNECTED: ${reason}`);
    console.log('Bot terputus. Menghentikan proses agar Docker me-restart kontainer.');
    setTimeout(() => {
      process.exit(1);
    }, 2000);
  });

  client.on('error', (err) => {
    logger.error(`Client error: ${err.message}`);
  });

  return client;
}

module.exports = { initWhatsApp };