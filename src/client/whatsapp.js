const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const logger = require('../utils/logger.util');
const { patchUtilsOnDisk, injectBrowserPatch } = require('../utils/patch.util');
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

async function dismissModals(pupPage) {
  if (!pupPage || pupPage.isClosed()) return;
  try {
    const result = await pupPage.evaluate(() => {
      const dismissed = [];
      const buttons = Array.from(document.querySelectorAll('button, div[role="button"]'));
      
      const continueBtn = buttons.find(b => {
        const txt = (b.innerText || b.textContent || '').trim().toLowerCase();
        return txt === 'continue' || txt === 'lanjutkan' || txt === 'ok' || txt === 'got it';
      });
      if (continueBtn) {
        continueBtn.click();
        dismissed.push('Continue button');
      }

      const useHereBtn = buttons.find(b => {
        const txt = (b.innerText || b.textContent || '').trim().toLowerCase();
        return txt.includes('use here') || txt.includes('gunakan di sini');
      });
      if (useHereBtn) {
        useHereBtn.click();
        dismissed.push('Use Here button');
      }

      const closeBtn = document.querySelector('span[data-icon="x"]')?.closest('button, div[role="button"]');
      if (closeBtn && dismissed.length === 0) {
        closeBtn.click();
        dismissed.push('Close (X) button');
      }

      return dismissed;
    });

    if (result && result.length > 0) {
      logger.info(`[MODAL] Dismissed popup: ${result.join(', ')}`);
    }
  } catch (err) {
    // ignore
  }
}

function initWhatsApp() {
  cleanupSingletonLocks();
  patchUtilsOnDisk();

  const client = new Client({
    authStrategy: new LocalAuth(),

    puppeteer: {
      headless: true,
      protocolTimeout: 180000,

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

  client.on('ready', async () => {
    logger.info('WhatsApp client ready');
    console.log('[BOT INFO] Connected as:', client.info?.wid?._serialized, 'Pushname:', client.info?.pushname);
    try {
      if (client.pupPage) {
        await dismissModals(client.pupPage);
      }
    } catch (e) {
      logger.warn(`[MODAL] Error dismissing modals on ready: ${e.message}`);
    }
    await injectBrowserPatch(client);

    // Periodically check and dismiss modals (like Use Here or update banners)
    setInterval(async () => {
      try {
        if (client.pupPage && !client.pupPage.isClosed()) {
          await dismissModals(client.pupPage);
        }
      } catch (_) {}
    }, 15000);
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