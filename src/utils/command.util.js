const config = require('../config/bot.config');

function parseCommand(text = '') {
  if (!text.startsWith(config.prefix)) return null;

  const parts = text.slice(1).trim().split(/\s+/);
  return {
    name: parts[0].toLowerCase(),
    args: parts.slice(1)
  };
}

module.exports = { parseCommand };
