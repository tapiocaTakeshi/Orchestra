/*---------------------------------------------------------------------------------------------
 *  Copyright 2025 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------------*/
// @ts-check

// Layers: DESIGN.html の要素ツリー (body 以下)。クリックで選択、ホバーでキャンバスを強調。
(function () {
	'use strict';
	const OD = /** @type {any} */ (window).OD = /** @type {any} */ (window).OD || {};

	class LayersPanel {
		/** @param {{ onSelect: (id: number) => void, onHover: (id: number | null) => void }} handlers */
		constructor(handlers) {
			this.root = /** @type {HTMLElement} */ (document.getElementById('od-layers-tree'));
			this.handlers = handlers;
			/** @type {Set<number>} */
			this.collapsed = new Set();
			/** @type {Map<number, HTMLElement>} */
			this.rows = new Map();
			/** @type {Map<number, number>} */
			this.parentOf = new Map();
			/** @type {number | null} */
			this.selectedId = null;
			this.root.addEventListener('mouseleave', () => this.handlers.onHover(null));
		}

		/** @param {any[]} layers */
		render(layers) {
			this.root.textContent = '';
			this.rows.clear();
			this.parentOf.clear();
			const frag = document.createDocumentFragment();
			/** @param {any} node @param {number} depth @param {number} parent */
			const walk = (node, depth, parent) => {
				if (parent >= 0) { this.parentOf.set(node.id, parent); }
				const row = document.createElement('div');
				row.className = 'od-tree-row';
				row.setAttribute('role', 'treeitem');
				row.style.paddingLeft = (6 + depth * 12) + 'px';
				const hasChildren = node.children && node.children.length > 0;
				const twisty = document.createElement('span');
				twisty.className = 'od-twisty';
				twisty.textContent = hasChildren ? (this.collapsed.has(node.id) ? '▸' : '▾') : '';
				twisty.addEventListener('click', (e) => {
					e.stopPropagation();
					if (this.collapsed.has(node.id)) { this.collapsed.delete(node.id); } else { this.collapsed.add(node.id); }
					this.render(layers);
				});
				const label = document.createElement('span');
				label.className = 'od-tree-label';
				label.textContent = node.label;
				label.title = node.label;
				row.append(twisty, label);
				row.addEventListener('click', () => this.handlers.onSelect(node.id));
				row.addEventListener('mouseenter', () => this.handlers.onHover(node.id));
				if (node.id === this.selectedId) { row.classList.add('selected'); }
				this.rows.set(node.id, row);
				frag.appendChild(row);
				if (hasChildren && !this.collapsed.has(node.id)) {
					for (const c of node.children) { walk(c, depth + 1, node.id); }
				} else if (hasChildren) {
					// 折りたたまれた子孫も親子関係だけは覚えておく (選択時に展開するため)
					/** @param {any} n */
					const mark = (n) => { for (const c of n.children || []) { this.parentOf.set(c.id, n.id); mark(c); } };
					mark(node);
				}
			};
			for (const n of layers) { walk(n, 0, -1); }
			this.root.appendChild(frag);
			this.layers = layers;
		}

		/** @param {number | null} id */
		setSelected(id) {
			this.selectedId = id;
			// 折りたたまれた祖先を開く
			let needsRender = false;
			for (let p = id === null ? undefined : this.parentOf.get(id); p !== undefined; p = this.parentOf.get(p)) {
				if (this.collapsed.delete(p)) { needsRender = true; }
			}
			if (needsRender && this.layers) { this.render(this.layers); }
			for (const [rid, row] of this.rows) { row.classList.toggle('selected', rid === id); }
			const row = id === null ? undefined : this.rows.get(id);
			if (row) { row.scrollIntoView({ block: 'nearest' }); }
		}

		/** @param {number | null} id */
		setHover(id) {
			for (const [rid, row] of this.rows) { row.classList.toggle('hover', rid === id); }
		}
	}

	OD.LayersPanel = LayersPanel;
})();
