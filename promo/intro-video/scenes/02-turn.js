// 02-turn — global 12.0–17.0 (BUILD). The turn: 「もし、AI に指揮者がいたら。」
// 01's grey copy-paste thread arrives as a scribbled knot, untangles left to right
// into Orchestra's own two-strand brand mark (the splash law from workbench.ts /
// c.mark), the ORCHESTRA wordmark tracks in with its red gloss and hairline meter,
// and on 16.5–17.0 everything is drawn into a gold point at P_ROBOT, where 03's
// titlebar robot icon sits. 03 is a hard cut, so the last frame equals 03's first.
(() => {
	const { u, c, ease } = ORC;
	const { h, svg, lerp, clamp } = u;
	const K = ORC.k;
	const C = K.COLORS;

	// ------------------------------------------------------------ timing (scene seconds)
	const FRAME = 1 / ORC.FPS;
	const END = 5 - FRAME;                         // last frame drawn before the cut to 03
	const CAP_IN = .3, CAP_TINT = 1.2;             // caption reveal; grey -> ivory over .3–1.5
	const RED_AT = 2.6, RED_DUR = .4;              // 「指揮者」 -> brand red
	const UNTANGLE = 1.0, WAVE = .6, SETTLE = 1.0; // A_i = 1 - inOutCubic((t - 1 - .6 xn) / 1)
	const SWAP = 2.6, LIGHT_DUR = .3, LAUNCH_DUR = .6;
	const LIFT = .3, LIFT_DUR = 2.1;               // warm uplight .3–2.4
	const WHITE = .6, WHITE_DUR = 1.8;             // splash white glow
	const BLOOM = 1.6, BLOOM_DUR = 1.3;            // red bloom follows the colour
	const BG = 2.4, BG_DUR = .8;                   // backdrop 2.4–3.2
	const WM = 3.0, WM_DUR = 1.0;                  // wordmark track-in
	const GLOSS = 3.6, GLOSS_DUR = .8;
	const HAIR = 4.0, HAIR_DUR = .5, METER_PERIOD = 1.2;
	const OUT = 4.5, OUT_DUR = END - OUT;          // handoff, complete on the last frame
	const POINT = 4.8;
	const CAP_OUT = 4.7;

	// ------------------------------------------------------------ geometry
	// The splash mark law (lib/components.js MARK_SPLASH = workbench.ts splashStrandY).
	const G = { W: 266, H: 120, CY: 60, X0: 10, X_OPEN: 164, X_END: 232, PERIOD: 76, AMP: 14, RAMP: 56, OPEN_BASE: 28, OPEN_WOBBLE: 4, CYCLE: 6, STROKE: 2.4, BACK: 1.5 };
	const MARK_W = 1500;
	const SC = MARK_W / G.W;                       // 5.639 screen px per mark unit
	const BOX = { x: 210, y: 132, h: G.H * SC };   // strands centre on y 470
	const smooth = k => k * k * (3 - 2 * k);
	function strandY(x, phase, side) {
		const amp = G.AMP * clamp((x - G.X0) / G.RAMP);
		const weave = G.CY + side * amp * Math.sin((2 * Math.PI * (x - G.X0)) / G.PERIOD + phase);
		if (x <= G.X_OPEN) { return weave; }
		const k = smooth((x - G.X_OPEN) / (G.X_END - G.X_OPEN));
		return weave * (1 - k) + (G.CY + side * (G.OPEN_BASE + G.OPEN_WOBBLE * Math.cos(phase))) * k;
	}
	// c.mark.draw(t) weaves with phase 2πt/CYCLE (0 at t = 0). The untangling threads aim
	// at that same live shape, so the hand-over to c.mark at 2.6 is seamless.
	const phaseAt = t => (2 * Math.PI * t) / G.CYCLE;

	// Tangle: two 240-point threads, P_i = M_i + A_i·N_i (screen px).
	const N = 240, CHUNK = 8, NCH = Math.ceil((N - 1) / CHUNK);
	const KNOT = { x0: 210, x1: 1710, y0: 300, y1: 640 };
	const GREY = '#8a92a3', THREAD_W = 1.5;
	// The raw scribble overshoots the knot box (±240 px against a 170 px half-height), so it
	// is folded in with tanh about the box centre: smooth, no flat edges, always inside.
	const fold = (v, lo, hi) => { const m = (lo + hi) / 2, r = (hi - lo) / 2; return m + r * Math.tanh((v - m) / r); };

	// ------------------------------------------------------------ helpers
	const hex = s => [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16));
	const RED_TEXT = 'linear-gradient(100deg, #c9273b 0%, #ff6174 50%, #e02431 100%)';
	const px = v => `${v}px`;
	// Catmull-Rom through pts[s..e] (same construction as c.mark's pathFor), tangents from
	// the neighbours so consecutive chunks join smoothly.
	function crPath(pts, s, e) {
		const at = i => pts[Math.min(pts.length - 1, Math.max(0, i))];
		const n = v => v.toFixed(3);
		let d = `M${n(pts[s][0])},${n(pts[s][1])}`;
		for (let i = s; i < e; i++) {
			const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
			d += ` C${n(p1[0] + (p2[0] - p0[0]) / 6)},${n(p1[1] + (p2[1] - p0[1]) / 6)} ${n(p2[0] - (p3[0] - p1[0]) / 6)},${n(p2[1] - (p3[1] - p1[1]) / 6)} ${n(p2[0])},${n(p2[1])}`;
		}
		return d;
	}
	const xAt = i => G.X0 + (G.X_END - G.X0) * i / (N - 1);
	// The mark strand sampled at 240 points (mark units).
	function markPts(t, side) {
		const phase = phaseAt(t);
		const pts = new Array(N);
		for (let i = 0; i < N; i++) { const x = xAt(i); pts[i] = [x, strandY(x, phase, side)]; }
		return pts;
	}
	// One thread at time t: points (mark units) and A_i.
	function threadAt(t, side) {
		const M = markPts(t, side);
		const drift = .15 * t;
		const off = side < 0 ? 0 : N; // strand b continues the scribble, so the two threads differ
		const pts = new Array(N), amt = new Array(N);
		for (let i = 0; i < N; i++) {
			const xn = i / (N - 1);
			const mx = BOX.x + M[i][0] * SC, my = BOX.y + M[i][1] * SC;
			const j = i + off;
			const nx = 220 * u.noise(j * .11 + drift, 3) + 60 * Math.sin(j * .9);
			const ny = 180 * u.noise(j * .13 + drift, 5) + 60 * Math.cos(j * .7);
			const tx = fold(mx + nx, KNOT.x0, KNOT.x1), ty = fold(my + ny, KNOT.y0, KNOT.y1);
			const A = 1 - ease.inOutCubic(clamp((t - UNTANGLE - WAVE * xn) / SETTLE));
			// Colour and weight follow A; the displacement follows A³ so the small loops are
			// pulled out early and the thickening strand never wobbles like a noodle.
			const D = A * A * A;
			pts[i] = [(lerp(mx, tx, D) - BOX.x) / SC, (lerp(my, ty, D) - BOX.y) / SC];
			amt[i] = A;
		}
		return { pts, amt };
	}

	// ------------------------------------------------------------ build
	function build(root) {
		const S = {};
		const P = K.P_ROBOT;

		// ======================================================== BACKGROUND
		root.appendChild(h('div', { class: 'fill', style: { background: '#050608' } }));
		S.bg = c.backdrop({ tint: 'red' });
		root.appendChild(S.bg.el);
		// Warm uplight rising from below (.3–2.4).
		S.uplight = h('div', { class: 'abs', style: { left: '-140px', width: '2200px', top: '700px', height: '900px', borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(198,167,105,.06), rgba(198,167,105,.025) 55%, transparent)' } });
		root.appendChild(S.uplight);

		// ======================================================== BRAND GROUP (drawn into P_ROBOT)
		S.brand = h('div', { class: 'fill', style: { transformOrigin: `${P.x}px ${P.y}px` } });
		root.appendChild(S.brand);
		// Splash background glow (white 3.5 %, 1100x500 at (960, 470)).
		S.whiteGlow = h('div', { class: 'abs', style: { left: '410px', top: '220px', width: '1100px', height: '500px', borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(255,255,255,.035), rgba(255,255,255,.012) 60%, transparent)' } });
		// Red bloom: the look of a 1100x500 rgba(216,40,59,.18) ellipse under blur(60px), as a
		// gradient. A real CSS blur gets a hard elliptical edge in Chromium once the group is
		// scaled for the handoff. Plateau to r .45, then a (1 - s²)³ fall with no rim.
		const bloomStops = [];
		for (let i = 0; i <= 16; i++) {
			const r = i / 16, s = clamp((r - .45) / .55);
			bloomStops.push(`rgba(216,40,59,${(.18 * Math.pow(1 - s * s, 3)).toFixed(4)}) ${(r * 100).toFixed(1)}%`);
		}
		S.bloom = h('div', { class: 'abs', style: { left: '260px', top: '90px', width: '1400px', height: '760px', background: `radial-gradient(closest-side, ${bloomStops.join(', ')})` } });
		S.brand.append(S.whiteGlow, S.bloom);

		// ---- custom threads: same viewBox and box as c.mark, so units, depth mask, gradient
		//      and aura are identical and the hand-over at 2.6 is invisible.
		const sv = svg('svg', { viewBox: `0 0 ${G.W} ${G.H}`, width: MARK_W, height: BOX.h, style: { position: 'absolute', left: px(BOX.x), top: px(BOX.y), overflow: 'visible' } });
		const defs = svg('defs');
		defs.appendChild(svg('linearGradient', { id: 'p02-fade', x1: G.X0, y1: 0, x2: G.X_END - 2, y2: 0, gradientUnits: 'userSpaceOnUse' },
			svg('stop', { offset: 0, 'stop-color': '#5e0b16', 'stop-opacity': 0 }),
			svg('stop', { offset: .28, 'stop-color': '#8c1223', 'stop-opacity': .9 }),
			svg('stop', { offset: .65, 'stop-color': '#c01e31' }),
			svg('stop', { offset: 1, 'stop-color': '#d8283b' })));
		defs.appendChild(svg('linearGradient', { id: 'p02-open', x1: G.X_OPEN - 12, y1: 0, x2: G.X_OPEN + 16, y2: 0, gradientUnits: 'userSpaceOnUse' },
			svg('stop', { offset: 0, 'stop-color': '#fff', 'stop-opacity': 0 }), svg('stop', { offset: 1, 'stop-color': '#fff' })));
		S.shifts = [];
		for (const [side, sign] of [['a', -1], ['b', 1]]) {
			const fill = svg('linearGradient', { id: `p02-d${side}`, x1: G.X0, y1: 0, x2: G.X0 + G.PERIOD, y2: 0, gradientUnits: 'userSpaceOnUse', spreadMethod: 'repeat' });
			for (let i = 0; i <= 24; i++) {
				const z = sign * Math.cos((2 * Math.PI * i) / 24);
				fill.appendChild(svg('stop', { offset: (i / 24).toFixed(3), 'stop-color': '#fff', 'stop-opacity': smooth(clamp((z + .4) / .8)).toFixed(3) }));
			}
			const shift = svg('rect', { x: -20, y: -20, width: G.W + 40 + G.PERIOD, height: G.H + 40, fill: `url(#p02-d${side})` });
			S.shifts.push(shift);
			defs.append(fill, svg('mask', { id: `p02-m${side}`, maskUnits: 'userSpaceOnUse', x: -20, y: -20, width: G.W + 40, height: G.H + 40 },
				shift, svg('rect', { x: -20, y: -20, width: G.W + 40, height: G.H + 40, fill: 'url(#p02-open)' })));
		}
		defs.appendChild(svg('filter', { id: 'p02-glow', x: '-60%', y: '-60%', width: '220%', height: '220%' },
			svg('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: 3, result: 'blur' }),
			svg('feColorMatrix', { in: 'blur', type: 'matrix', values: '1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.45 0', result: 'aura' }),
			svg('feMerge', {}, svg('feMergeNode', { in: 'aura' }), svg('feMergeNode', { in: 'SourceGraphic' }))));
		sv.appendChild(defs);

		// Four layers per thread, chunked so weight and colour can travel along it:
		//   back      red gradient, unmasked, .5            (c.mark's thin back strand)
		//   greyBack  the grey thread at the back's weight, fading out
		//   front     red gradient, depth-masked, with aura  (c.mark's front strand)
		//   greyFront the grey thread at the front's weight, depth-masked, fading out
		// Interior chunk ends are butt-capped: round caps would overlap and bead where the
		// stroke is translucent. The outer ends are round, as in c.mark.
		const chunk = (stroke, j) => svg('path', { fill: 'none', stroke, 'stroke-linejoin': 'round', 'stroke-linecap': j === 0 || j === NCH - 1 ? 'round' : 'butt' });
		const backG = svg('g'), greyBackG = svg('g');
		sv.append(backG, greyBackG);
		S.threads = [-1, 1].map((side, si) => {
			const id = si ? 'b' : 'a';
			const frontG = svg('g', { mask: `url(#p02-m${id})`, filter: 'url(#p02-glow)' });
			const greyFrontG = svg('g', { mask: `url(#p02-m${id})` });
			const L = { back: [], greyBack: [], front: [], greyFront: [] };
			for (let j = 0; j < NCH; j++) {
				L.back.push(chunk('url(#p02-fade)', j));
				L.greyBack.push(chunk(GREY, j));
				L.front.push(chunk('url(#p02-fade)', j));
				L.greyFront.push(chunk(GREY, j));
			}
			backG.append(...L.back);
			greyBackG.append(...L.greyBack);
			frontG.append(...L.front);
			greyFrontG.append(...L.greyFront);
			return { side, L, frontG, greyFrontG };
		});
		for (const th of S.threads) { sv.appendChild(th.frontG); }
		for (const th of S.threads) { sv.appendChild(th.greyFrontG); }
		S.custom = sv;
		S.brand.appendChild(sv);

		// ---- the product's own mark: takes over at 2.6, then weaves, launches and shines.
		S.mark = c.mark({ width: MARK_W, variant: 'splash', glow: true });
		S.markWrap = h('div', { class: 'abs', style: { left: px(BOX.x), top: px(BOX.y) } }, S.mark.el);
		S.brand.appendChild(S.markWrap);
		// Its strand paths in document order: back a, back b, front a, light a, front b, light b.
		const mp = S.mark.el.querySelectorAll('path');
		S.markPaths = [[mp[0], mp[2], mp[3]], [mp[1], mp[4], mp[5]]];

		// ======================================================== WORDMARK + HAIRLINE
		// Inter 400 (fonts/ has no 300), letter-spacing .9em -> .62em, centred on its glyphs.
		const wm = c.textAt('ORCHESTRA', { x: 960, baseline: 700, size: 40, weight: 400, family: 'var(--en)', color: '#ece6de', align: 'center', letterSpacing: '0', shadow: false, parent: S.brand });
		S.wm = wm.el;
		S.wmChars = wm.chars;
		S.wmOff = wm.chars.map(ch => ch.offsetLeft);
		S.wmW0 = wm.width;
		// The splash gloss: one 260 % background shared by every letter (per-letter offsets).
		for (const ch of wm.chars) {
			u.css(ch, { color: 'transparent', WebkitBackgroundClip: 'text', backgroundClip: 'text', backgroundRepeat: 'no-repeat', backgroundImage: 'linear-gradient(100deg, #ece6de 42%, #d8283b 50%, #ece6de 58%)' });
		}
		S.hair = h('div', { class: 'abs', style: { left: '932px', top: '740px', width: '56px', height: '1px', background: 'rgba(255,255,255,.22)' } });
		S.meter = h('div', { class: 'abs', style: { left: '932px', top: '740px', width: '6px', height: '1px', background: '#d8283b', boxShadow: '0 0 4px 1px rgba(216,40,59,.9), 0 0 12px 2px rgba(216,40,59,.35)' } });
		S.brand.append(S.hair, S.meter);

		// ======================================================== CAPTION (Caption L, baseline 900)
		const capLayer = h('div', { class: 'fill' });
		root.appendChild(capLayer);
		const CAP = 'もし、AI に指揮者がいたら。';
		// Optical centring: the trailing 。 carries half an em of blank space (as in 01).
		S.cap = c.textAt(CAP, { x: 960 + .25 * 80, baseline: 900, size: 80, weight: 900, color: '#c4c9d4', align: 'center', parent: capLayer });
		const from = Array.from(CAP).join('').indexOf('指揮者');
		S.redIdx = [from, from + 1, from + 2];
		const c0 = S.cap.chars[from], c2 = S.cap.chars[from + 2];
		const wordW = c2.offsetLeft + c2.offsetWidth - c0.offsetLeft;
		// 「指揮者」: a brand-red copy of each glyph laid exactly over it, faded in at 2.6.
		S.redOver = S.redIdx.map(i => {
			const ch = S.cap.chars[i];
			ch.style.position = 'relative';
			const over = h('span', { text: ch.textContent, style: { position: 'absolute', left: '0', top: '0', whiteSpace: 'pre', color: 'transparent', textShadow: 'none', backgroundImage: RED_TEXT, backgroundSize: `${wordW}px 100%`, backgroundPosition: `${-(ch.offsetLeft - c0.offsetLeft)}px 0`, WebkitBackgroundClip: 'text', backgroundClip: 'text' } });
			ch.appendChild(over);
			return over;
		});

		// base.css gives every .ch span `will-change: transform, opacity`, which makes each glyph
		// a composited layer whose raster Chromium keeps and merely translates/resamples. A
		// frame then depends on which frame was drawn before it (sub-pixel softening after a
		// mid-reveal or mid-hide frame). Painting the glyphs normally keeps frames a pure
		// function of t.
		for (const ch of [...S.cap.chars, ...S.wmChars]) { ch.style.willChange = 'auto'; }

		// ======================================================== GOLD POINT (03 picks it up at P_ROBOT)
		// Same element and style as 03's S.point, so the cut is seamless.
		S.point = h('div', { class: 'abs', style: { left: px(P.x - 6), top: px(P.y - 6), width: '12px', height: '12px', borderRadius: '50%', background: C.goldHi, boxShadow: `0 0 24px ${C.gold}` } });
		root.appendChild(S.point);
		return S;
	}

	// ------------------------------------------------------------ threads
	function drawThreads(t, S) {
		const thin = THREAD_W / SC; // 1.5 screen px in mark units
		for (const th of S.threads) {
			const { pts, amt } = threadAt(t, th.side);
			for (let j = 0; j < NCH; j++) {
				const s = j * CHUNK, e = Math.min(N - 1, s + CHUNK);
				const d = crPath(pts, s, e);
				const k = 1 - amt[Math.round((s + e) / 2)]; // settled share of this chunk
				const wb = lerp(thin, G.BACK, k), wf = lerp(thin, G.STROKE, k);
				const set = (p, w, o) => {
					p.style.display = o > .001 ? 'inline' : 'none';
					p.setAttribute('d', d);
					p.setAttribute('stroke-width', w.toFixed(4));
					p.setAttribute('stroke-opacity', o.toFixed(4));
				};
				set(th.L.back[j], wb, .5 * k);
				set(th.L.greyBack[j], wb, 1 - k);
				set(th.L.front[j], wf, k);
				set(th.L.greyFront[j], wf, 1 - k);
			}
		}
		// The depth mask slides with the weave exactly as c.mark's does.
		const off = -((phaseAt(t) / (2 * Math.PI)) % 1) * G.PERIOD;
		for (const sh of S.shifts) { sh.setAttribute('transform', `translate(${off.toFixed(3)} 0)`); }
	}

	// ------------------------------------------------------------ draw
	function draw(t, S) {
		// ---------------------------------------------------- background
		S.bg.draw(t); // same clock as 03's bgRed.draw(t + 5): continuous over the cut
		u.tf(S.bg.el, { o: u.p(t, BG, BG_DUR, ease.inOutSine) });
		const outK = u.p(t, OUT, OUT_DUR);
		const lk = u.p(t, LIFT, LIFT_DUR, ease.inOutSine);
		u.tf(S.uplight, { y: 260 * (1 - lk), o: lk * (1 - u.p(t, OUT, OUT_DUR, ease.inOutSine)) });

		// ---------------------------------------------------- brand group: handoff to P_ROBOT
		const sk = ease.inCubic(outK);
		u.tf(S.brand, { s: lerp(1, .02, sk), o: 1 - sk });
		u.tf(S.whiteGlow, { o: u.p(t, WHITE, WHITE_DUR, ease.inOutSine) });
		u.tf(S.bloom, { o: u.p(t, BLOOM, BLOOM_DUR, ease.inOutSine) });

		// ---------------------------------------------------- threads -> mark
		// At 2.6 every thread point has settled and the custom layer is identical to c.mark
		// with launch 0 and light 0, so the swap is invisible; the "crossfade" is the sheen
		// fading in (2.6–2.9) while the arrowheads open (outBack .6 s).
		const swapped = t >= SWAP;
		S.custom.style.display = swapped ? 'none' : 'block';
		S.markWrap.style.display = swapped ? 'block' : 'none';
		if (!swapped) {
			drawThreads(t, S);
		} else {
			S.mark.draw(t, { reveal: 1, launch: u.p(t, SWAP, LAUNCH_DUR, ease.outBack), light: u.p(t, SWAP, LIGHT_DUR, ease.inOutSine) });
			// c.mark's 24-segment spline shows faint kinks at 1500 px; trace the same law
			// through 240 points instead (same shape, smoother at this size).
			[-1, 1].forEach((side, i) => {
				const d = crPath(markPts(t, side), 0, N - 1);
				for (const p of S.markPaths[i]) { p.setAttribute('d', d); }
			});
		}

		// ---------------------------------------------------- wordmark (3.0–4.0) + gloss (3.6–4.4)
		const wk = u.p(t, WM, WM_DUR, ease.outCubic);
		const ls = lerp(.9, .62, wk) * 40;
		const W = S.wmW0 + 8 * ls; // visible glyph run
		const g = u.p(t, GLOSS, GLOSS_DUR, ease.inOutSine);
		const bgX = lerp(-1.6 * W, 0, g); // accent (50 % of a 260 % background) sweeps left -> right
		S.wmChars.forEach((ch, j) => {
			ch.style.transform = `translateX(${((j - 4) * ls).toFixed(3)}px)`;
			ch.style.backgroundSize = `${(2.6 * W).toFixed(2)}px 100%`;
			ch.style.backgroundPosition = `${(bgX - (S.wmOff[j] - S.wmOff[0] + j * ls)).toFixed(2)}px 0`;
		});
		u.tf(S.wm, { o: wk, blur: 10 * (1 - wk) });

		// ---------------------------------------------------- hairline meter (4.0, the bar line)
		const hk = u.p(t, HAIR, HAIR_DUR, ease.outCubic);
		u.tf(S.hair, { sx: hk, o: hk });
		const mph = Math.max(0, t - HAIR) / METER_PERIOD;
		u.tf(S.meter, { x: 50 * (1 - Math.cos(2 * Math.PI * mph)) / 2, o: u.p(t, HAIR + .1, .3, ease.inOutSine) });

		// ---------------------------------------------------- caption
		const tint = u.p(t, CAP_IN, CAP_TINT, ease.inOutSine);
		const gr = hex('#c4c9d4'), iv = hex('#f7f2ea');
		const rgb = gr.map((v, i) => Math.round(lerp(v, iv[i], tint))).join(',');
		S.cap.el.style.color = `rgb(${rgb})`;
		const rk = u.p(t, RED_AT, RED_DUR, ease.inOutSine);
		S.redIdx.forEach((ci, n) => {
			S.cap.chars[ci].style.color = `rgba(${rgb},${(1 - rk).toFixed(4)})`;
			S.redOver[n].style.opacity = rk.toFixed(4);
		});
		c.reveal(S.cap.chars, t, CAP_IN);
		// Exit 4.7–5.0: c.hide compressed so the last glyph is gone on the last frame.
		if (t >= CAP_OUT) { c.hide(S.cap.chars, t, CAP_OUT, { stagger: .006, dur: END - CAP_OUT - .006 * (S.cap.chars.length - 1) }); }

		// ---------------------------------------------------- gold point at P_ROBOT (from 4.8)
		u.tf(S.point, { s: lerp(.3, 1, u.p(t, POINT, END - POINT, ease.outCubic)), o: u.p(t, POINT, .08) });
	}

	ORC.register({ id: '02-turn', duration: 5, transition: 'fade', build, draw });
})();
