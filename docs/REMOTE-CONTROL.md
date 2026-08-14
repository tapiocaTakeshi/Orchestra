# リモートコントロール API

スマホアプリ [Orchestra-Mobile](https://github.com/tapiocaTakeshi/Orchestra-Mobile) から
Orchestra IDE を操作するためのローカル HTTP API です。

---

## 仕組み

```
[Orchestra-Mobile (React Native)]
      │  HTTP + JSON (X-Orchestra-Token)
      ▼
[electron-main: remoteControlChannel.ts]   ← HTTP サーバ (Node が要るので main プロセス)
      │  IPC (onRequest / respond)
      ▼
[workbench: remoteControlService.ts]       ← ルーティングと実処理
      ├─ kanbanService           (.orchestra/kanban.json)
      ├─ divisionProjectService  (.division/projects.json)
      ├─ chatThreadService       (エージェント)
      └─ commandService / editorService
```

main 側は HTTP を IPC の封筒に詰め替えるだけの薄いプロキシです。エンドポイントを増やすときに
触るのは `remoteControlService.ts` の `_route()` だけで済みます。

ウィンドウを複数開いている場合、サーバを持てるのは 1 つだけです。`start` を投げたウィンドウの
`ownerId` が main 側に記録され、リクエストはその ID 付きでブロードキャストされるので、
他のウィンドウは自分宛でないものを捨てます。

---

## 有効化

**設定 → リモートコントロール** から、またはコマンドパレットから:

| コマンド | 内容 |
| --- | --- |
| `Remote Control: Toggle Mobile Server` | サーバの起動 / 停止 |
| `Remote Control: Show Connection Info` | 接続先 URL とトークンの表示、ペアリングリンクのコピー |
| `Remote Control: Regenerate Token` | トークンの作り直し (既存のペアリングは無効になる) |

設定は `globalSettings.remoteControl` に入ります。

| キー | 既定値 | 内容 |
| --- | --- | --- |
| `enabled` | `false` | サーバを起動するか |
| `port` | `39231` | 待ち受けポート |
| `token` | `''` | 認証トークン。有効化時に自動生成される |
| `allowLan` | `true` | `false` なら `127.0.0.1` のみ待ち受ける |
| `allowAgentPrompts` | `true` | エージェントへの指示を許可するか |
| `allowKanbanWrites` | `true` | カンバンの編集を許可するか (false なら閲覧のみ) |
| `allowProjectWrites` | `true` | Division プロジェクトの編集を許可するか |
| `allowCommands` | `true` | 任意のコマンド ID の実行を許可するか |

`allowCommands` がオフでも、保存・ウィンドウ再読み込みなど無害なコマンド
(`SAFE_COMMAND_IDS`) は実行できます。

---

## 認証

`/api/ping` 以外のすべてのリクエストにトークンが要ります。次のどれでも渡せます。

```
X-Orchestra-Token: <token>
Authorization: Bearer <token>
?token=<token>
```

トークンの比較は `timingSafeEqual` で行います。ボディの上限は 2 MB、レンダラが 60 秒以内に
応答しない場合は `504 ide_timeout` を返します。

---

## エンドポイント

### 状態

| メソッド | パス | 内容 |
| --- | --- | --- |
| `GET` | `/api/ping` | トークン不要。相手が Orchestra かの判定に使う |
| `GET` | `/api/state` | すべてをまとめたスナップショット (下記) |
| `GET` | `/api/ide` | IDE の情報だけ |

`GET /api/state` のレスポンス:

```jsonc
{
  "ide":      { "protocolVersion": 1, "appName": "Orchestra", "version": "…",
                "workspaceName": "…", "workspaceFolders": ["…"], "uiLanguage": "ja" },
  "division": { "projects": [...], "activeProjectIds": [...], "configPath": "…", "hasProject": true },
  "kanban":   { "board": { /* KanbanBoard */ }, "runtime": { /* 実行状態 */ } },
  "chat":     { "threadId": "…", "messages": [...], "isRunning": false, "awaitingApproval": false },
  "threads":  [ { "threadId": "…", "title": "…", "lastModified": "…", "messageCount": 3 } ],
  "revision": 42,        // 状態が変わるたびに増える。ポーリング側はこれだけ見ればよい
  "generatedAt": 1739500000000
}
```

### カンバン

| メソッド | パス | 内容 |
| --- | --- | --- |
| `GET` | `/api/kanban` | ボードと実行状態 |
| `POST` | `/api/kanban/reload` | ファイルから読み直す |
| `PATCH` | `/api/kanban/board` | `{ title }` |
| `POST` | `/api/kanban/tasks` | `{ title, columnId?, description?, labels?, priority?, dueDate?, assignee? }` |
| `PATCH` | `/api/kanban/tasks/:id` | 任意のフィールドを更新 |
| `DELETE` | `/api/kanban/tasks/:id` | 削除 |
| `POST` | `/api/kanban/tasks/:id/move` | `{ columnId, index }` |
| `POST` | `/api/kanban/tasks/:id/run` | エージェントに実行させる (202、完了は待たない) |
| `POST` | `/api/kanban/tasks/:id/comments` | `{ body }` |
| `DELETE` | `/api/kanban/tasks/:id/comments/:commentId` | 削除 |
| `POST` | `/api/kanban/tasks/:id/checklist` | `{ text }` |
| `PATCH` | `/api/kanban/tasks/:id/checklist/:itemId` | `{ text?, done? }` |
| `DELETE` | `/api/kanban/tasks/:id/checklist/:itemId` | 削除 |
| `POST` | `/api/kanban/columns` | `{ title, role?, color?, wipLimit? }` |
| `PATCH` | `/api/kanban/columns/:id` | カラムの更新 |
| `DELETE` | `/api/kanban/columns/:id` | `{ moveTasksTo? }` |
| `POST` | `/api/kanban/columns/:id/move` | `{ index }` |
| `POST` | `/api/kanban/auto-run` | `{ enabled }` |
| `POST` | `/api/kanban/run-now` | To Do を 1 回さらって実行 (202) |
| `POST` | `/api/kanban/cancel` | 実行中タスクの中断 |

### Division プロジェクト

| メソッド | パス | 内容 |
| --- | --- | --- |
| `GET` | `/api/division/projects` | プロジェクト一覧と有効な ID |
| `GET` | `/api/division/models` | 選択できるプロバイダーとモデル (非表示のものは除く) |
| `POST` | `/api/division/projects` | `{ projectId, name, agents }` |
| `PATCH` | `/api/division/projects/:id` | `{ name?, agents? }` |
| `DELETE` | `/api/division/projects/:id` | 削除 |
| `POST` | `/api/division/projects/:id/activate` | `{ exclusive }` — true なら排他、false なら ON/OFF |
| `POST` | `/api/division/sync/pull` | Supabase から取得 |
| `POST` | `/api/division/sync/push` | Supabase へ送信 |

### エージェント (チャット)

| メソッド | パス | 内容 |
| --- | --- | --- |
| `GET` | `/api/chat` | 現在のスレッドの状態 |
| `GET` | `/api/chat/threads` | スレッド一覧 (最大 50 件) |
| `POST` | `/api/chat/message` | `{ message, newThread?, threadId? }` (202、完了は待たない) |
| `POST` | `/api/chat/abort` | 実行中の中断 |
| `POST` | `/api/chat/new` | 新しいスレッド |
| `POST` | `/api/chat/threads/:id` | スレッドの切り替え |
| `POST` | `/api/chat/approve` | ツール実行の承認 |
| `POST` | `/api/chat/reject` | ツール実行の却下 |

### コマンド / ファイル

| メソッド | パス | 内容 |
| --- | --- | --- |
| `GET` | `/api/commands?q=` | 実行できるコマンド ID (最大 500 件) |
| `POST` | `/api/commands/run` | `{ commandId, args? }` |
| `GET` | `/api/files/list?path=` | ワークスペース内のディレクトリ一覧 |
| `POST` | `/api/files/open` | `{ path }` — IDE でファイルを開く |

`path` はワークスペースルートからの相対パスです。`..` を含む指定は拒否します。

---

## エラー

| ステータス | `error` | 意味 |
| --- | --- | --- |
| 400 | `invalid_json` / `*_required` | ボディが壊れている / 必須項目が無い |
| 401 | `unauthorized` | トークンが違う |
| 403 | `forbidden` | IDE 側の設定でその操作が無効 (`detail` に日本語の説明) |
| 404 | `not_found` | 未対応のパス |
| 413 | `payload_too_large` | ボディが 2 MB 超 |
| 503 | `no_window_attached` | サーバは動いているがウィンドウが繋がっていない |
| 504 | `ide_timeout` | レンダラが 60 秒以内に応答しなかった |

---

## ペアリング

設定パネルの「ペアリングリンクをコピー」は次の形式を返します。

```
orchestra://pair?v=1&url=http%3A%2F%2F192.168.0.5%3A39231&token=<token>&workspace=<name>
```

アプリ側はこのリンクのほか、同じ内容の JSON (QR コードに載せる用) と、
`http://host:port?token=…` 形式の URL も受け付けます。

---

## セキュリティ上の注意

- 平文 HTTP です。信頼できる LAN の中だけで使ってください。
- トークンを知っている端末は IDE を操作できます (ファイル編集・コマンド実行を含む)。
- 外に出したくない操作は設定の許可トグルでオフにしてください。
- `allowLan` を `false` にすると `127.0.0.1` のみになります。USB 接続なら
  `adb reverse tcp:39231 tcp:39231` で繋げます。
