function info(msg) {
  console.log(`[INFO] ${msg}`);
}

function error(err) {
  // Abaikan error ProtocolError yang tidak kritis
  if (err && err.message && err.message.includes('ProtocolError')) {
    console.debug('[DEBUG] Ignored ProtocolError:', err.message);
    return;
  }
  console.error('[ERROR]', err);
}

function warn(msg) {
  console.warn(`[WARN] ${msg}`);
}

function debug(msg) {
  console.debug(`[DEBUG] ${msg}`);
}

module.exports = { 
  info, 
  error, 
  warn,
  debug
};