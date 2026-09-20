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

## Social sharing (assignment posts)

Orchestra Mobile's 共有 tab lets people publish the role-to-model assignments of a
Division project and import someone else's. It talks to Supabase directly rather
than through the desktop, so it works while no desktop is paired.

The access rules live in
`supabase/migrations/20260920000000_assignment_post_social.sql`:

- `AssignmentPost` is readable by any signed-in account; only the author can
  insert, edit or delete a row.
- `likeCount` and `importCount` are not writable from a client. A trigger on
  `AssignmentPostLike` keeps the like count, and the SECURITY DEFINER function
  `import_assignment_post(text)` bumps the import count and returns the
  assignments.

A post carries the role/model pairs, a title, a description and the author's
display name — never an API key, code or workspace content.

## Cost tuning

The mobile コスト tab reads `profiles.division_api_key` for the signed-in account
and calls the Division API (`/api/routing/quote`, `/api/routing/history`)
directly, plus `profiles` and `credit_transactions` for the balance. The routing
policy it edits is stored on the phone; the desktop keeps its own
`divisionAutoRouting` global setting.
