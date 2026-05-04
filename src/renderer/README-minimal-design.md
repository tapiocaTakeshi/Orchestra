# Minimal Design Layer

Electron レンダラー向けのミニマルデザインを追加するレイヤーです。
既存のスタイルを破壊せず、`<html data-design="minimal">` が付いた
ときだけ有効になる**追加スタイル**として実装されています。

## 構成

- `src/styles/minimal-design.css` — デザイントークン + ベーススタイル
- `src/renderer/applyMinimalDesign.ts` — 起動時ブートストラップ

## 有効化（1 行）

既存のレンダラーエントリ（例: `src/renderer/index.ts` や
`src/renderer/main.ts`）の先頭に次の 1 行を追加してください。

