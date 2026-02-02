const fs = require('fs');

/**
 * Hapus file dengan aman (tidak throw error)
 */
function safeUnlink(filePath) {
  if (!filePath) return;

  fs.unlink(filePath, err => {
  });
}

/**
 * Hapus file setelah delay (ms)
 */
function deleteAfter(filePath, delayMs = 5000) {
  setTimeout(() => safeUnlink(filePath), delayMs);
}

module.exports = {
  safeUnlink,
  deleteAfter
};
