'use strict';

// Each function here returns a JS string.
// It gets passed to site.evaluate() which runs it in the browser via C++.
// The JS MUST return a plain serializable value — no Backbone models, no circular refs.
// We wrap everything in safeSerialize (same logic as inject.js) so Qt's QVariant
// can handle the return value without crashing.

const SAFE_SERIALIZE = /* js */ `
  var __seen = [];
  function __ss(obj, depth) {
    depth = depth || 0;
    if (depth > 8) return '[MaxDepth]';
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'function') return undefined;
    if (typeof obj !== 'object') return obj;
    if (__seen.indexOf(obj) !== -1) return '[Circular]';
    __seen.push(obj);
    if (Array.isArray(obj)) return obj.map(function(v){ return __ss(v, depth+1); });
    var out = {};
    Object.keys(obj).forEach(function(k){
      var v = __ss(obj[k], depth+1);
      if (v !== undefined) out[k] = v;
    });
    return out;
  }
`;

// Wraps a JS expression so the result comes back as a JSON string.
// C++ runJavaScript returns QVariant — a string is the safest carrier for heavy data.
function asJsonString(expr) {
  return `(function(){
    ${SAFE_SERIALIZE}
    try {
      var __result = (${expr});
      if (__result && typeof __result.then === 'function') {
        return __result.then(function(r){ return JSON.stringify(__ss(r)); })
                       .catch(function(e){ return JSON.stringify({ __error: e.message }); });
      }
      return JSON.stringify(__ss(__result));
    } catch(e) {
      return JSON.stringify({ __error: e.message });
    }
  })()`;
}

// ── Connection / Auth ──────────────────────────────────────────────────────────

function getConnectionInfo() {
  return asJsonString(`(function(){
    var Conn = window.require('WAWebConnModel').Conn.serialize();
    var wid  = (window.require('WAWebUserPrefsMeUser').getMaybeMePnUser  && window.require('WAWebUserPrefsMeUser').getMaybeMePnUser())  ||
               (window.require('WAWebUserPrefsMeUser').getMaybeMeLidUser && window.require('WAWebUserPrefsMeUser').getMaybeMeLidUser());
    return Object.assign({}, Conn, { wid: wid });
  })()`);
}

function isAuthenticated() {
  return `(function(){
    try {
      var state = window.require('WAWebSocketModel').Socket.state;
      return state === 'CONNECTED' || state === 'PAIRING';
    } catch(e) { return false; }
  })()`;
}

// ── Message getters ────────────────────────────────────────────────────────────

function getMessageById(messageId) {
  return asJsonString(`(function(){
    var id  = ${JSON.stringify(messageId)};
    var Msg = window.require('WAWebCollections').Msg;
    var msg = Msg.get(id);
    if (msg) {
      return window.WWebJS.getMessageModel ? window.WWebJS.getMessageModel(msg) : msg.serialize();
    }
    return Msg.getMessagesById([id]).then(function(res){
      var m = res && res.messages && res.messages[0];
      return m ? (window.WWebJS.getMessageModel ? window.WWebJS.getMessageModel(m) : m.serialize()) : null;
    });
  })()`);
}

function getChatMessages(chatId, limit) {
  limit = limit || 50;
  return asJsonString(`(function(){
    var chatId = ${JSON.stringify(chatId)};
    var limit  = ${limit};
    var Msg    = window.require('WAWebCollections').Msg;
    var msgs   = Msg.filter(function(m){ return m.id && (m.id.remote === chatId || (m.from && m.from._serialized === chatId)); });
    msgs = msgs.slice(-limit);
    return msgs.map(function(m){
      try { return window.WWebJS.getMessageModel ? window.WWebJS.getMessageModel(m) : m.serialize(); }
      catch(e) { return { id: m.id, body: m.body, type: m.type, error: e.message }; }
    });
  })()`);
}

// ── Chat getters ───────────────────────────────────────────────────────────────

function getChatById(chatId) {
  return asJsonString(`(function(){
    var id   = ${JSON.stringify(chatId)};
    var Chat = window.require('WAWebCollections').Chat;
    var chat = Chat.get(id);
    if (!chat) return null;
    return window.WWebJS.getChatModel ? window.WWebJS.getChatModel(chat) : chat.serialize();
  })()`);
}

function getAllChats() {
  return asJsonString(`(function(){
    var Chat = window.require('WAWebCollections').Chat;
    return Chat.map(function(c){
      try { return window.WWebJS.getChatModel ? window.WWebJS.getChatModel(c) : c.serialize(); }
      catch(e) { return { id: c.id, name: c.name, error: e.message }; }
    });
  })()`);
}

// ── Contact getters ────────────────────────────────────────────────────────────

function getContactById(contactId) {
  return asJsonString(`(function(){
    var id      = ${JSON.stringify(contactId)};
    var Contact = window.require('WAWebCollections').Contact;
    var c       = Contact.get(id);
    if (!c) return null;
    return window.WWebJS.getContact ? window.WWebJS.getContact(c) : c.serialize();
  })()`);
}

