const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const logger = require('../utils/logger.util');

function initWhatsApp() {
  const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
  });

  client.on('qr', qr => {
    qrcode.generate(qr, { small: true });
    console.log('\nRAW QR STRING:\n', qr);
  });

  client.on('ready', () => {
    logger.info('WhatsApp client ready');
  });

  return client;
}

module.exports = { initWhatsApp };
