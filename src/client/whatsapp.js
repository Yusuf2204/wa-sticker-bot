const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const logger = require('../utils/logger.util');

function initWhatsApp() {
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
        '--disable-gpu',
        '--no-first-run'
      ]
    }
  });

  client.on('qr', qr => {
    qrcode.generate(qr, { small: true });
    console.log('\nRAW QR STRING:\n', qr);
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
    // Jangan auto-restart di sini karena bisa loop
    console.log('Bot terputus. Restart manual jika perlu.');
  });

  client.on('error', (err) => {
    logger.error(`Client error: ${err.message}`);
  });

  return client;
}

module.exports = { initWhatsApp };