function info(msg) {
  console.log(`[INFO] ${msg}`);
}

function error(err) {
  console.error('[ERROR]', err);
}

module.exports = { info, error };
