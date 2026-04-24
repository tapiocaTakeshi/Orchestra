# SidebarChat デザイン仕様書 改訂版
対象: `src/vs/workbench/contrib/void/browser/react/src/sidebar-tsx/SidebarChat.tsx`

---

## 0. この改訂版の目的

本書は、先行仕様書を**実装可能な形に補正**し、以下を明確に分離するための改訂版です。

- **採用したUIコンセプト**
- **必須仕様**
- **任意提案（optional）**
- **未確定事項 / 要確認事項**
- **文言方針の適用範囲**

特に、前版で混在していた
- コンセプト案
- 実装必須事項
- 日本語化提案
- 将来改善案

を切り分け、後続の `designer` / `planner` / `coder` が迷わず利用できる状態にすることを目的とします。

---

# 1. 採用コンセプト

## 1.1 採用方針
本UIは、先行案のうち以下を採用します。

- **ベースコンセプト:** 案2 `Gallery “カードキュレーション” 美学`
- **部分採用:** 案1 `Operational “ステータスHUD” 美学` の一部

## 1.2 採用理由
`SidebarChat` は文章表示だけでなく、以下を同時に扱います。

- 会話本文
- 推論や進行状況
- ツール実行結果
- 承認 / 却下
- ファイル変更の確認

そのため、全体は**読みやすく整理されたカード中心UI**にしつつ、進行中の状態だけは**HUD的に即読可能**にするのが最も適しています。

## 1.3 この採用方針が意味すること
### 全体として採用する性格
- 本文は読みやすい
- カード単位で整理される
- 余白と階層で高級感を出す
- アニメーションは控えめ
- 状態表示だけ少し強めに見せる

### 採用しない方向
以下は本改修の主軸にはしません。

- 強いガラス演出を全体にかける
- 立体感や押下感を主役にする
- 音や派手な視差演出を入れる
- 全体を雑誌風タイポグラフィに振り切る

---

# 2. スコープ定義

## 2.1 本改修で扱う必須スコープ
以下は**今回のデザイン仕様に含まれる必須範囲**です。

1. `SidebarChat` の視覚構造整理
2. `user / assistant / tool / review / command bar` のカード表現統一
3. 状態表現の整理
   - running
   - done
   - pending
   - error
   - rejected
4. 余白・タイポグラフィ・境界線の統一
5. 入力エリアの見た目調整
6. 折りたたみUIの見た目と挙動統一
7. 既存トークンベースでの配色整理

## 2.2 今回は含めないもの
以下は**今回の必須実装スコープ外**です。

- 新規アニメーションライブラリの導入
- 音付きインタラクション
- パララックスやLenis系スクロール演出
- UI全面の再構築を伴う大規模なファイル分割
- IAそのものを大きく変える仕様変更
- 文言の全面再設計
- 多言語化対応の新規実装
- ライトテーマ向け全面再設計
- メッセージ仮想化などの大規模性能最適化

---

# 3. 文言方針

## 3.1 必須方針
文言については、**今回は既存文言を基本維持**します。  
理由は、今回の主目的が**デザイン改善**であり、文言全面改修はスコープを広げすぎるためです。

したがって、今回の必須方針は以下です。

- 既存文言を基本維持
- デザイン変更に伴い**新しく追加するラベル**のみ、既存UI言語に合わせる
- 既存英語文言を一括で日本語化することは**必須ではない**

## 3.2 最低限許容される文言修正
以下のような、**UI整合性のための軽微な修正**は許容します。

- 明らかな重複や不自然なラベルの調整
- 状態表示に必要な短い補助ラベル追加
- 折りたたみや状態バッジの短縮表記

## 3.3 Optional: 日本語化提案
前版で記載していた「ユーザー向け文言は原則日本語統一」は、**本仕様では任意提案**に格下げします。

### Optional とする理由
- 元のユーザー要求に明示されていない
- プロダクト全体の言語方針と整合確認が必要
- このファイル単体で決めるべき内容ではない

