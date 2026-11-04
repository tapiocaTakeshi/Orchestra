# Orchestra: 永続的なアプリ制作フロー

## 基本構成

Orchestra の Division Project による**アプリ・ソフトウェア制作**は、次の依存順序で実行します。

1. **Researcher / Searcher** — ワークスペース直下の `paper.md` に研究・技術選定・根拠を記録する。
2. **Writer** — `paper.md` に基づいて `specification.md` に機能要件、非機能要件、画面仕様、データ構造、API、受け入れ基準を記述する。
3. **Designer** — `specification.md` に基づいて `design/` 内の HTML デザインを更新する。
4. **Coder** — `specification.md` と `design/` を参照して既存コードを差分実装する。
5. **Reviewer** — 実装結果を検証する。必要なら Leader の次のラウンドへフィードバックする。

Leader は全体を計画・監督します。Planner、Ideaman、File-searcher、Image は後方互換のため現状の設定・API には残します。将来的には、それらの能力を Leader / Writer / Designer の内部ツールとして利用できる設計が望まれます。ロール削除はこの変更に含みません。

## ワークスペース

```text
my-app/
├── paper.md                # 永続的な研究成果
├── specification.md        # 永続的な製品仕様
├── design/                 # 永続的なデザイン（1画面=1HTMLなど）
│   ├── index.html          # デザインシステム・画面一覧
│   ├── login.html
│   └── dashboard.html
├── src/                    # 実装（例）
└── .division/              # ロール設定・承認状態・旧形式のレポート
```

## 永続性のルール

- 新規プロジェクトの場合のみ `paper.md` / `specification.md` / `design/` を初期化します。
- 既存の `paper.md` と `specification.md` は空にしたり一括再生成しません。各ロールは既存内容を確認し、追加・訂正箇所を出力します。更新はタイムスタンプ付きの追記で保存され、古い内容も残ります。矛盾時は末尾の更新を優先します。
- `design/` はフォルダを削除しません。Designer が今回出力したページだけを更新し、出力しなかったページは維持します。
- 後続のロールはその都度、ディスクの最新版を読み込みます。チャット履歴だけを根拠にはしません。
- レビューのやり直しや次のセッションでも既存成果物を継続使用します。
- 既存の `.division/design/` と `.division/DESIGN.html` は読み取り側で引き続き認識します。
- アプリ制作以外の一般的な文章タスクでは、従来の `.division/*.md` の保存先を維持します。

## 実行方法と制約

新規アプリ開発の意図があるとき、Leader が4段階のいずれかを省いても Orchestra の実行側が必要な段階を補完し、依存関係を設定します。一般的な修正・質問に一律で4段階を強制しません。

この変更は**ローカル Division orchestration**のファイル永続化と、Division API の Leader タスク計画指示が対象です。クラウド Sandbox では結果を PR / 差分で反映する方式であり、承認後にワークスペースへ確実に保存できたことを確認する必要があります。サーバーに PC のローカルファイルへの直接アクセスはありません。

`paper.md`、`specification.md`、`design/` は Git に含めることを推奨します。編集の履歴管理とロール間の競合解決を Git 差分で行えます。
