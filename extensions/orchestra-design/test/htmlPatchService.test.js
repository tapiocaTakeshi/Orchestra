/*---------------------------------------------------------------------------------------------
 *  Copyright 2025 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------------*/
// Run: npm test  (compiles src/ to out/ and runs node --test)
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const h = require('../out/htmlPatchService.js');

const SAMPLE = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <title>My App</title>
  <style>
    .btn { color: red; } /* <div> in css must not become an element */
  </style>
  <script>if (a < b && "</div>") { console.log('<p>'); }</script>
</head>
<body>
  <!-- <section> comment -->
  <header class="top"><h1>My Application</h1></header>
  <main>
    <p>Create something great.
    <p>Build your next idea.</p>
    <button class="btn primary" style="width: auto; border-radius: 8px">
      Get Started
    </button>
    <img src="a.png" alt=hero>
    <ul><li>One<li>Two</ul>
  </main>
  <footer>&copy; 2026</footer>
</body>
</html>
`;

const find = (doc, tag, n = 0) => doc.nodes.filter((x) => x.tag === tag)[n];

test('parses elements with source ranges, skipping comments and raw text', () => {
	const doc = h.parseHtml(SAMPLE);
	const tags = doc.nodes.map((n) => n.tag);
	assert.deepEqual(tags, ['html', 'head', 'meta', 'title', 'style', 'script', 'body', 'header', 'h1', 'main', 'p', 'p', 'button', 'img', 'ul', 'li', 'li', 'footer']);
	const button = find(doc, 'button');
	assert.match(SAMPLE.slice(button.start, button.end), /^<button[\s\S]*<\/button>$/);
	// implicitly closed <p> and <li>
	const p0 = find(doc, 'p');
	assert.equal(SAMPLE.slice(p0.start, p0.end).trim(), '<p>Create something great.');
	assert.equal(find(doc, 'li', 1).parent, find(doc, 'ul').id);
	assert.equal(find(doc, 'img').attrs.find((a) => a.name === 'alt').value, 'hero');
});

test('setStyleProperty updates only the style attribute', () => {
	const doc = h.parseHtml(SAMPLE);
	const id = find(doc, 'button').id;
	const out = h.applyPatches(SAMPLE, h.setStyleProperty(doc, id, 'border-radius', '999px'));
	assert.ok(out.includes('style="width: auto; border-radius: 999px"'));
	assert.equal(out.replace('999px', '8px'), SAMPLE);

	const out2 = h.applyPatches(SAMPLE, h.setStyleProperty(doc, id, 'background-color', '#D43E45'));
	assert.ok(out2.includes('style="width: auto; border-radius: 8px; background-color: #D43E45"'));

	const removed = h.applyPatches(SAMPLE, h.setStyleProperty(doc, id, 'width', ''));
	assert.ok(removed.includes('style="border-radius: 8px"'));
});

test('setStyleProperty adds a style attribute when missing and escapes quotes', () => {
	const doc = h.parseHtml(SAMPLE);
	const id = find(doc, 'h1').id;
	const out = h.applyPatches(SAMPLE, h.setStyleProperty(doc, id, 'font-family', '"Noto Sans", sans-serif'));
	assert.ok(out.includes('<h1 style="font-family: &quot;Noto Sans&quot;, sans-serif">My Application</h1>'));
	// round trip: edit again on the patched text keeps one declaration
	const doc2 = h.parseHtml(out);
	const out2 = h.applyPatches(out, h.setStyleProperty(doc2, id, 'font-family', 'serif'));
	assert.ok(out2.includes('<h1 style="font-family: serif">'));
	assert.throws(() => h.setStyleProperty(doc, id, 'color;x', 'red'), h.HtmlPatchError);
});

test('setTextContent keeps surrounding whitespace and escapes HTML', () => {
	const doc = h.parseHtml(SAMPLE);
	const id = find(doc, 'button').id;
	const out = h.applyPatches(SAMPLE, h.setTextContent(doc, id, 'Start <now> & go'));
	assert.ok(out.includes('border-radius: 8px">\n      Start &lt;now&gt; &amp; go\n    </button>'));
	assert.throws(() => h.setTextContent(doc, find(doc, 'header').id, 'x'), /子要素/);
	assert.throws(() => h.setTextContent(doc, find(doc, 'img').id, 'x'), h.HtmlPatchError);
});

test('setAttribute adds, replaces, quotes unquoted values and removes', () => {
	const doc = h.parseHtml(SAMPLE);
	const img = find(doc, 'img').id;
	let out = h.applyPatches(SAMPLE, h.setAttribute(doc, img, 'alt', 'Hero "image"'));
	assert.ok(out.includes('<img src="a.png" alt="Hero &quot;image&quot;">'));
	out = h.applyPatches(SAMPLE, h.setAttribute(doc, img, 'alt', null));
	assert.ok(out.includes('<img src="a.png">'));
	out = h.applyPatches(SAMPLE, h.setAttribute(doc, find(doc, 'main').id, 'id', 'content'));
	assert.ok(out.includes('<main id="content">'));
});

test('replaceOuterHtml swaps exactly one element', () => {
	const doc = h.parseHtml(SAMPLE);
	const id = find(doc, 'header').id;
	const out = h.applyPatches(SAMPLE, h.replaceOuterHtml(doc, id, '<header class="top"><h1>New</h1></header>'));
	assert.equal(out, SAMPLE.replace('<h1>My Application</h1>', '<h1>New</h1>'));
	assert.equal(h.outerHtml(doc, id), '<header class="top"><h1>My Application</h1></header>');
});

test('instrumentForPreview tags every element without touching scripts or css', () => {
	const doc = h.parseHtml(SAMPLE);
	const html = h.instrumentForPreview(doc, { runScripts: true });
	const again = h.parseHtml(html);
	assert.equal(again.nodes.length, doc.nodes.length);
	again.nodes.forEach((n, i) => assert.equal(n.attrs.find((a) => a.name === h.ID_ATTR).value, String(i)));
	assert.ok(html.includes(`if (a < b && "</div>") { console.log('<p>'); }`));

	const noScripts = h.instrumentForPreview(h.parseHtml('<div onclick="x()">a</div><script>evil()</script>'), { runScripts: false });
	assert.ok(!noScripts.includes('evil()'));
	assert.ok(!/\sonclick=/.test(noScripts));
});

test('layers and element info', () => {
	const doc = h.parseHtml(SAMPLE);
	const layers = h.buildLayers(doc);
	assert.equal(layers.length, 1);
	assert.equal(layers[0].tag, 'body');
	assert.deepEqual(layers[0].children.map((c) => c.tag), ['header', 'main', 'footer']);
	const info = h.elementInfo(doc, find(doc, 'button').id);
	assert.equal(info.text, 'Get Started');
	assert.deepEqual(info.inlineStyle, { width: 'auto', 'border-radius': '8px' });
	assert.deepEqual(info.path.map((p) => p.tag), ['html', 'body', 'main', 'button']);
	assert.equal(h.elementInfo(doc, find(doc, 'footer').id).text, '© 2026');
});

test('tolerates broken markup', () => {
	for (const src of ['<div', '<div class="x', '<p>a</div></span>', '</x><a href=foo>b', '<!-- open', '<script>never closed']) {
		const doc = h.parseHtml(src);
		for (const n of doc.nodes) { assert.ok(n.end <= src.length && n.start < n.end || n.end === src.length); }
	}
});
