# Minimal Design Guidelines (Electron Renderer)

## 原則
1. **余白を最大の装飾とする** — 8pt スペーシングを徹底。
2. **モノクロ + 1 アクセント** — 既定では `--color-text` を主役、`--color-accent` をアクション喚起のみに使用。
3. **影は最小限** — `--shadow-sm` を基本、ホバー時のみ `--shadow-md`。
4. **タイポグラフィで階層を作る** — サイズ・ウェイト・字間で情報の主従を表現。
5. **モーションは控えめ** — 120–200ms / `cubic-bezier(0.2, 0, 0, 1)`。

## 主要トークン
- 角丸: 6 / 8 / 12px
- フォント: system stack (`-apple-system, "Segoe UI", "Noto Sans JP", ...`)
- カラー: light/dark を `:root[data-theme="dark"]` で切替

## レイアウト
- アプリは `header / main / footer` の 3 行グリッド。
- メインは最大幅 880px の 1 カラムを基本とし、必要に応じて `auto-fit minmax(240px, 1fr)` のカードグリッドで拡張。

## アクセシビリティ
- フォーカスリングは `--color-focus-ring` で 2px outline。
- `prefers-reduced-motion` を尊重しトランジションを無効化。
- ボタンは最低 32px 高さを確保（`padding` で担保）。
