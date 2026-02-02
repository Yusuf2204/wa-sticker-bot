const fs = require('fs-extra');
const path = require('path');
const { v4: uuid } = require('uuid');
const config = require('../config/bot.config');

async function saveTempFile(media) {
  const ext = media.mimetype.split('/')[1];
  const filePath = path.join(config.paths.temp, `${uuid()}.${ext}`);
  await fs.writeFile(filePath, Buffer.from(media.data, 'base64'));
  return filePath;
}

function removeFile(filePath) {
  fs.remove(filePath).catch(() => {});
}

module.exports = { saveTempFile, removeFile };
