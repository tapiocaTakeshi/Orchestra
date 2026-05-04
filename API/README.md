# Division API

**AIエージェントオーケストレーション API**

1つのプロンプトを送るだけで、最適なAIモデルが自動で役割分担し、タスクを完遂します。

---

## 概要

Division APIは、複数のAIモデルを**役割ベース**で自動振り分けるオーケストレーションAPIです。

Leader AI がユーザーのリクエストを分析し、「検索」「設計」「コーディング」「レビュー」などのサブタスクに分解。各タスクを最適なAIモデルに割り当てて並列実行し、全エージェントの出力を **Coder / Writer が統合**して最終成果物を Markdown で生成します。

```
ユーザー: 「クイズアプリを作って」
         ↓
  ┌─ POST /api/tasks/create ──────────────────────┐
  │  🧠 Leader AI (GPT-4.1)                       │
  │  タスクを分析・分解 + finalRole を決定          │
  │       ↓                                        │
  │  Wave 1 (並列実行)                              │
  │  ┌─────────────────────────────────────────┐   │
  │  │  💡 Ideaman  → Claude                   │   │
  │  │  🔍 Search   → Perplexity               │   │
  │  │  📂 FileSearch → GPT-4.1                │   │
  │  │  🔬 Research → Perplexity Deep Research  │   │
  │  └─────────────────────────────────────────┘   │
  │       ↓ Markdown                               │
  │  Wave 2 (並列実行、Wave 1に依存)                │
  │  ┌─────────────────────────────────────────┐   │
  │  │  🎨 Designer → Gemini                   │   │
  │  │  🖼️ Image    → GPT Image 1              │   │
  │  │  📐 Planner  → Gemini                   │   │
  │  └─────────────────────────────────────────┘   │
  └────────────────────────────────────────────────┘
         ↓ tasks (各タスクの出力を含む)
  ┌─ POST /api/tasks/execute ─────────────────────┐
  │  ✍️ Writer / 💻 Coder (合成ステップ)            │
  │  全出力を統合 → コード変更・ファイル生成        │
  └────────────────────────────────────────────────┘
         ↓ Code or Text
  ┌─ POST /api/tasks/execute ─────────────────────┐
  │  🔎 Reviewer (レビューステップ)                 │
  │  品質確認・評価                                 │
  └────────────────────────────────────────────────┘
         ↓
    最終成果物をユーザーに返却
```

## エンドポイント

**Base URL**: `https://api.division.he-ro.jp`

### エージェント実行

エージェント実行は **2ステップ** で行います。

```
Step 1: POST /api/tasks/create   → Leader AIがタスク分解＋各タスク実行
Step 2: POST /api/tasks/execute  → 合成 (Coder/Writer) + レビュー (Reviewer)
```

#### `POST /api/tasks/create` — タスク作成・実行

Leader AIがユーザーのリクエストを分析・分解し、各サブタスクを実行して結果を返します。

```bash
curl -X POST https://api.division.he-ro.jp/api/tasks/create \
  -H "Authorization: Bearer div_..." \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "your-project-id",
    "input": "クイズアプリを作って"
  }'
```

**リクエストボディ:**

| パラメータ    | 型       | 必須 | 説明                           |
| ------------- | -------- | ---- | ------------------------------ |
| `projectId`   | string   | ○    | プロジェクトID                 |
| `input`       | string   | ○    | ユーザーの入力テキスト         |
| `chatHistory` | array    | -    | 過去の会話履歴（user/assistant）|

**レスポンス:**

```json
{
  "sessionId": "session-abc123",
  "tasks": [
    { "taskId": "t1", "role": "search", "title": "技術調査", "output": "..." },
    { "taskId": "t2", "role": "planning", "title": "設計", "output": "..." },
    { "taskId": "t3", "role": "ideaman", "title": "アイデア出し", "output": "..." }
  ],
  "finalRole": "coder"
}
```

#### `POST /api/tasks/execute` — 単一ロール実行（SSE対応）

