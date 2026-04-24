# 最新UI演出実装ガイド — Next.js/Tailwind/React 環境対応版

本レポートは、SidebarChat の「デザインに凝る」改善を実現するため、**既存プロジェクト環境（Next.js + Tailwind CSS + React）に導入可能な最新 UI 演出手法**を調査・整理したものです。ライブラリ依存を最小化しつつ、Tailwind ネイティブおよび軽量 JavaScript で実装可能な技法を優先します。

---

## 1. マイクロインタラクション（Micro-Interactions）実装ガイド

マイクロインタラクションとは、**ユーザーのアクション（クリック、ホバー、フォーカス）に対する小さな反応や動きのこと**です[1][2]。SidebarChat では、以下の箇所で効果的に活用できます：

### 1.1 ボタン・フォーカス時の反応

**推奨実装**（Tailwind ネイティブ）：

```jsx
// 承認/拒否ボタン例
<button
  className="
    px-3 py-2 rounded-md
    bg-void-bg-2 text-void-fg-1
    border border-void-border-1
    transition-all duration-200 ease-out
    hover:bg-void-bg-3 hover:shadow-md
    focus:ring-2 focus:ring-vscode-focusBorder focus:ring-offset-1
    active:scale-95
  "
>
  承認
</button>
```

**実装ポイント**：
- `transition-all duration-200`：200ms は Search results [2] で推奨される「200～300ミリ秒」に該当[2]
- `hover:scale-105` よりも `active:scale-95`（押下時の縮小）を優先し、tactile feedback を演出
- `focus:ring-*` で keyboard navigation 対応を同時に実装

### 1.2 入力欄フォーカス時のラベル移動（Floating Label）

**Material Design パターン**[2]：

```jsx
<div className="relative">
  <input
    id="message"
    type="text"
    placeholder=" "
    className="
      w-full px-4 py-3 rounded-md
      bg-void-bg-1 border border-void-border-3
      text-void-fg-1 placeholder-transparent
      focus:border-vscode-focusBorder focus:outline-none
      transition-colors duration-200
    "
  />
  <label
    htmlFor="message"
    className="
      absolute left-4 top-3
      text-void-fg-3
      transition-all duration-200
      origin-left
      peer-placeholder-shown:top-3 peer-placeholder-shown:scale-100
      peer-focus:top-1 peer-focus:scale-90 peer-focus:text-vscode-focusBorder
    "
  >
    メッセージを入力...
  </label>
</div>
```

**効果**：
- フォーカス時にラベルが上に移動し、「ここに入力している」という状態が明確になる[2]
- `opacity` 変化のみでなく `scale` + `translate` の組み合わせで、より洗練された動き

### 1.3 Tool Header 展開・折りたたみアニメーション

**現在の実装改善案**：

```jsx
const [isOpen, setIsOpen] = useState(false);

return (
  <div
    className="
      bg-void-bg-2 border border-void-border-1 rounded-md
      overflow-hidden
    "
  >
    {/* ヘッダ */}
    <button
      onClick={() => setIsOpen(!isOpen)}
      className="
        w-full flex items-center justify-between
        px-3 py-2.5
        hover:bg-void-bg-3 transition-colors duration-150
        cursor-pointer
      "
    >
      <div className="flex items-center gap-2">
        <ChevronIcon
          className={`
            transition-transform duration-200
            ${isOpen ? 'rotate-90' : 'rotate-0'}
          `}
        />
        <span className="font-medium text-void-fg-1">{title}</span>
      </div>
      <span className="text-xs text-void-fg-3">{isOpen ? '展開中' : '折りたたみ中'}</span>
    </button>

    {/* コンテンツ（フルハイト遷移） */}
    <div
      className={`
        overflow-hidden transition-all duration-300 ease-out
        ${isOpen ? 'max-h-screen opacity-100' : 'max-h-0 opacity-0'}
      `}
    >
      <div className="px-3 py-2 bg-void-bg-3 border-t border-void-border-1">
        {children}
      </div>
    </div>
  </div>
);
```

