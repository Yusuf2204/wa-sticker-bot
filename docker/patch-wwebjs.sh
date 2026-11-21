#!/bin/sh
storeFile="/app/node_modules/whatsapp-web.js/src/util/Injected/Store.js"
if [ -f "$storeFile" ]; then
  sed -i "s/setPushname: window.require('WAWebSetPushnameConnAction').setPushname/setPushname: window.require('WAWebSetPushnameConnAction')?.setPushname/g" "$storeFile"
fi

msgFile="/app/node_modules/whatsapp-web.js/src/structures/Message.js"
if [ -f "$msgFile" ]; then
  sed -i "s/msg.mediaData.mediaStage.includes('ERROR') || msg.mediaData.mediaStage === 'FETCHING'/msg.mediaData.mediaStage.includes('ERROR')/g" "$msgFile"
fi
