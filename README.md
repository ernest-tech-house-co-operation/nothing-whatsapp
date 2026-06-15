# nothing-whatsapp

WhatsApp Web automation plugin for [nothing-browser](https://nothing-browser-docs.pages.dev/guide/piggy/) / Piggy.

## Install

```bash
npm install nothing-whatsapp
```

## Usage

```js
const piggy = require('nothing-browser').default;
const wa    = require('nothing-whatsapp');

await piggy.launch({ mode: 'tab', binary: 'C:/path/to/nothing-browser-headless.exe' });
await piggy.register('whatsapp', 'https://web.whatsapp.com', { single: true });

await piggy.extend(
  wa({
    onReady:      (d) => console.log('WAWeb ready, version:', d.version),
    onMessage:    (d) => console.log('New message:', d.body),
    onMessageAck: (d) => console.log('Ack:', d.ack),
    onStateChange:(d) => console.log('State:', d.state),
    onQR:         (d) => console.log('Scan QR:', d.qrData),
    onScanned:    ()  => console.log('Authenticated!'),
  })
);

await piggy.whatsapp.navigate();

// Send a message
const msg = await piggy.whatsapp.wa.sendMessage('1234567890@c.us', 'Hello!');
console.log('Sent:', msg.id);

// Get all chats
const chats = await piggy.whatsapp.wa.getAllChats();

// Get a specific message
const message = await piggy.whatsapp.wa.getMessageById('MSGID_HERE');

// React to a message
await piggy.whatsapp.wa.sendReaction('MSGID_HERE', '👍');

// Custom heavy JS with auto JSON parse
const result = await piggy.whatsapp.wa.evaluateHeavy(`
  window.require('WAWebCollections').Chat.map(c => ({ id: c.id, name: c.name }))
`);
```

## Events

Listen via `site.on()` or pass callbacks to `wa({})`:

| Event | Callback option | Data |
|---|---|---|
| `wa:ready` | `onReady` | `{ version }` |
| `wa:synced` | `onSynced` | `{}` |
| `wa:state` | `onStateChange` | `{ state }` |
| `wa:battery` | `onBattery` | `{ battery }` |
| `wa:error` | `onError` | `{ stage, message }` |
| `message` | `onMessage` | message object |
| `message:change` | `onMessageChange` | message object |
| `message:ack` | `onMessageAck` | `{ message, ack }` |
| `message:revoke` | `onMessageRevoke` | message object |
| `message:edit` | `onMessageEdit` | `{ message, newBody, prevBody }` |
| `message:media_uploaded` | `onMediaUploaded` | message object |
| `message:ciphertext` | `onCiphertext` | message object |
| `chat:unread` | `onChatUnread` | chat object |
| `chat:removed` | `onChatRemoved` | chat object |
| `qr` | `onQR` | `{ tabId, qrData, attempts }` |
| `qr:scanned` | `onScanned` | `{ tabId }` |
| `qr:timeout` | `onQRTimeout` | `{ tabId }` |

## API (`site.wa`)

| Method | Returns |
|---|---|
| `getConnectionInfo()` | Connection + wid info |
| `isAuthenticated()` | `boolean` |
| `getMessageById(id)` | message object or `null` |
| `getChatMessages(chatId, limit?)` | array of messages |
| `getChatById(chatId)` | chat object or `null` |
| `getAllChats()` | array of chats |
| `getContactById(contactId)` | contact object or `null` |
| `getAllContacts()` | array of contacts |
| `getProfilePicUrl(contactId)` | URL string |
| `sendMessage(chatId, content, opts?)` | sent message object |
| `sendSeen(chatId)` | `boolean` |
| `sendReaction(messageId, reaction)` | result |
| `deleteMessage(messageId, everyone?)` | result |
| `starMessage(messageId, star)` | result |
| `archiveChat(chatId, archive)` | result |
| `muteChat(chatId, duration?)` | result |
| `pinChat(chatId, pin)` | result |
| `setPresence(chatId, available)` | `boolean` |
| `evaluate(js)` | raw result |
| `evaluateHeavy(js)` | auto-serialized + parsed result |

## How it works

- `inject.js` is injected at `DocumentCreation` via `site.addInitScript()` — it attaches all WAWeb event listeners and polls for WAWeb boot
- All WAWeb objects (Backbone models, circular refs) are serialized to plain JSON inside the browser before being returned to Node
- `evaluateHeavy()` wraps any custom JS expression in the same safe serializer — safe to use on any WAWeb collection
- The event bridge uses `exposeFunction('__nw_emit')` — the C++ binary handles the function injection; Node receives the calls
"# nothing-whatsapp" 
