"""Downloads Inter / Noto Sans JP from Google Fonts, subset to the characters used in promo.html.

    python3 promo/fonts.py      # rewrites promo/fonts/*.woff2 and promo/fonts.css

Re-run after changing any on-screen text so new characters are included.
"""
import os
import re
import subprocess
import urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
FAMILIES = {'Inter': [400, 500, 600, 700], 'Noto Sans JP': [400, 500, 700]}
UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'

src = open(os.path.join(HERE, 'promo.html'), encoding='utf-8').read()
chars = set(src) | {chr(c) for c in range(32, 127)} | set('…·✓—「」、。？')
text = ''.join(sorted(c for c in chars if c >= ' '))

os.makedirs(os.path.join(HERE, 'fonts'), exist_ok=True)
for f in os.listdir(os.path.join(HERE, 'fonts')):
    os.remove(os.path.join(HERE, 'fonts', f))

rules = []
for fam, weights in FAMILIES.items():
    for w in weights:
        url = 'https://fonts.googleapis.com/css2?family=%s:wght@%d&text=%s' % (fam.replace(' ', '+'), w, urllib.parse.quote(text))
        css = subprocess.run(['curl', '-sSf', '-A', UA, url], capture_output=True, text=True, check=True).stdout
        font_url = re.search(r'url\((https://[^)]+)\)', css).group(1)
        name = 'fonts/%s-%d.woff2' % (fam.replace(' ', ''), w)
        subprocess.run(['curl', '-sSf', '-o', os.path.join(HERE, name), font_url], check=True)
        rules.append("@font-face { font-family: '%s'; font-weight: %d; font-style: normal; font-display: block; src: url('%s') format('woff2'); }" % (fam, w, name))

with open(os.path.join(HERE, 'fonts.css'), 'w') as f:
    f.write('\n'.join(rules) + '\n')
print('wrote %d font files' % len(rules))