**改善点**：
- `max-h-0 opacity-0` よりも `max-h-screen opacity-0` の組み合わせで滑らかな遷移
- `ease-out` easing で開き始めは素早く、終端で緩やかになる自然な感覚[2]
- 「展開中/折りたたみ中」テキストで状態を明確化

---

## 2. ガラスモーフィズム（Glassmorphism）実装

ガラスモーフィズムは、**半透明背景 + backdrop blur で磨りガラス風の奥行き感を演出**する手法です。SidebarChat では、ツールの overlay パネルやフローティング UI に適用できます[1]。

### 2.1 基本実装（Tailwind ネイティブ）

```jsx
// ガラスカード共通パターン
<div
  className="
    bg-white/5 backdrop-blur-lg
    border border-white/10
    rounded-lg
    shadow-lg
  "
>
  {/* コンテンツ */}
</div>
```

**推奨設定**：
- `bg-*-*/[数値]`：透明度は 5-20% が一般的（Search results [1] 参照）
- `backdrop-blur-lg` / `backdrop-blur-xl`：blur radius 12px～20px が目安
- `border border-white/10` or `border-white/20`：ボーダーも半透明で整合性を保つ

### 2.2 SidebarChat への応用例

**CommandBar の浮遊感演出**：

```jsx
<div
  className="
    fixed bottom-4 right-4
    bg-void-bg-1/80 backdrop-blur-md
    border border-void-border-1/50
    rounded-lg p-4
    shadow-lg hover:shadow-xl
    transition-shadow duration-300
  "
>
  <h3 className="text-sm font-semibold text-void-fg-1 mb-2">
    変更ファイル
  </h3>
  {/* ファイルリスト */}
</div>
```

**効果**：
- ユーザーメッセージの上に浮遊し、背後のコンテンツが透視される感覚
- 背景のぼかしで、UI レイヤーの区別が明確に
- `opacity-80` ではなく `backdrop-blur` で、より「空間的な」見た目

---

## 3. グラデーション・色彩の洗練

### 3.1 微細なグラデーション（Subtle Gradient）

現在の実装では、メッセージバブルに `linear-gradient(135deg, var(--void-bg-1) 0%, ...)` が使用されていますが、Search results [2][6] に基づけば、**グラデーションの角度・色数を慎重に調整**することで、より洗練された見た目になります。

**推奨パターン**：

```css
/* assistant メッセージ用 */
background: linear-gradient(
  135deg,
  var(--void-bg-2) 0%,
  color-mix(in srgb, var(--void-bg-2) 95%, var(--vscode-focusBorder) 5%) 100%
);

/* ユーザーメッセージ用 */
background: linear-gradient(
  135deg,
  var(--void-bg-1) 0%,
  color-mix(in srgb, var(--void-bg-1) 98%, white 2%) 100%
);
```

**利点**：
- `color-mix()` 関数でブラウザレベルで色を混合し、プリプロセッサ不要
- 5% 程度の微細な色変化で、「装飾的すぎない」上質感を演出

### 3.2 ノイズ・テクスチャの活用（オプション）

Search results [3] で言及されている multi-color noise gradient[3] は、高度な手法ですが、SidebarChat では **控えめな使用**を推奨します：

```css
/* 背景にノイズを重ねる場合 */
.assistant-card {
  background:
    linear-gradient(135deg, var(--void-bg-2) 0%, ...),
    url('data:image/svg+xml;utf8,...'); /* ノイズ SVG */
  background-blend-mode: multiply;
  background-size: 100%, 256px;
}
```

**注意**：
- 多用するとパフォーマンス低下の可能性
- ダーク/ライトテーマ両対応に手間
- 本レポートでは「オプション・差別化要素」として推奨

---

## 4. カード設計の洗練

### 4.1 影（Shadow）の段階化

