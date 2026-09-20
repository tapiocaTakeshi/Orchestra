# Orchestra Mobile remote control

Orchestra starts a token-protected LAN server at `http://<PC-IP>:39231` when the
desktop app starts. Sign in to the desktop and Orchestra Mobile using the same
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

Both devices must be on the same trusted LAN. iOS needs the Local Network
permission and Android needs the app's local-network access enabled.

The server exposes:

- `GET /api/ping` for discovery
- `GET /api/state` for authenticated connection verification
- `POST /api/commands/run` for Orchestra command palette commands
