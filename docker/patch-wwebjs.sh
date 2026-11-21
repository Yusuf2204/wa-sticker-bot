#!/bin/sh
file="/app/node_modules/whatsapp-web.js/src/util/Injected/Store.js"
if [ -f "$file" ]; then
  sed -i "s/setPushname: window.require('WAWebSetPushnameConnAction').setPushname/setPushname: window.require('WAWebSetPushnameConnAction')?.setPushname/g" "$file"
fi
