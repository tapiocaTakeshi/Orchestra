/*---------------------------------------------------------------------------------------------
 *  Copyright 2025 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------------*/
// @ts-check

// Design 画面のまとめ役。拡張機能 (このページの HTML の TextDocument) と各パネルをつなぐ。
(function () {
	'use strict';
	const OD = /** @type {any} */ (window).OD;
	// @ts-ignore
	const vscode = acquireVsCodeApi();
	const $ = (/** @type {string} */ id) => /** @type {any} */ (document.getElementById(id));

	const saved = vscode.getState() || {};
	const state = {
		/** @type {'design' | 'preview'} */
		mode: saved.mode === 'preview' ? 'preview' : 'design',
		/** @type {'desktop' | 'tablet' | 'mobile'} */
		device: saved.device || 'desktop',
		/** @type {number | null} */
		selectedId: typeof saved.selectedId === 'number' ? saved.selectedId : null,
		/** @type {string[]} */
		tags: [],
		/** @type {any} */
		info: null,
		/** @type {number | null} */
		editingId: null,
		showingProposal: false,
		/** 右パネルの幅 (px)。null なら既定 */
		sideWidth: typeof saved.sideWidth === 'number' ? saved.sideWidth : null,
		/** Properties の高さ (右パネルに対する割合 0-1)。null なら既定 */
		propsRatio: typeof saved.propsRatio === 'number' ? saved.propsRatio : null,
		aiExpanded: saved.aiExpanded === true,
	};
	const persist = () => vscode.setState({
		mode: state.mode, device: state.device, selectedId: state.selectedId,
		sideWidth: state.sideWidth, propsRatio: state.propsRatio, aiExpanded: state.aiExpanded,
	});

	// ---- エラー表示 ----
	let errorTimer = 0;
	/** @param {string} message */
	function showError(message) {
		const el = $('od-error');
		el.textContent = message;
		el.hidden = false;
		clearTimeout(errorTimer);
		errorTimer = setTimeout(() => { el.hidden = true; }, 8000);
	}

	// ---- パネル ----
	const canvas = new OD.Canvas(onAgentMessage);
	const layers = new OD.LayersPanel({
		onSelect: (/** @type {number} */ id) => select(id, true),
		onHover: (/** @type {number | null} */ id) => canvas.post({ type: 'hover', id }),
	});
	const props = new OD.PropertiesPanel({
		onStyle: (/** @type {number} */ id, /** @type {string} */ prop, /** @type {string} */ value, /** @type {boolean} */ commit) => {
			canvas.post({ type: 'applyStyle', id, prop, value });
			if (commit) { vscode.postMessage({ type: 'edit', ops: [{ kind: 'style', id, prop, value }] }); }
		},
		onText: (/** @type {number} */ id, /** @type {string} */ text) => {
			canvas.post({ type: 'setText', id, text });
			vscode.postMessage({ type: 'edit', ops: [{ kind: 'text', id, text }] });
		},
		onAttr: (/** @type {number} */ id, /** @type {string} */ name, /** @type {string | null} */ value) => {
			canvas.post({ type: 'applyAttr', id, name, value });
			vscode.postMessage({ type: 'edit', ops: [{ kind: 'attr', id, name, value }] });
		},
	});
	const ai = new OD.AIDesigner({
		onRun: (/** @type {string} */ instruction) => vscode.postMessage({ type: 'ai', instruction, id: state.selectedId }),
		onCancel: () => vscode.postMessage({ type: 'aiCancel' }),
		onApply: (/** @type {number} */ proposalId) => vscode.postMessage({ type: 'aiApply', proposalId }),
		onDiscard: (/** @type {number} */ proposalId) => { endProposal(); vscode.postMessage({ type: 'aiDiscard', proposalId }); },
	});

	// ---- 選択 ----
	/** @param {number | null} id @param {boolean} [scroll] */
	function select(id, scroll) {
		if (id !== null && (typeof id !== 'number' || !state.tags[id])) { id = null; }
		state.selectedId = id;
		persist();
		layers.setSelected(id);
		canvas.post({ type: 'select', id, scroll: !!scroll });
		vscode.postMessage({ type: 'select', id });
		if (id === null) { setInfo(null); }
	}

	/** @param {any} info */
	function setInfo(info) {
		state.info = info;
		props.setInfo(info);
		ai.setScope(info ? '<' + info.tag + '>' + (info.attrs.id ? '#' + info.attrs.id : info.attrs.class ? '.' + info.attrs.class.split(/\s+/)[0] : '') : null);
		const bc = $('od-breadcrumb');
		bc.textContent = '';
		if (!info) { return; }
		info.path.forEach((/** @type {{id:number, tag:string}} */ p, /** @type {number} */ i) => {
			if (i) { bc.appendChild(document.createTextNode(' › ')); }
			const b = document.createElement('button');
			b.textContent = p.tag;
			b.className = p.id === info.id ? 'current' : '';
			b.addEventListener('click', () => select(p.id, true));
			bc.appendChild(b);
		});
	}

	// ---- iframe 内エージェントからのメッセージ ----
	/** @param {any} msg */
	function onAgentMessage(msg) {
		const id = typeof msg.id === 'number' && Number.isInteger(msg.id) ? msg.id : null;
		switch (msg.type) {
			case 'ready':
				canvas.post({ type: 'mode', mode: state.showingProposal ? 'preview' : state.mode });
				canvas.restoreScroll();
				if (!state.showingProposal && state.selectedId !== null) { canvas.post({ type: 'select', id: state.selectedId, scroll: false }); }
				break;
			case 'select':
				if (state.mode === 'design' && !state.showingProposal) { select(id); }
				break;
			case 'hover':
				layers.setHover(id);
				break;
			case 'computed':
				if (id !== null) { props.setComputed(id, msg.styles); }
				break;
			case 'dblclick':
				if (id === null || state.mode !== 'design' || state.showingProposal) { break; }
				if (state.selectedId !== id) { select(id); }
				// 文字を持つ末端の要素だけ直接編集できる (拡張機能側の elementInfo で判定)
				state.editingId = id;
				canvas.post({ type: 'beginTextEdit', id });
				break;
			case 'textEdited':
				if (id !== null && id === state.editingId && typeof msg.text === 'string') {
					state.editingId = null;
					vscode.postMessage({ type: 'edit', ops: [{ kind: 'text', id, text: msg.text }] });
				}
				break;
			case 'textEditCancel':
				state.editingId = null;
				break;
			case 'key':
				if (msg.key === 'undo' || msg.key === 'redo' || msg.key === 'save') { vscode.postMessage({ type: msg.key }); }
				break;
		}
	}

	// ---- 拡張機能からのメッセージ ----
	window.addEventListener('message', (e) => {
		if (e.source === canvas.frame.contentWindow) { return; }
		const msg = e.data;
		if (!msg || typeof msg.type !== 'string') { return; }
		switch (msg.type) {
			case 'document': {
				$('od-file').textContent = msg.fileName;
				$('od-dirty').hidden = !msg.isDirty;
				$('od-run-scripts').checked = !!msg.runScripts;
				const prevTag = state.selectedId !== null ? state.tags[state.selectedId] : undefined;
				state.tags = msg.tags;
				layers.render(msg.layers);
				// 構造が変わって同じ番号が別の要素を指すようになったら選択を外す
				if (state.selectedId !== null && (state.tags[state.selectedId] === undefined || (prevTag !== undefined && state.tags[state.selectedId] !== prevTag))) { state.selectedId = null; setInfo(null); }
				layers.setSelected(state.selectedId);
				if (msg.reload && !state.showingProposal) { canvas.load(msg.html, { keepScroll: true }); }
				if (state.selectedId !== null) { vscode.postMessage({ type: 'select', id: state.selectedId }); }
				break;
			}
			case 'pages': {
				// 同じデザインフォルダのページ一覧 (index.html が先頭)。選ぶとそのページを開く
				const sel = $('od-pages');
				sel.textContent = '';
				for (const name of msg.pages) {
					const opt = document.createElement('option');
					opt.value = name;
					opt.textContent = name.replace(/\.html?$/i, '');
					sel.appendChild(opt);
				}
				sel.value = msg.current;
				sel.hidden = !msg.folder;
				$('od-new-page').hidden = !msg.folder;
				$('od-file').hidden = !!msg.folder;
				break;
			}
			case 'elementInfo':
				if (!msg.info || msg.info.id === state.selectedId) { setInfo(msg.info); }
				break;
			case 'saved':
				$('od-dirty').hidden = true;
				break;
			case 'error':
				showError(msg.message);
				break;
			case 'aiStatus':
				ai.setBusy(!!msg.busy, msg.message);
				break;
			case 'aiProposal':
				state.showingProposal = true;
				ai.showProposal(msg);
				$('od-banner').textContent = 'AI 提案のプレビュー — 右の「適用」でこのページの HTML に書き込みます';
				$('od-banner').hidden = false;
				canvas.load(msg.previewHtml, { keepScroll: true });
				break;
			case 'aiApplied':
				endProposal();
				ai.input.value = '';
				ai.grow();
				if (typeof msg.elementId === 'number') { state.selectedId = msg.elementId; }
				break;
		}
	});

	function endProposal() {
		state.showingProposal = false;
		ai.clearProposal();
		$('od-banner').hidden = true;
	}

	// ---- ツールバー ----
	/** @param {'design' | 'preview'} mode */
	function setMode(mode) {
		state.mode = mode;
		persist();
		document.body.classList.toggle('mode-preview', mode === 'preview');
		for (const b of document.querySelectorAll('.od-tabs button')) {
			b.classList.toggle('active', /** @type {HTMLElement} */ (b).dataset.mode === mode);
		}
		canvas.post({ type: 'mode', mode: state.showingProposal ? 'preview' : mode });
	}
	for (const b of document.querySelectorAll('.od-tabs button')) {
		b.addEventListener('click', () => {
			const mode = /** @type {HTMLElement} */ (b).dataset.mode;
			if (mode === 'code') { vscode.postMessage({ type: 'openCode' }); return; }
			setMode(mode === 'preview' ? 'preview' : 'design');
		});
	}
	/** @param {'desktop' | 'tablet' | 'mobile'} device */
	function setDevice(device) {
		state.device = device;
		persist();
		canvas.setDevice(device);
		for (const b of document.querySelectorAll('.od-devices button')) {
			b.classList.toggle('active', /** @type {HTMLElement} */ (b).dataset.device === device);
		}
	}
	for (const b of document.querySelectorAll('.od-devices button')) {
		b.addEventListener('click', () => setDevice(/** @type {any} */ (/** @type {HTMLElement} */ (b).dataset.device)));
	}
	$('od-pages').addEventListener('change', (/** @type {Event} */ e) => {
		const name = /** @type {HTMLSelectElement} */ (e.target).value;
		vscode.postMessage({ type: 'openPage', name });
	});
	$('od-new-page').addEventListener('click', () => vscode.postMessage({ type: 'newPage' }));
	$('od-undo').addEventListener('click', () => vscode.postMessage({ type: 'undo' }));
	$('od-redo').addEventListener('click', () => vscode.postMessage({ type: 'redo' }));
	$('od-save').addEventListener('click', () => vscode.postMessage({ type: 'save' }));
	$('od-run-scripts').addEventListener('change', (/** @type {Event} */ e) => {
		vscode.postMessage({ type: 'setRunScripts', value: /** @type {HTMLInputElement} */ (e.target).checked });
	});
	document.addEventListener('keydown', (e) => {
		const t = /** @type {HTMLElement} */ (e.target);
		if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) { return; }
		if (e.key === 'Escape' && state.selectedId !== null) { select(null); }
	});

	// ---- 右パネル (Properties / AI Designer) の大きさ ----
	const side = $('od-side');
	function applySideLayout() {
		document.documentElement.style.setProperty('--od-side-width', state.sideWidth ? state.sideWidth + 'px' : '');
		document.documentElement.style.setProperty('--od-props-height', state.propsRatio !== null ? (state.propsRatio * 100).toFixed(1) + '%' : '');
		side.classList.toggle('ai-expanded', state.aiExpanded);
		$('od-ai-expand').textContent = state.aiExpanded ? '⤡' : '⤢';
		$('od-ai-expand').title = state.aiExpanded ? 'Properties も表示する' : 'AI Designer を右側いっぱいに広げる';
	}
	/** つまみをドラッグしている間 onMove を呼ぶ。iframe がマウスを奪わないよう body に印を付ける */
	function dragHandle(/** @type {HTMLElement} */ handle, /** @type {(e: PointerEvent) => void} */ onMove) {
		handle.addEventListener('pointerdown', (e) => {
			e.preventDefault();
			handle.setPointerCapture(e.pointerId);
			handle.classList.add('dragging');
			document.body.classList.add('od-resizing');
			const move = (/** @type {PointerEvent} */ ev) => onMove(ev);
			const up = () => {
				handle.removeEventListener('pointermove', move);
				handle.removeEventListener('pointerup', up);
				handle.removeEventListener('pointercancel', up);
				handle.classList.remove('dragging');
				document.body.classList.remove('od-resizing');
				persist();
			};
			handle.addEventListener('pointermove', move);
			handle.addEventListener('pointerup', up);
			handle.addEventListener('pointercancel', up);
		});
	}
	dragHandle($('od-side-resizer'), (e) => {
		const max = Math.round(window.innerWidth * 0.75);
		state.sideWidth = Math.max(260, Math.min(max, Math.round(window.innerWidth - e.clientX)));
		applySideLayout();
	});
	dragHandle($('od-split'), (e) => {
		const r = side.getBoundingClientRect();
		const minPx = 60, minAi = 140;
		const y = Math.max(minPx, Math.min(r.height - minAi, e.clientY - r.top));
		state.propsRatio = r.height > 0 ? y / r.height : null;
		applySideLayout();
	});
	$('od-side-resizer').addEventListener('dblclick', () => { state.sideWidth = null; applySideLayout(); persist(); });
	$('od-split').addEventListener('dblclick', () => { state.propsRatio = null; applySideLayout(); persist(); });
	$('od-ai-expand').addEventListener('click', () => {
		state.aiExpanded = !state.aiExpanded;
		applySideLayout();
		persist();
		ai.input.focus();
	});
	applySideLayout();

	setMode(state.mode);
	setDevice(state.device);
	ai.setScope(null);
	vscode.postMessage({ type: 'ready' });
})();
