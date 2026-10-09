# Integrations

Every integration here is explicit and reversible. **Connected Apps** shows each connection's status, what it imported, and lets you disconnect and, separately, delete what was imported.

## WhatsApp: export import only

WhatsApp doesn't give apps a way to read your chats, so there is **no automatic sync**, and the app never claims one. You export a chat yourself:

- **Android**: open the chat → ⋮ → More → Export chat → Without media (or With media).
- **iPhone**: open the chat → tap the contact/group name → Export Chat.

Upload the `.txt` or `.zip` in *Connected Apps → Import a WhatsApp export* (or from *Add to Memory → Import a chat*).

What happens: the file is uploaded privately, parsed on the server (Android and iOS formats, 12/24-hour clocks, several date orders, multi-line messages, system messages, deleted-message notices), and stored as a conversation of messages. Media in a `.zip` is imported as files linked to the message when it is allowed (type, size and quota rules apply); anything skipped is listed in the import's notes. Then the export file itself is deleted.

Good to know:
- WhatsApp exports carry no time zone. Times are read in your current one, and the date order (day/month vs month/day) is auto-detected, or you can choose it.
- Sender names are whatever the export says. They're shown as **unverified labels**, never as identities.
- Importing a newer export of the same chat adds only the new messages. The same exact file twice is detected and skipped.
- Search results open the saved conversation here, scrolled to and highlighting the message. There is no link back into WhatsApp.
- Delete what an import added from *Import history → Delete imported data*, or remove the whole connection and its data from *Your connections*.

## Telegram

Two supported routes, plus a place for a third later.

### Bot (messages you send to it)

1. Talk to [@BotFather](https://t.me/BotFather), create a bot, and copy the token.
2. Set in the server environment: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` (without `@`) and `TELEGRAM_WEBHOOK_SECRET` (any long random string).
3. Deploy so the app has a public HTTPS address, then run `npm run telegram:webhook -- https://your-domain`. This registers `https://your-domain/api/telegram/webhook` with the secret token. For local testing use a tunnel (e.g. `cloudflared tunnel --url http://localhost:3000`) and pass its https address.
4. In the app: *Connected Apps → Link the Telegram bot*. Press Start in Telegram (or send the shown `/start CODE` message). The code works once and expires after 15 minutes. Only its hash is stored.

After linking, text messages and files you send the bot are saved into a "Telegram inbox" conversation (searchable like any chat; forwarded messages keep their original sender label; files go through the normal upload pipeline and are linked to the message; files over Telegram's 20 MB bot limit are noted and skipped). A link you send stays as message text; to fetch and index the page itself, use *Save a link* in the app. The bot only sees messages sent to it, never your other chats. The webhook verifies Telegram's secret header, and each Telegram chat can be linked to one account. Disconnecting frees the chat and optionally deletes everything it saved.

### Telegram Desktop export (JSON)

In Telegram Desktop: open a chat → ⋮ → Export chat history → Format **Machine-readable JSON** → Export. Upload `result.json` (or a zip of the folder) the same way as WhatsApp. HTML exports aren't supported yet.

### Telegram client API (not available)

Reading your personal account through Telegram's client API would need your login and a session stored on the server. It isn't offered. The data model keeps a `telegram_client` connection kind so it could be added without reshaping anything, but today the Connected Apps page lists it as unavailable.

## Adding another source

A source is: a row in `sources`, a connection kind in `source_connections`, a parser that yields conversations/messages (see `src/lib/imports/*`), and a job handler. Everything downstream (windows, indexing, search, cards, citations, deletion) is shared.
