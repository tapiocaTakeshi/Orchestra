// Story-level constants and graphics shared by several scenes (see storyboard.json).
// Anything two scenes must agree on — positions, demo content, token looks — lives here.
(() => {
	const { u, ease, c } = ORC;
	const { h, svg } = u;

	ORC.k = {
		GOAL: 'シンプルな TODO アプリを作り、動く状態にする',
		COND1: 'タスクを追加・完了・削除できる',
		COND2: 'npm test が成功する',
		REQUEST: 'シンプルな TODO アプリを作って動かして',
		TASKS: [
			{ n: 1, role: 'search', badge: '検索', title: 'TODO アプリの基本機能を調べる' },
			{ n: 2, role: 'planner', badge: 'プランナー', title: '画面とデータの構成を決める' },
			{ n: 3, role: 'coder', badge: 'コーダー', title: 'TODO アプリを実装し、テストを書く' },
			{ n: 4, role: 'reviewer', badge: 'レビュー', title: '最終レビュー' },
		],
		PREP: { title: 'ファイル読み込み', badge: '準備・AI なし' },
		CMD: { title: 'コマンドの実行（1 件）', badge: 'コマンド', command: '$ npm test' },
		// 01's 「✕ テスト失敗」 and 05's command result land on exactly this spot.
		FAIL_POS: { x: 875, baseline: 250, size: 29 },
		TOKENS: [{ x: 144, y: 560 }, { x: 144, y: 650 }],
		// Where 02 leaves its gold point and 03's robot icon sits.
		P_ROBOT: { x: 1680, y: 172 },
		COLORS: { gold: '#c6a769', goldHi: '#e3cf9f', goldLo: '#8a7449', garnet: '#8f1d2c', onGarnet: '#fbf6ee', ink: '#0e0c0b', ivory: '#f7f2ea', text: '#ece6de', muted: '#877c72', rose: '#d27a82' },
	};

	// Text whose alphabetic baseline sits exactly at `baseline` (y px in the 1920x1080
	// frame). align: 'left' (x is the left edge), 'center' or 'right' (x is that edge).
	// gold: substrings rendered with the gold gradient. Returns {el, chars}.
	function textAt(text, { x = 120, baseline, size = 72, weight = 900, color = '#f7f2ea', family = 'var(--jp)', align = 'left', gold = [], red = [], letterSpacing = '-.005em', shadow = true, parent } = {}) {
		const el = h('div', { class: 'abs nowrap', style: { left: '0', top: '0', font: `${weight} ${size}px/1 ${family}`, color, letterSpacing, textShadow: shadow ? '0 4px 24px rgba(0,0,0,.6)' : 'none' } });
		const chars = u.chars(el, text);
		// Mark characters inside highlighted substrings.
		const mark = (list, cls) => {
			for (const word of list) {
				const start = Array.from(text).join('').indexOf(word);
				if (start < 0) { continue; }
				const from = Array.from(text.slice(0, start)).length;
				for (let i = from; i < from + Array.from(word).length; i++) { chars[i].classList.add(cls); chars[i].style.textShadow = 'none'; }
			}
		};
		mark(gold, 'gold-grad');
		mark(red, 'red-grad');
		const probe = h('span', { style: { display: 'inline-block', width: '0', height: '0', verticalAlign: 'baseline' } });
		el.appendChild(probe);
		// Measure where layout is live: an unattached parent would report zero sizes.
		const measureIn = parent && parent.isConnected ? parent : document.getElementById('stage');
		measureIn.appendChild(el);
		const base = probe.offsetTop;
		const w = el.offsetWidth;
		probe.remove();
		if (parent) { parent.appendChild(el); } else { el.remove(); }
		const left = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
		el.style.left = `${left}px`;
		el.style.top = `${baseline - base}px`;
		return { el, chars, width: w };
	}

	// Two-line "Caption M": left at x 120, baselines 240 / 330 by default.
	function captionLines(lines, { x = 120, baselines = [240, 330], size = 72, gold = [], red = [], align = 'left', color = '#f7f2ea', weight = 900 } = {}) {
		const out = lines.map((line, i) => textAt(line, { x, baseline: baselines[i], size, gold, red, align, color, weight }));
		return { els: out.map(o => o.el), chars: out.flatMap(o => o.chars), lines: out };
	}

	function footnote(text, { x = 1800, baseline = 1040, align = 'right' } = {}) {
		return textAt(text, { x, baseline, size: 20, weight: 500, color: '#877c72', align, letterSpacing: '0', shadow: false });
	}

	// Goal token: a circle that is empty, met (gold ✓) or unmet (garnet ×), with a label.
	// set(state, k) — k is 0..1 progress of the transition into that state.
	function goalToken({ x, y, size = 48, label = '', labelSize = 34, mono = [] } = {}) {
		const K = ORC.k.COLORS;
		const el = h('div', { class: 'abs', style: { left: '0', top: '0' } });
		const disc = h('div', { class: 'abs', style: { left: `${x - size / 2}px`, top: `${y - size / 2}px`, width: `${size}px`, height: `${size}px`, borderRadius: '50%', boxSizing: 'border-box' } });
		const glyph = svg('svg', { viewBox: '0 0 24 24', width: size * .58, height: size * .58, fill: 'none', 'stroke-width': 3.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', style: { position: 'absolute', left: `${size * .21}px`, top: `${size * .21}px` } });
		const check = svg('path', { d: 'M20 6 9 17l-5-5', pathLength: 1, stroke: K.ink });
		const cross = svg('path', { d: 'M18 6 6 18M6 6l12 12', pathLength: 1, stroke: K.onGarnet });
		glyph.append(check, cross);
		disc.appendChild(glyph);
		el.appendChild(disc);
		let labelEl = null;
		if (label) {
			const t = textAt(label, { x: x + size / 2 + 22, baseline: y + labelSize * .36, size: labelSize, weight: 700, color: K.text, letterSpacing: '0', shadow: false });
			for (const word of mono) {
				const from = Array.from(label.slice(0, label.indexOf(word))).length;
				for (let i = from; i < from + Array.from(word).length; i++) { t.chars[i].style.fontFamily = 'var(--mono)'; t.chars[i].style.fontWeight = '600'; }
			}
			labelEl = t.el;
			el.appendChild(labelEl);
		}
		function set(state = 'empty', k = 1) {
			const e = ease.outCubic(u.clamp(k));
			disc.style.border = state === 'empty' ? `2px solid ${K.goldLo}` : 'none';
			disc.style.background = state === 'met' ? K.gold : state === 'unmet' ? K.garnet : 'transparent';
			disc.style.boxShadow = state === 'met' ? `0 0 ${18 * e}px rgba(198,167,105,.55)` : 'none';
			check.style.display = state === 'met' ? 'block' : 'none';
			cross.style.display = state === 'unmet' ? 'block' : 'none';
			check.setAttribute('stroke-dasharray', `${e} 1`);
			cross.setAttribute('stroke-dasharray', `${e} 1`);
		}
		set('empty');
		return { el, disc, label: labelEl, set };
	}

	let cometSeq = 0;
	// Gold comet (the baton): head + fading tail along a quadratic bezier.
	// draw(k, from, to, lift) — k 0..1 along the path; hidden outside (0, 1).
	function comet({ tail = 120, head = 12 } = {}) {
		const K = ORC.k.COLORS;
		const id = `cm${++cometSeq}`;
		const el = svg('svg', { width: 1920, height: 1080, viewBox: '0 0 1920 1080', style: { position: 'absolute', left: '0', top: '0', overflow: 'visible', pointerEvents: 'none' } });
		const grad = svg('linearGradient', { id, gradientUnits: 'userSpaceOnUse' }, svg('stop', { offset: 0, 'stop-color': K.goldHi, 'stop-opacity': 0 }), svg('stop', { offset: 1, 'stop-color': K.goldHi, 'stop-opacity': .95 }));
		const glow = svg('filter', { id: `${id}-g`, x: '-50%', y: '-50%', width: '200%', height: '200%' }, svg('feGaussianBlur', { stdDeviation: 4, result: 'b' }), svg('feMerge', {}, svg('feMergeNode', { in: 'b' }), svg('feMergeNode', { in: 'SourceGraphic' })));
		el.appendChild(svg('defs', {}, grad, glow));
		const path = svg('path', { fill: 'none', stroke: `url(#${id})`, 'stroke-width': head * .55, 'stroke-linecap': 'round', filter: `url(#${id}-g)` });
		const dot = svg('circle', { r: head / 2, fill: K.goldHi, filter: `url(#${id}-g)` });
		el.append(path, dot);
		const pt = (k, a, b, cp) => [(1 - k) ** 2 * a[0] + 2 * (1 - k) * k * cp[0] + k * k * b[0], (1 - k) ** 2 * a[1] + 2 * (1 - k) * k * cp[1] + k * k * b[1]];
		function draw(k, from, to, lift = 160) {
			const visible = k > 0 && k < 1;
			el.style.display = visible ? 'block' : 'none';
			if (!visible) { return; }
			const cp = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2 - lift];
			// Walk back from the head until the tail length is used up.
			const pts = [pt(k, from, to, cp)];
			let len = 0, kk = k;
			while (kk > 0 && len < tail) {
				kk = Math.max(0, kk - .01);
				const p = pt(kk, from, to, cp);
				const q = pts[pts.length - 1];
				len += Math.hypot(p[0] - q[0], p[1] - q[1]);
				pts.push(p);
			}
			pts.reverse();
			path.setAttribute('d', `M${pts.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' L')}`);
			grad.setAttribute('x1', pts[0][0]); grad.setAttribute('y1', pts[0][1]);
			grad.setAttribute('x2', pts[pts.length - 1][0]); grad.setAttribute('y2', pts[pts.length - 1][1]);
			const hd = pts[pts.length - 1];
			dot.setAttribute('cx', hd[0]); dot.setAttribute('cy', hd[1]);
			// Fade in at launch and out on arrival.
			el.style.opacity = String(Math.min(1, k * 8, (1 - k) * 6 + .35));
		}
		draw(0, [0, 0], [0, 0]);
		return { el, draw };
	}

	// Stamp-in helper for verdict lines and results: scale 1.08 -> 1, fade, .18 s.
	function stamp(el, t, at, dur = .18) {
		const k = u.p(t, at, dur, ease.outCubic);
		u.tf(el, { s: u.lerp(1.08, 1, k), o: k });
		return k;
	}

	// Horizontal shake (±amp px) during [at, at + dur].
	function shake(t, at, dur = .2, amp = 4) {
		if (t < at || t > at + dur) { return 0; }
		const k = (t - at) / dur;
		return amp * Math.sin(k * Math.PI * 6) * (1 - k);
	}

	Object.assign(c, { textAt, captionLines, footnote, goalToken, comet, stamp, shake });
})();
