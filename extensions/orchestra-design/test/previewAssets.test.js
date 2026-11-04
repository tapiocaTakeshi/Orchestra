/*---------------------------------------------------------------------------------------------
 *  Copyright 2025 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------------*/
// Run: npm test  (compiles src/ to out/ and runs node --test)
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const a = require('../out/previewAssets.js');
const h = require('../out/htmlPatchService.js');

const ROOT = path.resolve('/ws');
const DESIGN = path.join(ROOT, '.division', 'design');
const PAGE = path.join(DESIGN, 'index.html');

/** @param {Record<string, string | Uint8Array>} files ROOT からの相対パス → 内容 */
function opts(files) {
	const map = new Map(Object.entries(files).map(([k, v]) => [path.join(ROOT, k), v]));
	return {
		documentPath: PAGE,
		root: ROOT,
		reader: {
			readText: p => { const v = map.get(p); return typeof v === 'string' ? v : undefined; },
			readBytes: p => { const v = map.get(p); return v === undefined ? undefined : typeof v === 'string' ? Buffer.from(v) : v; },
		},
	};
}

test('relative <link rel=stylesheet> is replaced by an equivalent <style>', () => {
	const html = '<!DOCTYPE html><html><head><link data-od-id="3" rel="stylesheet" href="style.css" media="screen"></head><body><p class="x">hi</p></body></html>';
	const r = a.inlineStylesheets(html, opts({ '.division/design/style.css': '.x { color: red; }' }));
	assert.match(r.html, /<style data-od-id="3" media="screen" data-od-href="style.css">\n\.x \{ color: red; \}\n<\/style>/);
	assert.doesNotMatch(r.html, /<link/);
	assert.deepEqual(r.files, [path.join(DESIGN, 'style.css')]);
	// 置き換え後もパースでき、<body> はそのまま
	assert.ok(h.parseHtml(r.html).nodes.some(n => n.tag === 'p'));
});

test('paths in subfolders, parent folders and root-relative paths resolve', () => {
	const html = '<link rel="stylesheet" href="css/a.css"><link rel=stylesheet href="../shared.css?v=2"><link rel="stylesheet" href="/theme.css">';
	const r = a.inlineStylesheets(html, opts({
		'.division/design/css/a.css': 'a{}', '.division/shared.css': 'b{}', 'theme.css': 'c{}',
	}));
	assert.equal((r.html.match(/<style/g) || []).length, 3);
	assert.match(r.html, /a\{\}[\s\S]*b\{\}[\s\S]*c\{\}/);
});

test('remote, missing and outside-workspace stylesheets are left as <link>', () => {
	const html = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter"><link rel="stylesheet" href="missing.css"><link rel="stylesheet" href="../../../etc/x.css"><link rel="icon" href="style.css">';
	const r = a.inlineStylesheets(html, opts({ '.division/design/style.css': 'a{}' }));
	assert.equal(r.html, html);
	assert.deepEqual(r.files, []);
});

test('@import is expanded recursively, cycles stop, remote imports stay', () => {
	const r = a.inlineStylesheets('<link rel="stylesheet" href="main.css">', opts({
		'.division/design/main.css': '@import url("https://x.test/a.css");\n@import "base.css";\n@import url(print.css) print;\nmain{}',
		'.division/design/base.css': '@import "main.css";\nbase{}',
		'.division/design/print.css': 'p{}',
	}));
	assert.match(r.html, /@import url\("https:\/\/x\.test\/a\.css"\);/);
	assert.match(r.html, /base\{\}/);
	assert.match(r.html, /@media print \{\np\{\}\n\}/);
	assert.match(r.html, /main\{\}/);
	assert.equal(r.files.length, 3);
});

