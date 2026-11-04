# <img src="media/icon.png" alt="" width="40" height="40" align="center"> Orchestra Design

Division の **Designer ロール**が生成したデザイン HTML を、その場で編集する Design モードです。
デザインは **`.division/design/` フォルダの複数の HTML ファイル (1 画面 = 1 ファイル)** で、
新しい形式のデザインデータは作らず、これらの HTML を唯一の保存元として直接書き換えます。

```
Division API — Designer ロール ──生成──▶ .division/design/index.html   (デザインシステム + 画面一覧)
                                         .division/design/login.html   ◀──編集── Orchestra Design
                                         .division/design/dashboard.html   (ページ切替 / キャンバス / Properties / AI / Code)
                                              │
                                              └──保存──▶ Coder ロールが全ページを参照して実アプリへ反映
```

Designer は画面ごとに ```` ```html login.html ```` のようにファイル名付きのコードブロックで出力し、
Orchestra がそれぞれを `.division/design/<name>.html` に保存します (出力しなかったページは残ります)。
以前の単一ファイル `.division/DESIGN.html` も引き続き開けます。

`.division/DESIGN.md` は Designer 用のガイドで、編集対象ではありません (AI 編集時に文脈として渡します)。

## 使い方

- `.division/design/*.html` を開くと自動で Design モードになります (Custom Text Editor)。
  コマンド **Orchestra Design: Open Design in Design Mode** でページを選んで開けます。
- **ページ切替**: 上部のドロップダウンで同じフォルダの別の画面に切り替えます。**＋** で新しいページを作ります
  (今のページの `<head>` = トークンと `<style>` を引き継ぎ、本文は空)。
- **Design** タブ: クリックで要素を選択 → 右の Properties で色・文字・サイズ・余白・角丸などを変更。
  ダブルクリックで文字を直接編集 (Enter で確定、Esc で取り消し)。
- **Layers**: body 以下の要素ツリー。クリックで選択、ホバーでキャンバス上を強調。
- **Code** タブ: このページの HTML を通常のテキストエディタで横に開きます。どちらで編集しても同期します。
- **Preview** タブ: 選択なしで、リンクやスクリプトが動くプレビュー。
- **PC / Tablet / Mobile**: プレビュー幅を切り替えます (768px / 390px)。
- **Undo / Redo / 保存**: 通常のテキスト編集と同じ履歴を使います (Ctrl+Z / Ctrl+Shift+Z / Ctrl+S)。
- **AI Designer**: 指示を書いて「依頼」(Ctrl+Enter)。要素を選択していればその要素だけ、未選択ならページ全体を
  Designer ロールに修正させます (他のページ名もリンクの参考として渡します)。返ってきた案は「変更前 / 変更後」と
  キャンバスのプレビューで確認し、「適用」したときだけそのページの HTML に書き込みます。
  チャットは Division の `designer` ロールとして動き、システムプロンプトは Division に登録された
  designer ロールのもの (Role.systemPrompt) を使います。拡張側からは「要素単位で置き換える・返答形式」
  といったこの画面固有の指示だけを足します (`/api/generate` の `role: "designer"`)。

## 設計上のルール

- **HTML だけが保存元**。JSON などの別形式のデザインデータは持ちません。
- **差分適用**。キャンバスでの変更は該当要素の `style` 属性・文字・属性だけを書き換える最小のテキスト差分です。
  既存の `<style>`、スクリプト、インデント、コメントはそのまま残ります。
  (`src/htmlPatchService.ts`。選択用の `data-od-id` はプレビューにだけ注入し、ファイルには書きません)
- **AI には現在の HTML と選択要素を渡す**。選択要素の outerHTML・`<style>` と読み込んでいる CSS ファイル・DESIGN.md だけを送り、
  選択要素 1 つ分の置き換えを返させます。ファイル全体を再生成させません。
- **プレビューは隔離**。Webview 内の `sandbox="allow-scripts"` iframe (opaque origin) で描画します。
  DESIGN.html のスクリプトは VS Code API・拡張機能・ファイルに触れられません。
  信頼されていないワークスペース、または `orchestraDesign.preview.runScripts: false` ではスクリプトを実行しません。
- **別ファイルの CSS も表示**。`<link rel="stylesheet" href="style.css">` のようにワークスペース内の CSS を読み込んでいる場合、
  プレビューではその内容を `<style>` として埋め込みます (`@import` は展開、CSS 内の `url()` の画像・フォントは data: URI に変換)。
  CSS ファイルを編集すると (保存前でも) プレビューが更新されます。ファイルには何も書き込みません (`src/previewAssets.ts`)。
  ワークスペースの外を指すパスや `https://` の CSS はそのままです。
- **画像の相対パスも表示**。`<img src="img/logo.png">`・`srcset`・`<source>`・`<video poster>`・`<input type="image">`・
  SVG の `<image href>`、`style` 属性と `<style>` の中の `url()` も、プレビューでは data: URI に変換して表示します (1 ファイル 2MB まで)。
  画像ファイルを差し替えるとプレビューが更新されます。Properties で `src` を相対パスに変えたときも読み直します。
- **クラウドとローカルの区別**。この拡張機能が編集するのは、ローカルのワークスペースにあるデザイン HTML だけです。
  クラウドエージェントがサンドボックスで生成したページは、先にワークスペースへ取り込んでから開きます
  (サンドボックス上のファイルを直接書き換えることはしません)。

## AI Designer の接続

IDE で Division にログインしていれば追加設定は不要です。IDE 本体のコマンド
`orchestra.design.getDesignerConnection` から、Division API のエンドポイント・認証情報・
**design ロールに割り当てられたモデル**を受け取り、`POST /api/generate` を呼びます。

| 設定 | 既定 | 説明 |
| --- | --- | --- |
| `orchestraDesign.designerModel` | (空) | 空なら Division 設定の design ロールのモデル |
| `orchestraDesign.divisionEndpoint` | (空) | 空なら IDE の Division API エンドポイント |
| `orchestraDesign.preview.runScripts` | `true` | プレビューで DESIGN.html のスクリプトを実行する |
| `orchestraDesign.notifyOnCreate` | `true` | Designer がページを作成したら Design モードで開くよう通知 (まとめて 1 回) |

IDE 外で使う場合は **Orchestra Design: Set Division API Key for AI Designer** でキーを保存できます (SecretStorage)。

## 開発

```sh
cd extensions/orchestra-design
npm run compile   # src/ → out/
npm test          # htmlPatchService の単体テスト
```

本体のビルド (`npm run compile`) では `build/gulpfile.extensions.js` の compilations に含まれています。

## 今後 (開発計画)

1. ~~HTML プレビュー~~ — デザイン HTML を自動検出して Design タブで表示 (複数ページ・ページ切替)
2. ~~ビジュアル編集~~ — 要素選択・Layers・Properties・差分保存・Undo/Redo
3. ~~Designer AI 連携~~ — 選択要素の修正を依頼し、差分を確認して適用
4. ~~Coder ロール連携~~ — Coder は `.division/design/` の全ページを指示に受け取って実アプリ (React など) へ反映する。
   デザイン HTML の変更と本番アプリの変更は別物として扱い、反映は Coder の責任とする
5. 複数案比較 — Designer に複数案を作らせて並べて比較
