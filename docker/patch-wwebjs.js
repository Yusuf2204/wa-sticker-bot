const fs = require('fs');

// 1. Patch Store.js for setPushname
const storeFile = '/app/node_modules/whatsapp-web.js/src/util/Injected/Store.js';
if (fs.existsSync(storeFile)) {
  let content = fs.readFileSync(storeFile, 'utf8');
  content = content.replace(
    "setPushname: window.require('WAWebSetPushnameConnAction').setPushname",
    "setPushname: window.require('WAWebSetPushnameConnAction')?.setPushname"
  );
  fs.writeFileSync(storeFile, content, 'utf8');
  console.log('[PATCH] Store.js patched successfully');
}

// 2. Patch Message.js for robust downloadMedia & ID serialization
const msgFile = '/app/node_modules/whatsapp-web.js/src/structures/Message.js';
if (fs.existsSync(msgFile)) {
  let content = fs.readFileSync(msgFile, 'utf8');

  // Fix this.id serialization in constructor
  const targetCtor = 'this.id = data.id;';
  const replacementCtor = `this.id = data.id;
        if (this.id && typeof this.id === 'object' && !this.id._serialized) {
            const remoteStr = (this.id.remote && typeof this.id.remote === 'object') ? this.id.remote._serialized : this.id.remote;
            this.id._serialized = this.id['$1'] || (this.id.fromMe ? 'true' : 'false') + '_' + remoteStr + '_' + this.id.id;
        }`;
  if (!content.includes("this.id['$1']")) {
    content = content.replace(targetCtor, replacementCtor);
  }

  // Replace downloadMedia implementation with robust version
  const oldDownloadMediaRegex = /async downloadMedia\(\) \{[\s\S]*?return new MessageMedia\(result\.mimetype, result\.data, result\.filename, result\.filesize\);[\s\S]*?\}/;
  
  const robustDownloadMedia = `async downloadMedia() {
        if (!this.hasMedia) {
            return undefined;
        }

        const targetId = (this.id && (this.id._serialized || this.id['$1'])) || (typeof this.id === 'string' ? this.id : null);

        const result = await this.client.pupPage.evaluate(async (msgId) => {
            const msg = window.Store.Msg.get(msgId) || (await window.Store.Msg.getMessagesById([msgId]))?.messages?.[0];
            if (!msg) {
                console.log('[DEBUG downloadMedia] Msg not found for id:', msgId);
                return null;
            }

            if (msg.mediaData && msg.mediaData.mediaStage !== 'RESOLVED') {
                try {
                    await msg.downloadMedia({
                        downloadEvenIfExpensive: true,
                        rmrReason: 1
                    });
                } catch (e) {
                    console.log('[DEBUG downloadMedia] msg.downloadMedia error ignored:', e?.message || e);
                }
            }

            try {
                const mockQpl = {
                    addAnnotations: function() { return this; },
                    addPoint: function() { return this; }
                };
                const decryptedMedia = await window.Store.DownloadManager.downloadAndMaybeDecrypt({
                    directPath: msg.directPath,
                    encFilehash: msg.encFilehash,
                    filehash: msg.filehash,
                    mediaKey: msg.mediaKey,
                    mediaKeyTimestamp: msg.mediaKeyTimestamp,
                    type: msg.type,
                    signal: (new AbortController).signal,
                    downloadQpl: mockQpl
                });

                const data = await window.WWebJS.arrayBufferToBase64Async(decryptedMedia);

                return {
                    data,
                    mimetype: msg.mimetype,
                    filename: msg.filename,
                    filesize: msg.size
                };
            } catch (e) {
                console.error('[DEBUG downloadMedia] downloadAndMaybeDecrypt failed:', e);
                if (e && e.status === 404) return undefined;
                throw e;
            }
        }, targetId);

        if (!result) return undefined;
        return new MessageMedia(result.mimetype, result.data, result.filename, result.filesize);
    }`;

  if (oldDownloadMediaRegex.test(content)) {
    content = content.replace(oldDownloadMediaRegex, robustDownloadMedia);
    fs.writeFileSync(msgFile, content, 'utf8');
    console.log('[PATCH] Message.js downloadMedia replaced with robust version');
  } else {
    console.warn('[PATCH] Could not match old downloadMedia in Message.js');
  }
}