test('url() in CSS becomes a data: URI relative to the CSS file', () => {
	const r = a.inlineStylesheets('<link rel="stylesheet" href="css/a.css">', opts({
		'.division/design/css/a.css': '.h{background:url(../img/bg.png)} .i{background:url("data:image/png;base64,AA")} /* url(x.png) */ .s{content:"url(y.png)"}',
		'.division/design/img/bg.png': new Uint8Array([1, 2, 3]),
	}));
	assert.match(r.html, /url\(data:image\/png;base64,AQID\)/);
	assert.match(r.html, /url\("data:image\/png;base64,AA"\)/);
	assert.match(r.html, /\/\* url\(x\.png\) \*\//);
	assert.match(r.html, /"url\(y\.png\)"/);
});

test('</style> inside CSS cannot close the inlined <style>', () => {
	const r = a.inlineStylesheets('<link rel="stylesheet" href="s.css"><p>x</p>', opts({ '.division/design/s.css': 'a::after{content:"</style><script>"}' }));
	const doc = h.parseHtml(r.html);
	assert.equal(doc.nodes.filter(n => n.tag === 'script').length, 0);
	assert.ok(doc.nodes.some(n => n.tag === 'p'));
});

test('linkedStylesheets lists the local CSS files for the AI context', () => {
	const doc = h.parseHtml('<link rel="stylesheet" href="style.css"><link rel="stylesheet" href="https://x.test/a.css">');
	const list = a.linkedStylesheets(doc, opts({ '.division/design/style.css': 'a{}' }));
	assert.deepEqual(list, [{ path: path.join(DESIGN, 'style.css'), css: 'a{}' }]);
});

const PNG = new Uint8Array([1, 2, 3]); // base64: AQID

test('<img src> and srcset with relative paths become data: URIs', () => {
	const html = '<img data-od-id="1" src="img/a.png" alt="a"><img src="../shared/b.svg#icon"><img srcset="img/a.png 1x, img/a@2x.png 2x, https://x.test/c.png 3x" src="https://x.test/c.png"><picture><source srcset="img/a.png" type="image/png"></picture>';
	const r = a.inlineImages(html, opts({
		'.division/design/img/a.png': PNG, '.division/design/img/a@2x.png': PNG, '.division/shared/b.svg': '<svg/>',
	}));
	assert.match(r.html, /<img data-od-id="1" src="data:image\/png;base64,AQID" alt="a">/);
	assert.match(r.html, /src="data:image\/svg\+xml;base64,PHN2Zy8\+#icon"/);
	assert.match(r.html, /srcset="data:image\/png;base64,AQID 1x, data:image\/png;base64,AQID 2x, https:\/\/x\.test\/c\.png 3x" src="https:\/\/x\.test\/c\.png"/);
	assert.match(r.html, /<source srcset="data:image\/png;base64,AQID" type="image\/png">/);
	assert.equal(r.files.length, 3);
});

test('video poster, input type=image and SVG <image href> are converted; other inputs are not', () => {
	const html = '<video poster="p.png"></video><input type="image" src="p.png"><input type="text" src="p.png"><svg><image href="p.png"/><image xlink:href="p.png"/></svg>';
	const r = a.inlineImages(html, opts({ '.division/design/p.png': PNG }));
	assert.equal((r.html.match(/data:image\/png;base64,AQID/g) || []).length, 4);
	assert.match(r.html, /<input type="text" src="p\.png">/);
});

test('url() in style attributes and <style> resolves relative to the page', () => {
	const html = `<div style='background: url("img/a.png") no-repeat'></div><style>.h{background:url(img/a.png)} .x{background:url(missing.png)}</style>`;
	const r = a.inlineImages(html, opts({ '.division/design/img/a.png': PNG }));
	assert.match(r.html, /<div style="background: url\(data:image\/png;base64,AQID\) no-repeat">/);
	assert.match(r.html, /\.h\{background:url\(data:image\/png;base64,AQID\)\}/);
	assert.match(r.html, /url\(missing\.png\)/);
	// 書き換え後もパースでき、style 属性は 1 つの値のまま
	const div = h.parseHtml(r.html).nodes.find(n => n.tag === 'div');
	assert.equal(h.getAttr(div, 'style').value, 'background: url(data:image/png;base64,AQID) no-repeat');
});

test('remote, data:, missing, outside-workspace, non-image and oversized files stay as they are', () => {
	const big = new Uint8Array(a.MAX_DATA_URI_BYTES + 1);
	const html = '<img src="https://x.test/a.png"><img src="data:image/png;base64,AA"><img src="nope.png"><img src="../../../etc/a.png"><img src="doc.txt"><img src="big.png"><a href="other.html">x</a>';
	const r = a.inlineImages(html, opts({ '.division/design/doc.txt': 'x', '.division/design/big.png': big }));
	assert.equal(r.html, html);
	assert.deepEqual(r.files, []);
});

test('inlinePreviewAssets does both stylesheets and images', () => {
	const r = a.inlinePreviewAssets('<link rel="stylesheet" href="s.css"><img src="p.png">', opts({
		'.division/design/s.css': '.x{background:url(p.png)}', '.division/design/p.png': PNG,
	}));
	assert.equal((r.html.match(/data:image\/png;base64,AQID/g) || []).length, 2);
	assert.doesNotMatch(r.html, /<link/);
	assert.deepEqual(r.files.sort(), [path.join(DESIGN, 'p.png'), path.join(DESIGN, 's.css')].sort());
});
