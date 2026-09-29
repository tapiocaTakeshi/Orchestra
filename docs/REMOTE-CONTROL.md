# リモートコントロール API

Orchestra Mobile から IDE を操作するための LAN 内 HTTP API です。接続とアカウントの
仕組みは [ORCHESTRA-MOBILE-REMOTE.md](./ORCHESTRA-MOBILE-REMOTE.md) を参照してください。

## 仕組み

```
Orchestra Mobile ──HTTP──▶ メインプロセス (:39231)          ──IPC──▶ ワークベンチ (ウィンドウ)
                           トークン / Division アカウント確認           チャット・カンバン・Division・
                           src/vs/code/electron-main/                  コマンド・ファイルを操作
                           orchestraMobileRemoteControl.ts             contrib/void/electron-sandbox/
                                                                       remoteControl.contribution.ts
```

- `GET /api/ping` 以外はすべて `X-Orchestra-Token` と `X-Division-Access-Token` が必要です。
  トークン違いは `401 invalid_token`、PC と別アカウントなら `403 account_mismatch`。
- 確認を通ったリクエストは、フォーカス中 (無ければ最後にフォーカスされた) ウィンドウへ渡します。
  ウィンドウが無ければ `503 no_window`、50 秒以内に応答が無ければ `504 workbench_timeout`。
- 型は `src/vs/workbench/contrib/void/common/remoteControlTypes.ts` にあり、モバイル側の
  `src/api/types.ts` と対応します。形を変えたら `REMOTE_CONTROL_PROTOCOL_VERSION` を上げてください。
- エラーは `{ "error": "<code>", "detail": "<人向けの説明>" }` の形で返します。

## チャットのセッションをスマホに同期する (`/remote-control`)

PC のチャット欄に `/remote-control` と入力して送ると、そのチャット (スレッド) を
Orchestra Mobile と同期します。このメッセージは AI には送られません。

- 同期したチャットはスマホのチャット画面に出続けます。PC で別のチャットを開いても切り替わりません。
- スマホからの送信・承認・中断は、同期したチャットに届きます。スマホでスレッドを切り替えたり
  新しいチャットを始めたりすると、同期先がそちらに移ります (PC の表示はそのまま)。
- 送った時点でアカウントの RemoteSession をすぐ更新するので、スマホの「見つかったデバイス」に
  すぐ出ます。接続済みのスマホには「PC のセッションを同期しました」と通知が出ます。
- チャットには接続の案内だけを返し、トークンは書きません (チャット履歴は AI に送られるため)。
  手入力で繋ぐときは、同時に出る通知の「ペアリングリンクをコピー」を使ってください。

| 入力 | 動作 |
| --- | --- |
| `/remote-control` | このチャットを同期する (`on` / `sync` / `start` も同じ) |
| `/remote-control off` | 同期をやめる。スマホは PC で開いているチャットを表示する状態に戻る (`stop` も同じ) |
| `/remote-control status` | 同期の状態と、サーバー・アカウントの状態を表示する |

同期の状態は `GET /api/state` の `remoteSession` (`{ threadId, title, syncedAt }`、同期していなければ `null`) で
分かります。同期はウィンドウごとで、Orchestra を再起動すると解除されます。

## 権限の設定

設定 → リモートコントロール で、スマホからの操作を種類ごとに止められます (既定はすべて許可)。
止めた操作は `403 forbidden` になります。閲覧 (GET) はどれを止めても使えます。

| 設定 | 対象 |
| --- | --- |
| `orchestra.remoteControl.allowChat` | チャットの送信・中断・スレッド操作・ツールの承認/却下 |
| `orchestra.remoteControl.allowKanbanEdit` | カンバンの編集・タスク実行・自動実行の切り替え |
| `orchestra.remoteControl.allowProjectEdit` | Division プロジェクトの編集・有効化・Supabase 同期 |
| `orchestra.remoteControl.allowCommands` | コマンドの実行・ファイルを開く |

## エンドポイント

### 全体

| メソッド | パス | 内容 |
| --- | --- | --- |
| GET | `/api/ping` | 認証なし。`{ ok, app, protocolVersion }` |
| GET | `/api/state` | IDE 情報・Division・カンバン・現在のチャット・スレッド一覧をまとめて返す。`revision` はどれかが変わるたびに進む |

