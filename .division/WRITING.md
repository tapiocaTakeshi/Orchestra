# SidebarChat デザイン仕様書

対象: `src/vs/workbench/contrib/void/browser/react/src/sidebar-tsx/SidebarChat.tsx`

目的: `SidebarChat` 周辺 UI の見た目・文言・状態表現を統一し、実装後の認識ズレを防ぐ。

---

## 1. デザイン方針

### 1.1 全体コンセプト
`SidebarChat` は単なる入力欄ではなく、以下 3 つを同時に扱う UI とする。

- **会話**: user / assistant のやり取り
- **作業進行**: reasoning, tool, flow, checkpoint の進捗可視化
- **編集承認**: apply / reject / file changes の確認導線

そのためデザインは以下を満たす。

- **可読性優先**  
  派手さよりも、長時間見ても疲れにくいコントラストと密度にする。
- **状態の可視化**  
  「実行中 / 承認待ち / 完了 / エラー / 却下」が一目でわかること。
- **カード化された情報整理**  
  assistant 出力、tool 結果、review、変更一覧をカード単位で分離する。
- **VS Code サイドバー文脈との整合**  
  `void-*` / `vscode-*` トークンをベースにし、独自色は最小限にする。

---

## 2. 画面構成のデザインルール

---

## 3. レイアウト仕様

### 3.1 画面の縦構造
Sidebar 全体は 3 層構成。

1. **Header**
   - ログイン状態 / アカウントメニュー / 設定ボタン
2. **Content**
   - ランディング時: 入力欄 + 過去スレッド or おすすめ質問
   - スレッド時: メッセージ一覧
3. **Input Area**
   - CommandBar
   - Selected files
   - Textarea
   - モデル/モード選択
   - 送信/停止

### 3.2 パディング・余白基準
基本は 4px グリッドで統一。

- 外側余白:
  - Header: `px-4 pt-2 pb-1`
  - Thread content: `px-4 py-4`
  - Input wrapper: `px-2 pb-2`
- カード内余白:
  - 小カード: `8px`
  - 標準カード: `12px`
  - 強調カード: `12px 14px`
- 要素間:
  - 密な行間: `gap-1` / `4px`
  - 標準: `gap-2` / `8px`
  - セクション間: `gap-4` / `16px`

---

## 4. カラートークン仕様

既存トークンを優先利用し、新規色は意味付きで限定使用する。

### 4.1 ベーストークン
- `var(--void-bg-1)`  
  メイン面、入力欄、基本カード面
- `var(--void-bg-2)`  
  assistantカード、ツールカードヘッダ面、セカンダリ面
- `var(--void-bg-3)`  
  補助パネル、展開コンテンツ、コード背景、command bar

- `var(--void-fg-1)`  
  主本文字
- `var(--void-fg-2)`  
  見出し・強めの補助本文字
- `var(--void-fg-3)`  
  サブ文字、メタ情報
- `var(--void-fg-4)`  
  最も弱い補助文字、状態注記

- `var(--void-border-1)`  
  主境界線
- `var(--void-border-2)`  
  弱い境界線
- `var(--void-border-3)`  
  入力欄などの外周初期枠

- `var(--vscode-focusBorder)`  
  アクティブ状態、assistantアクセント、review強調、進行中強調
- `var(--void-warning)`  
  エラー・警告

### 4.2 意味色
以下は意味が明確な箇所に限定。

- **Success / Approved**
  - `green-500 / green-400`
- **Error / Rejected**
  - `red-500 / red-400`
- **Running / Attention**
  - `orange` 系または `focusBorder`
- **Drop target**
  - `blue-400`, `bg-blue-500/10`

### 4.3 使用ルール
- カード面は **bg + border + 左アクセント線** で識別する。
- 強調は原則 **色面ベタ塗りではなく淡い tint** で表現する。
- user バブルは assistant よりやや軽く、assistant は情報主体として少し強めに見せる。
- エラーは本文全体を赤くしすぎず、**アイコン + border + 補助領域** で示す。

---

## 5. タイポグラフィ仕様

### 5.1 基本
- 本文: `13px`
- 補助本文 / tool body: `12px`
- メタ情報 / バッジ / 状態: `10px ~ 11px`
- ラベル見出し: `11px ~ 12px`

