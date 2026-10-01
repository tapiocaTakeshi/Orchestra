#!/usr/bin/env bash
# Downloads the full (non-subset) TTFs for the video's fonts into fonts/ and
# writes fonts/fonts.css pointing at the local copies, so renders are offline
# and deterministic.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p fonts
URL='https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700;900&family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=block'
curl -fsSL "$URL" > fonts/remote.css
grep -oE 'https://fonts\.gstatic\.com/[^)]+' fonts/remote.css | while read -r src; do
  name=$(basename "$src")
  [ -f "fonts/$name" ] || curl -fsSL -o "fonts/$name" "$src"
done
sed -E 's#https://fonts\.gstatic\.com/([^)]*/)?([^/)]+)#\2#g' fonts/remote.css > fonts/fonts.css
rm fonts/remote.css
echo "fonts ready: $(ls fonts/*.ttf | wc -l) files"
