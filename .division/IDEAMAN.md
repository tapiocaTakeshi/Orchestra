以下は、提示された `SidebarChat.tsx` の「既存の雰囲気（Voidテーマの濃淡、カード・境界線・ステータス色、折りたたみ、ボタンの丸み、ProseWrapper等）」を踏まえて、**さらに凝った見た目**に寄せるためのデザイン案を“複数方向”でまとめたものです。  
（後続エージェントがそのままUI方針に落とし込めるよう、**部品ごとの提案**と**配色・モーションの考え方**を具体化しています。）

---

## 1) 全体コンセプト案（方向性を複数提示）

### A. “Glass / Card Depth” 強化（既存の延長で上品に）
**狙い**：いまのカード風表現を、さらに「奥行き」「光」「素材感」へ昇格。  
**やること（全体）**
- カードの `border` を単純な線で終わらせず、**二層境界**にする（例：外側薄グレー + 左アクセント太線）
- 背面に軽い `backdrop-filter`（可能なら）と `linear-gradient` を追加
- Hover時に**微小なリフト**（translateY(-1px)）と影増加
- スクロール領域やフッターにも同じ“素材感”を統一

**適用箇所**
- `UserMessageComponent` / `AssistantMessageComponent` / `ToolHeaderWrapper` / `FlowReviewComponent` / `VoidChatArea` / `CommandBarInChat` のコンテナ全般

---

### B. “Status-First” 可視化（状態が見た目で一発理解できる）
**狙い**：`tool running / success / rejected / awaiting_user` 等の状態を、色・形・アニメで強調。  
**やること**
- 状態ごとに **“柄”**（例：斜線/ドット/グラデーション）を使う
- `active` のときだけ **走査線/脈動**（pulse）を許可
- `done` は静的、`rejected` は視線誘導（軽い揺れは弱めに）

**適用箇所**
- `ToolHeaderWrapper` のアクセント色
- `FlowIndicator` の active 表示
- `threadStatusHTML`（StatusIndicator）周り

---

### C. “Timeline / Agent Story” 化（メッセージが物語っぽく流れる）
**狙い**：チャットを時系列の“進捗ログ”っぽく見せ、理解コストを下げる。  
**やること**
- `messages` を縦タイムラインに見立てる：
  - 各メッセージの左側に **フェーズに応じたチップ**
  - `assistant` は“ステップ完了カード”、`tool` は“イベントカード”
- `FlowIndicator` を単なるテキストから **モノリス型ステッパー**へ

**適用箇所**
- `ScrollToBottomContainer` 内：各 `ChatBubble` に左レーン追加（absolute / flex）
- `FlowIndicator` は下部に固定ではなく“カードの連結感”を出す

---

### D. “Ambient Motion” 演出（控えめに“気配”を出す）
**狙い**：凝るがうるさくしない。ユーザーが迷わず読める範囲で“空気”を入れる。  
**やること**
- アニメは次の3種だけに絞る：
  1. **Hoverリフト**（常用）
  2. **開閉の高さアニメ**（既にあるが質感強化）
  3. **loadingは軽いドット/光の移動**（速度は遅め）
- 文字の再描画が多い箇所では `will-change: transform` を最小限に

---

## 2) 部品別：具体的なUI改善提案

### 2-1) `ToolHeaderWrapper`（ここが一番“凝れる”中心）
**現状の良さ**：アクセント左線、折りたたみ、ステータスアイコン、Tooltip。  
**追加案（おすすめ）**
1. **ヘッダー背景を“層”にする**
   - `background: var(--void-bg-2)` をベースに
   - さらに `::before` 風（JS不可でもTailwindで gradient）で **上方向グロー**を足す
2. **状態に応じた pattern**
   - `isError` → うっすら赤い斜線（opacity低め）
   - `isRejected` → ドット柄 or 斜め細ライン
3. **折りたたみアニメの質感**
   - いまは `max-h-0/opacity`。これに加えて
   - `filter: blur()` を使わず、代わりに `transform: translateY(4px) -> 0` を混ぜる
4. **クリック領域の“手触り”**
   - `hover` 時に境界線の色を少しだけ強くし、`borderLeft` の太さを変える（例：2px→3px）

**状態別モーション**
- `isOpen` のとき：`opacity` + `translateY`（200ms）
- `isError`：揺れはしない、代わりに右側アイコンを“スッ”と強調（scale 1.0→1.05）

---

### 2-2) `AssistantMessageComponent`（オーケストレーション&読みやすさ両立）
**追加案**
1. カード上部のモデルラベルを“ステッカー化”
   - 現状の円ドット＋テキストを
   - **台座付きバッジ**に（薄い影 + rounded-full + gradient）
2. `ReasoningWrapper`（ToolHeaderWrapper利用）
   - “思考中”のときだけ、カード内に **マイクロスキャン（横グロー）**
   - `IconLoading` はテキストの “...” 方式だが、UIに合わせて
     - `.` を増やす代わりに **点がフェードイン**（CSSアニメ）へ
3. `DivisionOrchestrationComponent`
   - Task card の左アクセントを“進捗バー化”
   - `status === error` のときのみ赤いノイズ（opacity低）

---

### 2-3) `VoidChatArea`（入力部の“完成度”が印象を決める）
**追加案**
1. ドロップオーバーレイ
   - 現状：青枠 + dashed
   - これを“ガラス”風に：
     - `bg-blue-500/10` に加えて `backdrop-blur`（可能なら）
     - dashed の線に薄グロー
