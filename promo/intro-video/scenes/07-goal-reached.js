// 07-goal-reached — global 56.0–61.5 (cut on the 56 hit; MAIN, the most triumphant part).
// The emotional peak: the goal is reached in round 2. A gold burst and a faint brand-mark
// sweep land on the hit with the product's own success line, the round-2 verdict stamps in,
// then the frame opens onto the evidence: the new files (.division/*.md plus the app) and an
// illustration of the working TODO app. 「ひとことが、動くアプリに。」
(() => {
	const { u, c, ease } = ORC;
	const { h, svg } = u;
	const K = ORC.k;
	const C = K.COLORS;

	// ------------------------------------------------------------ timing (scene seconds)
	const BURST_DUR = .6;                         // ring flash + particles
	const BLOOM_DUR = .9;                         // soft gold bloom under the burst
	const SPARK_SHUTTER = .016;                   // spark streak = distance travelled in this time
	const MARK_DUR = .8, LAUNCH = .55, LAUNCH_DUR = .4;
	const MARK_O = .15, MARK_SETTLE = 0, MARK_DIM = 2.0, MARK_DIM_DUR = .8;
	const HL_STAGGER = .015, HL_DUR = .32;       // 20 glyphs → fully revealed at ≈ .6
	const STRIP = .5, STRIP_RISE = .42;
	const LINES = [.7, 1.0, 1.3];
	const CAP = 1.7;
	const SHRINK = 2.0, SHRINK_DUR = .6, HL_S = .55;
	const STRIP_OUT = 2.0, STRIP_OUT_DUR = .3;
	const FILES = 2.3, FILES_DUR = .4, ROW0 = 2.5, ROW_STEP = .12, ROW_POP = .34;
	const APP = 2.4, APP_DUR = .4;
	const TICK = 3.6;
	const NEW = 4.2, NEW_DUR = .35;

	// ------------------------------------------------------------ layout (screen px unless noted)
	const BC = [960, 360];                        // burst centre
	const HL_BASE = 330, HL_END = 150;            // headline baseline before / after the shrink
	const STRIP_BOX = { x: 400, y: 420, w: 560, z: 2 };          // w native
	const FILES_BOX = { x: 220, y: 300, w: 260, h: 280, z: 2 };  // w/h native
	const APP_BOX = { x: 1060, y: 340, w: 580, h: 520 };
	const MARK_W = 1600, MARK_H = MARK_W * 120 / 266;
	const ROW_H = 68;                             // TODO list row (screen px, the card is not zoomed)

	// ------------------------------------------------------------ helpers
	const px = v => `${v}px`;
	const hex = s => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
	const mix = (a, b, k) => { const A = hex(a), B = hex(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * u.clamp(k))).join(', ')})`; };

	// Explorer rows (storyboard ui_mock). App file names are demo content; only the three
	// .division names are verified, the rest of that folder is shown as '…'.
	const ROWS = [
		{ name: '.division', folder: true, level: 0 },
		{ name: 'LEADER.md', level: 1 },
		{ name: 'CODER.md', level: 1 },
		{ name: 'REVIEW.md', level: 1 },
		{ name: '…', level: 1, more: true },
		{ name: 'app.js', level: 0 },
		{ name: 'app.test.js', level: 0 },
		{ name: 'index.html', level: 0 },
		{ name: 'package.json', level: 0 },
	];

	ORC.register({
		id: '07-goal-reached',
		duration: 5.5,
		transition: 'cut',

		build(root) {
			const S = {};
			S.backdrop = c.backdrop({ tint: 'gold' });
			root.appendChild(S.backdrop.el);

			// ======================================================== BRAND MARK SWEEP (15 %, behind everything)
			S.mark = c.mark({ width: MARK_W, variant: 'splash', glow: true });
			S.markWrap = h('div', { class: 'abs', style: { left: px((1920 - MARK_W) / 2), top: px(540 - MARK_H / 2), width: px(MARK_W), height: px(MARK_H) } }, S.mark.el);
			root.appendChild(S.markWrap);

			// ======================================================== BURST at (960, 360)
			S.bloom = h('div', { class: 'abs', style: { left: px(BC[0] - 800), top: px(BC[1] - 450), width: '1600px', height: '900px', borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(227,207,159,.20) 0%, rgba(198,167,105,.08) 45%, rgba(198,167,105,0) 100%)', transformOrigin: '50% 50%' } });
			root.appendChild(S.bloom);
			const burst = svg('svg', { width: 1920, height: 1080, viewBox: '0 0 1920 1080', style: { position: 'absolute', left: '0', top: '0', overflow: 'visible', pointerEvents: 'none' } });
			burst.appendChild(svg('defs', {}, svg('filter', { id: 'gr07-glow', x: '-50%', y: '-50%', width: '200%', height: '200%' },
				svg('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: 3, result: 'b' }),
				svg('feMerge', {}, svg('feMergeNode', { in: 'b' }), svg('feMergeNode', { in: 'SourceGraphic' })))));
			S.ring = svg('circle', { cx: BC[0], cy: BC[1], r: 200, fill: 'none', stroke: C.goldHi, 'stroke-width': 3, filter: 'url(#gr07-glow)' });
			burst.appendChild(S.ring);
			const pg = svg('g', { filter: 'url(#gr07-glow)' });
			const rnd = u.rng(56);
			const PAL = [C.goldHi, C.gold, C.ivory];
			S.parts = Array.from({ length: 60 }, () => {
				const a = rnd() * Math.PI * 2;
				const dist = 300 + rnd() * 400;
				const size = 3 + rnd() * 3;
				const col = PAL[Math.min(2, Math.floor(rnd() * 3))];
				const r0 = 8 + rnd() * 32;
				const dur = .45 + rnd() * .15;
				// A spark: a round-capped stroke whose length follows its speed (a dot once it slows).
				const el = svg('line', { stroke: col, 'stroke-width': size.toFixed(2), 'stroke-linecap': 'round' });
				pg.appendChild(el);
				return { el, dx: Math.cos(a), dy: Math.sin(a), dist, r0, dur };
			});
			burst.appendChild(pg);
			root.appendChild(burst);

			// ======================================================== VERDICT STRIP (UI mock, zoom 2.0)
			// A bare body excerpt of the round-2 reviewer card, same markup as 05's verdict lines.
			S.stripWrap = h('div', { class: 'abs', style: { left: px(STRIP_BOX.x), top: px(STRIP_BOX.y), width: px(STRIP_BOX.w * STRIP_BOX.z), height: '0' } });
			const szb = c.zoomBox(STRIP_BOX.z, { left: '0', top: '0' });
			const strip = h('div', { class: 'o-card', style: { width: px(STRIP_BOX.w), background: '#131110', padding: '9px 12px 10px' } });
			const lineEl = (inner, pad) => {
				inner.style.transformOrigin = '0 60%';
				return { w: h('div', { style: { position: 'relative', paddingBottom: px(pad) } }, inner), inner };
			};
			const verdict = (mark, n, crit, note) => h('div', { class: 'o-md', style: { display: 'flex', alignItems: 'baseline', whiteSpace: 'nowrap' } },
				h('span', { text: `${mark} ${n}.`, style: { flex: 'none', whiteSpace: 'pre', marginRight: '.4em' } }),
				h('span', {}, h('span', { text: crit }), note ? ' ' : null, note ? h('span', { text: `— ${note}`, style: { color: '#bdb3a8' } }) : null));
			S.lines = [
				lineEl(h('div', { class: 'o-md', text: '🎯 目標との照合（ラウンド 2）', style: { fontSize: '14px', fontWeight: '700', lineHeight: '1.45', color: '#f7f2ea', whiteSpace: 'nowrap' } }), 7),
				lineEl(verdict('✅', 1, K.COND1, ''), 6),
				lineEl(verdict('✅', 2, K.COND2, '成功（3.2 秒）'), 0),
			];
			strip.append(...S.lines.map(l => l.w));
			szb.appendChild(strip);
			S.stripWrap.appendChild(szb);
			root.appendChild(S.stripWrap);

			// ======================================================== FILES PANEL (explorer mock, zoom 2.0)
			S.filesWrap = h('div', { class: 'abs', style: { left: px(FILES_BOX.x), top: px(FILES_BOX.y), width: px(FILES_BOX.w * FILES_BOX.z), height: px(FILES_BOX.h * FILES_BOX.z) } });
			const fzb = c.zoomBox(FILES_BOX.z, { left: '0', top: '0' });
			const panel = h('div', { style: { position: 'relative', width: px(FILES_BOX.w), height: px(FILES_BOX.h), background: '#131110', border: '1px solid #262120', borderRadius: '10px', overflow: 'hidden', padding: '9px 0' } });
			S.rows = ROWS.map((R, i) => {
				const twistie = h('span', { style: { width: '16px', height: '16px', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#877c72' } }, R.folder ? c.icon('chevronDown', 14) : null);
				const ico = R.folder ? null : h('span', { style: { width: '16px', height: '16px', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#877c72', marginRight: '5px' } }, R.more ? null : c.icon('file', 13, { 'stroke-width': 1.6 }));
				// File names in JetBrains Mono (style guide); the '…' row uses Noto Sans JP, whose
				// ellipsis sits mid-height and reads as "more files" rather than a truncated name.
				const name = h('span', { text: R.name, style: { font: R.more ? '500 13px/22px var(--jp)' : "400 13px/22px 'JetBrains Mono', 'Noto Sans JP', monospace", color: R.more ? '#877c72' : '#ece6de', whiteSpace: 'pre', marginLeft: R.folder ? '3px' : '0' } });
				// The 'new' dot pops by size (not a scale transform): a scaled box-shadow rasterizes
				// slightly differently depending on what was drawn before.
				const dot = R.more ? null : h('i', { style: { position: 'absolute', left: '50%', top: '50%', borderRadius: '50%', background: C.gold } });
				const dotBox = R.more ? null : h('span', { style: { position: 'relative', display: 'block', flex: 'none', marginLeft: 'auto', width: '6px', height: '6px' } }, dot);
				const content = h('div', { style: { height: '22px', display: 'flex', alignItems: 'center', paddingLeft: px(6 + R.level * 12), paddingRight: '14px', background: i === 0 ? '#24201e' : 'transparent' } }, twistie, ico, name, dotBox);
				panel.appendChild(content);
				return { el: content, dot };
			});
			fzb.appendChild(panel);
			S.filesWrap.appendChild(fzb);
			root.appendChild(S.filesWrap);

			// ======================================================== TODO ILLUSTRATION (not product UI)
			S.appWrap = h('div', { class: 'fill' });
			// Attach before c.textAt measures: on a detached parent its baseline probe reads 0 and
			// the label would land 18px low (baseline 340, on the card's top edge).
			root.appendChild(S.appWrap);
			const appLabel = c.textAt('できあがったアプリ（イメージ）', { x: APP_BOX.x, baseline: 322, size: 20, weight: 500, color: C.muted, letterSpacing: '0', shadow: false, parent: S.appWrap });
			S.appLabel = appLabel.el;
			const card = h('div', { class: 'abs', style: { left: px(APP_BOX.x), top: px(APP_BOX.y), width: px(APP_BOX.w), height: px(APP_BOX.h), background: '#1a1716', border: '1px solid #262120', borderRadius: '20px', boxShadow: '0 30px 80px rgba(0,0,0,.5)', padding: '38px 44px', overflow: 'hidden', fontFamily: 'var(--jp)' } });
			const title = h('div', { text: 'TODO', style: { font: '800 40px/48px var(--en)', color: C.ivory, letterSpacing: '.02em' } });
			const input = h('div', { style: { marginTop: '22px', height: '68px', borderRadius: '10px', background: '#0e0c0b', display: 'flex', alignItems: 'center', padding: '0 11px 0 24px' } },
				h('span', { text: '新しいタスク', style: { flex: '1', font: '500 26px/1 var(--jp)', color: C.muted } }),
				h('span', { text: '追加', style: { height: '46px', padding: '0 22px', borderRadius: '8px', background: C.garnet, color: C.onGarnet, font: '700 22px/46px var(--jp)', letterSpacing: '.04em' } }));
			const list = h('div', { style: { marginTop: '20px', display: 'flex', flexDirection: 'column' } });
			const item = (text, last) => {
				const box = h('div', { style: { position: 'relative', width: '28px', height: '28px', flex: 'none', borderRadius: '8px', border: '2px solid #3a3330', boxSizing: 'border-box', transformOrigin: '50% 50%' } });
				const path = svg('path', { d: 'M20 6 9 17l-5-5', pathLength: 1 });
				const check = svg('svg', { viewBox: '0 0 24 24', width: 20, height: 20, fill: 'none', stroke: C.ink, 'stroke-width': 3.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', style: { position: 'absolute', left: '2px', top: '2px' } }, path);
				box.appendChild(check);
				const strike = h('i', { style: { position: 'absolute', left: '-3px', right: '-3px', top: '50%', height: '2px', marginTop: '1px', background: C.muted, transformOrigin: '0 50%', display: 'block' } });
				const label = h('span', { style: { position: 'relative', font: '500 30px/1.2 var(--jp)', color: C.text, whiteSpace: 'nowrap' } }, text, strike);
				const inner = h('div', { style: { height: px(ROW_H), display: 'flex', alignItems: 'center', gap: '22px', paddingLeft: '4px', borderBottom: last ? 'none' : '1px solid #262120', boxSizing: 'border-box' } }, box, label);
				const hi = h('div', { class: 'fill', style: { background: 'linear-gradient(90deg, rgba(198,167,105,.13), rgba(198,167,105,0) 80%)', borderRadius: '8px', pointerEvents: 'none' } });
				const outer = h('div', { style: { position: 'relative', height: px(ROW_H), overflow: 'hidden', flex: 'none' } }, hi, inner);
				list.appendChild(outer);
				return { outer, inner, hi, box, path, strike, label };
			};
			S.newItem = item('レビューを読む', false);
			S.items = [item('買い物', false), item('メール返信', false), item('散歩', true)];
			card.append(title, input, list);
			S.appWrap.appendChild(card);

			// ======================================================== HEADLINE (the product's success line, set large)
			// 「**🎯 目標を達成しました**（2 ラウンド目）」: bold part 900 84px ivory, parenthetical 700 56px gold.
			S.hlWrap = h('div', { class: 'fill', style: { transformOrigin: `${BC[0]}px ${HL_BASE}px` } });
			root.appendChild(S.hlWrap);
			const hl = h('div', { class: 'abs nowrap', style: { left: '0', top: '0', font: '900 84px/1 var(--jp)', color: C.ivory, letterSpacing: '-.005em', textShadow: '0 4px 24px rgba(0,0,0,.6)' } });
			const partA = h('span');
			const partB = h('span', { style: { font: '700 56px/1 var(--jp)', color: C.gold, letterSpacing: '0' } });
			const chA = u.chars(partA, '🎯 目標を達成しました');
			const chB = u.chars(partB, '（2 ラウンド目）');
			const probe = h('span', { style: { display: 'inline-block', width: '0', height: '0', verticalAlign: 'baseline' } });
			hl.append(partA, partB, probe);
			S.hlWrap.appendChild(hl);
			const hlBase = probe.offsetTop, hlW = hl.offsetWidth;
			probe.remove();
			hl.style.left = px(Math.round(BC[0] - hlW / 2));
			hl.style.top = px(HL_BASE - hlBase);
			S.hlChars = [...chA, ...chB];

			// ======================================================== CAPTION L (bottom-centre, baseline 975)
			const capLayer = h('div', { class: 'fill' });
			root.appendChild(capLayer);
			S.cap = c.textAt('ひとことが、動くアプリに。', { x: 960, baseline: 975, size: 80, align: 'center', gold: ['動くアプリ'], parent: capLayer });

			// base.css gives every .ch span will-change, which makes Chromium cache each glyph's
			// raster (at whatever scale it was first drawn — blurry once the headline shrinks) and
			// makes a frame depend on draw order. Without it each frame rasterizes from scratch.
			for (const ch of root.querySelectorAll('.ch')) { ch.style.willChange = 'auto'; }
			return S;
		},

		draw(t, S) {
			S.backdrop.draw(t);

			// ---------------------------------------------------- brand-mark sweep (0.0–0.8)
			// At reveal 0 the dashed strands leave zero-length dashes whose round caps draw dots,
			// so the mark stays hidden until the sweep has started. Its sheen only runs once the
			// strands exist, and the mark recedes as the evidence panels arrive (left at 15 % its
			// arrowhead would peek out around the TODO card's corner).
			const rv = u.p(t, 0, MARK_DUR, ease.outCubic);
			S.mark.draw(t, { reveal: rv, launch: u.p(t, LAUNCH, LAUNCH_DUR, ease.outBack), light: u.p(t, MARK_DUR - .2, .5, ease.inOutSine) });
			u.tf(S.markWrap, { o: rv > .002 ? u.lerp(MARK_O, MARK_SETTLE, u.p(t, MARK_DIM, MARK_DIM_DUR, ease.inOutSine)) : 0 });

			// ---------------------------------------------------- burst (0.0–0.6)
			const bk = u.p(t, 0, BURST_DUR);
			S.ring.setAttribute('r', u.lerp(200, 900, ease.outCubic(bk)).toFixed(2));
			S.ring.setAttribute('opacity', (.8 * (1 - ease.outQuad(bk))).toFixed(3));
			S.ring.style.display = bk < 1 ? 'inline' : 'none';
			for (const p of S.parts) {
				const k = u.p(t, 0, p.dur);
				const d = u.lerp(p.r0, p.dist, ease.outCubic(k));
				const speed = (p.dist - p.r0) * 3 * (1 - k) * (1 - k) / p.dur; // px/s
				const tail = Math.min(d - p.r0, speed * SPARK_SHUTTER);
				p.el.setAttribute('x1', (BC[0] + p.dx * (d - tail)).toFixed(2));
				p.el.setAttribute('y1', (BC[1] + p.dy * (d - tail)).toFixed(2));
				p.el.setAttribute('x2', (BC[0] + p.dx * d).toFixed(2));
				p.el.setAttribute('y2', (BC[1] + p.dy * d).toFixed(2));
				p.el.setAttribute('opacity', Math.pow(1 - k, 1.4).toFixed(3));
				p.el.style.display = k < 1 ? 'inline' : 'none';
			}
			const bl = u.p(t, 0, BLOOM_DUR);
			u.tf(S.bloom, { s: u.lerp(.75, 1.2, ease.outCubic(bl)), o: 1 - ease.outQuad(bl) });

			// ---------------------------------------------------- headline: reveal on the hit, then shrink to the top
			c.reveal(S.hlChars, t, 0, { stagger: HL_STAGGER, dur: HL_DUR, dist: 30, blur: 10 });
			const sk = u.p(t, SHRINK, SHRINK_DUR, ease.inOutCubic);
			u.tf(S.hlWrap, { y: (HL_END - HL_BASE) * sk, s: u.lerp(1, HL_S, sk), origin: `${BC[0]}px ${HL_BASE}px` });

			// ---------------------------------------------------- verdict strip (0.5; fades 2.0–2.3)
			const si = u.p(t, STRIP, STRIP_RISE, ease.outCubic);
			const so = u.p(t, STRIP_OUT, STRIP_OUT_DUR, ease.inOutSine);
			u.tf(S.stripWrap, { y: (1 - si) * 20 - so * 14, o: si * (1 - so) });
			S.lines.forEach((L, i) => c.stamp(L.inner, t, LINES[i]));

			// ---------------------------------------------------- files panel (2.3–2.7), rows pop 2.5 + .12k
			const fk = u.p(t, FILES, FILES_DUR, ease.outCubic);
			u.tf(S.filesWrap, { x: -40 * (1 - fk), o: fk });
			S.rows.forEach((R, i) => {
				const at = ROW0 + ROW_STEP * i;
				const e = ease.outBack(u.p(t, at, ROW_POP));
				u.tf(R.el, { x: -10 * (1 - e), o: u.p(t, at, .2, ease.outCubic) });
				if (R.dot) {
					const dk = u.p(t, at + .1, .3);
					const d = 6 * (dk > 0 ? ease.outBack(dk) : 0);
					R.dot.style.width = px(d.toFixed(3));
					R.dot.style.height = px(d.toFixed(3));
					R.dot.style.margin = `${(-d / 2).toFixed(3)}px 0 0 ${(-d / 2).toFixed(3)}px`;
					R.dot.style.boxShadow = `0 0 ${d.toFixed(3)}px rgba(198,167,105,.75)`;
					R.dot.style.opacity = Math.min(1, dk * 3).toFixed(3);
					R.dot.style.visibility = dk > 0 ? 'visible' : 'hidden';
				}
			});

			// ---------------------------------------------------- TODO illustration (2.4–2.8)
			const ak = u.p(t, APP, APP_DUR, ease.outCubic);
			u.tf(S.appWrap, { y: 30 * (1 - ak), o: ak });

			// 3.6: 「メール返信」 is ticked — gold box, ink ✓, strike-through, text to muted.
			const I = S.items[1];
			const fill = u.p(t, TICK, .14, ease.outCubic);
			I.box.style.background = fill > 0 ? `rgba(198,167,105,${fill.toFixed(3)})` : 'transparent';
			I.box.style.borderColor = mix('#3a3330', C.gold, fill);
			u.tf(I.box, { s: u.keys(t, [[TICK, 1], [TICK + .1, 1.14, ease.outCubic], [TICK + .38, 1, ease.inOutCubic]]) });
			const ck = u.p(t, TICK + .05, .22, ease.outCubic);
			I.path.setAttribute('stroke-dasharray', `${ck.toFixed(4)} 1`);
			I.path.style.visibility = ck > 0 ? 'visible' : 'hidden';
			const stk = u.p(t, TICK + .08, .3, ease.inOutCubic);
			u.tf(I.strike, { sx: stk, o: stk > 0 ? 1 : 0 });
			I.label.style.color = mix(C.text, C.muted, u.p(t, TICK + .05, .3, ease.inOutSine));
			// The other rows stay unticked (reset every frame).
			for (const R of [S.newItem, S.items[0], S.items[2]]) {
				R.box.style.background = 'transparent';
				R.box.style.borderColor = '#3a3330';
				u.tf(R.box, {});
				R.path.style.visibility = 'hidden';
				u.tf(R.strike, { sx: 0, o: 0 });
				R.label.style.color = C.text;
			}
			for (const R of [S.items[0], S.items[1], S.items[2]]) { R.hi.style.opacity = '0'; R.outer.style.height = px(ROW_H); u.tf(R.inner, {}); }

			// 4.2: 「レビューを読む」 slides in at the top of the list (height 0 → row, .35 s outCubic).
			const nk = u.p(t, NEW, NEW_DUR, ease.outCubic);
			S.newItem.outer.style.height = px(ROW_H * nk);
			u.tf(S.newItem.inner, { y: -.45 * ROW_H * (1 - nk), o: u.p(t, NEW + .05, .3, ease.outCubic) });
			S.newItem.hi.style.opacity = (u.p(t, NEW, .2, ease.outCubic) * (1 - u.p(t, NEW + .35, .45, ease.inOutSine))).toFixed(3);

			// ---------------------------------------------------- caption (1.7, holds to the end)
			c.reveal(S.cap.chars, t, CAP);
		},
	});
})();