Search results [1][4] より、影を階層的に使い分けることで奥行き感が向上します。

```jsx
// 層別の shadow 定義を Tailwind config に追加推奨
const shadows = {
  'card-sm': '0 1px 2px rgba(0, 0, 0, 0.04), 0 1px 1px rgba(0, 0, 0, 0.02)',
  'card-md': '0 4px 8px rgba(0, 0, 0, 0.06), 0 2px 4px rgba(0, 0, 0, 0.04)',
  'card-lg': '0 10px 20px rgba(0, 0, 0, 0.08), 0 4px 8px rgba(0, 0, 0, 0.06)',
  'card-hover': '0 15px 30px rgba(0, 0, 0, 0.10)',
};

// コンポーネント内での使用
<div className="shadow-card-md hover:shadow-card-hover transition-shadow duration-300">
  {/* コンテンツ */}
</div>
```

**効果**：
- `shadow-lg` 一択ではなく、重要度・優先度に応じた shadow 段階
- hover 時に shadow を強くすることで、クリック可能性を示唆

### 4.2 ボーダーの役割分化

```jsx
// ToolHeaderWrapper の例
<div
  className={`
    border border-void-border-1
    border-l-3 ${
      isError ? 'border-l-red-500' : 
      isRejected ? 'border-l-gray-400' :
      'border-l-blue-500'
    }
    rounded-md
  `}
>
  {/* ヘッダ・コンテンツ */}
</div>
```

**ポイント**：
- 外側の `border` は UI の構造を示す
- 左の `border-l-3` はステータスを示す
- 色は Search results [2][6] の WCAG 基準に基づき、必ず icon + text でも区別可能に

---

## 5. テキスト・タイポグラフィの改善

### 5.1 行高（Line Height）の最適化

Search results [4] では、可読性向上のため行高を調整することが推奨されています。

```jsx
// Tailwind で行高を段階的に定義
<div className="space-y-6">
  {/* heading + prose で異なる行高を適用 */}
  <h2 className="text-lg font-semibold leading-tight">
    ツール実行結果
  </h2>
  <p className="text-sm leading-relaxed text-void-fg-3">
    長めの説明文は余裕ある行高で読みやすく
  </p>
</div>
```

**設定案**：
- heading：`leading-tight`（1.1～1.2）
- 本文：`leading-normal` or `leading-relaxed`（1.5～1.6）
- 補助情報：`leading-snug`（1.375）

### 5.2 フォント選択と Weight の統一

SidebarChat では monospace 環境のため、既定フォント仕様を維持しつつ：

```jsx
// font-weight の明確な使い分け
<div>
  <h3 className="font-semibold text-void-fg-1">タイトル</h3>
  <p className="font-normal text-void-fg-2">本文</p>
  <span className="font-medium text-xs text-void-fg-3">ラベル・メタ</span>
</div>
```

**推奨値**：
- `font-semibold` / `font-bold`：見出し・強調
- `font-medium`：ラベル・小見出し
- `font-normal`：本文・長文
- `font-light` は避ける（コントラスト低下）

---

## 6. フォーカス・キーボードナビゲーション対応

Search results [2] を踏まえ、アクセシビリティを確保しながら UI 品質を維持する方法：

### 6.1 Focus Ring のカスタマイズ

```jsx
// Tailwind config で focus ring を再定義
<button
  className="
    px-4 py-2 rounded-md
    focus:outline-none
    focus-visible:ring-2 focus-visible:ring-vscode-focusBorder focus-visible:ring-offset-2
    transition-all duration-200
  "
>
  操作ボタン
</button>
```

**ポイント**：
- `:focus-visible` で keyboard navigation のみに ring を表示（mouse click では非表示）
- `ring-offset-2` で ring と要素の間に余白を設け、視認性を向上

### 6.2 Tool Header の Keyboard 操作対応

```tsx
const ToolHeaderButton = ({ isOpen, onToggle, title, children
```