### 5.2 重み
- セクションタイトル: `font-medium` or `font-semibold`
- モデル名・状態名: `font-medium`
- 長文本文: 通常ウェイト

### 5.3 行間
- 長文 markdown: `leading-normal`
- compact prose / reasoning / tool result: `leading-snug`

---

## 6. 角丸・境界線・影

### 6.1 角丸
- 入力欄外枠: `rounded-md`
- assistant / tool / flow review card: `6px ~ 8px`
- user bubble: `12px`
- 小バッジ / token: `3px ~ 6px`
- FAB / 丸ボタン: `full`

### 6.2 影
- 通常カード: `0 1px 3px rgba(0,0,0,0.04 ~ 0.08)`
- assistant card: `0 1px 4px rgba(0,0,0,0.06)`
- hover/floating button: `shadow-md` → `shadow-lg`

### 6.3 境界線
- 標準: `1px solid var(--void-border-1)`
- 強調カード: 左に `2px` または `3px` のアクセント線
- 展開部は背景色差 + 上境界線で分離

---

## 7. コンポーネント別デザイン仕様

### 7.1 SidebarHeader
#### 構造
- 右寄せ
- 要素: ログイン or アバター、設定

#### スタイル
- 高さは詰めすぎず、クリック領域 20px 以上
- 設定アイコン:
  - 通常: `text-void-fg-3`
  - hover: `text-void-fg-1`

#### アカウントメニュー
- 背景: `bg-void-bg-1`
- border: `border-void-border-2`
- radius: `rounded-md`
- shadow: `shadow-lg`
- メニュー項目 hover: `bg-void-bg-3`

---

### 7.2 ランディング画面
#### 表示内容
- 入力欄を上部中央寄り
- 下部に
  - 過去チャット
  - またはおすすめ質問

#### おすすめ質問チップ
- 背景は極薄
- hover で少し濃く
- `text-sm`
- クリック可能性を明示するため opacity を hover で上げる

---

### 7.3 入力エリア `VoidChatArea`
#### 役割
最重要 UI。以下を一体化する。
- 添付ファイル表示
- テキスト入力
- モデル関連設定
- 送信/停止
- DnD

#### 見た目
- 背景: `bg-void-bg-1`
- border: `border-void-border-3`
- focus/hover: `border-void-border-1`
- radius: `rounded-md`
- 内側 padding: `p-2`
- 最大高: `80vh`

#### Drag & Drop 状態
- 通常からの変化:
  - border: `blue-400`
  - background: `blue-500/10`
- overlay:
  - `absolute inset-0`
  - `border-2 border-dashed`
  - 中央に `Paperclip + "ここにファイルをドロップ"`

#### 下段操作バー
現状 `bg-black/80` になっているが、採用方針は以下。
- 背景はテーマ非依存の真っ黒ではなく、**トークンベースに寄せる**
- 推奨:
  - `bg-void-bg-2`
  - `border border-void-border-1`
  - または `bg-[color-mix(...)]`
- 理由:
  - ダーク/ライト両対応
  - 浮きすぎ防止
  - assistant/tool card と一貫性を持たせる

#### 添付ボタン
- アイコン: `Paperclip`
- 通常: `text-void-fg-3`
- hover:
  - `text-void-fg-1`
  - `bg-void-bg-2`

---

### 7.4 送信/停止ボタン
#### Submit
- 形: 白の円形
- アイコン: 上向き矢印
- disabled:
  - `bg-vscode-disabled-fg`
  - `cursor-default`
- enabled:
  - `bg-white`
  - `cursor-pointer`

#### Stop
- 形: 白の円形
- アイコン: 四角
- 実行中のみ表示

#### 改善ルール
- クリック領域は最低 `28x28` を推奨
- 白背景は維持しつつ、hover 時に少し暗くする
- キーボードフォーカスリング対応推奨

---

### 7.5 SelectedFiles
#### 目的
選択済みファイル、コード範囲、フォルダ、画像を token 化して表示する。

#### token 仕様
- 高さ: compact
- border: `border-void-border-1`
- 背景: `bg-void-bg-1`
- 文字: `text-xs`
- radius: `rounded-sm`
- prospective:
  - `border-void-border-2`
  - `text-void-fg-3`
  - `opacity-80`

