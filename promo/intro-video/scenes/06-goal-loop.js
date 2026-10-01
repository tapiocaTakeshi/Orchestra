// 06-goal-loop — global 48.0–56.0 (BREAK; riser 52–56). Transition in: fade.
// Pays off the babysitting pain: the team re-plans only the unmet part and retries
// by itself. A gold lap ring with a round odometer turns 1 / 5 into 2 / 5, round 2
// fast-forwards, and npm test passes on the riser. The round cap is footnoted.
(() => {
	const { u, c, ease } = ORC;
	const { h, svg } = u;
	const K = ORC.k;
	const C = K.COLORS;

	// ------------------------------------------------------------ helpers
	const px = v => `${v}px`;
	const hex = s => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
	const mix = (a, b, k) => { const A = hex(a), B = hex(b); return A.map((v, i) => Math.round(v + (B[i] - v) * u.clamp(k))); };
	const rgb = (col, a = 1) => `rgba(${col[0]}, ${col[1]}, ${col[2]}, ${u.clamp(a).toFixed(3)})`;
	const deg = r => r * 180 / Math.PI;

	// ------------------------------------------------------------ ring geometry (frame px)
	const RC = [480, 450], R = 220, SW = 14;
	const SWASH = [236, 204];
	const TICK_R = 250, TICK_D = 10;
	const A0 = -Math.PI / 2;                        // laps start at 12 o'clock and run clockwise
	const GRAD = ['#8a7449', '#c6a769', '#e3cf9f']; // tail → tip
	// Arrowhead: the brand mark's notched arrow ('-4.5,-7 14.5,0 -4.5,7 0,0'), 34 px long.
	const AK = 34 / 19;
	const ARROW_PTS = [[-4.5, -7], [14.5, 0], [-4.5, 7], [0, 0]].map(([x, y]) => `${(x * AK).toFixed(2)},${(y * AK).toFixed(2)}`).join(' ');
	const ARROW_REACH = 14.5 * AK;
	// A full lap stops just short of its own tail, so the arrow tip meets the round cap with 6 px of air.
	const X_FULL = 2 * Math.PI - (ARROW_REACH + SW / 2 + 6) / R;
	const SEG = 4 * Math.PI / 180, MAXSEG = Math.ceil(2 * Math.PI / SEG) + 1, OV = .5 * Math.PI / 180;
	const TICK_ANG = [0, 1, 2, 3, 4].map(k => (-90 + 72 * k) * Math.PI / 180);
	const ROSE = C.rose; // #d27a82

	// ------------------------------------------------------------ column geometry
	const Z = 2.0, COL_W = 420, COL_X = 960, GAP = 6;
	const VIEW = [100, 940];          // the column's visible band (screen y)
	const FADE = 56;                  // soft edge of that band
	// 05's last frame (measured): column top-left, effective zoom, native width, opacity.
	const HAND = { x: 915.5, y: 78, z: 2.05, w: 430, o: .7 };
	const TAIL_O = .6;                // the round-1 verdict tail is dimmed to .6
	const RES = 29 / Z;               // 「✅ 成功（3.2 秒）」 at ~29 screen px, mirroring 05's ❌ line
	const LINE = 17;                  // code-bar line pitch (native)
	const TAIL_TARGET = 160;          // screen y of the 🔁 line's top once the column has settled
	const RES_BASELINE = 537;         // result baseline = the numeral's baseline after the riser scale

	// ------------------------------------------------------------ timing (scene seconds)
	const GLIDE = .45, GLIDE_DUR = .8;            // 05 framing → 06 framing
	const TOK_FLY = .3, TOK_FLY_DUR = .9;         // goal tokens settle into the ring
	const REV_DONE = .4, REV_DONE_DUR = .3;       // the reviewer hands over to the leader
	const TICK1 = .4, CAP1 = .4, CAP2 = 1.4, FOOT = 1.0, FOOT_DUR = .5;
	const LEAD = .6, RISE = .42, LEAD_OPEN = .7, OPEN = .25, LEAD_CLOSE = 2.2, CLOSE = .3;
	const ROT = 1.0, ROT_DUR = 1.2, TRAIL = 60;
	const ODO = 1.6, ODO_DUR = .4;
	const RESET = 2.2, RESET_DUR = .4;
	const LAP = 2.6, LAP_DUR = 4.9;
	const FF = 2.6, FF_DUR = 2.0, FF_DIST = 1100, FF_BLUR = 3;
	const FLOW_AT = 2.62, PREP_AT = 2.8, PREP_DONE = 3.02, CODER_AT = 3.02, CODE_T0 = 3.12, CODER_DONE = 4.42;
	const RISER = 4.0, RISER_END = 7.5, RING_S = .96;
	const CMD = 4.8;
	const HIT = 7.5, RES_GROW = .1, STAMP = .18, FLIP = .25, FLASH = .3;

	// Card loaders run on their own clock: speed 1, easing to 2 over 4.0–4.5 (the riser).
	// tau(t) is the integral of that speed, so the loader never jumps.
	const tau = t => {
		if (t <= RISER) { return t; }
		if (t < RISER + .5) { const x = (t - RISER) / .5; return t + .5 * (x ** 3 - x ** 4 / 2); }
		return 2 * t - RISER - .25;
	};

	// Demo verdict from 05 (round 1) — identical markup so the hand-off lines up.
	const VERDICT_LINES = [
		{ kind: 'h', html: '🎯 目標との照合（ラウンド 1）' },
		{ kind: 'b', html: K.GOAL },
		{ kind: 'v', mark: '✅', n: 1, crit: K.COND1, note: '追加・完了・削除の処理を実装済み' },
		{ kind: 'v', mark: '❌', n: 2, crit: K.COND2, note: '終了コード 1（1 件失敗）' },
		{ kind: 'b', html: '🔁 未達のため、ラウンド 2 / 5 に進みます。' },
	];

	// Illegible code for the round-2 coder card: [indent, [[tone, width], ...]] (native px).
	const TONES = { kw: 'rgba(208,128,138,.42)', fn: 'rgba(230,211,168,.34)', str: 'rgba(203,178,122,.36)', pl: 'rgba(201,192,181,.2)', cm: 'rgba(135,124,114,.38)' };
	const CODE_PAT = [
		[0, [['cm', 150]]],
		[0, [['kw', 38], ['fn', 74], ['pl', 58]]],
		[1, [['kw', 30], ['pl', 46], ['fn', 52], ['pl', 30]]],
		[2, [['pl', 64], ['str', 92]]],
		[1, [['pl', 12]]],
		[1, [['kw', 34], ['pl', 88], ['pl', 20]]],
		[0, [['pl', 10]]],
		[0, []],
		[0, [['kw', 38], ['fn', 86], ['pl', 72]]],
		[1, [['kw', 42], ['pl', 56], ['fn', 46]]],
		[2, [['pl', 96], ['str', 58]]],
		[2, [['fn', 70], ['pl', 40]]],
		[1, [['pl', 12]]],
		[0, [['pl', 10]]],
		[0, []],
		[0, [['cm', 182]]],
		[0, [['fn', 52], ['str', 128], ['pl', 22]]],
		[1, [['kw', 34], ['pl', 70]]],
		[1, [['fn', 62], ['pl', 38], ['str', 76]]],
		[1, [['fn', 58], ['pl', 104]]],
		[1, [['fn', 58], ['str', 66], ['pl', 30]]],
		[0, [['pl', 22]]],
		[0, []],
		[0, [['fn', 52], ['str', 112], ['pl', 22]]],
		[1, [['kw', 34], ['pl', 64], ['fn', 40]]],
		[1, [['fn', 62], ['pl', 50], ['kw', 30]]],
		[0, [['pl', 22]]],
		[0, []],
		[0, [['cm', 120]]],
		[0, [['kw', 38], ['fn', 66], ['pl', 44]]],
		[1, [['kw', 30], ['pl', 80]]],
		[0, [['pl', 10]]],
	];

	// The small brand-mark loader inside a card header (c.card does not expose it).
	const spinnerOf = card => Array.from(card.head.children).find(el => el.tagName.toLowerCase() === 'svg' && !el.classList.contains('o-chev'));
	const sheenOf = card => card.el.querySelector('.o-sheen');
	// A grey bar standing in for text nobody should read.
	const bar = (w, { hgt = 7, col = '#3a3330', style = {} } = {}) => h('i', { style: { display: 'inline-block', width: typeof w === 'number' ? px(w) : w, height: px(hgt), borderRadius: px(hgt / 2), background: col, verticalAlign: 'middle', ...style } });

	// Arc path on the ring from angle a to b (radians, b > a, sweep < 2π).
	const P = a => [R * Math.cos(a), R * Math.sin(a)];
	const arcD = (a, b) => {
		const [x0, y0] = P(a), [x1, y1] = P(b);
		return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${R} ${R} 0 ${b - a > Math.PI ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
	};
	const gradAt = k => rgb(k < .5 ? mix(GRAD[0], GRAD[1], k * 2) : mix(GRAD[1], GRAD[2], k * 2 - 1));

	// One lap stroke: gradient segments tail → tip, a round tail cap and the arrowhead at the tip.
	function lap(parent) {
		const g = svg('g');
		const base = svg('path', { fill: 'none', stroke: GRAD[1], 'stroke-width': SW });
		const segs = Array.from({ length: MAXSEG }, () => svg('path', { fill: 'none', 'stroke-width': SW }));
		const cap = svg('circle', { r: SW / 2, fill: GRAD[0] });
		const arrow = svg('polygon', { points: ARROW_PTS, fill: C.goldHi });
		g.append(base, ...segs, cap, arrow);
		parent.appendChild(g);
		function set(sweep) {
			const has = sweep > 1e-4;
			const n = has ? u.clamp(Math.ceil(sweep / SEG), 8, MAXSEG) : 0;
			base.style.display = has ? 'inline' : 'none';
			if (has) { base.setAttribute('d', arcD(A0, A0 + sweep)); }
			segs.forEach((s, i) => {
				if (i >= n) { s.style.display = 'none'; return; }
				s.style.display = 'inline';
				s.setAttribute('d', arcD(A0 + sweep * i / n, Math.min(A0 + sweep, A0 + sweep * (i + 1) / n + OV)));
				s.setAttribute('stroke', gradAt((i + .5) / n));
			});
			const [cx, cy] = P(A0);
			cap.setAttribute('cx', cx.toFixed(2));
			cap.setAttribute('cy', cy.toFixed(2));
			const tip = A0 + sweep, [tx, ty] = P(tip);
			arrow.setAttribute('transform', `translate(${tx.toFixed(2)} ${ty.toFixed(2)}) rotate(${(deg(tip) + 90).toFixed(3)})`);
		}
		return { g, set };
	}

	ORC.register({
		id: '06-goal-loop',
		duration: 8,
		transition: 'fade',

		build(root) {
			const S = {};
			S.backdrop = c.backdrop({ tint: 'gold' });
			root.appendChild(S.backdrop.el);

			// ======================================================== ROUND RING (graphics, left)
			const ringG = h('div', { class: 'fill', style: { transformOrigin: `${RC[0]}px ${RC[1]}px` } });
			root.appendChild(ringG);
			S.ringG = ringG;

			// Motion trail while the round-1 lap spins: a conic smear on the ring's band.
			const TR_R = 262;
			S.trail = h('div', { class: 'abs', style: { left: px(RC[0] - TR_R), top: px(RC[1] - TR_R), width: px(2 * TR_R), height: px(2 * TR_R), borderRadius: '50%', maskImage: 'radial-gradient(circle at 50% 50%, transparent 197px, #000 203px, #000 237px, transparent 243px)', WebkitMaskImage: 'radial-gradient(circle at 50% 50%, transparent 197px, #000 203px, #000 237px, transparent 243px)' } });
			ringG.appendChild(S.trail);

			const SV = 320;
			const ring = svg('svg', { width: 2 * SV, height: 2 * SV, viewBox: `${-SV} ${-SV} ${2 * SV} ${2 * SV}`, style: { position: 'absolute', left: px(RC[0] - SV), top: px(RC[1] - SV), overflow: 'visible' } });
			ring.appendChild(svg('defs', {}, svg('filter', { id: 'gl06-flash', x: '-30%', y: '-30%', width: '160%', height: '160%' },
				svg('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: 7, result: 'b' }),
				svg('feMerge', {}, svg('feMergeNode', { in: 'b' }), svg('feMergeNode', { in: 'b' }), svg('feMergeNode', { in: 'SourceGraphic' })))));
			for (const r of SWASH) { ring.appendChild(svg('circle', { r, fill: 'none', stroke: 'rgba(198,167,105,.3)', 'stroke-width': 2 })); }
			S.lap1 = lap(ring);
			S.lap1.set(X_FULL);
			S.lap2 = lap(ring);
			// Completion flash: the whole lap in #e3cf9f with a glow.
			S.flash = svg('g', { filter: 'url(#gl06-flash)' },
				svg('path', { d: arcD(A0, A0 + X_FULL), fill: 'none', stroke: C.goldHi, 'stroke-width': SW + 2, 'stroke-linecap': 'round' }),
				svg('polygon', { points: ARROW_PTS, fill: C.goldHi, transform: (() => { const tip = A0 + X_FULL, [x, y] = P(tip); return `translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${(deg(tip) + 90).toFixed(3)}) scale(1.08)`; })() }));
			ring.appendChild(S.flash);
			ringG.appendChild(ring);

			// Five round ticks just outside the ring.
			S.ticks = TICK_ANG.map(a => {
				const el = h('div', { class: 'abs', style: { left: px(RC[0] + TICK_R * Math.cos(a) - TICK_D / 2), top: px(RC[1] + TICK_R * Math.sin(a) - TICK_D / 2), width: px(TICK_D), height: px(TICK_D), borderRadius: '50%', background: '#3a3330' } });
				ringG.appendChild(el);
				return el;
			});

			// 「ラウンド」 + odometer numeral + 「/ 5」.
			c.textAt('ラウンド', { x: RC[0], baseline: 400, size: 26, weight: 500, color: '#877c72', align: 'center', letterSpacing: '0', shadow: false, parent: ringG });
			const NUM_FONT = '800 150px/1 var(--en)';
			const measure = (text, font) => {
				const s = h('span', { text, style: { position: 'absolute', left: '0', top: '0', font, whiteSpace: 'pre', visibility: 'hidden' } });
				root.appendChild(s);
				const w = s.getBoundingClientRect().width;
				s.remove();
				return w;
			};
			const wD = Math.ceil(Math.max(measure('1', NUM_FONT), measure('2', NUM_FONT)));
			const slashProbe = c.textAt('/ 5', { x: 0, baseline: 540, size: 52, weight: 600, family: 'var(--en)', color: '#877c72', letterSpacing: '0', shadow: false, parent: ringG });
			const NGAP = 14;
			const gx = Math.round(RC[0] - (wD + NGAP + slashProbe.width) / 2);
			slashProbe.el.style.left = px(gx + wD + NGAP);
			// Digit baseline inside a line-height:1 block.
			const probeDigit = h('div', { style: { position: 'absolute', left: '0', top: '0', font: NUM_FONT } }, '2', h('span', { style: { display: 'inline-block', width: '0', height: '0', verticalAlign: 'baseline' } }));
			root.appendChild(probeDigit);
			const digitBase = probeDigit.lastChild.offsetTop;
			probeDigit.remove();
			// The odometer window hugs the digits' ink (cap height + a little air), so a rolling
			// digit never reaches the 「ラウンド」 label above it.
			const cx2d = document.createElement('canvas').getContext('2d');
			cx2d.font = "800 150px 'Inter'";
			const inkTop = Math.ceil(Math.max(cx2d.measureText('1').actualBoundingBoxAscent, cx2d.measureText('2').actualBoundingBoxAscent));
			const PAD = 12, BOXH = inkTop + 2 * PAD;
			const boxTop = 540 - inkTop - PAD;
			const fadeMask = 'linear-gradient(to bottom, transparent 0, #000 10px, #000 calc(100% - 10px), transparent 100%)';
			const numBox = h('div', { class: 'abs', style: { left: px(gx), top: px(boxTop), width: px(wD), height: px(BOXH), overflow: 'hidden', maskImage: fadeMask, WebkitMaskImage: fadeMask } });
			S.digits = ['1', '2'].map(d => {
				const el = h('div', { class: 'abs', text: d, style: { left: '0', top: px(540 - digitBase - boxTop), width: '100%', textAlign: 'center', font: NUM_FONT, color: '#f7f2ea' } });
				numBox.appendChild(el);
				return el;
			});
			ringG.appendChild(numBox);
			S.BOXH = BOXH;

			// Goal tokens inside the ring (they arrive from 05's TOKEN_1 / TOKEN_2).
			const TOK = [[445, 625], [515, 625]];
			S.tok = TOK.map(([x, y], i) => {
				const tk = c.goalToken({ x, y, size: 30 });
				tk.el.style.transformOrigin = `${x}px ${y}px`;
				tk.disc.style.transformOrigin = '50% 50%';
				ringG.appendChild(tk.el);
				return { tk, to: [x, y], from: [K.TOKENS[i].x, K.TOKENS[i].y] };
			});

			// ======================================================== CARD COLUMN (UI mock, right)
			const view = h('div', { class: 'fill', style: { pointerEvents: 'none' } });
			root.appendChild(view);
			S.view = view;
			const strip = h('div', { class: 'abs', style: { left: '0', top: '0', width: px(COL_W * Z), height: '2400px', transformOrigin: '0 0' } });
			const zb = c.zoomBox(Z, { left: '0', top: '0' });
			const col = h('div', { style: { position: 'relative', width: px(HAND.w), display: 'flex', flexDirection: 'column', gap: px(GAP) } });
			zb.appendChild(col);
			strip.appendChild(zb);
			view.appendChild(strip);
			S.strip = strip;
			// Whip blur: sRGB like CSS blur(), anisotropic so the scroll can carry motion blur.
			S.mblur = svg('feGaussianBlur', { stdDeviation: '0 0' });
			root.appendChild(svg('svg', { width: 0, height: 0, style: { position: 'absolute', left: '0', top: '0' } },
				svg('defs', {}, svg('filter', { id: 'gl06-mblur', x: '-5%', y: '-10%', width: '110%', height: '120%', 'color-interpolation-filters': 'sRGB' }, S.mblur))));
			S.col = col;

			const mkCard = (opts, ownLoader = true) => {
				const card = c.card(opts);
				card.body.innerHTML = '';
				const o = { card, inner: spinnerOf(card), sheen: sheenOf(card) };
				if (ownLoader) {
					o.loader = c.mark({ width: 29, variant: 'small', glow: false });
					o.loader.el.style.flex = 'none';
					o.inner.after(o.loader.el);
				}
				return o;
			};

			// ---- round 1, carried over from 05: command card (collapsed) and the reviewer's verdict.
			const cmd1 = mkCard({ title: K.CMD.title, role: K.CMD.badge }, false);
			const rt = K.TASKS[3];
			const rev = mkCard({ n: rt.n, title: rt.title, role: rt.badge }, false);
			const lines = VERDICT_LINES.map((L, i) => {
				let inner;
				if (L.kind === 'h') {
					inner = h('div', { class: 'o-md', html: L.html, style: { fontSize: '14px', fontWeight: '700', lineHeight: '1.45', color: '#f7f2ea', whiteSpace: 'nowrap' } });
				} else if (L.kind === 'b') {
					inner = h('div', { class: 'o-md', html: `<b>${L.html}</b>`, style: { whiteSpace: 'nowrap' } });
				} else {
					inner = h('div', { class: 'o-md', style: { display: 'flex', alignItems: 'baseline' } },
						h('span', { text: `${L.mark} ${L.n}.`, style: { flex: 'none', whiteSpace: 'pre', marginRight: '.4em' } }),
						h('span', { style: { flex: '1', minWidth: '0' } },
							h('span', { text: L.crit, style: { whiteSpace: 'nowrap' } }), ' ',
							h('span', { text: `— ${L.note}`, style: { whiteSpace: 'nowrap', color: '#bdb3a8' } })));
				}
				return h('div', { style: { position: 'relative', paddingBottom: px([7, 7, 6, 7, 0][i]) } }, inner);
			});
			rev.card.body.appendChild(h('div', { style: { position: 'relative' } }, ...lines));
			S.tailLine = lines[4];

			// ---- round 2: the leader's re-plan card.
			const lead = mkCard({ title: 'ラウンド 2 / 5: 未達の部分をやり直す', role: 'リーダー' });
			lead.card.body.append(
				h('div', { class: 'o-md', text: '満たせていない条件:', style: { fontSize: '12.5px' } }),
				h('div', { class: 'o-md', style: { fontSize: '12.5px' } }, h('ul', { style: { margin: '1px 0 0' } }, h('li', { text: K.COND2 }))));

			// ---- fast-forward content (illegible): round-2 FLOW, prep card, coder card.
			const row = (...kids) => h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', height: '20px' } }, ...kids);
			const flow = h('div', { style: { paddingTop: '4px' } },
				h('div', { class: 'o-md', text: '📋 FLOW', style: { fontSize: '16px', fontWeight: '700', color: '#f7f2ea', lineHeight: '1.4' } }),
				h('div', { class: 'o-md', html: '📂 <b>準備:</b> 作業フォルダのファイルを読み込み、各 AI に渡します（AI は使いません）', style: { marginTop: '6px' } }),
				h('div', { style: { marginTop: '6px' } },
					row(h('span', { class: 'o-md', text: 'ラウンド 2:', style: { whiteSpace: 'nowrap' } }), bar('100%', { hgt: 8, col: '#2a2522', style: { flex: '1' } })),
					row(bar('74%', { hgt: 8, col: '#2a2522' }))),
				h('div', { style: { marginTop: '4px' } },
					row(bar(16, { hgt: 8, col: '#2a2522' }), bar(52, { hgt: 8 }), bar('46%', { hgt: 8, col: '#2a2522' })),
					row(bar(16, { hgt: 8, col: '#2a2522' }), bar(60, { hgt: 8 }), bar('30%', { hgt: 8, col: '#2a2522' }))));
			const prep = mkCard({ title: '', role: K.PREP.badge });
			prep.card.head.querySelector('.o-card-title').appendChild(bar('38%'));
			const coder = mkCard({ title: '', role: K.TASKS[2].badge });
			coder.card.head.querySelector('.o-card-title').appendChild(bar('64%'));
			const code = h('div', { style: { position: 'relative', overflow: 'hidden', background: '#0e0c0b', borderRadius: '4px', padding: '5px 8px' } });
			S.codeLines = CODE_PAT.map(([indent, segs]) => {
				const ln = h('div', { style: { height: px(LINE), display: 'flex', alignItems: 'center', gap: '6px', paddingLeft: px(indent * 16) } },
					...segs.map(([tone, w]) => bar(w, { hgt: 6, col: TONES[tone] })));
				code.appendChild(ln);
				return ln;
			});
			coder.card.body.appendChild(code);
			S.code = code;

			// ---- separator + the round-2 command card.
			const hr = h('div', { style: { height: '1px', background: '#262120', margin: '4px 0' } });
			const cmd2 = mkCard({ title: K.CMD.title, role: K.CMD.badge });
			const cmdLine = h('div', { style: { lineHeight: '1.5' } }, h('b', { text: K.CMD.command, style: { fontFamily: 'var(--mono)', fontWeight: '600', color: '#f7f2ea', whiteSpace: 'pre' } }));
			const resProbe = h('span', { style: { display: 'inline-block', width: '0', height: '0', verticalAlign: 'baseline' } });
			const resText = h('div', { class: 'o-md', style: { display: 'inline-block', fontSize: px(RES), lineHeight: '1.5', color: '#ece6de', whiteSpace: 'nowrap', transformOrigin: '0 55%' } }, resProbe, '✅ 成功（3.2 秒）');
			const resRow = h('div', { style: { position: 'relative', overflow: 'hidden' } }, resText);
			cmd2.card.body.append(cmdLine, resRow);

			col.append(cmd1.card.el, rev.card.el, lead.card.el, flow, prep.card.el, coder.card.el, hr, cmd2.card.el);
			S.cards = { cmd1, rev, lead, prep, coder, cmd2 };
			S.flow = flow;
			S.hr = hr;
			S.res = { row: resRow, text: resText };

			// ---- measure once (native px). Bodies are given explicit heights in draw().
			cmd1.card.draw(0, 'done', 0);
			rev.card.draw(0, 'running', 1);
			lead.card.draw(0, 'running', 1);
			prep.card.draw(0, 'done', 0);
			coder.card.draw(0, 'done', 1);
			cmd2.card.draw(0, 'running', 1);
			for (const o of [rev, lead, coder, cmd2]) { o.card.body.style.maxHeight = 'none'; o.card.body.style.height = 'auto'; }
			const zf = col.getBoundingClientRect().width / HAND.w;
			const hgt = el => el.getBoundingClientRect().height / zf;
			const colTop = () => col.getBoundingClientRect().top;
			const relTop = el => (el.getBoundingClientRect().top - colTop()) / zf;
			const revInner = rev.card.body.firstChild;
			S.H = {
				rev: hgt(revInner),
				lead: hgt(lead.card.body) - 15, // content only (padding 6 + 8, border 1)
				cmdLine: hgt(cmdLine),
				res: hgt(resText),
			};
			resRow.style.height = px(S.H.res);
			S.resBase = (resProbe.getBoundingClientRect().top - resText.getBoundingClientRect().top) / zf;
			// Final layout before the hit: leader collapsed, coder open with N lines, command open.
			lead.card.draw(0, 'done', 0);
			coder.card.body.style.height = px(15 + 10);
			code.style.height = px(10);
			col.style.width = px(COL_W);
			const tailTop = relTop(S.tailLine);
			const cmdTop0 = relTop(cmd2.card.el);
			// Result baseline inside the command card (native): card border + header + body border
			// + body padding + $ line + baseline.
			const headH = hgt(cmd2.card.head);
			const resBaseInCard = 1 + headH + 1 + 6 + S.H.cmdLine + S.resBase;
			// The result baseline lands on RES_BASELINE after the 1100 px whip; the code card
			// gets however many lines put the 🔁 tail at TAIL_TARGET before it.
			const fTop = RES_BASELINE - Z * resBaseInCard;
			const N = u.clamp(Math.round(((fTop + FF_DIST - TAIL_TARGET) / Z - (cmdTop0 - tailTop)) / LINE), 6, CODE_PAT.length);
			S.Y1 = fTop + FF_DIST - Z * (cmdTop0 + N * LINE);
			// The visible code is the pattern's last N lines, so the block always ends on a closing line.
			const first = CODE_PAT.length - N;
			S.codeLines.forEach((ln, i) => { ln.style.display = i >= first ? 'flex' : 'none'; });
			S.codeLines = S.codeLines.slice(first);
			// Fast-forward streaming keeps pace with the scroll: each line types in as it comes within
			// 30 native px of the band's bottom edge (never earlier than a quick .03 s stagger).
			const codeTop = relTop(code) + 5;
			const invInOutCubic = e => e < .5 ? Math.cbrt(e / 4) : 1 - Math.cbrt(2 * (1 - e)) / 2;
			const tEnter = y => {
				const need = (S.Y1 - VIEW[1] + Z * (y + 30)) / FF_DIST;
				return need <= 0 ? FF : need >= 1 ? FF + FF_DUR : FF + FF_DUR * invInOutCubic(need);
			};
			S.lineAt = S.codeLines.map((_, j) => Math.max(CODE_T0 + j * .03, tEnter(codeTop + (j + 1) * LINE)));
			col.style.width = px(HAND.w);

			// ======================================================== RISER VIGNETTE (tightens from 4.0)
			S.vignette = h('div', { class: 'fill', style: { pointerEvents: 'none' } });
			root.appendChild(S.vignette);

			// ======================================================== CAPTIONS + FOOTNOTE
			const capLayer = h('div', { class: 'fill' });
			root.appendChild(capLayer);
			S.cap = c.captionLines(['テストが落ちても、', '自分たちで、やり直す。'], { baselines: [860, 950], gold: ['やり直す'] });
			capLayer.append(...S.cap.els);
			S.foot = c.footnote('※ ラウンドの上限は既定 5（設定で変更できます）', { x: 1800, baseline: 1030, align: 'right' });
			capLayer.appendChild(S.foot.el);

			// ======================================================== BRIGHTEN (7.5–8.0, +5%)
			// color-dodge with rgb(13,13,13) multiplies every channel by 255/242 ≈ 1.054; blacks stay black.
			S.bright = h('div', { class: 'fill', style: { background: 'rgb(13,13,13)', mixBlendMode: 'color-dodge', pointerEvents: 'none' } });
			root.appendChild(S.bright);

			// Same reasoning as 05: per-glyph will-change makes rasterization depend on draw order.
			for (const ch of root.querySelectorAll('.ch')) { ch.style.willChange = 'auto'; }
			return S;
		},

		draw(t, S) {
			S.backdrop.draw(t);

			// ==================================================== RING
			const ringS = u.lerp(1, RING_S, u.p(t, RISER, RISER_END - RISER, ease.inOutSine));
			u.tf(S.ringG, { s: ringS, origin: `${RC[0]}px ${RC[1]}px` });

			// Round-1 lap: complete at 40%, spins 360° over 1.0–2.2, fades out 2.2–2.6.
			const rk = u.p(t, ROT, ROT_DUR);
			const rot = 360 * ease.inOutCubic(rk);
			const o1 = .4 * (1 - u.p(t, RESET, RESET_DUR, ease.inOutSine));
			S.lap1.g.setAttribute('transform', `rotate(${rot.toFixed(3)})`);
			S.lap1.g.setAttribute('opacity', o1.toFixed(3));
			S.lap1.g.style.display = o1 > .001 ? 'inline' : 'none';
			// Trail: conic smear 60° behind the arrowhead, as strong as the spin is fast.
			const vel = rk <= 0 || rk >= 1 ? 0 : (rk < .5 ? 4 * rk * rk : 4 * (1 - rk) * (1 - rk));
			const tipCss = deg(A0 + X_FULL) + rot + 90;
			S.trail.style.background = `conic-gradient(from ${(tipCss - TRAIL).toFixed(2)}deg at 50% 50%, rgba(198,167,105,0) 0deg, rgba(198,167,105,.3) ${TRAIL - 1}deg, rgba(198,167,105,0) ${TRAIL}deg)`;
			S.trail.style.opacity = vel.toFixed(3);
			S.trail.style.visibility = vel > .001 ? 'visible' : 'hidden';

			// Round-2 lap: the arrowhead appears at the top 2.2–2.6, then draws clockwise 2.6–7.5.
			const sweep = X_FULL * ease.inOutSine(u.p(t, LAP, LAP_DUR));
			S.lap2.set(sweep);
			const o2 = u.p(t, RESET, RESET_DUR, ease.inOutSine);
			S.lap2.g.setAttribute('opacity', o2.toFixed(3));
			S.lap2.g.style.display = o2 > .001 ? 'inline' : 'none';
			// Completion flash at 7.5 (.3 s).
			const fl = u.keys(t, [[HIT, 0], [HIT + .06, 1, ease.outCubic], [HIT + FLASH, 0, ease.inOutSine]]);
			S.flash.setAttribute('opacity', (.95 * fl).toFixed(3));
			S.flash.style.display = fl > .001 ? 'inline' : 'none';

			// Ticks: #1 stamps muted rose at 0.4 (round 1 unmet); #2 turns gold with a glow at 7.5.
			S.ticks.forEach((el, i) => {
				let col = hex('#3a3330'), s = 1, glow = 0;
				if (i === 0) {
					const k = u.p(t, TICK1, STAMP, ease.outCubic);
					col = mix('#3a3330', ROSE, k);
					s = k > 0 ? u.lerp(1.7, 1, k) : 1;
				} else if (i === 1) {
					const k = u.p(t, HIT, STAMP, ease.outCubic);
					col = mix('#3a3330', C.gold, k);
					s = k > 0 ? u.lerp(1.7, 1, k) : 1;
					glow = k;
				}
				el.style.background = rgb(col);
				el.style.boxShadow = glow > 0 ? `0 0 ${(18 * glow).toFixed(2)}px rgba(198,167,105,${(.9 * glow).toFixed(3)})` : 'none';
				u.tf(el, { s });
			});

			// Odometer 1 → 2 (old digit slides up and out, new digit slides up and in).
			const ok = u.p(t, ODO, ODO_DUR, ease.inOutCubic);
			u.tf(S.digits[0], { y: -ok * S.BOXH, o: ok < 1 ? 1 : 0 });
			u.tf(S.digits[1], { y: (1 - ok) * S.BOXH, o: ok > 0 ? 1 : 0 });

			// Goal tokens: glide in from 05's TOKEN_1 / TOKEN_2 (48 px) to the ring (30 px).
			const fk = u.p(t, TOK_FLY, TOK_FLY_DUR, ease.inOutCubic);
			S.tok.forEach(({ tk, to, from }, i) => {
				u.tf(tk.el, { x: (from[0] - to[0]) * (1 - fk), y: (from[1] - to[1]) * (1 - fk), s: u.lerp(48 / 30, 1, fk) });
				if (i === 0) {
					tk.set('met', 1);
					u.tf(tk.disc, {});
				} else {
					// 7.5: garnet × flips to gold ✓ (.25 s scaleX flip).
					const k = u.p(t, HIT, FLIP, ease.inOutSine);
					if (k < .5) { tk.set('unmet', 1); } else { tk.set('met', u.p(t, HIT + FLIP / 2, FLIP / 2 + .1)); }
					u.tf(tk.disc, { sx: t > HIT ? Math.max(.02, Math.abs(Math.cos(Math.PI * k))) : 1 });
				}
			});

			// ==================================================== COLUMN
			const g = u.p(t, GLIDE, GLIDE_DUR, ease.inOutCubic);
			const ffP = u.p(t, FF, FF_DUR);
			const ffK = ease.inOutCubic(ffP);
			const X = u.lerp(HAND.x, COL_X, g);
			const Y = u.lerp(HAND.y, S.Y1, g) - FF_DIST * ffK;
			const sc = u.lerp(HAND.z / Z, 1, g);
			S.strip.style.transform = `translate(${X.toFixed(3)}px, ${Y.toFixed(3)}px) scale(${sc.toFixed(5)})`;
			// Whip blur: 3 px for the whole fast-forward, eased in and out with zero slope so the column
			// settles at 4.6 without snapping into focus. The peak speed (d inOutCubic / dp = 3) is
			// ~55 px/frame, so a vertical motion blur (180° shutter: a box of half the per-frame travel
			// ≈ Gaussian σ .145·v) is added on top, or the bars would strobe/alias.
			const dv = ffP <= 0 || ffP >= 1 ? 0 : ffP < .5 ? 12 * ffP * ffP : 3 * (2 - 2 * ffP) ** 2;
			const bIso = FF_BLUR * Math.min(u.p(t, FF, .25, ease.inOutSine), 1 - u.p(t, FF + FF_DUR - .5, .5, ease.inOutSine));
			const bY = Math.hypot(bIso, .145 * (FF_DIST / FF_DUR) * dv / ORC.FPS);
			if (bY > .05) {
				S.mblur.setAttribute('stdDeviation', `${bIso.toFixed(2)} ${bY.toFixed(2)}`);
				S.strip.style.filter = 'url(#gl06-mblur)';
			} else {
				S.mblur.setAttribute('stdDeviation', '0 0');
				S.strip.style.filter = 'none';
			}
			S.col.style.width = px(u.lerp(HAND.w, COL_W, g));
			// Visible band: wide open while matching 05, then soft-edged at y 100–940.
			const mA = u.lerp(-FADE, VIEW[0], g), mD = u.lerp(1080 + FADE, VIEW[1], g);
			const mask = `linear-gradient(to bottom, transparent ${mA.toFixed(1)}px, #000 ${(mA + FADE).toFixed(1)}px, #000 ${(mD - FADE).toFixed(1)}px, transparent ${mD.toFixed(1)}px)`;
			S.view.style.maskImage = mask;
			S.view.style.webkitMaskImage = mask;

			const { cmd1, rev, lead, prep, coder, cmd2 } = S.cards;
			const lt = tau(t);
			const card = (o, tt, state, openK, runK = state === 'running' ? 1 : 0) => {
				o.card.draw(tt, state, openK);
				o.card.body.style.maxHeight = 'none';
				o.inner.style.display = 'none';
				const show = runK > .001;
				o.loader.el.style.display = show ? 'block' : 'none';
				o.loader.el.style.opacity = runK.toFixed(3);
				if (show) { o.loader.draw(lt); }
				o.sheen.style.opacity = state === 'running' ? runK.toFixed(3) : '0';
				o.card.el.classList.toggle('running', runK >= .5);
			};
			const rise = (el, at, fade = 1) => { const k = u.p(t, at, RISE, ease.outCubic); u.tf(el, { y: (1 - k) * 10, o: k * fade }); return k; };

			// Round 1 (from 05): dims .7 → .6; the reviewer finishes as the leader takes over.
			const oldO = u.lerp(HAND.o, TAIL_O, g);
			cmd1.card.draw(t + 16, 'done', 0);
			u.tf(cmd1.card.el, { o: oldO });
			rev.card.draw(t + 8, 'running', 1); // 05 drew it with its own clock (8 s in)
			const rd = u.p(t, REV_DONE, REV_DONE_DUR);
			rev.inner.style.opacity = (1 - rd).toFixed(3);
			rev.sheen.style.opacity = (1 - rd).toFixed(3);
			rev.card.el.classList.toggle('running', rd < .5);
			setBody(rev.card, 1, S.H.rev);
			u.tf(rev.card.el, { o: oldO });

			// Leader card: rises running at 0.6, opens, collapses 2.2 (done).
			rise(lead.card.el, LEAD);
			const lOpen = u.p(t, LEAD_OPEN, OPEN, ease.outCubic) * (1 - u.p(t, LEAD_CLOSE, CLOSE, ease.inOutCubic));
			card(lead, t, t < LEAD_CLOSE + CLOSE ? 'running' : 'done', lOpen, t < LEAD ? 0 : 1 - u.p(t, LEAD_CLOSE, CLOSE));
			setBody(lead.card, lOpen, S.H.lead);
			const lBodyO = u.p(t, LEAD_OPEN + .08, .3, ease.outCubic) * (1 - u.p(t, LEAD_CLOSE, CLOSE * .6, ease.outCubic));
			for (const el of lead.card.body.children) { u.tf(el, { o: lBodyO }); }

			// Fast-forward content.
			rise(S.flow, FLOW_AT);
			rise(prep.card.el, PREP_AT);
			card(prep, t, t < PREP_DONE ? 'running' : 'done', 0, t < PREP_AT ? 0 : 1 - u.p(t, PREP_DONE, .12));
			rise(coder.card.el, CODER_AT);
			const cRun = t < CODER_DONE + .2 ? 'running' : 'done';
			card(coder, t, cRun, t >= CODER_AT ? 1 : 0, t < CODER_AT ? 0 : 1 - u.p(t, CODER_DONE, .2));
			let codeH = 0;
			S.codeLines.forEach((ln, i) => {
				const at = S.lineAt[i];
				codeH += LINE * u.p(t, at, .1, ease.outCubic);
				const k = u.p(t, at, .14, ease.outCubic);
				ln.style.clipPath = k >= 1 ? 'none' : `inset(0 ${((1 - k) * 100).toFixed(2)}% 0 0)`;
				ln.style.opacity = k > 0 ? '1' : '0';
			});
			S.code.style.height = px(10 + codeH);
			setBody(coder.card, t >= CODER_AT ? 1 : 0, 10 + codeH);

			// Separator + command card: rises running at 4.8; 「✅ 成功（3.2 秒）」 stamps in at 7.5.
			const hk = u.p(t, CMD, RISE, ease.outCubic);
			S.hr.style.opacity = hk.toFixed(3);
			rise(cmd2.card.el, CMD);
			card(cmd2, t, 'running', t >= CMD ? 1 : 0, t < CMD ? 0 : 1 - u.p(t, HIT, .25));
			// The row opens just ahead of the hit so the stamp itself is never clipped.
			const gk = u.p(t, HIT - RES_GROW, RES_GROW, ease.outCubic);
			S.res.row.style.height = px(S.H.res * gk);
			c.stamp(S.res.text, t, HIT, STAMP);
			setBody(cmd2.card, t >= CMD ? 1 : 0, S.H.cmdLine + S.H.res * gk);

			// ==================================================== RISER VIGNETTE + BRIGHTEN
			const vk = u.p(t, RISER, RISER_END - RISER, ease.inOutSine);
			S.vignette.style.background = `radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) ${u.lerp(70, 40, vk).toFixed(2)}%, rgba(0,0,0,${(.58 * vk).toFixed(3)}) 100%)`;
			S.vignette.style.opacity = vk > 0 ? '1' : '0';
			const bk = u.p(t, HIT, .3, ease.outCubic);
			S.bright.style.opacity = bk.toFixed(3);
			S.bright.style.visibility = bk > .001 ? 'visible' : 'hidden';

			// ==================================================== CAPTIONS + FOOTNOTE (hold to the cut)
			reveal(S.cap.lines[0].chars, t, CAP1);
			reveal(S.cap.lines[1].chars, t, CAP2);
			u.tf(S.foot.el, { o: u.p(t, FOOT, FOOT_DUR, ease.outCubic) });
		},
	});

	// c.reveal with the shared caption motion (stagger .035, .55 s, 34 px, blur 10, outCubic), but the
	// finished state is written as plain 'none' so a glyph that was mid-reveal earlier in the page's
	// life rasterizes exactly like one drawn fresh.
	function reveal(chars, t, start) {
		chars.forEach((ch, i) => {
			const k = u.p(t, start + i * .035, .55, ease.outCubic);
			if (k >= 1) {
				ch.style.transform = 'none';
				ch.style.opacity = '1';
				ch.style.visibility = 'visible';
				ch.style.filter = 'none';
				return;
			}
			u.tf(ch, { y: (1 - k) * 34, o: k, blur: (1 - k) * 10 });
		});
	}

	// Card body at openness openK with native content height `content` (padding scales too,
	// so a collapse ends exactly at the header with no residual padding jump).
	function setBody(card, openK, content) {
		const b = card.body;
		b.style.maxHeight = 'none';
		b.style.paddingTop = px(6 * openK);
		b.style.paddingBottom = px(8 * openK);
		b.style.height = px(1 + openK * (14 + content));
	}
})();
