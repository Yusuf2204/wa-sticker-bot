const logger = require('./logger.util');

/**
 * Resolves user contact info (real phone number, display name)
 * Handles WhatsApp multi-device Linked Identity (@lid) gracefully.
 * @param {Object} msg - whatsapp-web.js message object
 * @param {Object} client - whatsapp-web.js client
 * @returns {Promise<{ rawId: string, phoneNumber: string|null, displayName: string }>}
 */
async function resolveUserInfo(msg, client) {
  const rawId = msg.author || msg.from;
  let phoneNumber = null;
  let displayName = msg._data?.notifyName || null;

  // 1. Coba ambil dari msg.getContact()
  try {
    const contact = await msg.getContact();
    if (contact) {
      if (contact.pushname) displayName = contact.pushname;
      if (contact.name) displayName = contact.name;

      if (contact.number && !contact.number.includes('@')) {
        phoneNumber = contact.number;
      } else if (contact.id?._serialized?.endsWith('@c.us')) {
        phoneNumber = contact.id.user;
      }
    }
  } catch (err) {
    logger.warn(`[USER_UTIL] Error calling msg.getContact: ${err.message}`);
  }

  // 2. Jika rawId sudah @c.us (format nomor HP standar)
  if (!phoneNumber && rawId.endsWith('@c.us')) {
    phoneNumber = rawId.replace('@c.us', '');
  }

  // 3. Jika rawId berupa @lid, resolve alternate JID via WhatsApp internal contact API
  if ((!phoneNumber || rawId.endsWith('@lid')) && client?.pupPage && !client.pupPage.isClosed()) {
    try {
      const resolved = await client.pupPage.evaluate(lid => {
        try {
          const widFactory = window.require('WAWebWidFactory');
          const contactApi = window.require('WAWebApiContact');
          const wid = widFactory.createWid(lid);
          const alt = contactApi?.getAlternateUserWid?.(wid);
          if (alt) {
            return {
              number: alt.user || alt._serialized?.replace('@c.us', '') || null,
              jid: alt._serialized || null
            };
          }
        } catch (_) {}
        return null;
      }, rawId);

      if (resolved && resolved.number) {
        phoneNumber = resolved.number;
      }
    } catch (err) {
      logger.warn(`[USER_UTIL] Failed to resolve alternate LID WID: ${err.message}`);
    }
  }

  return {
    rawId,
    phoneNumber,
    displayName: displayName || (phoneNumber ? `+${phoneNumber}` : 'kamu')
  };
}

module.exports = {
  resolveUserInfo
};
