# Orchestra — AI が仕事の摩擦を取り除く IDE

## 方向性

従来の AI IDE: 人間が問題を発見 → AI に指示 → AI が作業 → 人間が結果を確認。

Orchestra: **AI が問題や停滞を検出 → 必要な情報を集める → 複数の AI が解決策を実行・検証 → 人間には必要な判断だけを届ける。**

新しい AI 機能を大量に足すのではなく、既にある仕組み (Leader / Coder / Reviewer のマルチエージェント、Daytona のクラウド実行、目標ループ、承認モード、GitHub 連携と PR 作成、モバイル連携、`Flow` / `FlowRun` / `FlowNodeExecution`、モデルのルーティングとコスト管理) を、
「人間が都度起動するもの」から「仕事の流れを理解して自動でつながるもの」に変える。

## 7 つの機能

| # | 機能 | 減らす摩擦 | 状態 |
| --- | --- | --- | --- |
| ① | **Project Memory** — コード・過去の判断・失敗・変更理由・PR・会話を関連付けて記憶 | 探す・受け渡す | Phase 2 |
| ② | **Friction Detector** — CI 失敗・修正依頼・繰り返される失敗を検出 | 探す・待つ・やり直す | **Phase 1 実装済み (ルールベース)** |
| ③ | **Autonomous Workflow** — 調査・実装・テスト・レビューを依存関係に沿って自動で進める | 待つ・受け渡す | Phase 3 |
| ④ | **Decision Inbox** — 確認済みの情報・選択肢・推奨・リスクをまとめ、判断だけを人に | 確認・判断準備 | **Phase 1 実装済み** |
| ⑤ | **Verification Engine** — テスト・静的解析・影響範囲・要件との整合性 | やり直す | 既存の目標ループ / Reviewer を Phase 3 で verify ノードに |
| ⑥ | **Context Handoff** — 目的・完了事項・未解決・証拠・次の担当への指示を自動でまとめる | 整える・受け渡す | Phase 1 で一部 (調査用 Context Packet、きっかけの引き継ぎ) |
| ⑦ | **Friction Analytics** — 待ち時間・再修正率・人の介入回数・承認 1 件あたりの費用 | 本当に負担が減ったかを測る | Phase 3 (Phase 1 で元データの記録を開始) |

## Phase 1 で入ったもの

### 例: CI が失敗したとき

```
GitHub で CI 失敗 ──(webhook, 人の指示なし)──▶ Friction Detector
   ▶ Decision Inbox に「CI 失敗: CI (main)」
       ・何が起きたか / ログ・コミットへのリンク / リスク (デフォルトブランチが壊れている, 3 回目の失敗 …) / 推奨
   ▶ 「AI に調査・修正させる」(1 タップ)
       ・サーバーが用意した調査指示 (状況・ログ URL・関連 PR・進め方・禁止事項) でクラウドエージェントを起動
       ・項目は「AI が対応中」に
   ▶ エージェントが完了 → 受信箱に「変更の確認: …」(きっかけ: CI 失敗 …)
   ▶ 人は差分を確認して PR を作るだけ (外部への変更は必ず人の明示操作)
```

### 受信箱に集まるもの

- 承認モードの Division Project が成果物の承認を待っている
- クラウドエージェントが変更を作り、PR 前の確認を待っている
- クラウドエージェントが失敗した (7 日以内)
- 監視中のリポジトリで検出された CI 失敗・修正依頼 (`changes_requested`)

### どこに出るか

- **デスクトップ** (`browser/react/src/cloud-agents-tsx/CloudAgentsPanel.tsx`): 左の列「新しいエージェント」の下に「判断が必要な項目 N」。
  押すと中央 (新しいエージェントの画面) の上にカードが並ぶ。状態は `ICloudAgentService.state.decisions`
  (`refreshDecisions` / `dismissDecision` / `investigateDecision`)。一覧のポーリングのうち、セッションの状態が変わったときと 1 分ごとにだけ読み直す。
- **モバイル** (`Orchestra-Mobile/src/components/DecisionInbox.tsx`): ホームのセッション一覧の上。API クライアントは `src/lib/divisionDecisions.ts`
  (セッション操作の `divisionCloud.ts` とは分けた)。
- **API** (Division): `/api/decisions`, `/api/friction/*`。仕様は Division リポジトリの `docs/friction-removal.md`。

### 監視するリポジトリの登録

現時点ではクライアントの UI は無く、API (`POST /api/friction/triggers { repoFullName }`) で登録する。
GitHub 連携済みなら Division がそのトークンで webhook を自動登録する。

## 設計上の原則

- **LLM をすべてのイベントの監視に使わない**: 検出はルールベース。AI を動かすのは人が許可したとき (Phase 3 で予算付きの自動起動)。
- **根拠を必ず付ける**: カードには元のログ・コミット・PR へのリンクを付け、「まだ不確かなこと」を隠さない。
- **外部への変更 (PR 公開・マージ・デプロイ) は別の明示的な許可**。
- **重要な設計判断や対話の時間は、削るべき摩擦として扱わない**。受信箱は判断を速くするための準備をするだけで、判断そのものを省かない。
- 「削減できた時間」は AI の実行結果だけでは確定できない。Friction Analytics では導入前後の比較とユーザーの評価を組み合わせる。

## 次の段階

**Phase 2 — Project Memory と引き継ぎ**
`Source` (コミット・ファイル・Issue・PR・テスト結果などの一次情報) / `Memory` (方針・制約・決定事項・失敗した方法) / `Context Packet` (タスクに必要な分だけ) を分ける。
Supabase の PostgreSQL に全文検索 + pgvector。検索結果には元ファイル・コミット SHA・更新日時を必ず付け、古い記憶は現在のソースと照合する。
既存の自動コンパクションは「1 つの会話を続けるための記憶」として残し、Project Memory はセッションをまたぐ共有知識として独立させる。

**Phase 3 — 自律ワークフローと摩擦分析**
`Flow` のノードを `trigger / context / agent / verify / decision / action` に整理し、`FlowNodeExecution` から `CloudSession` を参照する。
依存の無いノードは並列、停止後の再開・重複イベントの排除・失敗ノードだけの再試行・コスト上限。
指標: End-to-End Time / Waiting Time / Rework Rate / Human Touchpoints / Verification Cost / Cost per Accepted Task (OpenTelemetry の GenAI 意味規約を土台に)。

最終的に目指す体験:

> 「3 つの問題を検出しました。2 つは修正案の生成とテストまで完了しています。残り 1 つは仕様の判断が必要です。」