### Optional 提案内容
- 将来的に、ユーザー向け文言を日本語へ統一する
- ただし以下の確認が必要
  1. プロダクト全体の言語ポリシー
  2. 他画面との一貫性
  3. 翻訳キー管理方針

---

# 4. デザイン原則

## 4.1 基本原則
1. **可読性優先**
2. **状態が一目でわかる**
3. **カード単位で整理されている**
4. **装飾より整列と余白を重視**
5. **VS Code サイドバー文脈から浮きすぎない**

## 4.2 視覚的な優先順位
UIの視線誘導は以下順で設計します。

1. 入力中・実行中の主要状態
2. assistant本文
3. tool / review の見出し
4. 補助情報（model, meta, counts, info）
5. 装飾要素

## 4.3 演出ルール
- 通常状態は静か
- hover は軽く
- active / running / error のみ視認性を強める
- 遷移は 100〜200ms 中心
- 点滅の多用は禁止

---

# 5. 必須仕様と任意仕様の区分

---

## 5.1 必須仕様一覧

### A. カード構造
- `user / assistant / tool / review / command bar` をカード単位で視覚的に分離する
- 各カードは
  - 背景面
  - 境界線
  - 角丸
  - 必要に応じた左アクセント線
  で構成する

### B. 状態表現
- 状態は**色だけに依存しない**
- 少なくとも以下の2つ以上で伝える
  - 色
  - アイコン
  - テキスト
  - 形状差

### C. 余白の統一
- 4pxグリッドベース
- 要素間の spacing を整理する
- 同種コンポーネントの header/body/footer で padding を揃える

### D. タイポグラフィ整理
- サイズ段階を絞る
- 見出し / 本文 / 補助情報 の階層を明確にする
- 補助情報を薄くしすぎない

### E. 入力欄デザイン
- トークンベースの背景・枠線に統一
- 純粋な `bg-black/80` 依存を避ける
- focus / drag-over / disabled を見分けられるようにする

### F. 折りたたみUI
- 開閉可能であることが視覚的にわかる
- 開閉時の余白変化が破綻しない
- chevron / body の変化に一貫性を持たせる

---

## 5.2 任意仕様一覧

### Optional 1. 日本語化
- 既存UI文言の統一翻訳
- ツールチップや補助文言の日本語化

### Optional 2. ガラス感の追加
- 軽い半透明 / blur / 微小なハイライト
- ただしテーマとの整合確認が前提

### Optional 3. 微細アニメーションの追加強化
- ステータスバッジの軽いパルス
- hover時の光量変化
- scroll to bottom ボタンの出現演出強化

### Optional 4. コンポーネント分割の大規模整理
- `SidebarChat.tsx` の分割
- 抽象コンポーネント化
- 共通スタイルユーティリティ化

---

# 6. 未確定事項 / 要確認事項

以下はこの仕様書だけで断定しない事項です。  
実装前または実装中に確認が必要です。

## 6.1 文言言語
- UI言語は英語維持か、日本語へ寄せるか
- 本件では決め打ちしない

## 6.2 ライトテーマ対応の粒度
- ダークテーマ中心で調整するか
- ライトテーマまで厳密に詰めるか
- 本仕様ではトークン準拠のみ必須とする

## 6.3 依存ライブラリ追加
- `framer-motion`
- `lenis`
- `use-sound`
などの新規導入は**本仕様の対象外**。導入可否は別判断とする。

## 6.4 コンポーネント分割範囲
- 今回は見た目修正を優先
- 大規模分割は必須ではない

## 6.5 review/flow 系 UI の文言詳細
- `FlowReviewComponent`
- `DivisionOrchestrationComponent`
の見出しを既存のままにするか、調整するかは別確認

---

# 7. デザイントークン方針

## 7.1 使用原則
既存トークンを優先使用します。

