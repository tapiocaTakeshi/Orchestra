# Orchestra Mobile remote control

Orchestra starts a token-protected LAN server at `http://<PC-IP>:39231` when the
desktop app starts, and an end-to-end encrypted relay so the phone can also
control it from outside the LAN. Sign in to the desktop and Orchestra Mobile using the same
Division account. The desktop verifies its Division session locally, then
publishes a short-lived `RemoteSession` for that account. Mobile lists only its
own account's sessions (enforced by Supabase RLS), so another account cannot
discover or control the desktop.

The desktop refreshes the session every 25 seconds and removes it on sign-out
or shutdown. In Orchestra Mobile, log in and select the desktop from **接続先を
選ぶ**; no token entry is needed for the normal flow.

The pairing information is stored locally at:

- macOS: `~/Library/Application Support/Orchestra/orchestra-mobile-remote.json`
- Windows: `%APPDATA%\\Orchestra\\orchestra-mobile-remote.json`
- Linux: `$XDG_CONFIG_HOME/Orchestra/orchestra-mobile-remote.json`

The pairing link remains available as a recovery path when account discovery is
not available. Open the file on the desktop and copy its `pairingLink` value
into Orchestra Mobile's **手入力・ペアリングリンクで接続** screen. The token is
random, persists across restarts, and must be kept private.

## Away from home (relay)

When the phone cannot reach the desktop on the LAN (mobile data, another Wi-Fi),
it switches to a relay over Supabase Realtime automatically, and switches back to
the LAN once it is reachable again (checked every 30 seconds). Nothing needs to be
set up: the desktop joins the relay while it is signed in to Division.

- The broadcast channel name and an AES-256-GCM key are derived (HKDF-SHA256) from
  the pairing token, which only the account's own devices can read from
  `RemoteSession`. Every request and response is end-to-end encrypted, so Supabase
  only relays opaque bytes.
- Each request still carries the phone's Division JWT and is checked exactly like a
  LAN request (`401 invalid_token` / `403 account_mismatch`). Requests older than
  five minutes and repeated request ids are dropped.
- Large messages are compressed and split into chunks below Supabase's broadcast
  size limit. The phone polls a little less often over the relay (5 s, 2 s while
  something is running).
- A new pairing token (delete `orchestra-mobile-remote.json` and restart) also
  moves the relay to a new channel and key.

The implementation is `src/vs/code/electron-main/orchestraMobileRelay.ts`; the
phone side is `src/api/relay.ts` and `src/api/relayCodec.ts` in Orchestra Mobile.

On the LAN, iOS needs the Local Network permission and Android needs the app's
local-network access enabled.

The server answers `GET /api/ping` itself and forwards every other authenticated
`/api/*` request to the open Orchestra window, which drives the agent chat, the
Kanban board, Division projects, commands and workspace files. See
[REMOTE-CONTROL.md](./REMOTE-CONTROL.md) for the full endpoint list and the
settings that restrict what a phone may do.
