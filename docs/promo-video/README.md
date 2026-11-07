# Orchestra 紹介動画

`orchestra-promo.mp4` — 1920×1080 / 30fps / 約 53 秒 / BGM 付き

| 時間 | 内容 |
| --- | --- |
| 0:00 | ロゴ・「最強のマルチエージェントを搭載した、次世代 AI IDE」 |
| 0:05 | 1つのプロンプト (「クイズアプリを作って」) を送る |
| 0:11 | Leader が分解し、7 つのロールが分担 (6 プロバイダー) |
| 0:19 | ワークフロー (`.division/workflow.json`): 並列 → 承認 → while ループ |
| 0:27 | 成果物 (論文・仕様書・デザイン・コード) と承認モード |
| 0:34 | Orchestra Mobile: リモートコントロール・クラウドエージェント |
| 0:41 | browser_use / apply_patch / update_plan / 自動コンパクション / AGENTS.md / VS Code 互換 |
| 0:47 | エンディング |

## 作り直し方

映像は `index.html` (時刻 `t` を渡すと、その瞬間の画面になる) を Playwright で 1 コマずつ撮り、ffmpeg で MP4 にしています。
BGM は `music.py` (numpy) で合成しています。

```bash
cd docs/promo-video
npm install          # フォント (Noto Sans JP / Inter)
npm run music        # music.wav
npm run render       # orchestra-promo.mp4
```

1 コマだけ確かめたいとき: `node render.js --stills 3 17 25` (→ `still_<秒>.png`)
