// 01-pain — global 0.0–12.0. Two pains in one cold world.
//   Part A (0–6):  AI tools multiply; you become the human glue, copy-pasting between tabs.
//   Part B (6–12): you babysit one agent that says 「できました」 while npm test fails (8.0 hit).
// Ends on 「指揮者は、いつも自分。」 with grey threads from a lone cursor that 02 untangles.
//
// PAIN WORLD palette only: no gold, no brand red. Every frame is a pure function of t.
(() => {
	const { u, c, ease } = ORC;
	const { h, svg, lerp, clamp } = u;

	// ------------------------------------------------------------ palette (pain world, defined in-scene)
	const COL = {
		bg0: '#12151d', bg1: '#0b0d12', bg2: '#050608',
		panel: '#161a23', panel2: '#1c212c', userBubble: '#2a3140', term: '#0f1218', winDot: '#3a4150',
		line: 'rgba(255,255,255,.08)', line2: 'rgba(255,255,255,.14)',
		text: '#f3f4f7', text2: '#c4c9d4', muted: '#8a92a3', alert: '#e5484d',
	};
	const MONO = "'JetBrains Mono', 'Noto Sans JP', monospace";
	const JP = "'Noto Sans JP', 'Inter', sans-serif";
	const EN = "'Inter', 'Noto Sans JP', sans-serif";

	// ------------------------------------------------------------ geometry
	const W1A = { x: 680, y: 245, w: 560, h: 380 };   // Part A rect of W1
	const W1B = { x: 210, y: 70, w: 1500, h: 700 };   // Part B (snap-zoomed) rect of W1
	const SW = 420, SH = 290;                         // W2..W11
	const NUMS = Array.from('①②③④⑤⑥⑦⑧⑨⑩⑪');
	const GLYPHS = ['●', '■', '▲', '◆'];               // W1 ●, then ■ ▲ ◆ ● ...
	const FAIL = ORC.k.FAIL_POS;                      // { x: 875, baseline: 250, size: 29 }
	const CLOCK_DY = 26;                              // see the clock in build()

	// ------------------------------------------------------------ timing (scene-local seconds)
	const T_POP = 1.0, POP_STEP = .25, N_POP = 10;   // W2..W11 on the 8th grid
	const T_16 = 3.5, STEP_16 = .125, N_16 = 17;      // cursor darts on the 16th grid
	const DART_8 = .18, DART_16 = .1;                 // a 16th is .125 s, so its dart must be shorter
	const T_FREEZE = 5.6, T_SNAP = 6.0, SNAP = .25;
	const T_PULL = 10.5, PULL = .9, T_DIM = 11.4, DIM = .6;
	const FOCUS = [W1A.x + W1A.w / 2, W1A.y + W1A.h / 2]; // camera focus for the snap / pull-back

	// Windows: W1 fixed, W2..W11 from rng(7): x in [140,1360], y in [110,470], rotation ±2°.
	const wins = [{ ...W1A, r: 0, pop: 0 }];
	{
		const rnd = u.rng(7);
		for (let k = 0; k < N_POP; k++) {
			const x = 140 + rnd() * 1220, y = 110 + rnd() * 360, r = (rnd() * 2 - 1) * 2;
			wins.push({ x, y, w: SW, h: SH, r, pop: T_POP + POP_STEP * k });
		}
	}
	// Placeholder speech-bar widths (40–80 %) per window.
	const barW = (() => { const r = u.rng(56); return wins.map(() => [0, 1, 2].map(() => .4 + r() * .4)); })();

	// A point given in window-local px (base pose, no jitter) -> frame px.
	function winPoint(wi, lx, ly) {
		const w = wins[wi];
		const a = w.r * Math.PI / 180, dx = lx - w.w / 2, dy = ly - w.h / 2;
		return [w.x + w.w / 2 + dx * Math.cos(a) - dy * Math.sin(a), w.y + w.h / 2 + dx * Math.sin(a) + dy * Math.cos(a)];
	}
	// Where the cursor lands in a window's input bar; f = 0..1 along the bar's text area.
	const inputPt = (wi, f) => { const w = wins[wi]; return winPoint(wi, 26 + f * (w.w - 90), w.h - 12 - 18); };
	const lerp2 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];

	// Cursor hops: entry (0.5–0.8), one dart per pop (8ths), then 17 darts on 16ths (targets rng(11)).
	const START = [1190, 735];
	const P0 = inputPt(0, .3);
	const hops = [{ t0: .5, dur: .3, from: START, to: P0, fn: ease.outQuart }];
	const keyEvents = []; // { pt: point index, letter, at }
	const points = [P0];  // every point the thread visits, in order
	{
		let pos = P0, cur = 0;
		for (let k = 1; k <= N_POP; k++) {
			const to = inputPt(k, .3), t0 = T_POP + POP_STEP * (k - 1);
			hops.push({ t0, dur: DART_8, from: pos, to, fn: ease.outQuart });
			keyEvents.push({ pt: points.length - 1, letter: 'C', at: t0 });
			keyEvents.push({ pt: points.length, letter: 'V', at: t0 + DART_8 });
			points.push(to);
			pos = to; cur = k;
		}
		const rnd = u.rng(11);
		for (let j = 0; j < N_16; j++) {
			let tgt = Math.floor(rnd() * 11);
			if (tgt === cur) { tgt = (tgt + 1 + Math.floor(rnd() * 10)) % 11; }
			const to = inputPt(tgt, .08 + rnd() * .84);
			hops.push({ t0: T_16 + STEP_16 * j, dur: DART_16, from: pos, to, fn: ease.outQuart });
			points.push(to);
			pos = to; cur = tgt;
		}
	}
	function cursorAt(tm) {
		let p = START;
		for (const hp of hops) {
			if (tm < hp.t0) { break; }
			p = lerp2(hp.from, hp.to, u.p(tm, hp.t0, hp.dur, hp.fn));
		}
		return p;
	}
	function trailAt(tm) {
		const first = hops[0];
		if (tm < first.t0 + first.dur) { return []; }
		const pts = [P0];
		for (let i = 1; i < hops.length; i++) {
			const hp = hops[i];
			if (tm < hp.t0) { break; }
			const k = u.p(tm, hp.t0, hp.dur, hp.fn);
			pts.push(k >= 1 ? hp.to : lerp2(hp.from, hp.to, k));
		}
		return pts;
	}

	// ------------------------------------------------------------ small DOM helpers
	// Place `el` (already holding its text) so its alphabetic baseline sits at `baseline` in parent px.
	function placeBaseline(el, parent, { x, baseline, align = 'left' }) {
		el.style.left = '0'; el.style.top = '0';
		const probe = h('span', { style: { display: 'inline-block', width: '0', height: '0', verticalAlign: 'baseline' } });
		el.appendChild(probe);
		parent.appendChild(el);
		const base = probe.offsetTop, w = el.offsetWidth;
		probe.remove();
		el.style.left = `${align === 'center' ? x - w / 2 : align === 'right' ? x - w : x}px`;
		el.style.top = `${baseline - base}px`;
		return w;
	}
	const flash = (t, at, dur = .3, fade = .08) => Math.min(u.p(t, at, fade), 1 - u.p(t, at + dur - fade, fade));
	// Terminal shake: 10·sin(2π·12·dt)·e^(−10·dt) for 0.3 s.
	const shakeAt = (t, at) => (t >= at && t < at + .3 ? 10 * Math.sin(2 * Math.PI * 12 * (t - at)) * Math.exp(-10 * (t - at)) : 0);
	const fmtClock = m => { const mm = ((Math.floor(m) % 1440) + 1440) % 1440; return `${String(Math.floor(mm / 60)).padStart(2, '0')}:${String(mm % 60).padStart(2, '0')}`; };

	// Generic, unbranded AI chat window content (Part A layout). Responsive: it reflows with the
	// window box, so W1 can resize without distorting text.
	function windowContentA(i, { strip = 32, dot = 10, labelSize = 15, pad = 16 } = {}) {
		const el = h('div', { class: 'fill' });
		const stripEl = h('div', { class: 'abs', style: { left: '0', right: '0', top: '0', height: `${strip}px`, background: COL.panel2 } });
		for (let j = 0; j < 3; j++) {
			stripEl.appendChild(h('i', { class: 'abs', style: { left: `${14 + j * (dot + 6)}px`, top: `${(strip - dot) / 2}px`, width: `${dot}px`, height: `${dot}px`, borderRadius: '50%', background: COL.winDot } }));
		}
		const tab = h('div', { class: 'abs row nowrap', style: { left: `${14 + 3 * (dot + 6) + 8}px`, bottom: '0', height: `${strip - 6}px`, padding: '0 14px 0 12px', gap: '7px', background: COL.panel, borderRadius: '8px 8px 0 0', font: `600 ${labelSize}px/1 ${EN}`, color: COL.text2 } },
			h('span', { style: { fontSize: `${labelSize * .72}px`, color: COL.muted }, text: GLYPHS[i % 4] }),
			h('span', {}, 'AI ', h('span', { style: { fontFamily: JP, fontWeight: '500' }, text: NUMS[i] })));
		stripEl.appendChild(tab);
		el.appendChild(stripEl);
		// Three placeholder speech bars: agent (left, #1c212c), user (right, #2a3140), agent.
		const fr = [.16, .42, .68];
		for (let j = 0; j < 3; j++) {
			const right = j === 1;
			el.appendChild(h('div', { class: 'abs', style: {
				[right ? 'right' : 'left']: `${pad}px`,
				top: `calc(${strip}px + (100% - ${strip + 48}px) * ${fr[j]} - 9px)`,
				width: `calc((100% - ${pad * 2}px) * ${barW[i][j].toFixed(3)})`,
				height: '18px', borderRadius: '9px', background: right ? COL.userBubble : COL.panel2,
			} }));
		}
		// Input bar (36px, #0f1218) with an empty send circle.
		el.appendChild(h('div', { class: 'abs', style: { left: '12px', right: '12px', bottom: '12px', height: '36px', borderRadius: '10px', background: COL.term, border: `1px solid ${COL.line}` } },
			h('i', { class: 'abs', style: { right: '6px', top: '6px', width: '22px', height: '22px', borderRadius: '50%', background: COL.userBubble } })));
		return el;
	}

	function windowFrame(content) {
		return h('div', { class: 'abs', style: { background: COL.panel, borderRadius: '14px', overflow: 'hidden', boxShadow: '0 30px 80px rgba(0,0,0,.5)', transformOrigin: '50% 50%' } },
			content, h('div', { class: 'fill', style: { borderRadius: '14px', border: `1px solid ${COL.line}`, pointerEvents: 'none', zIndex: '5' } }));
	}

	function keycap(text, w) {
		const letter = h('span', { text });
		const el = h('div', { class: 'center', style: { width: `${w}px`, height: '40px', borderRadius: '8px', background: COL.panel2, border: `1px solid ${COL.line2}`, boxShadow: 'inset 0 -3px 0 rgba(0,0,0,.35), 0 8px 18px rgba(0,0,0,.45)', font: `600 20px/1 ${MONO}`, color: COL.text2, transformOrigin: '50% 100%' } }, letter);
		return { el, letter };
	}

	// Classic arrow cursor, 36px tall; tip at (1.5, 1.5) of its own box.
	function cursorEl() {
		const el = svg('svg', { width: 24, height: 36, viewBox: '0 0 24 36', style: { position: 'absolute', left: '0', top: '0', overflow: 'visible', filter: 'drop-shadow(0 4px 6px rgba(0,0,0,.55))' } });
		el.appendChild(svg('path', { d: 'M1.5 1.5 L1.5 29.5 L8.3 23 L12.8 33.4 L17.1 31.6 L12.7 21.4 L21.8 21.4 Z', fill: COL.text, stroke: COL.bg1, 'stroke-width': 1, 'stroke-linejoin': 'round' }));
		return el;
	}
	const TIP = [1.5, 1.5], PIVOT = [9, 18]; // baton pivot inside the arrow body

	// ------------------------------------------------------------ build
	function build(root) {
		const S = {};
		// Backdrop
		root.appendChild(h('div', { class: 'fill', style: { background: `radial-gradient(120% 90% at 50% 45%, ${COL.bg0} 0%, ${COL.bg1} 55%, ${COL.bg2} 100%)` } }));
		root.appendChild(h('div', { class: 'fill', style: { background: 'radial-gradient(130% 100% at 50% 50%, transparent 55%, rgba(0,0,0,.55) 100%)' } }));
		// Static film grain (fixed seed) to dither the 8-bit banding of the dark radial gradients.
		{
			const g = svg('svg', { width: 1920, height: 1080, viewBox: '0 0 1920 1080', style: { position: 'absolute', left: '0', top: '0', opacity: '.35', mixBlendMode: 'overlay', pointerEvents: 'none' } });
			const f = svg('filter', { id: 'p01-grain', x: 0, y: 0, width: 1920, height: 1080, filterUnits: 'userSpaceOnUse' },
				svg('feTurbulence', { type: 'fractalNoise', baseFrequency: .9, numOctaves: 2, seed: 7, stitchTiles: 'stitch' }),
				svg('feColorMatrix', { type: 'saturate', values: 0 }));
			g.append(svg('defs', {}, f), svg('rect', { width: 1920, height: 1080, filter: 'url(#p01-grain)' }));
			root.appendChild(g);
		}

		// Window layer (freeze filter/scale applies to this whole group)
		S.layer = h('div', { class: 'fill', style: { transformOrigin: '960px 540px' } });
		root.appendChild(S.layer);

		// Windows W1..W11 (newer windows on top)
		S.wins = wins.map((w, i) => {
			const frame = windowFrame(windowContentA(i));
			frame.style.left = `${w.x}px`; frame.style.top = `${w.y}px`;
			frame.style.width = `${w.w}px`; frame.style.height = `${w.h}px`;
			frame.style.zIndex = String(i + 1);
			S.layer.appendChild(frame);
			return frame;
		});
		S.w1A = S.wins[0].firstChild;

		// W1 Part B content: a native 1500x700 box (chat column + terminal), scaled with the window.
		const B = h('div', { class: 'abs', style: { left: '0', top: '0', width: `${W1B.w}px`, height: `${W1B.h}px`, transformOrigin: '0 0' } });
		S.w1B = B;
		S.wins[0].insertBefore(B, S.wins[0].children[1]);
		const toLx = x => x - W1B.x, toLy = y => y - W1B.y;
		{
			const strip = h('div', { class: 'abs', style: { left: '0', top: '0', width: '1500px', height: '48px', background: COL.panel2 } });
			for (let j = 0; j < 3; j++) { strip.appendChild(h('i', { class: 'abs', style: { left: `${22 + j * 22}px`, top: '17px', width: '14px', height: '14px', borderRadius: '50%', background: COL.winDot } })); }
			strip.appendChild(h('div', { class: 'abs row nowrap', style: { left: '100px', bottom: '0', height: '38px', padding: '0 20px 0 16px', gap: '10px', background: COL.panel, borderRadius: '10px 10px 0 0', font: `600 20px/1 ${EN}`, color: COL.text2 } },
				h('span', { style: { fontSize: '14px', color: COL.muted }, text: '●' }), h('span', {}, 'AI ', h('span', { style: { fontFamily: JP, fontWeight: '500' }, text: '①' }))));
			B.appendChild(strip);
			B.appendChild(h('div', { class: 'abs', style: { left: '0', top: '48px', width: '630px', height: '652px', background: COL.panel } }));
			B.appendChild(h('div', { class: 'abs', style: { left: '630px', top: '48px', width: '870px', height: '652px', background: COL.term, borderLeft: `1px solid ${COL.line}` } }));
			// chat input bar
			B.appendChild(h('div', { class: 'abs', style: { left: '24px', width: '582px', top: '620px', height: '56px', borderRadius: '14px', background: COL.term, border: `1px solid ${COL.line}` } },
				h('i', { class: 'abs', style: { right: '11px', top: '11px', width: '32px', height: '32px', borderRadius: '50%', background: COL.userBubble } })));
			// The thread stays at .15 through Part B. This copy lives inside W1 (same screen position once
			// the snap lands) so bubbles and terminal text sit above it instead of being crossed by it.
			const tb = svg('svg', { width: 1500, height: 700, viewBox: '0 0 1500 700', style: { position: 'absolute', left: '0', top: '0', overflow: 'visible' } });
			tb.appendChild(svg('polyline', { points: points.map(p => `${(p[0] - W1B.x).toFixed(1)},${(p[1] - W1B.y).toFixed(1)}`).join(' '), fill: 'none', stroke: COL.muted, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', opacity: .15 }));
			B.appendChild(tb);
		}
		// Chat bubbles
		const bubbleStyle = (fill, origin) => ({ position: 'absolute', padding: '16px 22px', borderRadius: '18px', background: fill, font: `700 34px/41px ${JP}`, color: COL.text, whiteSpace: 'nowrap', transformOrigin: origin, boxShadow: '0 10px 24px rgba(0,0,0,.25)' });
		S.bubDone = h('div', { style: { ...bubbleStyle(COL.panel2, '0 0'), left: `${toLx(250)}px`, top: `${toLy(150)}px` }, text: 'できました！ ✓' });
		B.appendChild(S.bubDone);
		// User bubble types inside a fixed-width box (measured at full text), right edge at x 800.
		S.userText = h('span', { text: 'まだ動きません…' });
		S.userCaret = h('i', { style: { display: 'inline-block', width: '2px', height: '34px', marginLeft: '2px', verticalAlign: '-6px', background: COL.text2 } });
		S.bubUser = h('div', { style: { ...bubbleStyle(COL.userBubble, '100% 0'), top: `${toLy(250)}px` } }, S.userText, S.userCaret);
		B.appendChild(S.bubUser);
		const uw = S.bubUser.offsetWidth;
		S.bubUser.style.width = `${uw}px`;
		S.bubUser.style.boxSizing = 'border-box';
		S.bubUser.style.left = `${toLx(800) - uw}px`;
		// Typing dots bubble, then 「修正しました！」
		S.dots = [0, 1, 2].map(() => h('i', { style: { display: 'block', width: '8px', height: '8px', borderRadius: '50%', background: COL.muted } }));
		S.bubDots = h('div', { class: 'row', style: { ...bubbleStyle(COL.panel2, '0 0'), left: `${toLx(250)}px`, top: `${toLy(350)}px`, height: '73px', gap: '9px', boxSizing: 'border-box' } }, ...S.dots);
		B.appendChild(S.bubDots);
		S.bubFix = h('div', { style: { ...bubbleStyle(COL.panel2, '0 0'), left: `${toLx(250)}px`, top: `${toLy(350)}px` }, text: '修正しました！' });
		B.appendChild(S.bubFix);

		// Terminal content (shakes as one layer)
		S.term = h('div', { class: 'fill' });
		B.appendChild(S.term);
		const termFont = `400 ${FAIL.size}px/1 ${MONO}`;
		S.cmd1Rest = h('span', { style: { color: COL.text2 } });
		// Block caret: a zero-height inline box on the baseline with an absolute bar, so it never
		// changes the line box (the command baseline stays exactly at y 195).
		S.caret = h('i', { style: { display: 'inline-block', position: 'relative', width: '.6em', height: '0', marginLeft: '.08em', verticalAlign: 'baseline' } },
			h('i', { style: { position: 'absolute', left: '0', right: '0', bottom: '-.2em', height: '1.08em', background: COL.text2 } }));
		S.cmd1 = h('div', { class: 'abs nowrap', style: { font: termFont } }, h('span', { style: { color: COL.muted }, text: '$' }), S.cmd1Rest, S.caret);
		placeBaseline(S.cmd1, S.term, { x: toLx(FAIL.x), baseline: toLy(195) });
		S.fail1 = h('div', { class: 'abs nowrap', style: { font: termFont, color: COL.alert }, text: '✕ テスト失敗' });
		placeBaseline(S.fail1, S.term, { x: toLx(FAIL.x), baseline: toLy(FAIL.baseline) });
		S.cmd2 = h('div', { class: 'abs nowrap', style: { font: termFont } }, h('span', { style: { color: COL.muted }, text: '$' }), h('span', { style: { color: COL.text2 }, text: ' npm test' }));
		placeBaseline(S.cmd2, S.term, { x: toLx(FAIL.x), baseline: toLy(330) });
		S.fail2 = h('div', { class: 'abs nowrap', style: { font: termFont, color: COL.alert }, text: '✕ テスト失敗' });
		placeBaseline(S.fail2, S.term, { x: toLx(FAIL.x), baseline: toLy(385) });
		// Clock: r 48, 2px ring; label HH:MM below. Spec centre (1630,170) puts the ring 3px under the
		// 48px title strip, so it is lowered by CLOCK_DY to get an even 30px margin (top) / 32px (right).
		S.clock = h('div', { class: 'fill' });
		S.term.appendChild(S.clock);
		const ck = svg('svg', { width: 1500, height: 700, viewBox: '0 0 1500 700', style: { position: 'absolute', left: '0', top: '0', overflow: 'visible' } });
		const cx = toLx(1630), cy = toLy(170 + CLOCK_DY);
		ck.appendChild(svg('circle', { cx, cy, r: 48, fill: 'none', stroke: COL.muted, 'stroke-width': 2 }));
		for (let j = 0; j < 12; j++) {
			const a = j * Math.PI / 6, r0 = j % 3 ? 42 : 39;
			ck.appendChild(svg('line', { x1: cx + Math.sin(a) * r0, y1: cy - Math.cos(a) * r0, x2: cx + Math.sin(a) * 44, y2: cy - Math.cos(a) * 44, stroke: COL.muted, 'stroke-width': j % 3 ? 1 : 2, 'stroke-linecap': 'round', opacity: .7 }));
		}
		S.hourHand = svg('line', { x1: cx, y1: cy, x2: cx, y2: cy - 24, stroke: COL.text2, 'stroke-width': 3.5, 'stroke-linecap': 'round' });
		S.minHand = svg('line', { x1: cx, y1: cy, x2: cx, y2: cy - 36, stroke: COL.text2, 'stroke-width': 2.5, 'stroke-linecap': 'round' });
		ck.append(S.hourHand, S.minHand, svg('circle', { cx, cy, r: 3.5, fill: COL.text2 }));
		S.clock.appendChild(ck);
		S.clockCx = cx; S.clockCy = cy;
		S.clockLabel = h('div', { class: 'abs nowrap', style: { font: `400 22px/1 ${MONO}`, color: COL.muted }, text: '23:48' });
		placeBaseline(S.clockLabel, S.clock, { x: cx, baseline: toLy(250 + CLOCK_DY), align: 'center' });

		// Thread trail (persistent polyline), puppet threads, keycaps, cursor
		S.trailSvg = svg('svg', { width: 1920, height: 1080, viewBox: '0 0 1920 1080', style: { position: 'absolute', left: '0', top: '0', overflow: 'visible', zIndex: '60' } });
		S.trail = svg('polyline', { fill: 'none', stroke: COL.muted, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'vector-effect': 'non-scaling-stroke' });
		S.trailSvg.appendChild(S.trail);
		S.layer.appendChild(S.trailSvg);

		S.threadSvg = svg('svg', { width: 1920, height: 1080, viewBox: '0 0 1920 1080', style: { position: 'absolute', left: '0', top: '0', overflow: 'visible', zIndex: '61' } });
		S.threads = wins.map(() => svg('path', { fill: 'none', stroke: COL.muted, 'stroke-width': 1.5, 'stroke-linecap': 'round', pathLength: 1 }));
		S.threadSvg.append(...S.threads);
		S.layer.appendChild(S.threadSvg);

		S.keys = points.slice(0, N_POP + 1).map((pt, pi) => {
			const ctrl = keycap('Ctrl', 70), key = keycap('C', 44);
			const el = h('div', { class: 'abs row', style: { left: '0', top: '0', gap: '6px', zIndex: '62' } }, ctrl.el, key.el);
			S.layer.appendChild(el);
			return { el, ctrl, key, pt, events: keyEvents.filter(e => e.pt === pi) };
		});
		S.keyW = 70 + 6 + 44;

		S.cursor = cursorEl();
		S.cursor.style.zIndex = '70';
		S.layer.appendChild(S.cursor);

		// Captions (Caption L, #c4c9d4, bottom-centre, baselines 860 / 960)
		S.capLayer = h('div', { class: 'fill' });
		root.appendChild(S.capLayer);
		const caption = (text, baseline) => {
			// Optical centring: Japanese 「 and trailing 。/、 carry half an em of blank space.
			const size = 80;
			const opt = (/[。、]$/.test(text) ? .25 : 0) - (/^「/.test(text) ? .25 : 0);
			return c.textAt(text, { x: 960 + opt * size, baseline, size, weight: 900, color: COL.text2, align: 'center', parent: S.capLayer });
		};
		S.capA1 = caption('AI は、増えた。', 860);
		S.capA2 = caption('なのに、なぜか忙しい。', 960);
		S.capB1 = caption('「できました」を、疑う毎日。', 860);
		S.capB2 = caption('指揮者は、いつも自分。', 960);

		// Fade from black
		S.black = h('div', { class: 'fill', style: { background: '#000' } });
		root.appendChild(S.black);
		return S;
	}

	// ------------------------------------------------------------ draw
	function draw(t, S) {
		const tm = Math.min(t, T_FREEZE); // Part A motion freezes at 5.6
		const e = u.p(t, T_SNAP, SNAP, ease.inOutExpo);        // snap-zoom 6.0–6.25
		const pb = u.p(t, T_PULL, PULL, ease.inOutCubic);      // pull-back 10.5–11.4
		const dm = u.p(t, T_DIM, DIM, ease.inOutCubic);        // dim 11.4–12.0
		const partB = t >= T_SNAP;
		const pulling = t >= T_PULL;

		// Fade from black 0–0.4
		const blk = 1 - u.p(t, 0, .4, ease.inOutSine);
		S.black.style.opacity = String(blk);
		S.black.style.visibility = blk > .001 ? 'visible' : 'hidden';

		// Freeze 5.6–6.0: grayscale(.3) + scale 1→1.03 (linear); undone by the snap.
		const fz = u.p(t, T_FREEZE, T_SNAP - T_FREEZE);
		const ls = lerp(1 + .03 * fz, 1, e), gs = lerp(.3 * fz, 0, e);
		S.layer.style.transform = `scale(${ls.toFixed(5)})`;
		S.layer.style.filter = gs > .002 ? `grayscale(${gs.toFixed(3)})` : 'none';

		// Window jitter during the 16ths (A ramps 0→6 px over 3.5–5.5), frozen from 5.6.
		const A = u.range(tm, T_16, 2, 0, 6);
		const jit = i => [u.noise(tm * 3, i) * A, u.noise(tm * 3, i + 50) * A];
		// Camera push used by the snap and the pull-back: other windows fly outward from W1.
		const disp = pulling ? 1 - pb : e;
		const push = 1 + .3 * disp, pushS = 1 + .12 * disp;

		// ---- W2..W11
		const bottoms = [];
		for (let i = 1; i < wins.length; i++) {
			const w = wins[i], el = S.wins[i];
			const [jx, jy] = jit(i);
			const kp = u.p(tm, w.pop, .35);
			const s = (.85 + .15 * ease.spring(kp)) * pushS;
			const cx = w.x + w.w / 2, cy = w.y + w.h / 2;
			const dx = jx + (cx - FOCUS[0]) * (push - 1), dy = jy + (cy - FOCUS[1]) * (push - 1);
			let o, blur, gray = 0;
			if (!pulling) { o = u.p(tm, w.pop, .15) * (1 - e); blur = 12 * e; } else { o = .5 * pb - .2 * dm; blur = 12 * (1 - pb); gray = .6 * dm; }
			el.style.transform = `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) rotate(${w.r.toFixed(3)}deg) scale(${s.toFixed(4)})`;
			el.style.opacity = String(clamp(o));
			el.style.visibility = o > .001 ? 'visible' : 'hidden';
			const f = [];
			if (blur > .05) { f.push(`blur(${blur.toFixed(2)}px)`); }
			if (gray > .002) { f.push(`grayscale(${gray.toFixed(3)})`); }
			el.style.filter = f.length ? f.join(' ') : 'none';
			// bottom-centre in frame px (for the puppet threads)
			const a = w.r * Math.PI / 180, hh = w.h / 2 * s;
			bottoms[i] = [cx + dx - Math.sin(a) * hh, cy + dy + Math.cos(a) * hh];
		}

		// ---- W1
		{
			const el = S.wins[0];
			const [jx, jy] = jit(0);
			const rA = { x: W1A.x + jx, y: W1A.y + jy, w: W1A.w, h: W1A.h };
			let r, s = 1, o = 1;
			if (!partB) {
				r = rA;
				s = .9 + .1 * ease.spring(u.p(t, 0, .5));
				o = u.p(t, 0, .15);
			} else if (!pulling) {
				r = { x: lerp(rA.x, W1B.x, e), y: lerp(rA.y, W1B.y, e), w: lerp(rA.w, W1B.w, e), h: lerp(rA.h, W1B.h, e) };
			} else {
				r = { x: lerp(W1B.x, W1A.x, pb), y: lerp(W1B.y, W1A.y, pb), w: lerp(W1B.w, W1A.w, pb), h: lerp(W1B.h, W1A.h, pb) };
				o = 1 - .7 * dm;
			}
			el.style.left = `${r.x.toFixed(2)}px`; el.style.top = `${r.y.toFixed(2)}px`;
			el.style.width = `${r.w.toFixed(2)}px`; el.style.height = `${r.h.toFixed(2)}px`;
			el.style.transform = `scale(${s.toFixed(4)})`;
			el.style.opacity = String(clamp(o));
			el.style.visibility = o > .001 ? 'visible' : 'hidden';
			el.style.filter = dm > .002 ? `grayscale(${(.6 * dm).toFixed(3)})` : 'none';
			el.style.zIndex = partB ? '50' : '1';
			el.style.borderRadius = '14px';
			bottoms[0] = [r.x + r.w / 2, r.y + r.h];
			// Content swap A <-> B. B keeps its proportions (scale by height, cropped on the right).
			// Snap: a straight crossfade inside the .25 s inOutExpo jump. Pull-back: sequenced, so the
			// reflowing Part A bars never lie over Part B's text (B dissolves while W1 is still large,
			// 10.5–10.9; A fades in as W1 nears its Part A size, 10.8–11.2).
			const bo = !partB ? 0 : !pulling ? e : 1 - u.p(t, T_PULL, .4, ease.inOutSine);
			const ao = !partB ? 1 : !pulling ? 1 - e : u.p(t, T_PULL + .3, .4, ease.inOutSine);
			S.w1B.style.opacity = String(bo);
			S.w1B.style.visibility = bo > .001 ? 'visible' : 'hidden';
			S.w1B.style.transform = `scale(${(r.h / W1B.h).toFixed(5)})`;
			S.w1A.style.opacity = String(ao);
			S.w1A.style.visibility = ao > .001 ? 'visible' : 'hidden';
		}

		// ---- Part B chat + terminal (local times are scene times)
		drawPartB(t, S);

		// ---- Trail (the copy-paste thread): 2px #8a92a3 @ .7. On the snap it hands over to the .15 copy
		// inside W1; on the pull-back it returns at .15 with the other windows (same camera push).
		const pts = trailAt(tm);
		S.trail.setAttribute('points', pts.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' '));
		const trO = !partB ? .7 : !pulling ? .7 * (1 - e) : .15 * u.p(t, T_PULL + .4, .45, ease.inOutSine) * (1 - .5 * dm);
		S.trail.setAttribute('opacity', trO.toFixed(3));
		S.trail.setAttribute('transform', `translate(${FOCUS[0]} ${FOCUS[1]}) scale(${push.toFixed(5)}) translate(${-FOCUS[0]} ${-FOCUS[1]})`);
		S.trailSvg.style.display = pts.length > 1 && trO > .001 ? 'block' : 'none';

		// ---- Keycaps: [Ctrl][C] at the departure point, [Ctrl][V] at the arrival point, .3 s flashes.
		for (const g of S.keys) {
			let o = 0, latest = null;
			for (const ev of g.events) {
				if (tm >= ev.at) { latest = ev; }
				o = Math.max(o, flash(tm, ev.at));
			}
			o *= 1 - e;
			if (!latest) { o = 0; }
			g.el.style.visibility = o > .001 ? 'visible' : 'hidden';
			g.el.style.opacity = o.toFixed(3);
			g.key.letter.textContent = (latest || g.events[0]).letter;
			const kp = latest ? u.p(tm, latest.at, .14, ease.outCubic) : 0;
			const press = `translateY(${(3 * (1 - kp)).toFixed(2)}px) scale(${(.92 + .08 * kp).toFixed(4)})`;
			g.key.el.style.transform = press;
			g.ctrl.el.style.transform = press;
			const lift = 6 * (1 - u.p(tm, g.events[0].at, .1, ease.outCubic));
			g.el.style.transform = `translate(${(g.pt[0] - S.keyW / 2).toFixed(1)}px, ${(g.pt[1] - 30 - 40 + lift).toFixed(1)}px)`;
		}

		// ---- Cursor
		let cur, co, rot = 0;
		if (!pulling) {
			cur = cursorAt(tm);
			co = u.p(t, .5, .12) * (1 - e);
		} else {
			// Emerges as W1 retreats above it (W1's bottom edge passes y 700 around 10.95).
			const ki = u.p(t, T_PULL + .2, .45, ease.outCubic);
			cur = [960 + u.noise(t * 4, 5) * 8, 700 + u.noise(t * 4, 56) * 8 + 24 * (1 - ki)];
			co = ki;
			rot = 12 * u.noise(t * 4, 3);
		}
		// Rotate about the pivot inside the arrow body; `tip` is where the threads attach.
		const ra = rot * Math.PI / 180;
		const vx = TIP[0] - PIVOT[0], vy = TIP[1] - PIVOT[1];
		const tipOff = [PIVOT[0] + vx * Math.cos(ra) - vy * Math.sin(ra), PIVOT[1] + vx * Math.sin(ra) + vy * Math.cos(ra)];
		// Place the element so that its tip lands on `cur`.
		const ox = cur[0] - tipOff[0], oy = cur[1] - tipOff[1];
		S.cursor.style.transformOrigin = `${PIVOT[0]}px ${PIVOT[1]}px`;
		S.cursor.style.transform = `translate(${ox.toFixed(2)}px, ${oy.toFixed(2)}px) rotate(${rot.toFixed(2)}deg)`;
		S.cursor.style.opacity = String(clamp(co));
		S.cursor.style.visibility = co > .001 ? 'visible' : 'hidden';

		// ---- Puppet threads from the cursor to every window's bottom-centre (pull-back onward)
		const thO = pulling ? lerp(.8, 1, dm) : 0;
		S.threadSvg.style.display = thO > 0 ? 'block' : 'none';
		{
			const col = mixHex(COL.muted, COL.text2, dm);
			S.threads.forEach((p, i) => {
				const b = bottoms[i];
				const mx = (cur[0] + b[0]) / 2 + u.noise(t * 2, i) * 10, my = (cur[1] + b[1]) / 2 + u.noise(t * 2, i + 50) * 10;
				p.setAttribute('d', `M${cur[0].toFixed(1)},${cur[1].toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${b[0].toFixed(1)},${b[1].toFixed(1)}`);
				const k = u.p(t, T_PULL + .3 + i * .025, .55, ease.inOutCubic);
				p.setAttribute('stroke-dasharray', '1 1');
				p.setAttribute('stroke-dashoffset', (1 - k).toFixed(4));
				p.setAttribute('stroke', col);
				p.setAttribute('opacity', (thO * Math.min(1, k * 3)).toFixed(3));
			});
		}

		// ---- Captions
		const hideOpts = { stagger: .006, dur: .24 };
		c.cycle(S.capA1.chars, t, .4, T_SNAP, { out: hideOpts });
		c.cycle(S.capA2.chars, t, 1.9, T_SNAP, { out: hideOpts });
		c.reveal(S.capB1.chars, t, 6.4);
		c.reveal(S.capB2.chars, t, 8.6);
		// Past the scene end (only seen under 02's fade-in) the captions clear by 12.25,
		// before 02's caption starts at 12.30, so the two never overlap.
		const capO = 1 - u.p(t, 12.0, .25, ease.inOutSine);
		S.capLayer.style.opacity = String(capO);
		S.capLayer.style.visibility = capO > .001 ? 'visible' : 'hidden';
	}

	function drawPartB(t, S) {
		const pop = (el, at, from = .85) => {
			const k = u.p(t, at, .35);
			const o = u.p(t, at, .12);
			el.style.transform = `scale(${(from + (1 - from) * ease.spring(k)).toFixed(4)})`;
			el.style.opacity = String(o);
			el.style.visibility = o > .001 ? 'visible' : 'hidden';
			return o;
		};
		pop(S.bubDone, 6.3);
		// User bubble types 「まだ動きません…」 at 16 cps from 8.2; caret until sent (8.75).
		pop(S.bubUser, 8.2, .9);
		S.userText.textContent = u.typed('まだ動きません…', t, 8.2, 16);
		S.userCaret.style.visibility = t >= 8.2 && t < 8.75 ? 'visible' : 'hidden';
		// Typing dots 8.8–9.3, then 「修正しました！」
		const dO = pop(S.bubDots, 8.8, .9) * (1 - u.p(t, 9.3, .08));
		S.bubDots.style.opacity = String(dO);
		S.bubDots.style.visibility = dO > .001 ? 'visible' : 'hidden';
		S.dots.forEach((d, i) => { d.style.opacity = String(.3 + .7 * Math.max(0, Math.sin(2 * Math.PI * (2 * t - i / 3)))); });
		pop(S.bubFix, 9.3);

		// Terminal: '$ npm test' typed 7.0–7.85 (12 cps over the whole string; the '$' prompt is already there).
		const full = '$ npm test';
		const n = clamp(Math.floor((t - 7.0) * 12), 0, full.length);
		S.cmd1Rest.textContent = full.slice(1, Math.max(n, 2));
		const typing = t >= 7.0 && t < 7.85;
		const caretOn = t < 7.85 && (typing || ((t - 6.25) % 1 + 1) % 1 < .55);
		S.caret.style.visibility = caretOn ? 'visible' : 'hidden';
		// 8.0 hit and 10.0: '✕ テスト失敗' prints, with a short alert glow.
		const failGlow = (el, at) => {
			const on = t >= at;
			el.style.visibility = on ? 'visible' : 'hidden';
			const k = u.p(t, at, .6, ease.outCubic);
			el.style.textShadow = on && k < 1 ? `0 0 ${(16 * (1 - k)).toFixed(1)}px rgba(229,72,77,${(.85 * (1 - k)).toFixed(3)})` : 'none';
		};
		failGlow(S.fail1, 8.0);
		S.cmd2.style.visibility = t >= 9.5 ? 'visible' : 'hidden';
		failGlow(S.fail2, 10.0);
		const sx = shakeAt(t, 8.0) + shakeAt(t, 10.0);
		S.term.style.transform = `translateX(${sx.toFixed(2)}px)`;

		// Clock 6.3–10.5: minute hand 6 turns, hour hand half a turn, label 23:48 → 01:12 (all linear).
		const cp = u.p(t, 6.3, 4.2);
		const co = u.p(t, 6.3, .3, ease.outCubic);
		S.clock.style.opacity = String(co);
		S.clock.style.visibility = co > .001 ? 'visible' : 'hidden';
		const mA = 288 + 360 * 6 * cp, hA = 354 + 180 * cp; // 23:48 -> minute 288°, hour 354°
		S.minHand.setAttribute('transform', `rotate(${mA.toFixed(2)} ${S.clockCx} ${S.clockCy})`);
		S.hourHand.setAttribute('transform', `rotate(${hA.toFixed(2)} ${S.clockCx} ${S.clockCy})`);
		S.clockLabel.textContent = fmtClock(23 * 60 + 48 + 84 * cp);
	}

	function mixHex(a, b, k) {
		const pa = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16)), pb = [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16));
		return `rgb(${pa.map((v, i) => Math.round(lerp(v, pb[i], clamp(k)))).join(',')})`;
	}

	ORC.register({ id: '01-pain', duration: 12, transition: 'cut', build, draw });
})();