#### hover / click
- hover で `brightness-95`
- staging 選択は click で:
  - prospective の確定
  - file/code selection の open

#### 画像添付
- サムネイル: `24x24`
- `object-cover`
- ファイル名は `max-w-[80px] truncate`

#### 削除ボタン
- token 右端に小さく表示
- click で remove
- 本体 click と競合しないよう stopPropagation

---

### 7.6 UserMessageComponent
#### display モード
- 右寄せ
- 最大幅は広めだが本文に合わせて縮む
- 背景:
  - `void-bg-1` ベースの薄いグラデーション
- border:
  - `void-border-1` と `focusBorder` をミックス
- radius: `12px`
- shadow: 薄く

#### edit モード
- 入力欄全幅化
- 元の message selections を引き継ぐ
- Escape で閉じる
- Enter 送信

#### 編集アイコン
- hover/focus 時のみ表示
- 背景: `bg-void-bg-1`
- border: `border-void-border-1`
- radius: `rounded-md`

---

### 7.7 AssistantMessageComponent
#### 基本方針
assistant は「返答本文」と「その前後の思考/構造情報」をまとめる中核カード。

#### カード仕様
- 背景:
  - `void-bg-2` ベースの薄いグラデーション
- border:
  - `1px solid var(--void-border-1)`
- 左アクセント:
  - `3px solid var(--vscode-focusBorder)`
- radius: `8px`
- padding: `12px 14px`

#### モデルラベル
- 上部ヘッダに小さく表示
- ドット + モデル名
- 11px、fg-3

#### 本文
- markdown は `ProseWrapper`
- 行間をやや広くし、説明文の読みやすさを優先

---

### 7.8 Reasoning 表示
#### 方針
思考は「本文より一段下の情報」として折りたたみ可能にする。

#### 表示仕様
- タイトル:
  - 実行中: `思考中`
  - 完了後:
    - `X.X 秒間思考しました`
    - 取得不可時は `思考`
- 実行中は初期オープン
- 完了後は自動クローズ

#### 見た目
- ToolHeaderWrapper 構造を流用
- body は `SmallProseWrapper`
- 本文よりコントラストを少し落とす

---

### 7.9 ToolHeaderWrapper
#### 役割
すべての tool 表示の共通カード。

#### 標準仕様
- 背景: `var(--void-bg-2)`
- border: `1px solid var(--void-border-1)`
- 左アクセント:
  - 通常: `var(--vscode-focusBorder)`
  - error: `var(--void-warning)`
  - rejected: `var(--void-fg-4)`
- radius: `6px`

#### ヘッダ
- 高さ: 最低 `28px`
- 左:
  - 開閉矢印
  - タイトル
  - desc1
- 右:
  - info
  - error/rejected icon
  - desc2
  - 件数 badge

#### 状態表現
- `isRejected`
  - `line-through opacity-50`
- `isError`
  - warning icon
- 展開部
  - `transition-all duration-200`

---

### 7.10 Tool body
#### 共通
- 背景は `bg-void-bg-3` を基本
- コード/結果は本文と視覚階層を分ける
- コピー、適用、移動系ボタンは右上のメタ行に集約

#### 一覧結果
- `ListableToolItem`
- hover で明るく
- クリック可能な行はポインタ化

#### エラー下部
- `BottomChildren`
- 左 warning border
- 初期は閉じる
- 文言:
  - `Error` は日本語統一で `エラー` 推奨

---

### 7.11 FlowIndicator
#### 目的
エージェント進行を一行で示す。

#### 表示ルール
- `isRunning` 時のみ表示
- `thinking → searching → reading → coding → running`
- 非 Division では左に単一モデルラベル

#### 見た目
- 横並び compact
- phase:
  - active: fg-1, semibold
  - done: opacity 0.5
  - idle: 非表示
- 矢印区切り: `→`
- モデル名は 9px

#### 文言
- `思考中`
- `検索中`
- `読み込み`
- `実装中`
- `実行中`

---

### 7.12 DivisionOrchestrationComponent
#### 方針
JSON 由来の orchestration 結果を「システムフローの監査カード」として可視化。