### チャット (エージェント)

| メソッド | パス | 本文 | 内容 |
| --- | --- | --- | --- |
| GET | `/api/chat` | | 現在のスレッド |
| GET | `/api/chat/threads` | | `{ threads }` (新しい順、最大 50 件) |
| POST | `/api/chat/message` | `{ message, newThread?, threadId? }` | 送信して `{ threadId }` を返す。完了は待たない。実行中・承認待ちなら `409 agent_busy` |
| POST | `/api/chat/abort` | `{ threadId? }` | 実行を中断 |
| POST | `/api/chat/new` | | 新しいスレッド |
| POST | `/api/chat/threads/:id` | | スレッドを切り替え |
| POST | `/api/chat/approve` | `{ threadId? }` | 承認待ちのツールを承認。承認待ちでなければ `409 not_awaiting_approval` |
| POST | `/api/chat/reject` | `{ threadId? }` | 承認待ちのツールを却下 |

メッセージは `{ role, text, toolName? }` に変換して返します (1 件 4,000 文字・直近 200 件まで)。
ストリーミング中の返答や実行中のツールも末尾に含めます。

### カンバン

| メソッド | パス | 本文 |
| --- | --- | --- |
| GET | `/api/kanban` | |
| POST | `/api/kanban/reload` | |
| PATCH | `/api/kanban/board` | `{ title }` |
| POST | `/api/kanban/tasks` | `{ title, columnId?, description?, labels?, priority?, dueDate?, assignee? }` → `{ task }` |
| PATCH | `/api/kanban/tasks/:id` | タスクの一部 → `{ task }` |
| DELETE | `/api/kanban/tasks/:id` | |
| POST | `/api/kanban/tasks/:id/move` | `{ columnId, index }` |
| POST | `/api/kanban/tasks/:id/run` | (完了は待たない) |
| POST | `/api/kanban/tasks/:id/comments` | `{ body }` → `{ task }` |
| POST | `/api/kanban/tasks/:id/checklist` | `{ text }` → `{ task }` |
| PATCH | `/api/kanban/tasks/:id/checklist/:itemId` | `{ text?, done? }` → `{ task }` |
| DELETE | `/api/kanban/tasks/:id/checklist/:itemId` | |
| POST | `/api/kanban/columns` | `{ title, role?, wipLimit?, color? }` → `{ column }` |
| PATCH | `/api/kanban/columns/:id` | カラムの一部 |
| DELETE | `/api/kanban/columns/:id` | `{ moveTasksTo? }` |
| POST | `/api/kanban/auto-run` | `{ enabled }` |
| POST | `/api/kanban/run-now` | |
| POST | `/api/kanban/cancel` | |

### Division プロジェクト

| メソッド | パス | 本文 |
| --- | --- | --- |
| GET | `/api/division/projects` | |
| GET | `/api/division/models` | → `{ providers: [{ provider, models }] }` (設定で表示中のモデル) |
| POST | `/api/division/projects` | `{ projectId, name, agents }` |
| PATCH | `/api/division/projects/:id` | `{ name?, agents? }` |
| DELETE | `/api/division/projects/:id` | |
| POST | `/api/division/projects/:id/activate` | `{ exclusive }` (`false` なら ON/OFF 切り替え) |
| POST | `/api/division/sync/pull` | `{ projectId? }` |
| POST | `/api/division/sync/push` | |

更新系はどれも更新後の Division 状態を返します。

### コマンド / ファイル

| メソッド | パス | 内容 |
| --- | --- | --- |
| GET | `/api/commands?q=` | 登録済みコマンド ID (最大 300 件、`_` で始まる内部コマンドは除く) |
| POST | `/api/commands/run` | `{ commandId, args? }` → `{ result }` |
| GET | `/api/files/list?path=` | ワークスペース直下からの相対パスで一覧。フォルダが先 |
| POST | `/api/files/open` | `{ path }` をエディタで開く |

ファイルのパスは最初のワークスペースフォルダからの相対パスだけを受け付け、外へ出るものは
`403 outside_workspace` にします。
