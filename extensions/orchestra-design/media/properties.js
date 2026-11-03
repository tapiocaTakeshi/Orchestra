/*---------------------------------------------------------------------------------------------
 *  Copyright 2025 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------------*/
// @ts-check

// Properties: 選択要素の文字・色・サイズ・余白などを編集する。
// 値は DESIGN.html の style 属性 (インライン) に書き込み、空にするとそのプロパティを外す。
// 入力欄の薄い文字 (placeholder) は、ブラウザが実際に計算した値 (クラスや <style> 由来を含む)。
(function () {
	'use strict';
	const OD = /** @type {any} */ (window).OD = /** @type {any} */ (window).OD || {};

	/** @typedef {{ prop: string, label: string, kind?: 'color' | 'select', options?: string[] }} Field */
	/** @type {Array<{ title: string, fields: Field[] }>} */
	const GROUPS = [
		{
			title: 'Layout', fields: [
				{ prop: 'width', label: 'Width' },
				{ prop: 'height', label: 'Height' },
				{ prop: 'padding', label: 'Padding' },
				{ prop: 'margin', label: 'Margin' },
				{ prop: 'display', label: 'Display', kind: 'select', options: ['', 'block', 'inline-block', 'inline', 'flex', 'inline-flex', 'grid', 'none'] },
				{ prop: 'gap', label: 'Gap' },
			],
		},
		{
			title: 'Text', fields: [
				{ prop: 'color', label: 'Color', kind: 'color' },
				{ prop: 'font-size', label: 'Size' },
				{ prop: 'font-weight', label: 'Weight', kind: 'select', options: ['', '300', '400', '500', '600', '700', '800'] },
				{ prop: 'line-height', label: 'Line height' },
				{ prop: 'text-align', label: 'Align', kind: 'select', options: ['', 'left', 'center', 'right', 'justify'] },
			],
		},
		{
			title: 'Fill & Border', fields: [
				{ prop: 'background-color', label: 'Fill', kind: 'color' },
				{ prop: 'border-radius', label: 'Radius' },
				{ prop: 'border', label: 'Border' },
				{ prop: 'opacity', label: 'Opacity' },
				{ prop: 'box-shadow', label: 'Shadow' },
			],
		},
	];
	const ATTRS_BY_TAG = { a: ['href'], img: ['src', 'alt'], button: ['type'], input: ['placeholder', 'value'] };

	/** rgb()/rgba() → #rrggbb (input[type=color] 用) @param {string} v */
	function toHex(v) {
		if (!v) { return ''; }
		if (/^#[0-9a-f]{6}$/i.test(v)) { return v.toLowerCase(); }
		if (/^#[0-9a-f]{3}$/i.test(v)) { return '#' + v.slice(1).split('').map((c) => c + c).join('').toLowerCase(); }
		const m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i.exec(v);
		if (!m) { return ''; }
		if (m[4] !== undefined && parseFloat(m[4]) === 0) { return ''; }
		return '#' + [m[1], m[2], m[3]].map((n) => Math.min(255, Number(n)).toString(16).padStart(2, '0')).join('');
	}

	class PropertiesPanel {
		/**
		 * @param {{
		 *   onStyle: (id: number, prop: string, value: string, commit: boolean) => void,
		 *   onText: (id: number, text: string) => void,
		 *   onAttr: (id: number, name: string, value: string | null) => void,
		 * }} handlers
		 */
		constructor(handlers) {
			this.body = /** @type {HTMLElement} */ (document.getElementById('od-props-body'));
			this.handlers = handlers;
			/** @type {any} */
			this.info = null;
			/** @type {Record<string, string>} */
			this.computed = {};
			/** @type {Map<string, HTMLInputElement | HTMLSelectElement>} */
			this.inputs = new Map();
		}

		/** @param {any} info */
		setInfo(info) {
			const sameElement = this.info && info && this.info.id === info.id;
			this.info = info;
			if (!sameElement) { this.computed = {}; }
			// 入力中の欄を作り直さないよう、同じ要素なら値だけ更新する
			if (sameElement && this.body.contains(document.activeElement)) { this.refreshValues(); return; }
			this.render();
		}

		/** @param {number} id @param {Record<string, string>} styles */
		setComputed(id, styles) {
			if (!this.info || this.info.id !== id) { return; }
			this.computed = styles || {};
			for (const [prop, input] of this.inputs) {
				if (input instanceof HTMLInputElement && input.type !== 'color') { input.placeholder = this.computed[prop] || ''; }
				const swatch = /** @type {HTMLInputElement | undefined} */ (this.body.querySelector('input[type=color][data-prop="' + prop + '"]') || undefined);
				if (swatch && !this.info.inlineStyle[prop]) { swatch.value = toHex(this.computed[prop]) || '#000000'; }
			}
		}

		refreshValues() {
			if (!this.info) { return; }
			for (const [prop, input] of this.inputs) {
				if (document.activeElement !== input) { input.value = this.info.inlineStyle[prop] || ''; }
			}
		}

		render() {
			this.body.textContent = '';
			this.inputs.clear();
			const info = this.info;
			if (!info) {
				const p = document.createElement('p');
				p.className = 'od-muted';
				p.textContent = 'キャンバスか Layers で要素を選択してください。ダブルクリックで文字を直接編集できます。';
				this.body.appendChild(p);
				return;
			}

			const head = document.createElement('div');
			head.className = 'od-props-head';
			head.textContent = '<' + info.tag + '>' + (info.attrs.id ? ' #' + info.attrs.id : '');
			this.body.appendChild(head);

			if (info.text !== undefined) {
				const sec = this.section('Content');
				const ta = document.createElement('textarea');
				ta.rows = 2;
				ta.value = info.text;
				ta.addEventListener('change', () => this.handlers.onText(info.id, ta.value));
				sec.appendChild(this.row('Text', ta));
			}

			for (const group of GROUPS) {
				const sec = this.section(group.title);
				for (const f of group.fields) { sec.appendChild(this.row(f.label, this.field(f))); }
			}

			const sec = this.section('Attributes');
			const names = ['id', 'class', ...(ATTRS_BY_TAG[/** @type {keyof typeof ATTRS_BY_TAG} */ (info.tag)] || [])];
			for (const name of names) {
				const input = document.createElement('input');
				input.type = 'text';
				input.value = info.attrs[name] || '';
				input.spellcheck = false;
				input.addEventListener('change', () => this.handlers.onAttr(info.id, name, input.value === '' ? null : input.value));
				sec.appendChild(this.row(name, input));
			}
		}

		/** @param {string} title */
		section(title) {
			const sec = document.createElement('div');
			sec.className = 'od-props-section';
			const h = document.createElement('div');
			h.className = 'od-props-section-title';
			h.textContent = title;
			sec.appendChild(h);
			this.body.appendChild(sec);
			return sec;
		}

		/** @param {string} label @param {HTMLElement} control */
		row(label, control) {
			const row = document.createElement('label');
			row.className = 'od-props-row';
			const l = document.createElement('span');
			l.textContent = label;
			row.append(l, control);
			return row;
		}

		/** @param {Field} f */
		field(f) {
			const info = this.info;
			const value = info.inlineStyle[f.prop] || '';
			if (f.kind === 'select') {
				const sel = document.createElement('select');
				for (const o of f.options || []) {
					const opt = document.createElement('option');
					opt.value = o;
					opt.textContent = o || '—';
					sel.appendChild(opt);
				}
				if (value && !(f.options || []).includes(value)) {
					const opt = document.createElement('option');
					opt.value = value;
					opt.textContent = value;
					sel.appendChild(opt);
				}
				sel.value = value;
				sel.addEventListener('change', () => this.handlers.onStyle(info.id, f.prop, sel.value, true));
				this.inputs.set(f.prop, sel);
				return sel;
			}
			const text = document.createElement('input');
			text.type = 'text';
			text.value = value;
			text.spellcheck = false;
			text.placeholder = this.computed[f.prop] || '';
			text.addEventListener('input', () => this.handlers.onStyle(info.id, f.prop, text.value, false));
			text.addEventListener('change', () => this.handlers.onStyle(info.id, f.prop, text.value, true));
			this.inputs.set(f.prop, text);
			if (f.kind !== 'color') { return text; }

			const wrap = document.createElement('span');
			wrap.className = 'od-color';
			const swatch = document.createElement('input');
			swatch.type = 'color';
			swatch.dataset.prop = f.prop;
			swatch.value = toHex(value) || toHex(this.computed[f.prop]) || '#000000';
			swatch.addEventListener('input', () => { text.value = swatch.value; this.handlers.onStyle(info.id, f.prop, swatch.value, false); });
			swatch.addEventListener('change', () => { text.value = swatch.value; this.handlers.onStyle(info.id, f.prop, swatch.value, true); });
			wrap.append(swatch, text);
			return wrap;
		}
	}

	OD.PropertiesPanel = PropertiesPanel;
	OD.toHex = toHex;
})();
