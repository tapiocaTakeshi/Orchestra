/*---------------------------------------------------------------------------------------------
 *  Copyright 2025 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------------*/
// @ts-check

// AI Designer: 選択要素 (未選択ならページ全体) の修正を Division の Designer ロールに依頼する。
// 返ってきた案は「変更前 / 変更後」とキャンバスのプレビューで確認し、適用したときだけ書き込む。
(function () {
	'use strict';
	const OD = /** @type {any} */ (window).OD = /** @type {any} */ (window).OD || {};
	const $ = (/** @type {string} */ id) => /** @type {any} */ (document.getElementById(id));

	class AIDesigner {
		/**
		 * @param {{
		 *   onRun: (instruction: string) => void,
		 *   onCancel: () => void,
		 *   onApply: (proposalId: number) => void,
		 *   onDiscard: (proposalId: number) => void,
		 * }} handlers
		 */
		constructor(handlers) {
			this.handlers = handlers;
			this.input = /** @type {HTMLTextAreaElement} */ ($('od-ai-input'));
			this.runBtn = $('od-ai-run');
			this.cancelBtn = $('od-ai-cancel');
			this.status = $('od-ai-status');
			this.scope = $('od-ai-scope');
			this.proposalBox = $('od-ai-proposal');
			/** @type {number | null} */
			this.proposalId = null;
			this.busy = false;

			const run = () => {
				const text = this.input.value.trim();
				if (!text || this.busy) { return; }
				this.handlers.onRun(text);
			};
			this.runBtn.addEventListener('click', run);
			this.input.addEventListener('keydown', (/** @type {KeyboardEvent} */ e) => {
				if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run(); }
			});
			this.cancelBtn.addEventListener('click', () => this.handlers.onCancel());
			// 入力に合わせて高さを伸ばす (上限は CSS の max-height)
			const grow = () => {
				this.input.style.height = 'auto';
				this.input.style.height = Math.max(110, this.input.scrollHeight + 2) + 'px';
			};
			this.input.addEventListener('input', grow);
			this.grow = grow;
			$('od-ai-apply').addEventListener('click', () => { if (this.proposalId !== null) { this.handlers.onApply(this.proposalId); } });
			$('od-ai-discard').addEventListener('click', () => { if (this.proposalId !== null) { this.handlers.onDiscard(this.proposalId); } });
		}

		/** @param {string | null} label */
		setScope(label) {
			this.scope.textContent = label ? '対象: ' + label : '対象: ページ全体 (要素を選ぶとその要素だけを修正します)';
		}

		/** @param {boolean} busy @param {string} [message] */
		setBusy(busy, message) {
			this.busy = busy;
			this.runBtn.disabled = busy;
			this.cancelBtn.hidden = !busy;
			this.status.textContent = busy ? (message || '') : '';
		}

		/** @param {any} p */
		showProposal(p) {
			this.proposalId = p.proposalId;
			$('od-ai-note').textContent = (p.note ? p.note + ' ' : '') + '(' + p.model + ')';
			$('od-ai-before').textContent = p.before;
			$('od-ai-after').textContent = p.after;
			this.proposalBox.hidden = false;
		}

		clearProposal() {
			this.proposalId = null;
			this.proposalBox.hidden = true;
		}
	}

	OD.AIDesigner = AIDesigner;
})();
