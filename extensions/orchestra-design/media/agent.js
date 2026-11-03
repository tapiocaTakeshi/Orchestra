/*---------------------------------------------------------------------------------------------
 *  Copyright 2025 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------------*/
// @ts-check

// プレビュー iframe (sandbox="allow-scripts", opaque origin) の中で動く選択用エージェント。
// DESIGN.html と同じ権限しか持たず、親 (Design 画面) とは postMessage だけでやり取りする。
// VS Code API や拡張機能の権限には触れられない。
(function () {
	'use strict';
	const ATTR = '__OD_ID_ATTR__';
	/** @type {'design' | 'preview'} */
	let mode = 'design';
	/** @type {Element | null} */
	let selected = null;
	/** @type {Element | null} */
	let hovered = null;
	/** @type {HTMLElement | null} */
	let editing = null;
	let editingOriginal = '';

	const COMPUTED_PROPS = [
		'display', 'width', 'height', 'padding', 'margin', 'gap',
		'color', 'font-size', 'font-weight', 'font-family', 'line-height', 'text-align',
		'background-color', 'border-radius', 'border', 'opacity', 'box-shadow',
	];

	/** @param {Record<string, unknown>} msg */
	const send = (msg) => parent.postMessage(Object.assign({ __od: true }, msg), '*');

	/** @param {EventTarget | null} target */
	function idElement(target) {
		const el = target instanceof Element ? target : (target instanceof Node ? target.parentElement : null);
		return el ? el.closest('[' + ATTR + ']') : null;
	}
	/** @param {number} id */
	const byId = (id) => document.querySelector('[' + ATTR + '="' + Number(id) + '"]');
	/** @param {Element | null} el */
	const idOf = (el) => (el ? Number(el.getAttribute(ATTR)) : null);

	// ---- ハイライト (shadow DOM に隔離してページの CSS の影響を受けないようにする) ----
	/** @type {HTMLElement | null} */
	let host = null;
	/** @type {HTMLElement[]} */
	let boxes = [];
	function ensureOverlay() {
		if (host && host.isConnected) { return; }
		host = document.createElement('od-overlay');
		host.setAttribute('style', 'position:fixed!important;inset:0!important;pointer-events:none!important;z-index:2147483647!important;display:block!important;margin:0!important;padding:0!important;border:0!important;background:none!important;');
		const root = host.attachShadow({ mode: 'closed' });
		const style = document.createElement('style');
		style.textContent = '.b{position:fixed;box-sizing:border-box;pointer-events:none;display:none}'
			+ '.h{outline:1px dashed #3b82f6;background:rgba(59,130,246,.06)}'
			+ '.s{outline:2px solid #D43E45}'
			+ '.l{position:fixed;display:none;background:#D43E45;color:#fff;font:11px/16px system-ui,sans-serif;padding:0 6px;border-radius:3px;white-space:nowrap;pointer-events:none}';
		root.appendChild(style);
		boxes = ['b h', 'b s', 'l'].map((cls) => {
			const d = document.createElement('div');
			d.className = cls;
			root.appendChild(d);
			return d;
		});
		(document.body || document.documentElement).appendChild(host);
	}
	/** @param {HTMLElement} box @param {Element | null} el */
	function place(box, el) {
		if (!el || !el.isConnected || mode !== 'design') { box.style.display = 'none'; return; }
		const r = el.getBoundingClientRect();
		box.style.display = 'block';
		box.style.left = r.left + 'px';
		box.style.top = r.top + 'px';
		box.style.width = r.width + 'px';
		box.style.height = r.height + 'px';
	}
	function redraw() {
		ensureOverlay();
		const [hoverBox, selBox, label] = boxes;
		place(hoverBox, hovered && hovered !== selected ? hovered : null);
		place(selBox, selected);
		if (selected && selected.isConnected && mode === 'design') {
			const r = selected.getBoundingClientRect();
			label.textContent = selected.tagName.toLowerCase() + '  ' + Math.round(r.width) + ' × ' + Math.round(r.height);
			label.style.display = 'block';
			label.style.left = Math.max(0, r.left) + 'px';
			label.style.top = (r.top > 18 ? r.top - 18 : r.bottom + 2) + 'px';
		} else {
			label.style.display = 'none';
		}
	}
	let raf = 0;
	const scheduleRedraw = () => { if (!raf) { raf = requestAnimationFrame(() => { raf = 0; redraw(); }); } };

	function sendComputed() {
		if (!selected) { return; }
		const cs = getComputedStyle(selected);
		/** @type {Record<string, string>} */
		const styles = {};
		for (const p of COMPUTED_PROPS) { styles[p] = cs.getPropertyValue(p); }
		const r = selected.getBoundingClientRect();
		send({ type: 'computed', id: idOf(selected), styles, rect: { width: r.width, height: r.height } });
	}

	// ---- 入力 (Design モードではページのクリック動作を止めて選択に使う) ----
	/** @param {Event} e */
	function swallow(e) {
		if (mode !== 'design') { return false; }
		if (editing && e.target instanceof Node && editing.contains(e.target)) { return false; }
		e.preventDefault();
		e.stopPropagation();
		e.stopImmediatePropagation();
		return true;
	}
	window.addEventListener('click', (e) => {
		if (!swallow(e)) { return; }
		if (editing) { finishEdit(true); }
		const el = idElement(e.target);
		if (el) { send({ type: 'select', id: idOf(el) }); }
	}, true);
	window.addEventListener('dblclick', (e) => {
		if (!swallow(e)) { return; }
		const el = idElement(e.target);
		if (el) { send({ type: 'dblclick', id: idOf(el) }); }
	}, true);
	for (const type of ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'auxclick', 'submit', 'contextmenu']) {
		window.addEventListener(type, swallow, true);
	}
	window.addEventListener('mousemove', (e) => {
		if (mode !== 'design') { return; }
		const el = idElement(e.target);
		if (el !== hovered) {
			hovered = el;
			send({ type: 'hover', id: idOf(el) });
			scheduleRedraw();
		}
	}, true);
	document.addEventListener('mouseleave', () => { hovered = null; send({ type: 'hover', id: null }); scheduleRedraw(); });
	window.addEventListener('scroll', () => {
		scheduleRedraw();
		send({ type: 'scroll', x: window.scrollX, y: window.scrollY });
	}, true);
	window.addEventListener('resize', scheduleRedraw);

	window.addEventListener('keydown', (e) => {
		if (editing) {
			if (e.key === 'Escape') { e.preventDefault(); finishEdit(false); }
			else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); finishEdit(true); }
			return;
		}
		const mod = e.ctrlKey || e.metaKey;
		const key = e.key.toLowerCase();
		if (mod && key === 'z') { e.preventDefault(); send({ type: 'key', key: e.shiftKey ? 'redo' : 'undo' }); }
		else if (mod && key === 'y') { e.preventDefault(); send({ type: 'key', key: 'redo' }); }
		else if (mod && key === 's') { e.preventDefault(); send({ type: 'key', key: 'save' }); }
		else if (key === 'escape' && mode === 'design') { send({ type: 'select', id: null }); }
	}, true);

	// ---- 文字の直接編集 ----
	/** @param {HTMLElement} el */
	function beginEdit(el) {
		if (editing) { finishEdit(true); }
		editing = el;
		editingOriginal = el.textContent || '';
		try { el.contentEditable = 'plaintext-only'; } catch { el.contentEditable = 'true'; }
		if (el.contentEditable !== 'plaintext-only') { el.contentEditable = 'true'; }
		el.focus();
		const range = document.createRange();
		range.selectNodeContents(el);
		const sel = getSelection();
		if (sel) { sel.removeAllRanges(); sel.addRange(range); }
		el.addEventListener('blur', onEditBlur);
	}
	function onEditBlur() { finishEdit(true); }
	/** @param {boolean} commit */
	function finishEdit(commit) {
		const el = editing;
		if (!el) { return; }
		editing = null;
		el.removeEventListener('blur', onEditBlur);
		el.removeAttribute('contenteditable');
		const text = (el.innerText || el.textContent || '').replace(/\n+$/, '');
		if (commit && text !== editingOriginal.trim() && text !== editingOriginal) {
			send({ type: 'textEdited', id: idOf(el), text });
		} else {
			el.textContent = editingOriginal;
			send({ type: 'textEditCancel', id: idOf(el) });
		}
		scheduleRedraw();
	}

	// ---- 親からの指示 ----
	window.addEventListener('message', (e) => {
		if (e.source !== parent) { return; }
		const msg = e.data;
		if (!msg || msg.__odHost !== true) { return; }
		switch (msg.type) {
			case 'mode':
				mode = msg.mode === 'preview' ? 'preview' : 'design';
				if (mode === 'preview') { hovered = null; if (editing) { finishEdit(true); } }
				scheduleRedraw();
				break;
			case 'select': {
				selected = msg.id === null ? null : byId(msg.id);
				if (selected && msg.scroll) { selected.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
				scheduleRedraw();
				sendComputed();
				break;
			}
			case 'hover':
				hovered = msg.id === null ? null : byId(msg.id);
				scheduleRedraw();
				break;
			case 'applyStyle': {
				const el = byId(msg.id);
				if (el instanceof HTMLElement || el instanceof SVGElement) {
					if (msg.value) { el.style.setProperty(String(msg.prop), String(msg.value)); }
					else { el.style.removeProperty(String(msg.prop)); }
				}
				scheduleRedraw();
				if (el === selected) { sendComputed(); }
				break;
			}
			case 'applyAttr': {
				const el = byId(msg.id);
				if (el && /^(id|class|href|src|alt|title)$/.test(String(msg.name))) {
					if (msg.value === null) { el.removeAttribute(msg.name); } else { el.setAttribute(msg.name, String(msg.value)); }
				}
				scheduleRedraw();
				break;
			}
			case 'setText': {
				const el = byId(msg.id);
				if (el && el.children.length === 0) { el.textContent = String(msg.text); }
				scheduleRedraw();
				if (el === selected) { sendComputed(); }
				break;
			}
			case 'beginTextEdit': {
				const el = byId(msg.id);
				if (el instanceof HTMLElement && el.children.length === 0) { beginEdit(el); }
				break;
			}
			case 'scrollTo':
				window.scrollTo(Number(msg.x) || 0, Number(msg.y) || 0);
				break;
		}
	});

	const ready = () => { ensureOverlay(); send({ type: 'ready' }); };
	if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', ready); } else { ready(); }
	window.addEventListener('load', scheduleRedraw);
})();
