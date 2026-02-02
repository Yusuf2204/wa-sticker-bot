const { initWhatsApp } = require('./client/whatsapp');
const { handleMessage } = require('./handlers/message.handler');
const logger = require('./utils/logger.util');

const client = initWhatsApp();

client.on('message', msg => {
  handleMessage({ msg, client });
});

client.initialize().catch(err => {
  logger.error(err);
});
