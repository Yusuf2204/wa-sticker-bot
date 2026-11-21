const fs = require('fs');
const path = require('path');

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

// 2. Patch Message.js for mediaStage FETCHING bypass and ID serialization
const msgFile = '/app/node_modules/whatsapp-web.js/src/structures/Message.js';
if (fs.existsSync(msgFile)) {
  let content = fs.readFileSync(msgFile, 'utf8');

  // Bypass mediaStage FETCHING
  content = content.replace(
    "msg.mediaData.mediaStage.includes('ERROR') || msg.mediaData.mediaStage === 'FETCHING'",
    "msg.mediaData.mediaStage.includes('ERROR')"
  );

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

  // Ensure downloadMedia uses a valid string ID
  content = content.replace(
    '}, this.id._serialized);',
    '}, (this.id && (this.id._serialized || this.id[\'$1\'])) || (typeof this.id === \'string\' ? this.id : null));'
  );

  fs.writeFileSync(msgFile, content, 'utf8');
  console.log('[PATCH] Message.js patched successfully');
}
