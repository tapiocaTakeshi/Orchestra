# Orchestra Mobile remote control

Orchestra starts a token-protected LAN server at `http://<PC-IP>:39231` when the
desktop app starts. Orchestra Mobile uses it to verify the desktop and run
approved workbench commands.

The pairing information is stored locally at:

- macOS: `~/Library/Application Support/Orchestra/orchestra-mobile-remote.json`
- Windows: `%APPDATA%\\Orchestra\\orchestra-mobile-remote.json`
- Linux: `$XDG_CONFIG_HOME/Orchestra/orchestra-mobile-remote.json`

Open the file on the desktop and copy its `pairingLink` value into Orchestra
Mobile's **手入力・ペアリングリンクで接続** screen. The token is random,
persists across restarts, and must be kept private.

Both devices must be on the same trusted LAN. iOS needs the Local Network
permission and Android needs the app's local-network access enabled.

The server exposes:

- `GET /api/ping` for discovery
- `GET /api/state` for authenticated connection verification
- `POST /api/commands/run` for Orchestra command palette commands