function getAllContacts() {
  return asJsonString(`(function(){
    var Contact = window.require('WAWebCollections').Contact;
    return Contact.map(function(c){
      try { return window.WWebJS.getContact ? window.WWebJS.getContact(c) : c.serialize(); }
      catch(e) { return { id: c.id, name: c.name, error: e.message }; }
    });
  })()`);
}

// ── Actions ────────────────────────────────────────────────────────────────────

function sendMessage(chatId, content, options) {
  options = options || {};
  return asJsonString(`(function(){
    var chatId  = ${JSON.stringify(chatId)};
    var content = ${JSON.stringify(content)};
    var options = ${JSON.stringify(options)};
    return window.WWebJS.getChat(chatId, { getAsModel: false }).then(function(chat){
      if (!chat) return null;
      var p = Promise.resolve();
      if (options.sendSeen) p = p.then(function(){ return window.WWebJS.sendSeen(chatId); });
      return p.then(function(){
        return window.WWebJS.sendMessage(chat, content, options);
      }).then(function(msg){
        return msg ? (window.WWebJS.getMessageModel ? window.WWebJS.getMessageModel(msg) : msg.serialize()) : null;
      });
    });
  })()`);
}

function sendSeen(chatId) {
  return `(function(){
    try { window.WWebJS.sendSeen(${JSON.stringify(chatId)}); return true; }
    catch(e) { return false; }
  })()`;
}

function sendReaction(messageId, reaction) {
  return asJsonString(`(function(){
    var id       = ${JSON.stringify(messageId)};
    var reaction = ${JSON.stringify(reaction)};
    var Msg = window.require('WAWebCollections').Msg;
    var msg = Msg.get(id);
    var p = msg
      ? Promise.resolve(msg)
      : Msg.getMessagesById([id]).then(function(r){ return r && r.messages && r.messages[0]; });
    return p.then(function(m){
      if (!m) return null;
      return window.require('WAWebSendReactionMsgAction').sendReactionToMsg(m, reaction);
    });
  })()`);
}

function deleteMessage(messageId, everyone) {
  return asJsonString(`(function(){
    var id       = ${JSON.stringify(messageId)};
    var everyone = ${!!everyone};
    var Msg = window.require('WAWebCollections').Msg;
    var msg = Msg.get(id);
    if (!msg) return false;
    return window.WWebJS.deleteMessage(msg, everyone);
  })()`);
}

function starMessage(messageId, star) {
  return asJsonString(`(function(){
    var id   = ${JSON.stringify(messageId)};
    var star = ${!!star};
    var Msg  = window.require('WAWebCollections').Msg;
    var msg  = Msg.get(id);
    if (!msg) return false;
    return window.WWebJS.starMessage(msg, star);
  })()`);
}

function archiveChat(chatId, archive) {
  return asJsonString(`(function(){
    var id      = ${JSON.stringify(chatId)};
    var archive = ${!!archive};
    var Chat    = window.require('WAWebCollections').Chat;
    var chat    = Chat.get(id);
    if (!chat) return false;
    return window.WWebJS.archiveChat(chat, archive);
  })()`);
}

function muteChat(chatId, duration) {
  return asJsonString(`(function(){
    var id       = ${JSON.stringify(chatId)};
    var duration = ${JSON.stringify(duration || null)};
    var Chat     = window.require('WAWebCollections').Chat;
    var chat     = Chat.get(id);
    if (!chat) return false;
    return window.WWebJS.muteChat(chat, duration);
  })()`);
}

function pinChat(chatId, pin) {
  return asJsonString(`(function(){
    var id   = ${JSON.stringify(chatId)};
    var pin  = ${!!pin};
    var Chat = window.require('WAWebCollections').Chat;
    var chat = Chat.get(id);
    if (!chat) return false;
    return window.WWebJS.pinChat(chat, pin);
  })()`);
}

function setPresence(chatId, available) {
  return asJsonString(`(function(){
    var id        = ${JSON.stringify(chatId)};
    var available = ${!!available};
    try {
      window.require('WAWebPresenceAction').setPresence(id, available ? 'available' : 'unavailable');
      return true;
    } catch(e) { return false; }
  })()`);
}

function getProfilePicUrl(contactId) {
  return asJsonString(`(function(){
    var id = ${JSON.stringify(contactId)};
    return window.WWebJS.getProfilePicThumbToURL(id, window.require('WAWebWid').SUPERSCRIPT_IMAGE_THUMB_TYPE);
  })()`);
}

module.exports = {
  getConnectionInfo,
  isAuthenticated,
  getMessageById,
  getChatMessages,
  getChatById,
  getAllChats,
  getContactById,
  getAllContacts,
  sendMessage,
  sendSeen,
  sendReaction,
  deleteMessage,
  starMessage,
  archiveChat,
  muteChat,
  pinChat,
  setPresence,
  getProfilePicUrl,
  // expose the raw wrapper for custom scripts
  asJsonString,
};
