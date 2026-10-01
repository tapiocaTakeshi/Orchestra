// 05-review — global 40.0–48.0 (MAIN). Transition in: zoom (04 pushes into the command card).
// The callback to 01: npm test fails at exactly the spot of the pain scene's
// 「✕ テスト失敗」 (FAIL_POS), but nobody calls the human. The Reviewer then checks
// the result against the goal, condition by condition, and the two goal tokens
// fill: gold ✓ for met, garnet × for unmet. 「ラウンド 2 / 5 へ」 foreshadows 06.
(() => {
	const { u, c, ease } = ORC;
	const { h } = u;
	const K = ORC.k;
	const C = K.COLORS;
	const FAIL = K.FAIL_POS; // { x: 875, baseline: 250, size: 29 }

	// ------------------------------------------------------------ geometry
	const Z = 2.2, Z_END = 2.05;   // card column zoom (CSS zoom, crisp), eased out at the end
	const COL_W = 430;             // native column width → 946 screen px
	const RES_SIZE = FAIL.size / Z; // result line font size (native) so it lands at ~29 screen px
	const GAP = 6;                 // native gap between cards
	const SLIDE_TOP = 78;          // screen y of the collapsed command card's top after the slide-up
	const BAR_W = 4, BAR_GAP = 8;  // annotation bar (screen px)
	// 04's last frame (its CMD_CARD_END / Z1 / Z0): the command card's top-left in screen px, its
	// on-screen zoom and the CSS zoom it is laid out at (its width and sub-pixel offsets are
	// measured from a replica in build()). Under the incoming zoom transition the column is held
	// exactly on top of that card, so the crossfade never doubles it, then eases into this
	// scene's FAIL_POS framing before the result lands at 1.0.
	const HAND = { x: 851, y: 110, z: 2.1, zoomCss: 1.8 };
	const TR = .45, TR_S = 1.08, TR_OUT = .94; // core's 'zoom' transition: length, incoming / outgoing scale

	// ------------------------------------------------------------ timing (scene seconds)
	const SETTLE = .4, SETTLE_END = .95; // hand-off framing → 05 framing (zoom 1.97 → 2.2, ≤ 1.35×/s)
	const RESULT = 1.0, STAMP = .18, RES_GROW = .1, SHAKE = .3, BAR = .3;
	const GHOST = .6;
	const TAIL = [1.1, 1.2, 1.3], TAIL_GROW = .1, TAIL_FADE = .2;
	const CAP = 1.6;
	const COLLAPSE = 1.8, COLLAPSE_DUR = .25;
	const SLIDE = 1.8, SLIDE_DUR = .4;
	const REV = 2.0, RISE = .42, WAIT_END = 2.4;
	const VERDICT = [2.5, 3.0, 3.5, 4.0, 4.5], GROW = .2;
	const TOK_IN = .6, TOK_FADE = .45, TOK1 = 3.5, TOK2 = 4.0;
	const NEXT = 4.5, NEXT_DUR = .4, NEXT_SLIDE = 56;
	const OUT = 7.4, OUT_DUR = .6;

	// ------------------------------------------------------------ helpers
	const px = v => `${v}px`;
	const hex = s => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
	const rgba = (col, a = 1) => `rgba(${col[0]}, ${col[1]}, ${col[2]}, ${u.clamp(a).toFixed(3)})`;
	const mixHex = (a, b, k) => { const A = hex(a), B = hex(b); return A.map((v, i) => Math.round(v + (B[i] - v) * k)); };
	// The small brand-mark loader inside a card header (c.card does not expose it).
	const spinnerOf = card => Array.from(card.head.children).find(el => el.tagName.toLowerCase() === 'svg' && !el.classList.contains('o-chev'));
	const sheenOf = card => card.el.querySelector('.o-sheen');

	// Demo verdict (storyboard ui_mock). Criteria are the shared COND1/COND2.
	const VERDICT_LINES = [
		{ kind: 'h', html: '🎯 目標との照合（ラウンド 1）' },
		{ kind: 'b', html: K.GOAL },
		{ kind: 'v', mark: '✅', n: 1, crit: K.COND1, note: '追加・完了・削除の処理を実装済み' },
		{ kind: 'v', mark: '❌', n: 2, crit: K.COND2, note: '終了コード 1（1 件失敗）' },
		{ kind: 'b', html: '🔁 未達のため、ラウンド 2 / 5 に進みます。' },
	];
	const TAIL_LINES = ['FAIL  app.test.js', '  ✕ 完了したタスクを削除できる', 'Tests: 1 failed, 2 passed'];

	ORC.register({
		id: '05-review',
		duration: 8,
		transition: 'zoom',

		build(root) {
			const S = {};
			S.backdrop = c.backdrop({ tint: 'gold' });
			root.appendChild(S.backdrop.el);

			// ======================================================== GOAL TOKENS (graphics, left)
			const tokLayer = h('div', { class: 'fill' });
			root.appendChild(tokLayer);
			S.tok = [
				c.goalToken({ x: K.TOKENS[0].x, y: K.TOKENS[0].y, size: 48, label: K.COND1, labelSize: 34 }),
				c.goalToken({ x: K.TOKENS[1].x, y: K.TOKENS[1].y, size: 48, label: K.COND2, labelSize: 34, mono: ['npm test'] }),
			];
			for (const tk of S.tok) { tokLayer.appendChild(tk.el); }
			S.next = c.textAt('ラウンド 2 / 5 へ', { x: 120, baseline: 740, size: 30, weight: 700, color: C.goldHi, letterSpacing: '0', parent: tokLayer });

			// ======================================================== CARD COLUMN (UI mock, right)
			const wrap = h('div', { class: 'abs', style: { left: '0', top: '0', width: px(COL_W * Z), height: '0', transformOrigin: '0 0' } });
			const zb = c.zoomBox(Z, { left: '0', top: '0' });
			const col = h('div', { style: { position: 'relative', width: px(COL_W), display: 'flex', flexDirection: 'column', gap: px(GAP) } });
			zb.appendChild(col);
			wrap.appendChild(zb);
			root.appendChild(wrap);
			S.wrap = wrap;

			// ---- command card: 「コマンドの実行（1 件）」 [コマンド], no #.
			const cmd = c.card({ title: K.CMD.title, role: K.CMD.badge });
			cmd.body.innerHTML = '';
			const cmdLine = h('div', { style: { lineHeight: '1.5' } }, h('b', { text: K.CMD.command, style: { fontFamily: 'var(--mono)', fontWeight: '600', color: '#f7f2ea', whiteSpace: 'pre' } }));
			// Result row: fixed-height row so its own growth never moves the text.
			const resText = h('div', { class: 'o-md', style: { display: 'inline-block', fontSize: px(RES_SIZE), lineHeight: '1.5', color: '#ece6de', whiteSpace: 'nowrap', transformOrigin: '0 55%' } });
			const probe = h('span', { style: { display: 'inline-block', width: '0', height: '0', verticalAlign: 'baseline' } });
			resText.append(probe, '❌ 失敗（終了コード 1、4.0 秒）');
			const bar = h('i', { style: { position: 'absolute', display: 'block', left: px(-(BAR_W + BAR_GAP) / Z), width: px(BAR_W / Z), borderRadius: px(BAR_W / 2 / Z), background: C.rose } });
			const resRow = h('div', { style: { position: 'relative', marginTop: '1px' } }, bar, resText);
			// Output tail as a text fence (demo output).
			const tailEls = TAIL_LINES.map(s => h('div', { text: s, style: { whiteSpace: 'pre', height: '17.6px' } }));
			const fence = h('div', { style: { overflow: 'hidden', background: '#0e0c0b', borderRadius: '4px', padding: '5px 8px', font: '400 11px/17.6px var(--mono)', fontVariantLigatures: 'none', color: '#877c72' } }, ...tailEls);
			cmd.body.append(cmdLine, resRow, fence);
			col.appendChild(cmd.el);

			// ---- reviewer card: 「最終レビュー」 #4 [レビュー].
			const rt = K.TASKS[3];
			const rev = c.card({ n: rt.n, title: rt.title, role: rt.badge });
			rev.body.innerHTML = '';
			const ph = h('div', { text: '(出力待機中…)', style: { position: 'absolute', left: '0', top: '0', fontStyle: 'italic', color: '#877c72', lineHeight: '1.5', whiteSpace: 'nowrap' } });
			const lines = VERDICT_LINES.map((L, i) => {
				let inner;
				if (L.kind === 'h') {
					inner = h('div', { class: 'o-md', html: L.html, style: { fontSize: '14px', fontWeight: '700', lineHeight: '1.45', color: '#f7f2ea', whiteSpace: 'nowrap' } });
				} else if (L.kind === 'b') {
					inner = h('div', { class: 'o-md', html: `<b>${L.html}</b>`, style: { whiteSpace: 'nowrap' } });
				} else {
					// '✅ 1. criterion — note' with a hanging indent; wraps only before the em dash.
					inner = h('div', { class: 'o-md', style: { display: 'flex', alignItems: 'baseline' } },
						h('span', { text: `${L.mark} ${L.n}.`, style: { flex: 'none', whiteSpace: 'pre', marginRight: '.4em' } }),
						h('span', { style: { flex: '1', minWidth: '0' } },
							h('span', { text: L.crit, style: { whiteSpace: 'nowrap' } }), ' ',
							h('span', { text: `— ${L.note}`, style: { whiteSpace: 'nowrap', color: '#bdb3a8' } })));
				}
				inner.style.transformOrigin = '0 60%';
				const pad = [7, 7, 6, 7, 0][i];
				const w = h('div', { style: { position: 'relative', paddingBottom: px(pad) } }, inner);
				return { w, inner };
			});
			const revInner = h('div', { style: { position: 'relative' } }, ph, ...lines.map(l => l.w));
			rev.body.appendChild(revInner);
			col.appendChild(rev.el);

			// ---- measure once (native px) with everything laid out at full size.
			cmd.draw(0, 'running', 1);
			rev.draw(0, 'running', 1);
			for (const cd of [cmd, rev]) { cd.body.style.maxHeight = 'none'; cd.body.style.height = 'auto'; }
			const rootRect = root.getBoundingClientRect();
			const zf = col.getBoundingClientRect().width / COL_W;
			const hgt = el => el.getBoundingClientRect().height / zf;
			const lh = parseFloat(getComputedStyle(resText).lineHeight) || RES_SIZE * 1.5;
			bar.style.height = px(RES_SIZE * 1.12);
			bar.style.top = px((lh - RES_SIZE * 1.12) / 2 + RES_SIZE * .04);
			S.H = {
				cmdLine: hgt(cmdLine),
				res: hgt(resRow) + 1, // + its 1px top margin
				tailLine: 17.6,
				ph: hgt(ph),
				lines: lines.map(l => hgt(l.w)),
			};
			// FAIL_POS: the result text's left edge at x 875, its baseline at y 250.
			const pr = probe.getBoundingClientRect();
			const tr = resText.getBoundingClientRect();
			const dx = Math.round(FAIL.x - (tr.left - rootRect.left));
			const dy = Math.round(FAIL.baseline - (pr.top - rootRect.top));
			S.colLeft = dx;
			S.colTop = dy;
			S.colW = COL_W * zf;
			S.col = col;
			// Slide-up after the collapse: the collapsed card settles near the top of the frame.
			S.slide = Math.max(0, dy - SLIDE_TOP);

			// ---- hand-off registration. 04 lays its card out at CSS zoom 1.8 (shown at 2.1 through a
			// transform), where its 1 px borders snap to 1 device px; at this scene's zoom 2.2 they snap
			// to 2. Left alone, the crossfade double-strikes the title, 「$ npm test」 and the badge by
			// 0.7–2.6 screen px. Measure a replica of 04's card (inside its 425 px panel: 1 px border,
			// 16 px padding) and cancel those offsets while the column sits on 04's card.
			const metrics = (card, cmdEl, z) => {
				const cr = card.el.getBoundingClientRect();
				return {
					h: cr.height / z,
					title: (card.head.querySelector('.o-card-title').getBoundingClientRect().top - cr.top) / z,
					cmd: (cmdEl.getBoundingClientRect().top - cr.top) / z,
					role: (cr.right - card.head.querySelector('.o-role').getBoundingClientRect().right) / z,
				};
			};
			setBody(cmd, 1, S.H.cmdLine); // the hand-off state: command line only
			const m05 = metrics(cmd, cmdLine.firstChild, zf);
			const repCard = c.card({ title: K.CMD.title, role: K.CMD.badge, body: '<b style="font-family:var(--mono);font-weight:600;color:#f7f2ea">$ npm test</b>' });
			const rep = c.zoomBox(HAND.zoomCss, { left: '0', top: '0', visibility: 'hidden' });
			const repPanel = h('div', { style: { width: '425px', border: '1px solid #3a3330', padding: '0 16px' } }, repCard.el);
			rep.appendChild(repPanel);
			root.appendChild(rep);
			repCard.draw(0, 'running', 1);
			repCard.body.style.maxHeight = 'none';
			const zr = repPanel.getBoundingClientRect().width / 425;
			const m04 = metrics(repCard, repCard.body.querySelector('b'), zr);
			const w04 = repCard.el.getBoundingClientRect().width / zr;
			rep.remove();
			// Native px at this scene's zoom: column width that puts the badge on 04's badge, and the
			// header / command-line / card-height offsets, all blended out by SETTLE_END.
			S.fix = { w: w04 + m05.role - m04.role, title: m04.title - m05.title, cmd: m04.cmd - m05.cmd, h: m04.h - m05.h };

			S.cmd = { card: cmd, spinner: spinnerOf(cmd), sheen: sheenOf(cmd), cmdLine, resRow, resText, bar, fence, tailEls };
			S.rev = { card: rev, spinner: spinnerOf(rev), ph, lines };

			// ======================================================== CALLBACK GHOST (01's 「✕ テスト失敗」)
			const ghostLayer = h('div', { class: 'fill', style: { pointerEvents: 'none' } });
			root.appendChild(ghostLayer);
			S.ghost = c.textAt('✕ テスト失敗', { x: FAIL.x, baseline: FAIL.baseline, size: FAIL.size, weight: 400, family: "'JetBrains Mono', 'Noto Sans JP', monospace", color: '#8a92a3', letterSpacing: '0', shadow: false, parent: ghostLayer }).el;

			// ======================================================== CAPTIONS
			const capLayer = h('div', { class: 'fill' });
			root.appendChild(capLayer);
			S.kicker = c.textAt('REVIEWER', { x: 120, baseline: 150, size: 20, weight: 600, family: 'var(--en)', color: C.gold, letterSpacing: '.32em', shadow: false, parent: capLayer });
			S.cap = c.captionLines(['最後に、', 'レビューが確かめる。'], { gold: ['レビュー'] });
			capLayer.append(...S.cap.els);
			// base.css gives every .ch span will-change, which makes Chromium cache each glyph's
			// raster from whatever sub-pixel offset it was first drawn at, so a frame's anti-aliasing
			// depended on draw order. Without it each frame rasterizes from scratch (order-independent).
			for (const ch of root.querySelectorAll('.ch')) { ch.style.willChange = 'auto'; }
			return S;
		},

		draw(t, S) {
			S.backdrop.draw(t);

			// ---------------------------------------------------- column camera
			// Hand-off: while the root scales 1.08 → 1 and 04 scales 1 → .94 (both about the
			// frame centre), keep the card on 04's card: screen = C + (P04 + 2.1·p − C)·sOut.
			const kT = u.clamp(t / TR);
			const r = u.lerp(1, TR_OUT, ease.inOutCubic(kT)) / u.lerp(TR_S, 1, ease.outCubic(kT));
			const hx = 960 + (HAND.x - 960) * r, hy = 540 + (HAND.y - 540) * r, hs = HAND.z / Z * r;
			const b = u.p(t, SETTLE, SETTLE_END - SETTLE, ease.inOutCubic);
			S.col.style.width = px(u.lerp(S.fix.w, COL_W, b));
			const fixK = 1 - b; // sub-pixel registration onto 04's card, gone by SETTLE_END
			let X = u.lerp(hx, S.colLeft, b), Y = u.lerp(hy, S.colTop, b);
			const s0 = u.lerp(hs, 1, b);
			// Slide-up after the collapse, then the closing zoom-out 2.2 → 2.05 anchored at the
			// column's top-right (drifting toward 06's column at x 960–1800).
			Y -= S.slide * u.p(t, SLIDE, SLIDE_DUR, ease.inOutCubic);
			const zk = u.p(t, OUT, OUT_DUR, ease.inOutCubic);
			const sEnd = u.lerp(1, Z_END / Z, zk);
			X += S.colW * (1 - sEnd);
			S.wrap.style.transform = `translate(${X.toFixed(3)}px, ${Y.toFixed(3)}px) scale(${(s0 * sEnd).toFixed(5)})`;
			S.wrap.style.opacity = String(u.lerp(1, .7, zk));

			// ---------------------------------------------------- command card
			const M = S.cmd;
			const openK = 1 - u.p(t, COLLAPSE, COLLAPSE_DUR, ease.inOutCubic);
			const ck = u.p(t, COLLAPSE, COLLAPSE_DUR);
			const cmdRunning = t < COLLAPSE + COLLAPSE_DUR;
			// 04 drew this card with its own clock: continue its sheen and loader phase (04 lasts 16 s).
			M.card.draw(t + 16, cmdRunning ? 'running' : 'done', openK);
			// Running → done crossfades during the collapse (loader and sheen fade, accent settles).
			M.spinner.style.opacity = String(cmdRunning ? 1 - ck : 0);
			M.sheen.style.opacity = String(cmdRunning ? 1 - ck : 0);
			M.card.el.classList.toggle('running', cmdRunning && ck < .5);
			// Shake ±4 screen px for .3 s when the failure lands.
			M.card.el.style.transform = `translateX(${(c.shake(t, RESULT, SHAKE, 4) / Z).toFixed(3)}px)`;
			M.card.head.style.transform = fixK > 0 ? `translateY(${(S.fix.title * fixK).toFixed(3)}px)` : '';
			M.cmdLine.style.transform = fixK > 0 ? `translateY(${(S.fix.cmd * fixK).toFixed(3)}px)` : '';

			// Result line stamps in at FAIL_POS; its row opens just ahead of it.
			const kRes = u.p(t, RESULT, RES_GROW, ease.outCubic);
			M.resRow.style.height = px(S.H.res * kRes - 1 * kRes);
			M.resRow.style.marginTop = px(kRes);
			c.stamp(M.resText, t, RESULT, STAMP);
			const bk = u.p(t, RESULT, BAR, ease.outCubic);
			M.bar.style.opacity = String(bk);
			M.bar.style.transform = `scaleY(${u.lerp(.4, 1, bk).toFixed(3)})`;

			// Output tail: the fence opens line by line, one per .1 s.
			const g1 = u.p(t, TAIL[0], TAIL_GROW, ease.outCubic);
			let g = 0;
			M.tailEls.forEach((el, i) => {
				g += u.p(t, TAIL[i], TAIL_GROW, ease.outCubic);
				const k = u.p(t, TAIL[i], TAIL_FADE, ease.outCubic);
				u.tf(el, { y: (1 - k) * 3, o: k });
			});
			M.fence.style.display = g1 > 0 ? 'block' : 'none';
			M.fence.style.marginTop = px(5 * g1);
			M.fence.style.paddingTop = px(5 * g1);
			M.fence.style.paddingBottom = px(5 * g1);
			M.fence.style.height = px(10 * g1 + S.H.tailLine * g);
			const cmdContent = S.H.cmdLine + S.H.res * kRes + 15 * g1 + S.H.tailLine * g + S.fix.h * fixK;
			setBody(M.card, openK, cmdContent);

			// ---------------------------------------------------- reviewer card
			const R = S.rev;
			const rk = u.p(t, REV, RISE, ease.outCubic);
			u.tf(R.card.el, { y: (1 - rk) * 10, o: rk });
			R.card.draw(t, 'running', t >= REV ? 1 : 0);
			const phK = 1 - u.p(t, WAIT_END, .1);
			R.ph.style.opacity = String(phK);
			R.ph.style.visibility = phK > .001 ? 'visible' : 'hidden';
			let linesH = 0;
			R.lines.forEach((L, i) => {
				const k = u.p(t, VERDICT[i], GROW, ease.outCubic);
				L.w.style.height = px(S.H.lines[i] * k);
				linesH += S.H.lines[i] * k;
				c.stamp(L.inner, t, VERDICT[i]);
			});
			setBody(R.card, t >= REV ? 1 : 0, Math.max(S.H.ph, linesH));

			// ---------------------------------------------------- goal tokens
			const tIn = u.p(t, TOK_IN, TOK_FADE, ease.outCubic);
			const [T1, T2] = S.tok;
			// TOKEN_1: met — gold fill, ✓ strokes in, scale pulse 1 → 1.15 → 1.
			if (t <= TOK1) { T1.set('empty'); } else { // (a 0-length dash with round caps would draw dots)
				T1.set('met', u.p(t, TOK1, .25));
				fillDisc(T1.disc, C.gold, u.p(t, TOK1, .1, ease.outCubic), `, 0 0 ${(18 * ease.outCubic(u.p(t, TOK1, .25))).toFixed(2)}px rgba(198,167,105,.55)`);
			}
			u.tf(T1.disc, { s: u.keys(t, [[TOK1, 1], [TOK1 + .12, 1.15, ease.outCubic], [TOK1 + .42, 1, ease.inOutCubic]]) });
			u.tf(T1.el, { o: tIn, y: (1 - tIn) * 6 });
			// TOKEN_2: unmet — garnet fill with ×, shakes ±4 px for .2 s.
			if (t <= TOK2) { T2.set('empty'); } else {
				T2.set('unmet', u.p(t, TOK2, .25));
				fillDisc(T2.disc, C.garnet, u.p(t, TOK2, .1, ease.outCubic), '');
			}
			u.tf(T2.disc, { s: u.keys(t, [[TOK2, 1], [TOK2 + .1, 1.08, ease.outCubic], [TOK2 + .35, 1, ease.inOutCubic]]) });
			u.tf(T2.el, { o: tIn, y: (1 - tIn) * 6, x: c.shake(t, TOK2, .2, 4) });

			// 「ラウンド 2 / 5 へ」 slides in from the left.
			const nk = u.p(t, NEXT, NEXT_DUR, ease.outCubic);
			// Clipped at x 120 so no part of it ever leaves the safe area while it slides.
			const off = (1 - nk) * NEXT_SLIDE;
			u.tf(S.next.el, { x: -off, o: nk, blur: (1 - nk) * 3 });
			S.next.el.style.clipPath = off > .01 ? `inset(-40px -40px -40px ${off.toFixed(2)}px)` : 'none';

			// ---------------------------------------------------- callback ghost
			const gb = u.p(t, RESULT, GHOST, ease.inOutSine);
			const go = t < RESULT ? 0 : .4 * (1 - u.p(t, RESULT + .06, GHOST - .06, ease.inQuad));
			u.tf(S.ghost, { o: go, blur: 8 * gb });

			// ---------------------------------------------------- captions (hold to the end)
			c.reveal(S.kicker.chars, t, CAP);
			c.reveal(S.cap.chars, t, CAP);
		},
	});

	// Card body at openness openK with native content height `content` (padding scales too,
	// so the collapse ends exactly at the header with no residual padding jump).
	function setBody(card, openK, content) {
		const b = card.body;
		b.style.maxHeight = 'none';
		b.style.paddingTop = px(6 * openK);
		b.style.paddingBottom = px(8 * openK);
		b.style.height = px(1 + openK * (14 + content));
	}

	// Ramp a token's fill in over a few frames instead of popping. The empty state's 2 px ring
	// is kept as an inset shadow (not a border, which would shift goalToken's absolutely
	// placed glyph by 2 px) and blends into the fill, so the end state equals goalToken's own.
	function fillDisc(disc, color, k, glow) {
		disc.style.border = 'none';
		disc.style.background = rgba(hex(color), k);
		disc.style.boxShadow = k < 1 ? `inset 0 0 0 2px ${rgba(mixHex(C.goldLo, color, k))}${glow}` : (glow ? glow.slice(2) : 'none');
	}
})();
