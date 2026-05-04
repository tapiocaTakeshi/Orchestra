# Minimal Theme — Design Tokens

このアプリは「シンプル / 余白 / 無彩色 + 1 アクセント」を原則とします。

## カラー
- Background: `#ffffff` / Dark: `#0f0f10`
- Border:     `#ececec` / Dark: `#26262a`
- Text:       `#111111` / Dark: `#f5f5f7`
- Muted:      `#6b6b6b` / Dark: `#a1a1aa`
- Accent:     Text と同じ無彩色（強調はコントラストで）

## タイポグラフィ
- Font: system-ui スタック（`-apple-system, "Segoe UI", Roboto, "Noto Sans JP", ...`）
- Base: 14px / line-height 1.6
- Heading: 600 weight, tracking -0.01〜-0.02em

## スペーシング
- 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 px のスケールを使用

## 角丸 / 影
- Radius: 4 / 6 / 10 px
- Shadow: 極薄 2 段階（hover で 1 段階強調）

## 原則
1. 1 画面あたりのアクセント色は 1 つまで
2. ボーダーは 1px の薄いグレーで統一
3. ボタン・入力・カードの hover/focus トランジションを 150ms に統一
4. ライト / ダークは `prefers-color-scheme` に追従
5. `prefers-reduced-motion` でアニメーション抑制
