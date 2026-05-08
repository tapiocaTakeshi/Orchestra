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

**Orchestra** は、[Division API](https://api.division.he-ro.jp) を搭載したAIエージェント統合型IDEです。
1つのプロンプトを送信するだけで、Orchestraのマルチエージェント・オーケストレーションが「検索」「プロンプト設計」「コーディング」「レビュー」といった各タスクに最適なAIモデル（Claude, GPT-4, Gemini, Perplexity等）を自動で割り当て、最高品質のコードを生成します。

## ✨ 主な機能 (Features)

- 🧠 **Division API 統合** — **6プロバイダー・145+モデル**をシームレスに利用可能。
  - 🟢 **ChatGPT** (OpenAI) — GPT-4o、GPT-4 Turboなど最先端のLLM
  - 🟣 **Claude** (Anthropic) — 高精度で安全なAIモデル
  - 🔵 **Gemini** (Google) — マルチモーダル対応の高性能モデル
  - 🟠 **Perplexity** — リアルタイム検索機能を備えたAI
  - ⚫ **xAI** — 高速で効率的なモデル
  - 🔴 **DeepSeek** — 深い理解を得るための推論モデル

- 🎭 **役割ベースのマルチエージェント** — 適材適所のAIアサインを実現。
  - `💻 Coder` — コード生成・実装・デバッグ（Claude 3.5 Sonnet等）
  - `🔍 Searcher` — ウェブ検索・情報収集（Perplexity Sonar Pro等）
  - `🔎 Reviewer` — コードレビュー・品質確認（GPT-4等）
  - `📋 Planner` — タスク計画・設計・戦略立案（Gemini等）
  - `✍️ Writer` — 文章作成・ドキュメント生成（OpenAI等）
  - `🧑‍🎨 Designer` — UI/UXデザイン・HTML生成（Gemini等）

- ⚡ **自律型エージェントモード** — AIエージェントがファイル編集、ターミナルコマンド実行、プロジェクト管理からコードの実行まで自律的に行います。
- 💬 **インライン・コンテキスト追加** — チャットの文章中に `@` を入力するだけで、特定のファイルやフォルダ、シンボルを文脈（コンテキスト）として簡単にプロンプトへ追加できます。
- 🔄 **VS Code完全互換** — 拡張機能、デバッグ、Git連携など、使い慣れたVS Codeの機能をそのまま利用可能です。

## 🚀 Division API について

Orchestraの頭脳である **Division API** (`https://api.division.he-ro.jp`) は、Leader AI (Gemini 2.5 Flash等) がユーザーの指示を解析・タスク分解し、複数のAIに並行・順次処理させるオーケストレーションシステムです。

### 対応AIプロバイダー・モデル（145+）

| プロバイダー      | 主要モデル                                                        |
| ----------------- | ----------------------------------------------------------------- |
| 🟢 **ChatGPT**    | GPT-4.1, GPT-4.1 Mini/Nano, GPT-4o, o3/Mini, GPT Image 1         |
| 🟣 **Claude**     | Claude Opus 4, Sonnet 4.5, Haiku 4.5                              |
| 🔵 **Gemini**     | Gemini 2.5 Pro/Flash, Gemini 2.0 Flash                            |
| 🟠 **Perplexity** | Sonar Deep Research, Sonar Reasoning Pro, Sonar Pro                |
| ⚫ **xAI**        | Grok 4, Grok 3/Mini                                               |
| 🔴 **DeepSeek**   | DeepSeek Chat (V3), DeepSeek Reasoner (R1)                        |

### ロール別 AI フロー

#### 🧑‍💻 Coder - コード生成・実装
**最適モデル**: Claude 3.5 Sonnet (精度重視)  
**用途**: 関数実装、バグ修正、テスト作成、コード最適化

**フロー**:
1. **コンテキスト解析** — エディタのコードを分析
2. **モデル選択** — コード生成に最高精度のClaude Sonnet を選択
3. **コード生成** — 高品質なコードを提案
4. **統合** — 1クリックで提案コードをエディタに挿入

#### 🔍 Searcher - 情報検索・リサーチ
**最適モデル**: Perplexity Sonar Pro (リアルタイム検索)  
**用途**: 情報検索、市場調査、トレンド分析、技術情報収集

**フロー**:
1. **クエリ理解** — ユーザーの検索意図を把握
2. **リアルタイム検索** — 最新情報をウェブから取得
3. **信頼性確認** — ソース付きで信頼できる情報のみ
4. **結果提示** — 構造化された結果を提示

#### 🔎 Reviewer - コードレビュー・品質確認
**最適モデル**: GPT-4 (複雑な分析能力)  
**用途**: コードレビュー、セキュリティチェック、パフォーマンス最適化

**フロー**:
1. **コード読込** — 対象コードを詳細に分析
2. **詳細分析** — バグリスク、セキュリティ脆弱性を発見
3. **改善提案** — コード例付きで改善案を提示
4. **レポート生成** — 詳細なレビューレポート作成

#### 📋 Planner - タスク計画・設計
**最適モデル**: Claude Opus (複雑な推論)  
**用途**: プロジェクト計画、アーキテクチャ設計、スプリント計画、ドキュメント作成

**フロー**:
1. **要件解析** — プロジェクトの要件を理解
2. **タスク計画** — 実行可能な計画を作成
3. **リソース配分** — マイルストーンとスケジュールを定義
4. **ドキュメント生成** — README、設計書、マニュアルを自動生成

### ロール自動選択の仕組み

```
ユーザーのアクション
   ↓
「何をしようとしているか」をAIが検出
   ↓
タスク特性に応じて最適なロール（Coder, Searcher, Reviewer, Planner）を選択
   ↓
そのロールで最高性能のAIモデルを割り当て（Claude Sonnet, Perplexity Pro, GPT-4等）
   ↓
実行 → 結果をユーザーに提供
```

### 複数プロバイダー利用の利点

✓ **最適なモデルの自動選択** — タスク毎に最適なAIモデルが自動で選ばれます  
✓ **コスト最適化** — タスクに応じて最もコスト効率の良いモデルを選択  
✓ **ベンダーロックイン回避** — 複数プロバイダーを利用できるため依存性なし  
✓ **統一されたAPIインターフェース** — プロバイダー切り替えコードをゼロに  

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
