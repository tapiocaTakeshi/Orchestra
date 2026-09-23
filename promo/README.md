# Orchestra プロモーションビデオ

`orchestra-promo.mp4` — 1920×1080 / 30fps / 28 秒 / BGM つき

白と赤を基調にした、テンポの速いモーショングラフィックス版です。

| 時間 | シーン |
| --- | --- |
| 0:00 | 3D 空間に浮かぶ UI ウィンドウと紙飛行機 —「つくりたいものは？」 |
| 0:03 | プロンプト入力 → カーソルから役割タグ（検索 / 設計 / 実装 / レビュー）が飛び出す |
| 0:06 | タイムライン —「複数のAIが、同時に動く。」 |
| 0:08 | ピルの文字切り替え：マルチエージェント → 自律型エージェント（赤フラッシュ）→ VS Code 完全互換 |
| 0:12 | 黒背景で 3D ロゴタイルが現れ、放射状の光がはじける |
| 0:14 | 「AIを、指揮しよう。」— 横切るバーと背景のグレーアップ |
| 0:16 | モデルカードのカルーセル（Perplexity / Gemini / Claude / GPT / Grok / DeepSeek） |
| 0:19 | コーディング担当モデルを選択 → エージェント構成カード →「実行する」 |
| 0:22 | 「1つのプロンプトで、最高のチームを。」→ 巨大なロゴが画面を横切って着地 |
| 0:24 | ロゴ + Orchestra ワードマーク +「AIを、指揮せよ。」/ Powered by Division API |

## 作り直し方

アニメーションは `promo.html`（時刻 `t` を渡すと 1 コマ描く `render(t)`）で、
BGM は `music.py` で合成しています。ブラウザで `promo.html` を開くとリアルタイムでプレビューできます
（モーションブラーは書き出し時のみ）。

```bash
python3 promo/fonts.py                           # 画面の文字を変えたらフォントのサブセットを作り直す
pip install numpy && python3 promo/music.py      # promo/music.wav を生成
npm i -D playwright                              # 未導入の場合
node promo/render.mjs                            # promo/orchestra-promo.mp4 を生成（ffmpeg が必要）
```

- `FFMPEG=/path/to/ffmpeg` で ffmpeg の場所を指定できます。
- `SUB` は 1 コマあたりに重ねるサブフレーム数（モーションブラーの滑らかさ、既定 8）。`SUB=1` でブラーなし・高速。
- `FROM=12 TO=16 OUT=/tmp/part.mp4 SUB=1 node promo/render.mjs` で一部だけ素早く書き出せます。
- シーンの区切りを変えたら、`promo.html` の `T` と `music.py` の `CUTS` などを合わせてください。
- `fonts/` は Inter / Noto Sans JP（SIL Open Font License）を動画で使う文字だけに絞ったものです。
