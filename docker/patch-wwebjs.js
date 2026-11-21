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

// 2. Patch Message.js for bulletproof downloadMedia & ID serialization
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

  // Replace downloadMedia implementation with bulletproof fallback version
  const oldDownloadMediaRegex = /async downloadMedia\(\) \{[\s\S]*?return new MessageMedia\(result\.mimetype, result\.data, result\.filename, result\.filesize\);[\s\S]*?\}/;
  
  const bulletproofDownloadMedia = `async downloadMedia() {
        if (!this.hasMedia) {
            return undefined;
        }

        const targetId = (this.id && (this.id._serialized || this.id['$1'])) || (typeof this.id === 'string' ? this.id : null);
        const rawMediaData = {
            directPath: this.directPath || this._data?.directPath,
            encFilehash: this.encFilehash || this._data?.encFilehash,
            filehash: this.filehash || this._data?.filehash,
            mediaKey: this.mediaKey || this._data?.mediaKey,
            mediaKeyTimestamp: this.mediaKeyTimestamp || this._data?.mediaKeyTimestamp,
            type: this.type || this._data?.type,
            mimetype: this.mimetype || this._data?.mimetype,
            size: this.filesize || this._data?.size
        };

        const result = await this.client.pupPage.evaluate(async (msgId, raw) => {
            let msg = null;
            if (msgId) {
                try {
                    msg = window.Store.Msg.get(msgId);
                    if (!msg) {
                        const fetched = await window.Store.Msg.getMessagesById([msgId]).catch(() => null);
                        msg = fetched?.messages?.[0];
                    }
                } catch (e) {
                    // Ignore Msg store lookup error
                }
            }

            const directPath = msg?.directPath || raw.directPath;
            const encFilehash = msg?.encFilehash || raw.encFilehash;
            const filehash = msg?.filehash || raw.filehash;
            const mediaKey = msg?.mediaKey || raw.mediaKey;
            const mediaKeyTimestamp = msg?.mediaKeyTimestamp || raw.mediaKeyTimestamp;
            const type = msg?.type || raw.type;
            const mimetype = msg?.mimetype || raw.mimetype;
            const size = msg?.size || raw.size;

            if (!directPath || !mediaKey) {
                console.log('[DEBUG downloadMedia] Missing directPath or mediaKey:', { directPath: Boolean(directPath), mediaKey: Boolean(mediaKey) });
                return null;
            }

            try {
                const mockQpl = {
                    addAnnotations: function() { return this; },
                    addPoint: function() { return this; }
                };
                const decryptedMedia = await window.Store.DownloadManager.downloadAndMaybeDecrypt({
                    directPath,
                    encFilehash,
                    filehash,
                    mediaKey,
                    mediaKeyTimestamp,
                    type,
                    signal: (new AbortController).signal,
                    downloadQpl: mockQpl
                });

                const data = await window.WWebJS.arrayBufferToBase64Async(decryptedMedia);

                return {
                    data,
                    mimetype: mimetype || 'application/octet-stream',
                    filename: msg?.filename || 'media',
                    filesize: size
                };
            } catch (e) {
                console.error('[DEBUG downloadMedia] downloadAndMaybeDecrypt failed:', e);
                return null;
            }
        }, targetId, rawMediaData);

        if (!result || !result.data) return undefined;
        return new MessageMedia(result.mimetype, result.data, result.filename, result.filesize);
    }`;

  if (oldDownloadMediaRegex.test(content)) {
    content = content.replace(oldDownloadMediaRegex, bulletproofDownloadMedia);
    fs.writeFileSync(msgFile, content, 'utf8');
    console.log('[PATCH] Message.js downloadMedia replaced with bulletproof version');
  } else {
    console.warn('[PATCH] Could not match old downloadMedia in Message.js');
  }
}