2. 下部フッター（モデル/スイッチ/送信/添付）
   - フッターを“ステッキー”化はしない（現状の設計上は不要）
   - ただし `-mx-1 mb-[-4px]` があるので、背景と角丸の整合を強化
3. 添付ボタンのトーン統一
   - 添付ボタンは `showSelections` のときだけ表示
   - 表示時に `pulse` などは控えめに、代わりに hover時の背景を `var(--void-bg-2)` へ統一

---

### 2-4) `ScrollToBottomContainer`（戻るボタンを“機能的に綺麗”へ）
**追加案**
- 戻るボタン（ChevronDown）の見た目を
  - 背景グラデ（濃淡）
  - ふわっと出現（opacity + translateY）
- `!isAtBottom` のときのみ軽く“呼吸”（ただし0.5s周期程度の超控えめ）

---

### 2-5) `SelectedFiles`（サムネとパス表示のUIを統一感ある“チップ”に）
**現状の良さ**：Prospective と本命で色を変え、Xで削除。  
**追加案**
1. Prospective は “点線ボーダー”
   - `border-void-border-2` だけでなく `border-dashed` を使う
2. ファイルチップに “右端メタ情報”枠
   - `type=File` のとき右側に小さく `language` or `state` を表示（表示は極小）
3. `Image` サムネの角丸・影
   - 画像サムネ枠に `shadow-sm` 追加、hover時に明るさ

---

### 2-6) `FlowIndicator`（エージェントの流れを“ミニダッシュボード”化）
**現状の良さ**：phase label と arrow と modelName。  
**追加案**
- `→` をただのテキストではなく **小さな区切りアイコン**
- `active` のphaseに
  - 軽い“枠グロー”
  - ラベルの下に細いプログレスライン（短い）
- `done` のphaseは
  - 文字色を薄くするだけでなく、アイコン部分にチェックの印

---

### 2-7) `FlowReviewComponent`（最も作り込み可能なカード）
**現状の良さ**：ステッパー＋ドキュメントプレビュー＋承認/却下。  
**追加案**
1. ステッパーの横線を“コネクタ”風に
   - 線を `bg-green-500/60` だけでなく gradient（左から右に光）
2. Doc previewの折りたたみ
   - 開く/閉じるときに `max-h` の変化に加えて `opacity` + `transform: translateY(2px)`
3. Actionボタン
   - `承認して次へ進む` / `やり直す` を
   - それぞれ `loading` 表示（必要なら）
   - クリック時に“押し込み”（active: translateY(1px)）

---

## 3) 配色設計案（Voidテーマ前提での拡張）

### 共通の推奨トークン（例）
- 背景：`var(--void-bg-1)` / `var(--void-bg-2)` / `var(--void-bg-3)`
- 境界：`var(--void-border-1)` / `var(--void-border-2)`  
- 通常テキスト：`var(--void-fg-1)` / `var(--void-fg-2)` / `var(--void-fg-3)`  
- 重点：
  - success：`green-500` 系（ただし opacity を統一）
  - error：`var(--void-warning)` or `red-500` 系（ここも濃度統一）

### 状態の統一ルール（重要）
- `active` は「色が濃い」ではなく **光ってる/動いてる**
- `done` は「色が薄い＋静的」
- `rejected` は「色が赤い＋アイコンは強いが、背景は薄く」

---

## 4) モーション設計（うるさくしない凝り方）

おすすめの“モーション仕様”をテンプレ化します：

- 基本：`transition: 200ms ease`
- Hover：`transform: translateY(-1px)` + `shadow: 0 8px 20px rgba(0,0,0,.08)`
- Collapse/Expand：
  - `max-height` だけでなく `transform: translateY(4px)->0`
  - `opacity` を併用（opacity 0→1）
- Loading：
  - `IconLoading` をテキスト点滅から **点のフェードループ**に置換（可能なら）
  - もしくは “脈動”は限定（activeカードのみ）

---

## 5) 実装しやすい“優先度”提案（どこから直すべきか）
後続エージェントが作業計画を立てやすいように優先度を付けます。

1. **最優先：ToolHeaderWrapper**（見た目の中心。多用されるので効果最大）
2. **次点：AssistantMessageComponent / ReasoningWrapper**
3. **次点：VoidChatArea 下部フッター & ドロップオーバーレイ**
4. **次点：FlowIndicator / FlowReviewComponent**
5. **仕上げ：SelectedFiles & ScrollToBottomButton**

---

## 6) 追加の“提案ネタ”（そのまま採用できる演出アイデア）
- **アイコン周りの“サムネ影”**：`shadow-inner` を使って読みやすさUP
- **カードの角丸を統一**：12px / 8px / 6px が混在しているなら、用途別に固定
- **Tooltipの一貫性**：`data-tooltip-delay-show` の値をカテゴリ別に統一
- **アクセント線の太さを状態で変更**：activeは太め（ただし跳ねない）

---

必要なら次のステップとして、こちらから「採用する方向性（A/B/C/Dどれ寄せ）」をあなたに質問して、**具体的なスタイル差分（Tailwindクラスの置換案、inline styleの決め方、色トークン表）**まで落とし込み案を作れます。  
どの方向性（例：A: Glass強化、B: Status-first、C: Timeline、D: Ambient motion）に寄せたいですか？