#!/usr/bin/env bash
# 簡易: トップレベル構成と主要拡張子の行数を CODEBASE_SUMMARY.md の末尾に追記する。
# 使い方: bash scripts/gen-codebase-summary.sh
set -euo pipefail

OUT="CODEBASE_SUMMARY.md"
{
  echo ""
  echo "## 10. 自動生成スナップショット ($(date -u +%Y-%m-%dT%H:%M:%SZ))"
  echo ""
  echo '