#### セクション
1. Task Generation Flow
2. Task Execution Flow n

#### カード仕様
- 背景: `bg-void-bg-1`
- border: `border-void-border-1`
- radius: `8px`
- padding: `12px`
- shadow: 薄く

#### 左アクセント
Task execution card のみ左に 3px アクセント

#### 文言変更方針
英語見出しはできれば日本語化する。
- `Task Generation Flow` → `タスク生成フロー`
- `Task Execution Flow` → `タスク実行フロー`
- `Hide/Show Context Input` → `コンテキスト入力を表示/非表示`
- `No output` → `出力はありません`

---

### 7.13 FlowReviewComponent
#### 役割
文書ベースの中間レビュー UI。承認/差し戻しが主導線。

#### コンテナ状態
- pending:
  - `focusBorder` 系
- approved:
  - 緑系 tint
- rejected:
  - 赤系 tint + opacity 少し低下

#### 構成
1. ヘッダ
2. 進行ステッパー
3. ドキュメントプレビュー
4. タスク進捗バー
5. アクションボタン

#### ステッパー
- 各 phase は丸アイコン + 短いラベル
- current:
  - scale 少し拡大
  - focusBorder
- completed:
  - 緑チェック
- upcoming:
  - 弱い色

#### アクション
- Primary: 承認して次へ進む
  - 緑塗り
  - 白文字
- Secondary: やり直す
  - 薄いボーダー

#### 文言
- `ドキュメントレビュー`
- `レビュー待ち`
- `承認済み`
- `却下`
- `承認して次へ進む`
- `やり直す`

---

### 7.14 CommandBarInChat
#### 役割
このスレッドで発生したファイル変更の集約パネル。

#### 上部パネル
- 背景: `bg-void-bg-3`
- border:
  - `border-t border-l border-r border-zinc-300/10`
- rounded top

#### 表示内容
- 左:
  - 変更ファイル数
  - 開閉ボタン
- 右:
  - Reject all / Accept all
  - thread status indicator

#### ステータス色
- 承認待ち: yellow
- 実行中: orange
- 完了: dark

#### ファイル詳細
- 各行:
  - ファイル名
  - diff 数
  - 個別承認/拒否
  - file status indicator

#### 文言変更
- `変更されたファイルはありません`
- `n件の変更されたファイル`
- tooltip:
  - `すべて拒否`
  - `すべて承認`
  - `ファイルを拒否`
  - `ファイルを承認`

---

## 8. 状態仕様

### 8.1 入力欄
- default
- hover
- focus-within
- disabled
- drag-over
- streaming

### 8.2 メッセージ
- committed
- streaming
- checkpoint ghost
- editing

### 8.3 tool
- tool_request
- running_now
- success
- rejected
- tool_error
- invalid_params

### 8.4 review
- pending
- approved
- rejected

### 8.5 thread
- idle
- LLM running
- tool running
- awaiting_user

---

## 9. アニメーション仕様

### 9.1 基本方針
- 速く、短く、主張しすぎない
- 100ms〜200ms を基本
- streaming/loading は 300ms 周期程度

### 9.2 個別
#### Hover / border
- `transition-all duration-150 ~ 200`

#### Accordion 開閉
- `transition-all duration-200 ease-in-out`

#### Chevron 回転
- `duration-100`
- cubic-bezier は現状踏襲可

#### Loading dots
- `300ms` 周期
- ただし今後は text 切替より CSS アニメ化が望ましい

#### Scroll to bottom button
- ふわっと出る:
  - `opacity`
  - `shadow`
  - `duration-200`

---

## 10. 文言変更ルール

現コードは日本語と英語が混在しているため、**ユーザー向け文言は原則日本語統一** とする。

### 10.1 日本語化対象
以下は変更推奨。

| 現在 | 変更案 |
|---|---|
| Send | 送信 |
| Scroll to bottom | 一番下へスクロール |
| Attach image | 画像を添付 |
| Error | エラー |
| Approve | 承認 |
| Cancel | キャンセル |
| Copy | コピー |
| Open settings | 設定を開く |
| Current File | 現在のファイル |
| Checkpoint | チェックポイント |
| Disabled when running | 実行中は無効です |
| because another thread is running | 他のスレッド実行中のため無効です |
| Generating | 生成中 |
| Results truncated | 結果は省略されています |
| No lint errors found. | lint エラーはありません |
| No output | 出力はありません |

