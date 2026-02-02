const { parseCommand } = require('../utils/command.util');
const logger = require('../utils/logger.util');

const sticker = require('../commands/sticker');
const help = require('../commands/help');

const COMMANDS = {
  sticker,
  help
};

async function handleMessage({ msg, client }) {
  console.log('INCOMING MESSAGE:', {
    from: msg.from,
    body: msg.body,
    hasMedia: msg.hasMedia,
    type: msg.type
  });

  const cmd = parseCommand(msg.body);
  if (!cmd) return;

  const command = COMMANDS[cmd.name];
  if (!command) return;

  try {
    await command.execute({ msg, client });
  } catch (err) {
    logger.error(err);
    msg.reply('❌ Terjadi kesalahan saat memproses stiker');
  }
}

module.exports = { handleMessage };
