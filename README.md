# 🎵 Orchestra

<div align="center">
	<img
		src="void_icons/orchestra_icon_nonbackground.png"
	 	alt="Orchestra"
		width="300"
	 	height="300"
	/>
  <br />
  <p><strong>最強のマルチエージェントを搭載した次世代 AI IDE</strong></p>
</div>

---

**Orchestra** は、[Division API](https://api.division.he-ro.io) を搭載したAIエージェント統合型IDEです。
1つのプロンプトを送信するだけで、Orchestraのマルチエージェント・オーケストレーションが「検索」「プロンプト設計」「コーディング」「レビュー」といった各タスクに最適なAIモデル（Claude, GPT-4, Gemini, Perplexity等）を自動で割り当て、最高品質のコードを生成します。

## ✨ 主な機能 (Features)

- 🧠 **Division API 統合** — Anthropic, Google, OpenAI, Perplexity, xAI, DeepSeekなど、**6プロバイダー・38以上の最新LLM**をシームレスに利用可能。
- 🎭 **役割ベースのマルチエージェント** — ロールは **リーダー・サーチャー・リサーチャー・ライター・デザイナー・コーダー・レビュアー** の 7 つ。設定でロールごとにモデルを割り当てます。
  - `Leader`: タスク分解・統括 / `Searcher`: Web 検索・既存ファイルの調査 / `Researcher`: 深い調査・アイデア出し
  - `Writer`: 文章・仕様書 / `Designer`: UI デザイン (HTML) / `Coder`: 実装 / `Reviewer`: レビュー
- 🗺️ **ワークフロー** — Division Project では、Leader の計画を**ワークフロー図**にして `.division/workflow.json` に保存します (承認モードでなくても保存)。チャットの図で編集でき、ノードは「ロール」「承認」「for ループ」「while ループ」「ループ終了」「並列」。
  - **繰り返しと目標はワークフローの中で設定します。** while ループに目標を書くと、達成するまで (最大 1〜10 回) 中のステップを繰り返し、毎回の前に Leader が判定します。for ループは決まった回数繰り返します。以前の入力欄の「ループ」設定 (目標ループ) はなくなりました。
  - 並列ノードから出た分岐は同時に実行し、出力はステップの順に表示します。
- ✅ **承認モード** — 設定の Division タブ先頭のスイッチで切り替えます (チャットとクラウドエージェントで共通)。オンにすると、Leader のワークフロー案と、各ロールの成果物 (`.division/*.md`、デザインは `.division/design/`) で止まり、内容を編集してから承認するとその内容で次へ進みます。
- 🎬 **ウェルカム画面のチュートリアル** — ウェルカム画面 (ようこそ) に、依頼 → ワークフロー (`.division/workflow.json`) → 論文 (`.division/paper.md`) と仕様書 (`.division/specification.md`) → デザイン (`.division/design/`) → 承認・編集 の流れを見せるアニメーションがあります。ファイルがあればその場で開け、チャット (Ctrl+L) もそこから開けます。チャットの初期画面は入力欄だけのままです。
- ⚡ **自律型エージェントモード** — AIエージェントがファイル編集、ターミナルコマンド実行、プロジェクト管理からコードの実行まで自律的に行います。
- � **インライン・コンテキスト追加** — チャットの文章中に `@` を入力するだけで、特定のファイルやフォルダ、シンボルを文脈（コンテキスト）として簡単にプロンプトへ追加できます。
- ✅ **計画チェックリスト (update_plan)** — [OpenAI Codex](https://github.com/openai/codex) の `update_plan` と同じく、複数ステップの作業ではエージェントが最初に計画を立て、「完了 / 作業中 / 未着手」を更新しながら進めます。IDE のチャットとクラウドエージェントの画面にライブのチェックリストとして表示され、最新の計画は開いたまま、それ以前の更新は 1 行に畳まれます。
- 🩹 **apply_patch** — [OpenAI Codex](https://github.com/openai/codex) と同じパッチ形式 (`*** Begin Patch` 〜 `*** End Patch`) で、複数ファイルの追加・変更・削除・名前変更を 1 回でまとめて行えます。どこか 1 か所でも当てはまらなければ何も変更しない「全部か無しか」方式で、空白や全角記号の違いはある程度吸収します。IDE では通常の編集と同じく差分として表示され、承認・取り消しができます。
- 🌐 **ブラウザ操作 (browser_use)** — エージェントが Vercel の [agent-browser](https://agent-browser.dev) で実際のブラウザ (Chrome) を操作します。ページを開く・クリック・入力・選択・キー操作・スクロール・戻る/進む・ダイアログへの応答ができ、毎回「アクセシビリティツリー (操作できる要素に `ref=e3` のような参照付き) + ページ本文」を受け取って次の操作を決めます。チャットには操作ごとにスクリーンショットが表示されます。開発中のアプリ (`localhost:3000` など) の動作確認に使えます。ブラウザは普段のプロファイルとは別のログアウト状態で開き、開けるのは http(s) だけです。操作は承認制 (設定で「browser」を自動承認にもできます)。Chrome が見つからないときはコマンド「Orchestra: Install Browser for Agent」で Chrome for Testing をダウンロードできます。設定: `orchestra.browserUse.headless` (ウィンドウを出さない)、`orchestra.browserUse.executablePath`、`orchestra.browserUse.localhostOnly` (agent-browser のドメイン制限で localhost 以外を遮断)、`orchestra.browserUse.agentBrowserPath`。
- 🗜️ **自動コンパクション** — [OpenAI Codex](https://github.com/openai/codex) と同じく、IDE のチャットとクラウドエージェントの会話が長くなると、エージェントがそれまでの経緯 (進み具合・決めたこと・変えたファイル・テスト結果・うまくいかなかった方法・次の一手) を要約し、古い手順の代わりにその要約を読んで作業を続けます。ユーザーの指示文と計画は原文のまま残ります。画面には「ここまでの経緯を要約しました」と表示され、押すと要約を読めます。チャット欄やクラウドエージェントの追加指示欄に `/compact` と送れば、いつでも手動で要約できます (Codex と同じ)。
- ⌨️ **Codex 風のチャット操作** — 入力欄に `/` と打つとコマンドの候補 (`/compact` 会話の要約・`/init` AGENTS.md の作成・`/remote-control`) が出ます (↑↓ で選択、Enter で実行、Tab で入力)。入力欄の下には残りコンテキストの目安 (「残り 82%」) を、作業中は経過時間と止め方 (「12秒 · Esc で中断」) を表示します。
- 📜 **AGENTS.md 対応** — [OpenAI Codex](https://github.com/openai/codex) などと同じ `AGENTS.md` 規約に対応。ワークスペース直下の `AGENTS.md`（ローカル用の `AGENTS.override.md` があればそちらを優先、合計 32 KiB まで）を IDE のエージェントとクラウドエージェントの両方が自動で読み込み、ビルド・テスト手順やコーディング規約に従って作業します。サブフォルダの `AGENTS.md` はそのフォルダ以下に適用され、より深い階層の指示が優先されます。
- �🔄 **VS Code完全互換** — 拡張機能、デバッグ、Git連携など、使い慣れたVS Codeの機能をそのまま利用可能です。
- 🤖 **エージェントモード (既定の表示)** — AI エージェントに作業を任せるための画面。IDE 的な部品 (アクティビティバー・ステータスバー・ミニマップ等) を隠し、ホーム画面とエージェントへの指示欄だけの画面で始められます。チャットは常に「エージェント」、ファイル編集とコマンド実行は自動承認で、エージェントが最後まで自走します。タイトルバーから「止める」「確認する」ができ、自分でもコードを触りたければ「上級者モード」で通常の VS Code の表示に戻せます。詳しくは [docs/agent-mode.md](./docs/agent-mode.md)。

## 🚀 Division API について

Orchestraの頭脳である **Division API** (`https://api.division.he-ro.io`) は、Leader AI (Gemini 2.5 Flash等) がユーザーの指示を解析・タスク分解し、7 つのロールに並行・順次処理させるオーケストレーションシステムです。プロジェクトのワークフロー (ループ・並列・承認) どおりに実行することもできます。

利用可能なモデル一覧やMCP（Model Context Protocol）連携の詳細などについては、[DIVISION-API.md](./DIVISION-API.md) をご参照ください。

## 🛠 開発者向けガイド (For Developers)

Orchestraは [Void Editor](https://github.com/voideditor/void) (VS Codeのフォーク) をベースに開発されています。
コードベースの構造やアーキテクチャについては、[VOID_CODEBASE_GUIDE.md](./VOID_CODEBASE_GUIDE.md) をご確認ください。

### 開発の始め方 (Getting Started)

Orchestraの開発環境を構築・起動する手順は以下の通りです：

1. **依存関係のインストール**

   ```bash
   npm install
   ```

2. **コンパイルとビルド**
   コアモジュールやTypeScriptファイルのビルドを行います。（初回は数分かかります）

   ```bash
   npm run compile
   ```

3. **Orchestra の起動**
   コンパイル完了後、VS Codeの「実行とデバッグ (Run and Debug)」パネルから `VS Code (Debug Observables)` ターゲットを選択して実行するか、以下のスクリプトを使用して起動します。
   ```bash
   ./scripts/code.sh
   # Windows: .\scripts\code.bat
   ```

## 📜 ライセンス (License)

このプロジェクトは [MIT License](./LICENSE.txt) の下で公開されています。（コアとなるVS Codeの部分については [LICENSE-VS-Code.txt](./LICENSE-VS-Code.txt) および [ThirdPartyNotices.txt](./ThirdPartyNotices.txt) を併せてご参照ください）
