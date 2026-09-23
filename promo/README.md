# Orchestra プロモーションビデオ

`orchestra-promo.mp4` — 1920×1080 / 30fps / 50 秒 / BGM つき

| 時間 | シーン |
| --- | --- |
| 0:00 | 「コードを書く時代から、AI を指揮する時代へ。」 |
| 0:05 | ロゴとタグライン（最強のマルチエージェントを搭載した次世代 AI IDE） |
| 0:11 | 「どの AI に、何を任せるか。」— バラバラのモデルが整列する |
| 0:17 | マルチエージェント・オーケストレーション（Leader AI → Search / Planning / Coding / Review） |
| 0:29 | 自律型エージェントモード（コード生成・コマンド実行・レビューまで自走） |
| 0:38 | 6 プロバイダー / 38+ LLM / VS Code 互換 / `@` コンテキスト |
| 0:44 | 「AI を、指揮せよ。」— ORCHESTRA / Powered by Division API |

## 作り直し方

アニメーションは `promo.html`（時刻 `t` を渡すと 1 コマ描く `render(t)`）で、
BGM は `music.py` で合成しています。ブラウザで `promo.html` を開くとリアルタイムでプレビューできます。

```bash
pip install numpy && python3 promo/music.py      # promo/music.wav を生成
npm i -D playwright                              # 未導入の場合
node promo/render.mjs                            # promo/orchestra-promo.mp4 を生成（ffmpeg が必要）
```

- `FFMPEG=/path/to/ffmpeg` で ffmpeg の場所を指定できます。
- `FROM=17 TO=29 OUT=/tmp/part.mp4 node promo/render.mjs` で一部だけ書き出せます。
- 文言やタイミングを変えたら、`promo.html` の `T`（シーン区切り）と `music.py` の `SCENE_HITS` などを合わせてください。
- `fonts/` は Inter / Noto Sans JP / JetBrains Mono（SIL Open Font License）を動画で使う文字だけに絞ったものです。
  新しい文字を足した場合は、フォントに含まれず代替フォントで表示されることがあります。
