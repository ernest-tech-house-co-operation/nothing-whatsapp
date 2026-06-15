// nothing-whatsapp — browser-side injection
// This entire string is injected via site.addInitScript() at DocumentCreation.
// It MUST be self-contained: no imports, no require(), no Node APIs.
// All heavy WAWeb objects are serialized to plain JSON before being sent to Node
// via the exposed function bridge (window.__nw_emit).

'use strict';

const WWEBJS_INJECT = /* js */ `
(function () {
  if (window.__nothingWhatsappLoaded) return;
  window.__nothingWhatsappLoaded = true;

  // ── Safe JSON serializer ───────────────────────────────────────────────────
  // Handles circular refs, Backbone models, and undefined/function values.
  function safeSerialize(obj, maxDepth) {
    maxDepth = maxDepth || 8;
    var seen = [];
    function replacer(key, value) {
      if (typeof value === 'function') return undefined;
      if (typeof value === 'object' && value !== null) {
        if (seen.indexOf(value) !== -1) return '[Circular]';
        seen.push(value);
      }
      return value;
    }
    try {
      return JSON.parse(JSON.stringify(obj, replacer));
    } catch (e) {
      return { __serializeError: e.message };
    }
  }

  // ── Event emitter bridge ───────────────────────────────────────────────────
  // __nw_emit is injected by Node via exposeFunction before this script runs.
  function emit(event, data) {
    if (typeof window.__nw_emit !== 'function') return;
    try {
      window.__nw_emit(JSON.stringify({ event: event, data: safeSerialize(data) }));
    } catch (e) {
      console.error('[nothing-whatsapp] emit error:', e);
    }
  }

  // ── WWebJS model serializers ───────────────────────────────────────────────
  function serializeMessage(msg) {
    if (!msg) return null;
    try {
      if (window.WWebJS && window.WWebJS.getMessageModel) {
        return safeSerialize(window.WWebJS.getMessageModel(msg));
      }
    } catch (e) {}
    // Fallback: serialize raw msg keys
    return safeSerialize({
      id:        msg.id,
      body:      msg.body,
      type:      msg.type,
      from:      msg.from,
      to:        msg.to,
      author:    msg.author,
      timestamp: msg.t,
      fromMe:    msg.id && msg.id.fromMe,
      isNewMsg:  msg.isNewMsg,
      ack:       msg.ack,
      hasMedia:  msg.hasMedia,
    });
  }

  function serializeChat(chat) {
    if (!chat) return null;
    try {
      if (window.WWebJS && window.WWebJS.getChatModel) {
        return safeSerialize(window.WWebJS.getChatModel(chat));
      }
    } catch (e) {}
    return safeSerialize({
      id:          chat.id,
      name:        chat.name,
      isGroup:     chat.isGroup,
      unreadCount: chat.unreadCount,
      timestamp:   chat.t,
      pinned:      chat.pin,
      muted:       chat.muted,
    });
  }

  function serializeContact(contact) {
    if (!contact) return null;
    try {
      if (window.WWebJS && window.WWebJS.getContact) {
        return safeSerialize(window.WWebJS.getContact(contact));
      }
    } catch (e) {}
    return safeSerialize({
      id:          contact.id,
      name:        contact.name,
      pushname:    contact.pushname,
      shortName:   contact.shortName,
      isMe:        contact.isMe,
      isGroup:     contact.isGroup,
      isBusiness:  contact.isBusiness,
    });
  }

  // ── Anti-detection spoof ───────────────────────────────────────────────────
  try {
    Object.defineProperty(navigator, 'webdriver',  { get: () => false, configurable: true });
    Object.defineProperty(navigator, 'languages',  { get: () => ['en-US', 'en'], configurable: true });
    Object.defineProperty(navigator, 'platform',   { get: () => 'Win32', configurable: true });
    if (!window.chrome) {
      window.chrome = {
        runtime: {
          onMessage:   { addListener: function(){}, removeListener: function(){} },
          sendMessage: function(){},
          id:          undefined,
        },
      };
    }
    if (navigator.storage) {
      navigator.storage.persist   = function () { return Promise.resolve(true); };
      navigator.storage.persisted = function () { return Promise.resolve(true); };
    }
  } catch (e) {}

  // ── WAWeb boot detector ────────────────────────────────────────────────────
  // Polls until WAWeb internals are ready, then attaches all event listeners.
  var MAX_WAIT_MS  = 120000;
  var POLL_MS      = 300;
  var elapsed      = 0;
  var listenersSet = false;

  function isWAReady() {
    try {
      return (
        window.require &&
        window.WWebJS &&
        window.require('WAWebCollections') &&
        window.require('WAWebSocketModel')
      );
    } catch (e) { return false; }
  }

  function attachListeners() {
    if (listenersSet) return;
    listenersSet = true;

    try {
      var Collections = window.require('WAWebCollections');
      var Msg         = Collections.Msg;
      var Chat        = Collections.Chat;
      var AppState    = window.require('WAWebSocketModel').Socket;

      // Enable ciphertext recovery
      try {
        window.require('WAWebSyncGatingUtils').isPlaceholderMessageResendEnabled = function () { return true; };
      } catch (e) {}

      // ── App state ──────────────────────────────────────────────────────────
      AppState.on('change:state', function (_s, state) {
        emit('wa:state', { state: state });
      });

      AppState.on('change:hasSynced', function () {
        emit('wa:synced', {});
      });

      AppState.on('change:battery', function (_s, battery) {
        emit('wa:battery', { battery: battery });
      });

      // ── Messages ───────────────────────────────────────────────────────────
      Msg.on('add', function (msg) {
        if (!msg.isNewMsg) return;
        if (msg.type === 'ciphertext') {
          emit('message:ciphertext', serializeMessage(msg));
          // Request resend for ciphertext messages
          try {
            var payload = { type: msg.type, id: msg.id, from: msg.from };
            window.require('WAWebResendMsgAction') &&
              window.require('WAWebResendMsgAction').resendMsg(msg);
          } catch (e) {}
          return;
        }
        emit('message', serializeMessage(msg));
      });

      Msg.on('change', function (msg) {
        emit('message:change', serializeMessage(msg));
      });

      Msg.on('change:type', function (msg) {
        emit('message:type', serializeMessage(msg));
      });

      Msg.on('change:ack', function (msg, ack) {
        emit('message:ack', { message: serializeMessage(msg), ack: ack });
      });

      Msg.on('change:isUnsentMedia', function (msg, unsent) {
        if (msg.id.fromMe && !unsent) {
          emit('message:media_uploaded', serializeMessage(msg));
        }
      });

      Msg.on('remove', function (msg) {
        if (msg.isNewMsg) emit('message:revoke', serializeMessage(msg));
      });

      Msg.on('change:body change:caption', function (msg, newBody, prevBody) {
        emit('message:edit', { message: serializeMessage(msg), newBody: newBody, prevBody: prevBody });
      });

      // ── Chats ──────────────────────────────────────────────────────────────
      Chat.on('change:unreadCount', function (chat) {
        emit('chat:unread', serializeChat(chat));
      });

      Chat.on('remove', function (chat) {
        emit('chat:removed', serializeChat(chat));
      });

      // ── Ready ──────────────────────────────────────────────────────────────
      emit('wa:ready', {
        version: (function () {
          try { return window.Debug && window.Debug.VERSION; } catch (e) { return null; }
        })(),
      });

    } catch (e) {
      emit('wa:error', { stage: 'attachListeners', message: e.message });
    }
  }

  // ── Poll loop ──────────────────────────────────────────────────────────────
  var pollTimer = setInterval(function () {
    elapsed += POLL_MS;
    if (isWAReady()) {
      clearInterval(pollTimer);
      attachListeners();
      return;
    }
    if (elapsed >= MAX_WAIT_MS) {
      clearInterval(pollTimer);
      emit('wa:error', { stage: 'boot', message: 'WAWeb did not boot within ' + MAX_WAIT_MS + 'ms' });
    }
  }, POLL_MS);

})();
`;

module.exports = WWEBJS_INJECT;
