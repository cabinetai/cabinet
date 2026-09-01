# WhatsApp connector (read-only)

A read-only WhatsApp connection that runs inside the Cabinet daemon, next to
the Telegram gateway (`server/whatsapp/`, mirroring `server/telegram/`). It
logs into one or more WhatsApp accounts via
[Baileys](https://github.com/WhiskeySockets/Baileys), normalizes every
incoming message, and posts them to a channel board on the home cabinet.

Origin: extracted from the `whatsapp-sidecar` package in the moomacha repo.
There it ran as a separate Node process behind a loopback SSE API because the
consumer was a Python control-plane; Cabinet's daemon is Node, so the bus is
consumed in-process and the HTTP layer was dropped.

**Read-only by construction:** there is no `sendMessage` path. The connection
only wires `connection.update`, `messages.upsert`, and `creds.update`, never
marks chats read, and never sends presence. Agents can see WhatsApp traffic on
the board; nothing can reply to WhatsApp.

> ⚠️ Baileys speaks the unofficial WhatsApp Web protocol, which is against
> WhatsApp's terms of service. Read-only use keeps the footprint minimal, but
> a paired account can in principle be banned. Treat this as an opt-in
> personal connector.

## Enable it

Add to `.cabinet.env` (the daemon watches the file — no restart needed):

```bash
# Comma-separated accounts: "id" or "id:Label". Empty/absent = gateway off.
WHATSAPP_ACCOUNTS=personal
# Optional: channel board to post to (default "whatsapp").
#WHATSAPP_CHANNEL=whatsapp
# Optional: also post the account's own outgoing messages.
#WHATSAPP_INCLUDE_FROM_ME=1
```

## Pairing (one-time, per account)

On first start an account with no saved session prints a **QR code in the
daemon log**. Scan it with that account's phone: **WhatsApp → Settings →
Linked Devices → Link a Device**. The raw QR payload is also mirrored to
`<data>/.agents/.runtime/whatsapp/...` for a future settings-UI card.

Session credentials persist under `<data>/.agents/.whatsapp/store/<id>/` —
these are secrets. Re-pair by deleting that directory. If the phone unlinks
the device, the log says `logged out — delete <dir> and re-pair`.

## The message shape

Every inbound message (DM or group, across all accounts) is normalized to:

```jsonc
{
  "account_id": "personal",
  "id": "3EB0…",
  "chat_jid": "972…@s.whatsapp.net",   // group chats end in @g.us
  "is_group": false,
  "sender": "972…@s.whatsapp.net",     // the participant in groups
  "sender_name": "Alice",
  "text": "hello",                      // conversation / extended text / caption
  "type": "text",                       // text | image | video | audio | document | other
  "timestamp": "2026-07-15T20:00:00.000Z",
  "from_me": false
}
```

`server/whatsapp/gateway.ts` subscribes an in-process `MessageBus` and posts
each message to the configured channel board (`channels-manager`), so it shows
up in the UI like any other channel traffic.

## Operational notes

- **One gateway per data dir:** an `owner.json` pid marker under
  `.agents/.runtime/whatsapp/` keeps a second daemon (dev + packaged side by
  side) from fighting over the same Baileys session files.
- **Reconnects** are automatic on every disconnect except `loggedOut`.
- **Later layers** (not built yet): a settings-UI connector card that renders
  the pairing QR, routing messages into agent runs (the Telegram router is the
  template), and — only as a deliberate decision — a send path.

## Tests

`test/whatsapp-normalize.test.ts`, `test/whatsapp-bus.test.ts`,
`test/whatsapp-config.test.ts` (node:test, run with `tsx --test`).
