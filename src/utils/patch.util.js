const fs = require('fs');
const path = require('path');
const logger = require('./logger.util');

function patchUtilsOnDisk() {
  const possiblePaths = [
    path.resolve(__dirname, '../../node_modules/whatsapp-web.js/src/util/Injected/Utils.js'),
    '/app/node_modules/whatsapp-web.js/src/util/Injected/Utils.js'
  ];

  for (const utilsPath of possiblePaths) {
    if (!fs.existsSync(utilsPath)) continue;

    try {
      let content = fs.readFileSync(utilsPath, 'utf8');
      if (content.includes('isSuspendedOrTerminated')) {
        logger.info(`[PATCH] Utils.js is already patched at ${utilsPath}`);
        return;
      }

      const targetStr = `        // Always call internal downloadMedia - never skip based on
        // mediaStage, because cache eviction can leave stage=RESOLVED
        // with empty InMemoryMediaBlobCache.
        await msg.downloadMedia({
            downloadEvenIfExpensive: true,
            rmrReason: 1,
            isUserInitiated: true,
        });`;

      const replacementStr = `        // Fix: attach chat safely to prevent TypeError: isSuspendedOrTerminated on detached/quoted messages
        try {
            if (!msg.chat && msg.id && msg.id.remote) {
                const { Chat } = window.require('WAWebCollections');
                msg.chat = Chat.get(msg.id.remote);
            }
            if (!msg.chat) {
                msg.chat = { isSuspendedOrTerminated: () => false };
            } else if (typeof msg.chat.isSuspendedOrTerminated !== 'function') {
                msg.chat.isSuspendedOrTerminated = () => false;
            }
        } catch (_) {}

        try {
            await msg.downloadMedia({
                downloadEvenIfExpensive: true,
                rmrReason: 1,
                isUserInitiated: true,
            });
        } catch (e) {
            // Internal download may throw if already in memory or if detached
        }`;

      if (content.includes(targetStr)) {
        content = content.replace(targetStr, replacementStr);
        fs.writeFileSync(utilsPath, content, 'utf8');
        logger.info(`[PATCH] Successfully patched resolveMediaBlob in ${utilsPath}`);
        return;
      } else {
        logger.warn(`[PATCH] Target signature not found in ${utilsPath}`);
      }
    } catch (err) {
      logger.error(`[PATCH] Failed to patch ${utilsPath}: ${err.message}`);
    }
  }
}

async function injectBrowserPatch(client) {
  if (!client || !client.pupPage) return;
  try {
    await client.pupPage.evaluate(() => {
      if (!window.WWebJS) return;
      window.WWebJS.resolveMediaBlob = async (msgId) => {
        const { Msg, Chat } = window.require('WAWebCollections');
        const widFactory = window.require('WAWebWidFactory');
        const contactApi = window.require('WAWebApiContact');

        // Helper to locate message across @c.us and @lid
        async function findMsg(id) {
          if (!id) return null;
          let m = Msg.get(id) || (await Msg.getMessagesById([id]))?.messages?.[0];
          if (m && (m.mediaObject?.mediaBlob || window.require('WAWebMediaInMemoryBlobCache')?.InMemoryMediaBlobCache?.get(m.mediaObject?.filehash || m.mediaData?.filehash))) {
            return m;
          }

          // Try alternate JID mapping (e.g. @c.us <-> @lid)
          try {
            const parts = id.split('_');
            if (parts.length >= 3) {
              const fromMe = parts[0];
              const remote = parts[1];
              const stanzaId = parts.slice(2).join('_');
              const wid = widFactory.createWid(remote);
              const altWid = contactApi?.getAlternateUserWid?.(wid);
              if (altWid) {
                const altRemote = altWid._serialized || altWid.$1 || altWid;
                const altId = `${fromMe}_${altRemote}_${stanzaId}`;
                const altMsg = Msg.get(altId) || (await Msg.getMessagesById([altId]))?.messages?.[0];
                if (altMsg) return altMsg;
              }
            }
          } catch (_) {}
          return m || null;
        }

        let msg = await findMsg(msgId);
        if (!msg || !msg.mediaData) {
          return null;
        }

        const getBlob = () => {
          const filehash = msg.mediaData?.filehash || msg.mediaObject?.filehash;
          const cached = filehash ? window.require('WAWebMediaInMemoryBlobCache')?.InMemoryMediaBlobCache?.get(filehash) : null;
          return cached || (msg.mediaObject?.mediaBlob ? msg.mediaObject.mediaBlob.forceToBlob() : null);
        };

        // If blob is already in cache/memory, return immediately!
        let existingBlob = getBlob();
        if (existingBlob) {
          return {
            blob: existingBlob,
            mimetype: msg.mimetype,
            filename: msg.filename,
            filesize: msg.size || existingBlob.size,
          };
        }

        if (msg.mediaData.mediaStage === 'REUPLOADING') {
          return null;
        }

        try {
          if (!msg.chat && msg.id && msg.id.remote) {
            msg.chat = Chat.get(msg.id.remote);
          }
          if (!msg.chat) {
            msg.chat = { isSuspendedOrTerminated: () => false };
          } else if (typeof msg.chat.isSuspendedOrTerminated !== 'function') {
            msg.chat.isSuspendedOrTerminated = () => false;
          }
        } catch (_) {}

        try {
          await msg.downloadMedia({
            downloadEvenIfExpensive: true,
            rmrReason: 1,
            isUserInitiated: true,
          });
        } catch (e) {
          // Internal download may throw if already in memory or if detached
        }

        if (
          msg.mediaData.mediaStage.includes('ERROR') ||
          msg.mediaData.mediaStage === 'FETCHING'
        ) {
          return null;
        }

        let blob = getBlob();
        if (!blob) return null;

        return {
          blob,
          mimetype: msg.mimetype,
          filename: msg.filename,
          filesize: msg.size || blob.size,
        };
      };
    });
    logger.info('[PATCH] Injected runtime resolveMediaBlob patch with bidirectional LID support');
  } catch (err) {
    logger.warn(`[PATCH] Failed to inject browser patch: ${err.message}`);
  }
}

module.exports = {
  patchUtilsOnDisk,
  injectBrowserPatch
};
