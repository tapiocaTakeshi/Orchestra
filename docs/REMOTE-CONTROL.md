# Remote Control (orchestra-mobile 向け API)

Orchestra IDE をスマホアプリ [orchestra-mobile](https://github.com/tapiocaTakeshi/orchestra-mobile) から操作するための、
ローカル LAN 上の HTTP API です。

現在の実装は **Phase 1** で、接続確認 (`/api/ping`) と最小限の状態取得 (`/api/state`) のみを提供します。
カンバン・チャット・Division 連携・ファイル操作などの API は将来のフェーズで追加予定です
(それまでの間、これらのエンドポイントは `404 not_implemented` を返します)。

## 有効にする

設定 → **リモートコントロール** タブ、またはコマンドパレットから:

- `Remote Control: Toggle Mobile Server` — サーバーの ON/OFF
- `Remote Control: Show Connection Info` — 接続先アドレス・トークンの表示、ペアリングリンクのコピー
- `Remote Control: Regenerate Token` — トークンを作り直す (以前のペアリングリンクは無効になる)

有効にすると、この PC の LAN 上の IP アドレスで `http://<PC の IP>:39231` の待ち受けが始まります。

## 接続方法

### 1. Division アカウントでのログイン (推奨)

IDE で Division アカウントにログインした状態でリモートコントロールを有効にすると、
この PC のセッション情報 (LAN アドレス・トークン) が Supabase の `RemoteSession` テーブルへ
定期的に登録されます (約 25 秒間隔のハートビート)。orchestra-mobile 側で同じ Division
アカウントにログインすると、このセッションが自動的に一覧に表示され、タップするだけで接続できます。

### 2. 手動ペアリング (フォールバック)

「ペアリングリンクをコピー」で得られる `orchestra://pair?v=1&url=...&token=...&workspace=...`
形式のリンクを orchestra-mobile に貼り付けるか、アドレスとトークンを直接入力します。
Division アカウントを使わない場合や、Wi-Fi 環境の都合で自動検出が使えない場合はこちらを使ってください。

## プロトコル

`PROTOCOL_VERSION = 1` (`src/vs/workbench/contrib/void/common/remoteControlTypes.ts`)。
orchestra-mobile 側の `PROTOCOL_VERSION` と食い違う場合、アプリ側で警告が表示されます。

### 認証

`/api/ping` を除く全エンドポイントで、リクエストヘッダに `X-Orchestra-Token: <token>` が必要です。
一致しない場合は `401 { "error": "unauthorized" }` を返します。

### `GET /api/ping`

認証不要。相手が Orchestra かどうかの判定に使います。

```json
{ "ok": true, "app": "Orchestra", "protocolVersion": 1, "requiresToken": true }
```

### `GET /api/state`

要トークン。IDE の現在のスナップショットを返します。Phase 1 では `division` / `kanban` / `chat` / `threads`
は空の最小構造 (`revision` は `setIdeInfo` が呼ばれるたびに増加) です。

```json
{
  "ide": { "protocolVersion": 1, "appName": "Orchestra", "version": "...", "workspaceName": "...", "workspaceFolders": ["..."], "uiLanguage": "ja" },
  "division": { "projects": [], "activeProjectIds": [], "configPath": null, "hasProject": false },
  "kanban": { "board": { "version": 1, "title": "", "columns": [], "tasks": [], "updatedAt": 0 }, "runtime": { "isLoaded": false, "source": { "kind": "storage" }, "isPolling": false, "isRunning": false, "awaitingApproval": false, "runningTaskId": null, "queuedTaskIds": [], "lastPolledAt": null, "autoRunEnabled": false } },
  "chat": { "threadId": "", "messages": [], "isRunning": false, "awaitingApproval": false },
  "threads": [],
  "revision": 0,
  "generatedAt": 1710000000000
}
```

### それ以外のエンドポイント

Phase 1 では未実装です。`404 { "error": "not_implemented", "detail": "..." }` を返します。

## アカウント自動連携の仕組み (Supabase)

- テーブル: `public."RemoteSession"` (1 インストールにつき 1 行、`id` は端末ごとに生成される安定 UUID で upsert)
- RLS: `auth.uid() = "userId"` の行のみ本人が read/write 可能
- IDE 側 (`src/vs/workbench/contrib/void/browser/remoteControlSessionSync.ts`) が約 25 秒ごとに
  `lastSeenAt` を更新し、リモートコントロールを無効化するかログアウトすると該当行を削除します
- orchestra-mobile 側はログイン中、同じ `RemoteSession` テーブルを購読し、新しい行が増えたら
  ローカル通知でユーザーに知らせます

このテーブルへのマイグレーションは本番 Supabase プロジェクトへの変更を伴うため、
リポジトリでは SQL をレビュー用に管理し、適用は別途人間の確認を経て行います。

## セキュリティ

- 平文 HTTP です。信頼できる LAN の中だけで使ってください。
- トークンが漏れたら `Remote Control: Regenerate Token` で作り直してください。
- Division アカウントでの自動連携を使う場合、そのアカウントの Supabase セッション (JWT) が
  端末のセキュアストレージに保存されます。