### Surface
- `var(--void-bg-1)` : ベース面 / 入力欄 / user系の軽い面
- `var(--void-bg-2)` : assistant / tool header / 主カード面
- `var(--void-bg-3)` : 補助面 / 展開部 / コード系 / command bar系

### Text
- `var(--void-fg-1)` : 主本文
- `var(--void-fg-2)` : 見出し・やや強い補助
- `var(--void-fg-3)` : メタ情報
- `var(--void-fg-4)` : 最弱い補助  
  ※ 常用しない。コントラスト不足に注意

### Border
- `var(--void-border-1)` : 主境界
- `var(--void-border-2)` : 弱い境界
- `var(--void-border-3)` : 入力欄外周など

### Semantic
- `var(--vscode-focusBorder)` : active / running / assistant accent
- `var(--void-warning)` : warning / error 系

## 7.2 新規意味色の扱い
新規の success / error / warning を追加する場合は、**最小限**とします。

推奨:
- Success: 緑系
- Error: 赤系
- Warning: 既存 warning 系
- Pending: focusBorder または黄系弱色

ただし、**新規CSS変数追加は必須ではない**です。既存トークンで成立するなら優先します。

---

# 8. レイアウト仕様

## 8.1 全体の縦構造
1. Header
2. Message / Content area
3. Input area

この基本構造は維持します。

## 8.2 余白スケール
4pxグリッドで統一します。

- 4px: 密な要素間
- 8px: 標準の要素間
- 12px: カード内の標準padding
- 16px: セクション間
- 20px以上: 特別な強調領域のみ

## 8.3 基本padding指針
- Header: `px-4 pt-2 pb-1`
- Thread content: `px-4 py-4`
- Input wrapper: `px-2 pb-2`

## 8.4 カード内部
- compact card: `p-2`
- standard card: `p-3`
- emphasized card: `px-3.5 py-3`

---

# 9. タイポグラフィ仕様

## 9.1 サイズ段階
サイズはむやみに増やさず、原則以下に寄せます。

- 本文: `13px`
- 補助本文: `12px`
- メタ情報: `11px`
- 極小ラベル: `10px`

## 9.2 ウェイト
- 見出し: `font-medium` 〜 `font-semibold`
- 状態名: `font-medium`
- 本文: regular
- メタ情報: regular

## 9.3 可読性ルール
- 本文は `fg-1`
- 見出しは `fg-1` か `fg-2`
- メタ情報は `fg-3`
- `fg-4` は本当に弱い注釈のみ

---

# 10. コンポーネント別 必須仕様

---

## 10.1 `VoidChatArea` 入力エリア

### 必須
- 背景は `bg-void-bg-1` 系
- 枠線は `border-void-border-3` を基準にし、hover/focus で強める
- 下段操作バーは**純黒ベタ依存を避ける**
- drag-over 時は通常状態との差が明確であること

### 推奨見た目
- background: `var(--void-bg-1)`
- border: `1px solid var(--void-border-3)`
- focus: `var(--void-border-1)` または `var(--vscode-focusBorder)`
- radius: `rounded-md`
- padding: `p-2`

### Optional
- 軽い backdrop / color-mix による質感追加

---

## 10.2 `SelectedFiles`

### 必須
- token 表示の高さ・角丸・境界を揃える
- remove ボタンが誤タップしにくいこと
- 画像添付のサムネイル表示を既存より整える
- prospective 状態は通常状態と判別できること

### 視覚ルール
- 背景: `bg-void-bg-1`
- border: `border-void-border-1`
- radius: `rounded-sm` 〜 `rounded-md`
- text: `text-xs`

### Optional
- hover時の微小なハイライト
- サムネイル影の微調整

---

## 10.3 `UserMessageComponent`

### 必須
- 右寄せ構造は維持
- assistantより軽いカード表現にする
- edit affordance を見つけやすくする
- 編集時の見た目が display 時と大きく乖離しない

### 視覚ルール
- 背景: `void-bg-1` ベースの薄いトーン差
- border: `void-border-1` ベース
- radius: `12px`
- 影は薄く

