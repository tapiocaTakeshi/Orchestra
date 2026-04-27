# Codebase Summary ツール

`scripts/summarize_codebase.py` は、このリポジトリ全体を走査して
`CODEBASE_SUMMARY.md` を生成する自己完結スクリプトです。

## 生成内容

1. **概要** — 走査ファイル数、検出言語数、TODO 件数
2. **ディレクトリツリー** — `--max-depth` で深さ調整可能
3. **言語別ファイル数 / 行数**
4. **トップレベルディレクトリの推定役割** （`src/`, `tests/`, `docs/` などをヒューリスティックで分類）
5. **主要設定ファイル** — `package.json` / `pyproject.toml` / `Dockerfile` などを抜粋
6. **README 抜粋**

## 使い方