プロジェクトに割り当てられたロールを1つだけ実行します。合成ステップ（Coder/Writer）とレビューステップ（Reviewer）で使用します。`stream: true` 指定時は SSE でストリーミング、未指定時は JSON で完了後にまとめて返却されます。

```bash
curl -N -X POST https://api.division.he-ro.jp/api/tasks/execute \
  -H "Authorization: Bearer div_..." \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "your-project-id",
    "roleSlug": "coder",
    "input": "プロンプト内容",
    "sessionId": "session-abc123",
    "stream": true
  }'
```

**リクエストボディ:**

| パラメータ    | 型      | 必須 | 説明                                                   |
| ------------- | ------- | ---- | ------------------------------------------------------ |
| `projectId`   | string  | ○    | プロジェクトID                                         |
| `roleSlug`    | string  | ○    | 実行するロール名（例: `coder`, `review`, `writing`）   |
| `input`       | string  | ○    | 入力テキスト                                           |
| `sessionId`   | string  | -    | セッションID（tasks/createの戻り値）                   |
| `chatHistory` | array   | -    | 過去の会話履歴（user/assistant）                       |
| `stream`      | boolean | -    | `true` で SSE ストリーミング、既定は JSON レスポンス   |

**SSEイベント（`stream: true` 時）:**

| イベント | 説明                                      |
| -------- | ----------------------------------------- |
| `chunk`  | テキストチャンク（`text`フィールド）      |
| `done`   | 完了（`output`, `provider`, `durationMs`）|
| `error`  | エラー発生                                |

**JSONレスポンス（stream未指定時）:**

```json
{
  "output": "...",
  "provider": "claude-opus-4",
  "durationMs": 12345
}
```

### モデル管理

| エンドポイント                        | メソッド | 説明                                           |
| ------------------------------------- | -------- | ---------------------------------------------- |
| `/api/models`                         | GET      | DB上の全プロバイダー/モデル一覧                |
| `/api/models/available`               | GET      | プロバイダーAPIから取得した利用可能モデル一覧   |
| `/api/models/available?provider=openai`| GET     | 特定プロバイダーのモデルのみ                    |
| `/api/models/provider/:providerId`    | GET      | プロバイダー別モデルリスト（キャッシュ付き）   |
| `/api/models/sync`                    | POST     | プロバイダーAPIからモデルをDBに同期             |

モデルリストは **インメモリキャッシュ (TTL: 1時間)** で高速に返却されます。
また、**Vercel Cron Job** により毎日 UTC 04:00 に自動同期されます。

### その他

| エンドポイント         | メソッド | 説明                                       |
| ---------------------- | -------- | ------------------------------------------ |
| `/api/tasks/create`    | POST     | タスク作成・Leader AI分解・各タスク実行    |
| `/api/tasks/execute`   | POST     | 単一ロール実行（SSE対応、合成/レビュー用） |
| `/api/providers`       | GET      | プロバイダーCRUD                           |
| `/api/roles`         | GET      | ロールCRUD                                 |
| `/api/assignments`   | GET      | ロール割当CRUD                             |
| `/api/projects`      | GET      | プロジェクトCRUD（認証ユーザーのみ）       |
| `/health`            | GET      | ヘルスチェック                             |
| `/mcp`               | POST     | MCP接続                                   |

---

## 対応モデル（145+ / 6プロバイダー）

プロバイダーAPIからリアルタイムで取得。モデル数は自動同期により常に最新です。

| プロバイダー      | 主要モデル                                                        |
| ----------------- | ----------------------------------------------------------------- |
| 🟢 **OpenAI**     | GPT-4.1, GPT-4.1 Mini/Nano, GPT-4o, o3/Mini, GPT Image 1         |
| 🟣 **Anthropic**  | Claude Opus 4, Sonnet 4.5, Haiku 4.5                              |
| 🔵 **Google**     | Gemini 2.5 Pro/Flash, Gemini 2.0 Flash                            |
| 🟠 **Perplexity** | Sonar Deep Research, Sonar Reasoning Pro, Sonar Pro                |
| ⚫ **xAI**        | Grok 4, Grok 3/Mini                                               |
| 🔴 **DeepSeek**   | DeepSeek Chat (V3), DeepSeek Reasoner (R1)                        |