---

## 10.4 `AssistantMessageComponent`

### 必須
- 本文を主役にする
- model や補助情報は弱く整理
- userカードより一段強い主カードにする
- 左アクセント線を維持可能

### 視覚ルール
- 背景: `void-bg-2`
- border: `1px solid var(--void-border-1)`
- 左アクセント: `3px solid var(--vscode-focusBorder)`
- radius: `8px`
- padding: `12px 14px`

---

## 10.5 Reasoning 表示

### 必須
- assistant本文の下位階層であることがわかる
- 折りたたみ可能であること
- running 時のみやや目立たせる
- 完了後は本文の邪魔をしない

### 視覚ルール
- `ToolHeaderWrapper` と同系列の構造を使ってよい
- body は本文より低コントラスト
- header は compact

---

## 10.6 `ToolHeaderWrapper`

### 必須
- 共通カード構造として統一する
- header は情報過密になりすぎない
- title / desc1 / status / counts の優先順位を整理
- open/close がわかる
- error / rejected / normal が判別できる

### 視覚ルール
- 背景: `var(--void-bg-2)`
- border: `1px solid var(--void-border-1)`
- 左アクセント:
  - normal: `focusBorder`
  - error: warning/error color
  - rejected: muted系
- radius: `6px`

### header構造の優先順
左:
- chevron
- title
- desc1

右:
- desc2
- info
- status icon
- count badge

### 禁止
- 右側に情報を詰め込みすぎる
- 補助情報を本文より強く見せる

---

## 10.7 Tool body

### 必須
- header と body の階層差を明確にする
- body は `bg-void-bg-3` ベースでよい
- コード / 結果 / メタ操作を分離する
- copy / apply / jump などはまとまりを持って配置する

---

## 10.8 `FlowIndicator`

### 必須
- 実行中の状態把握を助ける
- 通常時は静か
- active のみやや強く見せる
- done は薄く残すか、必要最小限に抑える

### 視覚ルール
- compactな横並び
- active: `fg-1` + medium
- done: `opacity` を下げるが消しすぎない
- idle: 極力主張しない

### Optional
- activeに軽いパルス / opacity変化

---

## 10.9 `CommandBarInChat`

### 必須
- 変更ファイルの集約パネルとして独立性を持たせる
- 入力欄より目立ちすぎない
- file list / bulk action / status の3役割を整理する
- 承認待ちかどうかがわかる

### 視覚ルール
- 背景: `bg-void-bg-3`
- border: `border-void-border-1` 系
- rounded top を維持可能
- file row は一覧性を優先

### Optional
- bulk action ボタンの hover強化
- thread status indicator の視認性改善

---

## 10.10 `FlowReviewComponent` / `DivisionOrchestrationComponent`

### 必須
- 他のカード群と同じデザイン言語に寄せる
- レビュー系であること、通常toolでないことがわかる
- 状態
  - pending
  - approved
  - rejected
  を見分けられる

### Optional
- 見出しの文言整理
- ステッパー表示の演出強化

---

# 11. 状態仕様

## 11.1 入力欄
- default
- hover
- focus-within
- disabled
- drag-over
- streaming

## 11.2 メッセージ
- committed
- streaming
- editing
- ghost / checkpoint

## 11.3 tool
- pending
- running
- success
- rejected
- error
- invalid params

## 11.4 review
- pending
- approved
- rejected

## 11.5 thread
- idle
- LLM running
- tool running
- awaiting user

---

# 12. アニメーション仕様

## 12.1 必須方針
- 速い
- 短い
- 控えめ
- レイアウト破綻を起こさない

## 12.2 推奨値
- hover: `150ms`
- accordion: `200ms`
- chevron rotate: `100ms`
- status pulse: 任意、使う場合のみ `250ms〜400ms` 程度

## 12.3 禁止
- 常時大きく動く装飾
- 複数箇所の同時点滅
- 可読性を下げる過剰モーション

---

