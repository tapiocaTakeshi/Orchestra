/*---------------------------------------------------------------------------------------------
 *  Copyright 2025 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------------*/
// @ts-check

// Canvas: デザイン HTML (このページ) を sandbox iframe に描画し、中のエージェント (agent.js) と通信する。
// iframe からのメッセージは信頼しない: 送り元が自分の iframe であることを確認し、
// 値は数値・文字列として扱うだけ (外側の文書に HTML として挿入しない)。
(function () {
	'use strict';
	const OD = /** @type {any} */ (window).OD = /** @type {any} */ (window).OD || {};

	const DEVICE_WIDTHS = { desktop: '', tablet: '768px', mobile: '390px' };

	class Canvas {
		/** @param {(msg: any) => void} onAgentMessage */
		constructor(onAgentMessage) {
			this.frame = /** @type {HTMLIFrameElement} */ (document.getElementById('od-frame'));
			this.wrap = /** @type {HTMLElement} */ (document.getElementById('od-canvas'));
			this.scroll = { x: 0, y: 0 };
			this.onAgentMessage = onAgentMessage;
			window.addEventListener('message', (e) => {
				if (e.source !== this.frame.contentWindow) { return; }
				const msg = e.data;
				if (!msg || msg.__od !== true || typeof msg.type !== 'string') { return; }
				if (msg.type === 'scroll') { this.scroll = { x: Number(msg.x) || 0, y: Number(msg.y) || 0 }; return; }
				this.onAgentMessage(msg);
			});
		}

		/** @param {string} html @param {{ keepScroll?: boolean }} [opts] */
		load(html, opts) {
			this.pendingScroll = opts && opts.keepScroll ? { ...this.scroll } : { x: 0, y: 0 };
			this.frame.srcdoc = html;
		}

		/** エージェントの ready を受けたときに呼ぶ */
		restoreScroll() {
			if (this.pendingScroll && (this.pendingScroll.x || this.pendingScroll.y)) {
				this.post({ type: 'scrollTo', ...this.pendingScroll });
			}
			this.pendingScroll = undefined;
		}

		/** @param {Record<string, unknown>} msg */
		post(msg) {
			const win = this.frame.contentWindow;
			// opaque origin の iframe なので targetOrigin は '*' しか使えない (秘密情報は送らない)
			if (win) { win.postMessage(Object.assign({ __odHost: true }, msg), '*'); }
		}

		/** @param {'desktop' | 'tablet' | 'mobile'} device */
		setDevice(device) {
			const w = DEVICE_WIDTHS[device] || '';
			this.wrap.classList.toggle('framed', !!w);
			this.frame.style.width = w || '100%';
		}
	}

	OD.Canvas = Canvas;
})();