## 役割（ロール）

| ロール          | デフォルトAI              | 説明                                         |
| --------------- | ------------------------- | -------------------------------------------- |
| `leader`        | GPT-4.1                   | タスク分解・統括・finalRole決定               |
| `coding`        | Claude                    | コード生成・実装・デバッグ                   |
| `search`        | Perplexity Sonar Pro      | ウェブ検索・情報収集                         |
| `file-search`   | GPT-4.1                   | ファイル検索・コード解析・既存コード理解     |
| `planning`      | Gemini                    | 企画・設計・戦略立案                         |
| `writing`       | OpenAI                    | 文章作成・ドキュメント                       |
| `review`        | Gemini                    | レビュー・品質確認                           |
| `deep-research` | Perplexity Deep Research  | 徹底調査・包括的分析                         |
| `image`         | GPT Image 1               | 画像生成・ビジュアルコンテンツ               |
| `ideaman`       | Claude                    | アイデア発想・ブレインストーミング           |

### 合成ステップ (Synthesis) + レビューステップ (Review)

全エージェントの作業完了後、`/api/tasks/execute` を2回呼び出します。

1. **合成**: Leader が指定した `finalRole`（`coder` or `writer`）のAIが全出力を統合し、コード変更・ファイル生成を実行
2. **レビュー**: `review` ロールのAIが成果物の品質を確認・評価

```
全エージェント出力 → Coder/Writer (コード変更) → Reviewer (品質確認) → 最終成果物
```

## overrides（モデル切り替え）

`overrides` パラメータで、特定の役割に使うAIを自由に切り替えできます。

```json
{
  "overrides": {
    "coding": "deepseek-r1",
    "search": "grok-3",
    "review": "gpt-4.1",
    "planning": "gemini-2.5-pro"
  }
}
```

## 認証

Authorization ヘッダーに Division API キーを含めます。

```
Authorization: Bearer div_...
```

`div_` プレフィックスと `ak_` プレフィックスの両方のAPIキーに対応しています。
認証済みリクエストではサーバー側の環境変数から各プロバイダーのAPIキーが自動解決されます。

## MCP接続（IDE統合）

Cursor / Antigravity / Claude Desktop のMCP設定に追加するだけで使えます。

```json
{
  "mcpServers": {
    "division": {
      "url": "https://api.division.he-ro.jp/mcp?key=div_..."
    }
  }
}
```

### MCPツール

| ツール                 | 説明                                       |
| ---------------------- | ------------------------------------------ |
| `division_run`         | AIエージェントにタスクを実行させる         |
| `division_stream`      | ストリーミング付きでエージェントを実行する |
| `division_list_models` | 利用可能な全モデルを一覧表示               |
| `division_health`      | APIの稼働状態を確認                        |

---

## フロントエンド (Conductor UI)

Division Conductor はマルチエージェントオーケストレーションのWebフロントエンドです。

- Google認証（Supabase Auth）
- リアルタイムSSEストリーミング表示
- Wave ベースの並列実行ビジュアライゼーション
- 合成ステップの Markdown レンダリング
- 指揮者モード（エージェント全体俯瞰）
- パイプラインビルダー / テンプレート

## 技術スタック

- **Runtime**: Node.js + TypeScript
- **Framework**: Express
- **Database**: PostgreSQL (Supabase) + Prisma ORM
- **Frontend**: React + Vite + Zustand + Tailwind CSS
- **Hosting**: Vercel (Serverless + Cron Jobs)
- **Protocol**: JSON-RPC 2.0 (MCP), SSE (Server-Sent Events)
- **Auth**: Supabase Auth (Google OAuth)