# 13. アクセシビリティ方針

## 13.1 必須
- 状態を色だけで伝えない
- 補助情報のコントラストを落としすぎない
- 小さすぎるクリックターゲットを避ける
- hover のみで意味を伝えない

## 13.2 推奨
- focus-visible の見た目強化
- 展開UIに `aria-expanded` を付与
- 状態アイコンへ補助ラベル付与

※ ただし本書はデザイン仕様書であり、完全なアクセシビリティ実装仕様ではありません。ARIA詳細は実装設計側で補完します。

---

# 14. 実装優先順位

## P0
1. 入力欄下段バーの黒ベース解消
2. assistant / tool / command bar のカード整理
3. ToolHeaderWrapper の header情報整理
4. 余白・タイポの段階整理
5. running / error / rejected の状態表現強化

## P1
1. reasoning 表示の整理
2. selected files token の統一
3. flow indicator の微調整
4. review系カードの統一感改善

## P2
1. optionalな文言整理
2. 微細演出の追加
3. ガラス感の軽微な付与
4. 将来的なコンポーネント分割の準備

---

# 15. 実装者向け判断ルール

実装中に迷った場合、以下で判断します。

## 15.1 優先順位
1. 情報が読みやすいか
2. 状態がわかるか
3. 既存トークンで整合するか
4. 既存構造を壊しすぎないか
5. 装飾が過剰でないか

## 15.2 迷ったら採用する方向
- 派手さより整理
- 強い色面より境界と余白
- 新規ライブラリより既存CSS/Tailwind
- 文言改修より視覚整理

---

# 16. 非目標

今回の改修では、以下を成果基準にしません。

- UI言語の完全統一
- 新規モーションライブラリ導入
- 完全なコンポーネント分割
- 全テーマ完全最適化
- IA再設計
- 全文言の再翻訳

---

# 17. QAチェックリスト

## 視覚
- [ ] user / assistant / tool / review / command bar が見分けられる
- [ ] 本文が最も読みやすい
- [ ] 進行中状態が埋もれない
- [ ] 補助情報がうるさすぎない
- [ ] 入力欄が黒ベタから浮きすぎず改善されている

## 状態表現
- [ ] error / rejected / running / done が判別できる
- [ ] 色だけで状態を判断させていない
- [ ] open/close可能要素が開閉可能に見える

## レイアウト
- [ ] 同種カードでpaddingが揃っている
- [ ] headerとbodyの区切りが明確
- [ ] 長いタイトルやファイル名でも破綻しにくい

## 文言
- [ ] 新規追加ラベルが既存UI文脈と矛盾しない
- [ ] 日本語化を行った場合、それが任意提案であることを逸脱していない

## 実装方針
- [ ] 新規依存導入なしでも成立している
- [ ] 既存のテーマトークンを優先利用している
- [ ] 既存動作を壊していない

---

# 18. 付録: Optional 提案の扱いルール

以下は**採用してもよいが、今回の完了条件には含めない**提案です。

## Optional A: 日本語化
- 実施する場合は、別PRまたは別タスク扱いが望ましい

## Optional B: ガラス演出
- 背景 / blur / ハイライトはごく弱く
- 可読性を下げるなら不採用

## Optional C: 強めのHUD演出
- active flow に限定
- 常時点滅は避ける

## Optional D: 大規模リファクタ
- UI差分が安定してから着手

---

# 19. 最終要約

今回の `SidebarChat` デザイン改修は、以下を正式採用とします。

- **Gallery型の読みやすいカードUI**をベースにする
- **進行状態だけHUD的に少し強く**見せる
- **文言全面日本語化は必須ではない**
- **optional提案と必須仕様を分離**する
- **既存トークンと既存構造を優先**する
- **新規ライブラリ導入は前提にしない**

この仕様書は、後続エージェントが
- 何を実装すべきか
- 何を勝手に広げてはいけないか
- 何が任意提案か
を判断できるように整理した改訂版です。