# 🎵 Orchestra

<div align="center">
	<img
		src="./src/vs/workbench/browser/parts/editor/media/slice_of_void.png"
	 	alt="Orchestra"
		width="300"
	 	height="300"
	/>
  <br />
  <p><strong>最強のマルチエージェントを搭載した次世代 AI IDE</strong></p>
</div>

---

**Orchestra** は、[Division API](https://api.division.he-ro.jp) を搭載したAIエージェント統合型IDEです。
1つのプロンプトを送信するだけで、Orchestraのマルチエージェント・オーケストレーションが「検索」「プロンプト設計」「コーディング」「レビュー」といった各タスクに最適なAIモデル（Claude, GPT-4, Gemini, Perplexity等）を自動で割り当て、最高品質のコードを生成します。

## ✨ 主な機能 (Features)

- 🧠 **Division API 統合** — Anthropic, Google, OpenAI, Perplexity, xAI, DeepSeekなど、**6プロバイダー・38以上の最新LLM**をシームレスに利用可能。
- 🎭 **役割ベースのマルチエージェント** — 適材適所のAIアサインを実現。
  - `コーディング` : Claude Sonnet 4.5 など
  - `検索・調査`: Perplexity Sonar Pro など
  - `設計・推論`: Gemini 2.5 Pro など
  - `レビュー`: GPT-4.1 / DeepSeek V3 など
- ⚡ **自律型エージェントモード** — AIエージェントがファイル編集、ターミナルコマンド実行、プロジェクト管理からコードの実行まで自律的に行います。
- � **インライン・コンテキスト追加** — チャットの文章中に `@` を入力するだけで、特定のファイルやフォルダ、シンボルを文脈（コンテキスト）として簡単にプロンプトへ追加できます。
- �🔄 **VS Code完全互換** — 拡張機能、デバッグ、Git連携など、使い慣れたVS Codeの機能をそのまま利用可能です。

## 🚀 Division API について

Orchestraの頭脳である **Division API** (`https://api.division.he-ro.jp`) は、Leader AI (Gemini 2.5 Flash等) がユーザーの指示を解析・タスク分解し、複数のAIに並行・順次処理させるオーケストレーションシステムです。

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