### 10.2 用語統一
- `チャット`
- `ギャザー`
- `エージェント`
- `思考中`
- `承認待ち`
- `実行中`
- `完了`
- `却下`
- `エラー`

### 10.3 トーン
- 説明的で簡潔
- 機械翻訳調を避ける
- ボタンは動詞で統一
  - `承認`
  - `拒否`
  - `設定を開く`
  - `ログイン`

---

## 11. 実装変更ポイント一覧

### 11.1 すぐ反映すべき見た目調整
1. `VoidChatArea` 下段バーの `bg-black/80` をトークンベースへ変更
2. 英語文言の日本語統一
3. `Error` / `Lint errors` / `Task Generation Flow` 等の見出し統一
4. Submit/Stop ボタンの hover/focus 強化
5. Tool card の右上メタ情報サイズ統一

### 11.2 実装後に確認すること
- ダーク/ライトテーマでコントラスト破綻がないか
- 長いファイル名、コマンド、パスの省略表示
- streaming 中の高さ揺れ
- FlowReview の pending/approved/rejected の視認性
- assistant card と tool card の区別が十分か

---

## 12. QA チェックリスト

### 12.1 視覚
- [ ] user / assistant / tool / review が見分けられる
- [ ] 実行中 / 完了 / エラー / 却下が即判別できる
- [ ] 長文 markdown が詰まりすぎていない
- [ ] command bar が入力欄より強くなりすぎていない

### 12.2 文言
- [ ] 英語 UI が残っていない
- [ ] tooltip 文言が日本語で統一されている
- [ ] ボタンラベルが命令形で統一されている

### 12.3 操作感
- [ ] hover が効く場所と効かない場所が明確
- [ ] 展開 UI のアニメーションが自然
- [ ] スクロール最下部ボタンが邪魔すぎない
- [ ] 添付・削除・編集アイコンのクリック領域が十分

---

## 13. 参考実装ポリシー

### 13.1 優先順位
1. 情報設計の明確化
2. 状態の視認性
3. テーマ整合
4. 細かな装飾

### 13.2 禁止寄りルール
- 純黒背景の常用
- 意味のないグラデーション多用
- 重要状態を opacity のみで表現
- 英日混在ラベルの放置

---

## 14. 推奨デザイントークン早見表

```ts
const designSpec = {
  surfaces: {
    primary: 'var(--void-bg-1)',
    secondary: 'var(--void-bg-2)',
    tertiary: 'var(--void-bg-3)',
  },
  text: {
    primary: 'var(--void-fg-1)',
    secondary: 'var(--void-fg-2)',
    muted: 'var(--void-fg-3)',
    subtle: 'var(--void-fg-4)',
  },
  border: {
    strong: 'var(--void-border-1)',
    default: 'var(--void-border-2)',
    outer: 'var(--void-border-3)',
  },
  semantic: {
    accent: 'var(--vscode-focusBorder)',
    warning: 'var(--void-warning)',
    success: 'rgb(34 197 94)', // green-500
    error: 'rgb(239 68 68)',   // red-500
    infoDrop: 'rgb(96 165 250)', // blue-400
  },
  radius: {
    sm: '4px',
    md: '6px',
    lg: '8px',
    xl: '12px',
    full: '9999px',
  },
  motion: {
    fast: '100ms',
    normal: '200ms',
    loading: '300ms',
  }
}
```

---

## 15. 最終要約

この `SidebarChat` で採用するデザインは、以下を核とする。

- **入力欄は作業ハブとして落ち着いたカード表現**
- **assistant/tool/review をカードとアクセント線で明確に分離**
- **状態は色・アイコン・文言の 3 点で伝える**
- **文言は日本語に統一**
- **黒ベタではなくテーマトークン中心**
- **アニメーションは短く控えめ**

必要であれば次に、
1. **実装用の差分ガイド**
2. **文言置換一覧（grep しやすい形式）**
3. **Tailwind/className 単位の修正案**
まで落とし込めます。