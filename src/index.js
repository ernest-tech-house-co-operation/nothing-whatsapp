'use strict';

const INJECT  = require('./inject');
const actions = require('./actions');

/**
 * nothing-whatsapp
 * WhatsApp Web automation plugin for nothing-browser / Piggy.
 *
 * @example
 * const piggy  = require('nothing-browser').default;
 * const wa     = require('nothing-whatsapp');
 *
 * await piggy.launch({ mode: 'tab', binary: 'C:/path/to/nothing-browser-headless.exe' });
 * await piggy.register('whatsapp', 'https://web.whatsapp.com', { single: true });
 * await piggy.extend(wa());
 *
 * piggy.whatsapp.on('wa:ready',  (d) => console.log('WAWeb ready, version:', d.version));
 * piggy.whatsapp.on('message',   (d) => console.log('New message:', d.body));
 *
 * await piggy.whatsapp.navigate();
 */
function whatsapp(opts) {
  opts = opts || {};

  return function install(site) {

    // ── 1. Expose the event bridge BEFORE injecting the script ────────────────
    // The injected script calls window.__nw_emit(jsonString) to send events.
    // We expose it here so it's available at DocumentCreation.
    site.exposeFunction('__nw_emit', function (jsonString) {
      let parsed;
      try { parsed = JSON.parse(jsonString); } catch { return; }
      const { event, data } = parsed;
      // Emit on the site so user can do site.on('message', ...)
      site.emit(event, data);
      // Also call named option callbacks if provided
      if (opts[eventToCb(event)]) opts[eventToCb(event)](data);
    });

    // ── 2. Inject the WWebJS listener script at DocumentCreation ─────────────
    site.addInitScript(INJECT);

    // ── 3. Build the wa namespace ─────────────────────────────────────────────
    // Every method runs JS in the browser via site.evaluate() and parses the
    // JSON string result back into a plain JS object.

    async function run(jsString) {
      const raw = await site.evaluate(jsString);
      if (typeof raw === 'string') {
        try {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.__error) throw new Error(parsed.__error);
          return parsed;
        } catch (e) {
          if (e.message && e.message.startsWith('wa:')) throw e;
          // Not JSON — return raw (e.g. boolean from isAuthenticated)
          return raw;
        }
      }
      return raw;
    }

    const wa = {
      // ── Auth / Connection ──────────────────────────────────────────────────
      getConnectionInfo()         { return run(actions.getConnectionInfo()); },
      isAuthenticated()           { return run(actions.isAuthenticated()); },

      // ── Messages ───────────────────────────────────────────────────────────
      getMessageById(id)          { return run(actions.getMessageById(id)); },
      getChatMessages(chatId, n)  { return run(actions.getChatMessages(chatId, n)); },

      // ── Chats ──────────────────────────────────────────────────────────────
      getChatById(chatId)         { return run(actions.getChatById(chatId)); },
      getAllChats()                { return run(actions.getAllChats()); },

      // ── Contacts ───────────────────────────────────────────────────────────
      getContactById(contactId)   { return run(actions.getContactById(contactId)); },
      getAllContacts()             { return run(actions.getAllContacts()); },
      getProfilePicUrl(contactId) { return run(actions.getProfilePicUrl(contactId)); },

      // ── Actions ────────────────────────────────────────────────────────────
      sendMessage(chatId, content, opts2)   { return run(actions.sendMessage(chatId, content, opts2)); },
      sendSeen(chatId)                       { return run(actions.sendSeen(chatId)); },
      sendReaction(messageId, reaction)      { return run(actions.sendReaction(messageId, reaction)); },
      deleteMessage(messageId, everyone)     { return run(actions.deleteMessage(messageId, everyone)); },
      starMessage(messageId, star)           { return run(actions.starMessage(messageId, star)); },
      archiveChat(chatId, archive)           { return run(actions.archiveChat(chatId, archive)); },
      muteChat(chatId, duration)             { return run(actions.muteChat(chatId, duration)); },
      pinChat(chatId, pin)                   { return run(actions.pinChat(chatId, pin)); },
      setPresence(chatId, available)         { return run(actions.setPresence(chatId, available)); },

      // ── Raw evaluate with auto JSON-parse ──────────────────────────────────
      // For custom heavy JS: returns deserialized object, not raw string.
      // Wrap your expression with actions.asJsonString() for complex objects.
      evaluate(js)                { return run(js); },
      evaluateHeavy(js)           { return run(actions.asJsonString(js)); },
    };

    return { wa };
  };
}

// Map event name to option callback name
// e.g. 'wa:ready' -> 'onReady', 'message' -> 'onMessage'
function eventToCb(event) {
  const map = {
    'wa:ready':           'onReady',
    'wa:synced':          'onSynced',
    'wa:state':           'onStateChange',
    'wa:battery':         'onBattery',
    'wa:error':           'onError',
    'message':            'onMessage',
    'message:change':     'onMessageChange',
    'message:type':       'onMessageType',
    'message:ack':        'onMessageAck',
    'message:revoke':     'onMessageRevoke',
    'message:edit':       'onMessageEdit',
    'message:media_uploaded': 'onMediaUploaded',
    'message:ciphertext': 'onCiphertext',
    'chat:unread':        'onChatUnread',
    'chat:removed':       'onChatRemoved',
    'qr':                 'onQR',
    'qr:scanned':         'onScanned',
    'qr:timeout':         'onQRTimeout',
  };
  return map[event] || ('on_' + event.replace(/[^a-zA-Z0-9]/g, '_'));
}

module.exports = whatsapp;
module.exports.default = whatsapp;
