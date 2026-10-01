// 08-control-anywhere — global 61.5–69.5 (MAIN). Two short, honest nods to other
// differentiators, each with at most three sub-beats:
//  (A) Cost tuning, in the product's order: the chip opens the panel, the switch turns
//      it on, the sliders settle. No estimate is run (Plus-only).
//  (B) /remote-control: once the goal is met (the agent is idle) the chat is synced to
//      Orchestra Mobile, and the next request comes from a phone over the LAN. Sync is
//      polled, so the packet hops in discrete 0.25 s steps — never "real-time".
// An in-scene clip-path wipe joins the beats; the frame dims to noir for the cut to 09.
(() => {
	const { u, c, ease } = ORC;
	const { h, svg } = u;
	const K = ORC.k;
	const C = K.COLORS;

	// ------------------------------------------------------------ timing (scene seconds)
	// Beat A
	const COMP_IN = .6;                          // composer settles while the fade-in plays
	const COMP_FADE = .3, COMP_FADE_DUR = .3;    // ...but stays hidden until the 07 -> 08 fade (0–.45) has nearly landed
	const CAP_A = .45, CAP_A_OUT = 3.75;         // after the fade, so it never crosses 07's layout
	const CUR_IN = .05, CUR_IN_DUR = .25;
	const MOVE1 = .3, CLICK1 = .6;               // cursor -> cost chip, click
	// Spec: the cursor moves to the toggle over 1.0–1.2. That is ~870 px in 6 frames (a
	// visible jump), so it leaves at 0.7, as the panel unfolds, and still clicks on 1.2.
	const MOVE2 = .7, CLICK2 = 1.2;
	const CUR_OUT = 1.5, CUR_OUT_DUR = .3;
	const OPEN = .6, OPEN_DUR = .35, CHEV_DUR = .25, CHIP_DUR = .15;
	const TOGGLE = 1.2, KNOB_DUR = .3, FILL_DUR = .2, ROLL_DUR = .25, COND_DUR = .25;
	const LANDS = [1.9, 2.05, 2.2], GLIDE = .5, VALUE_DUR = .25;
	const VALUES = [.7, .4, .5];                // 性能 70 % / 1 回あたりの上限 40 % / 回答の長さ 50 %
	const STAFF_FOR = [1, 3, 2];                // staff line that rings on each landing (high / low / middle)
	const STAFF_DUR = .4;
	const CLOSE = 3.4, CLOSE_DUR = .35;
	const WIPE = 3.6, WIPE_DUR = .4;
	// Beat B
	const BUB1 = 4.1, BUB_DUR = .32;
	const REPLY = [4.4, 4.6], REPLY_DUR = .1;   // "instant" (no LLM): a 3-frame fade, no typing
	const CAP_B = 4.2;
	const FOOT = 4.4, FOOT_DUR = .4;
	const PHONE = 4.5, PHONE_DUR = .5;
	const ARC = 4.4, ARC_DUR = .35;            // the link reaches out as the reply says 同期しました
	const PILL_LAN = 4.6, PILL_IMG = 4.75, PILL_DUR = .35;
	// Two hops each way, so most of the beat goes to the result (the phone's request in the
	// PC chat and the Leader starting a new run) rather than to the packet's travel.
	const PKT_OUT = 5.0, PKT_BACK = 5.75, HOP = .25, HOP_MOVE = .1, HOPS = 2;
	const TAP = 5.5, TYPE_DUR = .2, SEND = 5.75;   // tap as the packet reaches the phone (global 67.0)
	const BUB2 = 6.25, STATUS = 6.75;              // bubble as the packet reaches the PC; ~1.35 s before DIM
	const DIM = 7.6, DIM_DUR = .4, DIM_MAX = .7;

	// ------------------------------------------------------------ layout (screen px)
	const COMP = { x: 840, y: 730, w: 460, h: 127, zoom: 2 };          // native w/h
	const PANEL_W = 340, PANEL_GAP = 6;                                 // native
	const STAFF_Y = [380, 444, 508, 572, 636], STAFF_A = .045, STAFF_PEAK = .14, STAFF_DRIFT = 12;
	const PANE = { x: 120, y: 266, w: 440, h: 420, zoom: 1.7 };         // native w/h
	const PHONE_R = { x: 1340, y: 230, w: 320, h: 640, r: 48 };
	const ARC_P0 = [868, 560], ARC_CP = [1104, 380], ARC_P1 = [1340, 560], DOT_GAP = 24;
	const TAP_AT = [1450, 800];
	const BOTTOM_GAP = 14;                                               // native px under the newest thread line

	// ------------------------------------------------------------ helpers
	const px = v => `${v}px`;
	const hex = s => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
	const mixHex = (a, b, k) => { const A = hex(a), B = hex(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * u.clamp(k))).join(', ')})`; };
	const quad = (a, cp, b, k) => [(1 - k) ** 2 * a[0] + 2 * (1 - k) * k * cp[0] + k * k * b[0], (1 - k) ** 2 * a[1] + 2 * (1 - k) * k * cp[1] + k * k * b[1]];
	const arcAt = k => quad(ARC_P0, ARC_CP, ARC_P1, k);
	const show = (el, on, display = 'block') => { el.style.display = on ? display : 'none'; };
	// u.tf, but a settled (identity) transform is written as 'none'. Chromium rasters an element
	// that keeps an identity transform differently depending on the frames drawn before it (the
	// bubble that rose from scale .985 stayed slightly soft in a forward render), so at rest the
	// transform is removed and a frame's pixels no longer depend on render order.
	const tf = (el, o) => {
		u.tf(el, o);
		if (!o.x && !o.y && !o.r && Math.abs((o.s === undefined ? 1 : o.s) - 1) < 1e-9) { el.style.transform = 'none'; }
	};
	const setTf = (el, str, rest) => { el.style.transform = rest ? 'none' : str; };
	const place = (el, p) => { el.style.left = `${p[0].toFixed(2)}px`; el.style.top = `${p[1].toFixed(2)}px`; };
	// Native-px rect of el relative to base (measured while zoom is 1 and nothing is transformed).
	const rel = (el, base) => {
		const r = el.getBoundingClientRect(), b = base.getBoundingClientRect();
		return { x: r.left - b.left, y: r.top - b.top, w: r.width, h: r.height };
	};
	// Sum of eased steps (thread scroll): moves to each v over [t, t + dur].
	const steps = (t, evs, dur) => {
		let v = 0, prev = 0;
		for (const e of evs) { v += (e.v - prev) * u.p(t, e.t, dur, ease.inOutCubic); prev = e.v; }
		return v;
	};
	// .045 -> .14 -> .045 over STAFF_DUR: quick rise, slow decay.
	const ring = (t, at, dur) => {
		const k = u.p(t, at, dur);
		if (k <= 0 || k >= 1) { return 0; }
		return k < .25 ? ease.outCubic(k / .25) : 1 - ease.inOutSine((k - .25) / .75);
	};
	// Packet progress along the arc: rests at 0, 1/HOPS, ..., 1 and hops (HOP_MOVE) to land
	// exactly on start + HOP·j — discrete steps, like polling.
	const hopK = (t, start) => {
		let k = 0;
		for (let j = 1; j <= HOPS; j++) { k += u.p(t, start + HOP * j - HOP_MOVE, HOP_MOVE, ease.inOutCubic) / HOPS; }
		return k;
	};

	ORC.register({
		id: '08-control-anywhere',
		duration: 8,
		transition: 'fade',

		build(root) {
			const S = {};

			// ======================================================== BACKDROP + STAFF LINES
			S.bg = c.backdrop({ tint: 'gold' });
			root.appendChild(S.bg.el);
			// Five hairlines that drift left. A slow 640 px swell (.03–.06 around .045) makes
			// the drift readable; a .10 overlay rings each line to .14 on a slider landing.
			const staff = h('div', { class: 'fill' });
			S.staff = STAFF_Y.map(y => {
				const line = h('div', { class: 'abs', style: { left: '0', top: px(y), width: px(1920 + 640), height: '1px', background: 'repeating-linear-gradient(90deg, rgba(236,230,222,.03) 0px, rgba(236,230,222,.06) 320px, rgba(236,230,222,.03) 640px)' } });
				const glow = h('div', { class: 'abs', style: { left: '0', top: px(y), width: '1920px', height: '1px', background: `rgba(236,230,222,${((STAFF_PEAK - STAFF_A) / (1 - STAFF_A)).toFixed(3)})`, boxShadow: '0 0 6px rgba(227,207,159,.25)' } });
				staff.append(line, glow);
				return { line, glow };
			});
			root.appendChild(staff);

			// ======================================================== BEAT A: COST TUNING
			const layerA = h('div', { class: 'fill' });
			root.appendChild(layerA);
			S.layerA = layerA;

			// ---- composer (idle, chips passed explicitly: cost tuning starts OFF)
			const comp = c.composer({ chips: [
				{ icon: 'sliders', text: 'モデルなどの設定' },
				{ icon: 'coins', text: 'コスト調整: オフ', caret: true },
				{ icon: 'repeat', text: 'ループ: 自動' },
			] });
			comp.setText('', false, 'idle');
			comp.input.style.wordBreak = 'auto-phrase';   // wrap the placeholder at a phrase, not mid-word
			u.css(comp.el, { width: px(COMP.w), boxShadow: '0 24px 60px -16px rgba(0,0,0,.6)' });
			const zbA = c.zoomBox(1, { left: '0', top: '0' });
			zbA.appendChild(comp.el);
			const wrapA = h('div', { class: 'abs', style: { left: px(COMP.x), top: px(COMP.y) } }, zbA);
			layerA.appendChild(wrapA);
			Object.assign(S, { comp, zbA, wrapA });

			// ---- cost chip: coins · rolling label · green dot · ▾
			const chip = comp.chips[1];
			chip.textContent = '';
			const rollIn = h('span', { style: { display: 'flex', flexDirection: 'column' } },
				h('span', { text: 'コスト調整: オフ', style: { whiteSpace: 'nowrap' } }),
				h('span', { text: 'コスト調整: オン', style: { whiteSpace: 'nowrap' } }));
			const roll = h('span', { style: { display: 'block', overflow: 'hidden', position: 'relative' } }, rollIn);
			const dot = h('i', { class: 'o-dot green', style: { display: 'block' } });
			const chev = h('span', { text: '▾', style: { fontSize: '11px', display: 'inline-block', lineHeight: '1' } });
			chip.append(c.icon('coins', 12), roll, dot, chev);
			Object.assign(S, { chip, roll, rollIn, dot, chev });
			// The ▾ glyph sits low in its line box, so turning it about the box centre lifts the
			// ▲ well above the label. Turn it about the glyph's ink centre instead (zoom is 1 here).
			{
				const probe = h('span', { style: { display: 'inline-block', width: '0', height: '0', verticalAlign: 'baseline' } });
				chev.appendChild(probe);
				const base = probe.getBoundingClientRect().top - chev.getBoundingClientRect().top;
				probe.remove();
				const cs = getComputedStyle(chev);
				const ctx = document.createElement('canvas').getContext('2d');
				ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
				const m = ctx.measureText('▾');
				const cx = (m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2;
				const cy = base - (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
				chev.style.transformOrigin = `${cx.toFixed(2)}px ${cy.toFixed(2)}px`;
			}

			// ---- AutoRouting panel (native px; placement top-start, 6 px above the chip)
			const knob = h('i', { style: { position: 'absolute', left: '1px', top: '1px', width: '16px', height: '16px', borderRadius: '50%', background: '#ffffff', boxShadow: '0 1px 3px rgba(0,0,0,.45)', display: 'block' } });
			const toggle = h('span', { style: { position: 'relative', display: 'block', width: '36px', height: '20px', borderRadius: '999px', flex: 'none', boxSizing: 'border-box', border: '1px solid #262120', background: '#0e0c0b' } }, knob);
			const header = h('div', { style: { display: 'flex', alignItems: 'flex-start', gap: '12px' } },
				h('div', { style: { flex: '1', minWidth: '0' } },
					h('div', { text: 'コストを自動で調整', style: { fontSize: '11px', fontWeight: '700', color: '#f7f2ea', lineHeight: '1.4' } }),
					h('div', { text: '依頼ごとに、下の条件に合うモデルと回答の長さを選びます。', style: { marginTop: '2px', color: '#877c72' } })),
				toggle);
			const slider = (label, value, ends) => {
				const val = h('span', { text: value, style: { fontWeight: '500', color: '#ece6de', whiteSpace: 'nowrap' } });
				const row = h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px', fontSize: '11px' } },
					h('span', { text: label, style: { color: '#ece6de' } }), val);
				const base = h('div', { style: { position: 'absolute', left: '0', right: '0', top: '5px', height: '4px', borderRadius: '2px', background: '#262120' } });
				const fill = h('div', { style: { position: 'absolute', left: '0', top: '5px', height: '4px', borderRadius: '2px', background: '#8f1d2c', width: '0' } });
				const thumb = h('i', { style: { position: 'absolute', left: '0', top: '1px', width: '12px', height: '12px', borderRadius: '50%', background: '#8f1d2c', boxShadow: '0 0 0 2px #1a1716, 0 1px 4px rgba(0,0,0,.5)', display: 'block' } });
				const track = h('div', { style: { position: 'relative', height: '14px', marginTop: '5px' } }, base, fill, thumb);
				const endsEl = ends ? h('div', { style: { display: 'flex', justifyContent: 'space-between', marginTop: '2px', fontSize: '10px', color: '#8c8c8c' } }, h('span', { text: ends[0] }), h('span', { text: ends[1] })) : null;
				return { el: h('div', {}, row, track, endsEl), val, fill, thumb, track };
			};
			const sliders = [
				slider('性能', '性能を重視（70）', ['料金を重視', '性能を重視']),
				slider('1 回あたりの上限', '$0.05 まで'),
				slider('回答の長さ', 'ふつう（4,096 トークンまで）', ['短め', '長め']),
			];
			const conds = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } }, ...sliders.map(s => s.el));
			const estimate = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '5px', opacity: '.5' } },
				h('div', { text: '料金の見積もり', style: { fontSize: '11px', fontWeight: '700', color: '#f7f2ea', lineHeight: '1.4' } }),
				h('div', { text: '入力中の依頼を見積もります。', style: { color: '#877c72' } }),
				h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' } },
					h('span', { text: '見積もる', style: { flex: 'none', padding: '4px 10px', borderRadius: '4px', background: '#8f1d2c', color: '#fbf6ee', fontSize: '11px', fontWeight: '600', lineHeight: '1.3' } }),
					h('span', { text: '見積もり自体にも少額の料金がかかります', style: { color: '#877c72' } })));
			const box = h('div', { style: { border: '1px solid #262120', borderRadius: '6px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '10px', lineHeight: '1.5' } },
				header, conds, h('div', { style: { height: '1px', background: '#262120' } }), estimate);
			const panel = h('div', { style: { position: 'absolute', left: '0', top: '0', width: px(PANEL_W), padding: '6px', borderRadius: '6px', background: '#1a1716', color: '#ece6de', wordBreak: 'auto-phrase', boxShadow: '0 8px 28px rgba(0,0,0,.35), 0 0 0 1px rgba(236,230,222,.05)' } }, box);
			zbA.appendChild(panel);
			Object.assign(S, { panel, toggle, knob, conds, sliders });

			// ---- measure (zoom 1), then place the panel and enlarge
			const labels = Array.from(rollIn.children).map(s => s.getBoundingClientRect());
			const lineH = labels[0].height;
			u.css(roll, { width: px(Math.max(...labels.map(r => r.width))), height: px(lineH) });
			S.lineH = lineH;
			const hNat = rel(comp.el, zbA).h;
			comp.input.style.minHeight = px(64 + (COMP.h - hNat));
			const chipR = rel(chip, zbA);
			const panelH = rel(panel, zbA).h;
			// Top-start above the chip would overhang the composer's right edge by 7 native px;
			// shifted (as a floating panel is kept inside its boundary) so the right edges align.
			const panelX = Math.min(chipR.x, COMP.w - PANEL_W);
			u.css(panel, { left: px(panelX), top: px(chipR.y - PANEL_GAP - panelH), transformOrigin: `${chipR.x - panelX + 20}px 100%` });
			S.trackW = sliders.map(s => s.track.getBoundingClientRect().width);
			const tg = rel(toggle, zbA);
			const toScreen = p => [COMP.x + p[0] * COMP.zoom, COMP.y + p[1] * COMP.zoom];
			S.chipPt = toScreen([chipR.x + chipR.w * .42, chipR.y + chipR.h * .55]);
			S.togglePt = toScreen([tg.x + tg.w * .5, tg.y + tg.h * .6]);
			zbA.style.zoom = String(COMP.zoom);

			// ---- cursor (ivory arrow, tip = hotspot) + click ring
			const cursor = svg('svg', { width: 24, height: 32, viewBox: '0 0 24 32', style: { position: 'absolute', left: '0', top: '0', overflow: 'visible', transformOrigin: '3px 2.5px', filter: 'drop-shadow(0 4px 8px rgba(0,0,0,.55))' } },
				svg('path', { d: 'M3 2.5 L3 25.5 L8.7 20 L12.7 29 L16.6 27.3 L12.7 18.5 L20.5 18.5 Z', fill: '#f7f2ea', stroke: '#0e0c0b', 'stroke-width': 1.3, 'stroke-linejoin': 'round' }));
			const clickRing = h('i', { class: 'abs', style: { left: '0', top: '0', width: '44px', height: '44px', marginLeft: '-22px', marginTop: '-22px', borderRadius: '50%', border: '1.5px solid #f7f2ea', boxSizing: 'border-box', display: 'block' } });
			layerA.append(clickRing, cursor);
			Object.assign(S, { cursor, clickRing });

			// ---- caption A (Caption M, baselines 420 / 510)
			S.capA = c.captionLines(['性能と料金を、', '調律する。'], { baselines: [420, 510], gold: ['調律'] });
			layerA.append(...S.capA.els);
			// base.css gives .ch `will-change: transform`: each char becomes a layer whose raster
			// offset is frozen at the frame it was first drawn, so a frame depended on which frames
			// came before it (≈0.05 px shift / softer edges in a forward render). Paint them normally.
			const unlayer = chars => chars.forEach(ch => { ch.style.willChange = 'auto'; });
			unlayer(S.capA.chars);
			{ const probe = h('i'); u.tf(probe, {}); S.ident = probe.style.transform; }   // how u.tf writes "no transform"

			// ======================================================== BEAT B: MOBILE
			const layerB = h('div', { class: 'fill' });
			root.appendChild(layerB);
			S.layerB = layerB;

			// ---- PC chat pane (zoom 1.7, native 440×420)
			const viewtitle = h('div', { class: 'o-viewtitle' }, h('span', { text: 'CHAT' }), h('div', { class: 'o-tb-icons' }, c.icon('plus', 14), c.icon('history', 14), c.icon('listChecks', 14), c.icon('gear', 14)));
			const thread = h('div', { class: 'o-thread', style: { position: 'relative', display: 'block', padding: '0', WebkitMaskImage: 'linear-gradient(180deg, transparent 0, #000 16px)', maskImage: 'linear-gradient(180deg, transparent 0, #000 16px)' } });
			const compB = c.composer({ chips: [
				{ icon: 'sliders', text: 'モデルなどの設定' },
				{ icon: 'coins', text: 'コスト調整: オン', on: true, dot: true, caret: true },
				{ icon: 'repeat', text: 'ループ: 自動' },
			] });
			compB.setText('', false, 'idle');
			compB.input.style.minHeight = '44px';
			compB.input.style.wordBreak = 'auto-phrase';
			const chatFoot = h('div', { style: { padding: '0 12px 12px' } }, compB.el);
			const pane = h('div', { class: 'o-chatpane', style: { width: px(PANE.w), height: px(PANE.h), minWidth: '0', border: '1px solid #3a3330', borderRadius: '10px', boxShadow: '0 40px 120px -20px rgba(0,0,0,.75), 0 0 0 1px rgba(255,255,255,.03)' } }, viewtitle, thread, chatFoot);
			const zbB = c.zoomBox(1, { left: '0', top: '0' });
			zbB.appendChild(pane);
			const wrapB = h('div', { class: 'abs', style: { left: px(PANE.x), top: px(PANE.y) } }, zbB);
			layerB.appendChild(wrapB);

			// Thread: the goal-reached line from 07 (agent idle), then /remote-control and its reply.
			const done = h('div', { class: 'o-md', html: '<b>🎯 目標を達成しました</b>（2 ラウンド目）' });
			const bub1 = c.bubble('/remote-control');
			const hang = { paddingLeft: '1.1em', textIndent: '-1.1em' };
			const r1 = h('div', { text: 'このチャットを Orchestra Mobile と同期しました。' });
			const r2 = h('div', { text: 'スマホで開くには:', style: { marginTop: '10px' } });
			const r3 = h('div', { text: '1. Orchestra Mobile に you@example.com でログインする', style: hang });
			const r4 = h('div', { text: '2. 「見つかったデバイス」から「Orchestra · my-pc」を選ぶ (接続済みならそのままこのチャットに切り替わります)', style: hang });
			const reply = h('div', { class: 'o-md', style: { wordBreak: 'auto-phrase' } }, r1, r2, r3, r4);
			const bub2 = c.bubble('ダークモードにも対応して');
			const statusText = h('span', { html: '<b style="color:inherit">Leader</b> が目標を設定しています...', style: { WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', backgroundSize: '300% 100%' } });
			const loader = c.mark({ width: 29, variant: 'small', glow: false });
			loader.el.style.flex = 'none';
			const status = h('div', { class: 'o-md', style: { display: 'flex', alignItems: 'center', gap: '8px' } }, h('span', { text: '🎯' }), statusText, loader.el);
			const content = h('div', { class: 'abs', style: { left: '16px', right: '16px', top: '12px', display: 'flex', flexDirection: 'column', gap: '12px' } }, done, bub1, reply, bub2, status);
			thread.appendChild(content);
			for (const b of [bub1, bub2]) { b.style.transformOrigin = '100% 100%'; }
			Object.assign(S, { pane, thread, content, done, bub1, reply, r12: [r1, r2], r34: [r3, r4], bub2, status, statusText, loader, compB });

			// Thread scroll: keep each new item's bottom BOTTOM_GAP above the composer.
			const threadH = thread.clientHeight;
			const evs = [];
			let need = 0;
			[[bub1, BUB1], [r2, REPLY[0]], [r4, REPLY[1]], [bub2, BUB2], [status, STATUS]].forEach(([el, at]) => {
				const r = rel(el, thread);
				const s = Math.max(need, r.y + r.h + BOTTOM_GAP - threadH);
				if (s > need + .5) { evs.push({ t: at, v: s }); need = s; }
			});
			S.scrollEv = evs;
			zbB.style.zoom = String(PANE.zoom);

			// ---- LAN arc: dotted quadratic, dots every 24 px of arc length
			const arcSvg = svg('svg', { width: 1920, height: 1080, viewBox: '0 0 1920 1080', style: { position: 'absolute', left: '0', top: '0', overflow: 'visible' } });
			const samples = [];
			let len = 0, prev = arcAt(0);
			for (let i = 0; i <= 600; i++) {
				const p = arcAt(i / 600);
				len += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
				samples.push({ k: i / 600, s: len, p });
				prev = p;
			}
			const total = len;
			const nDots = Math.floor(total / DOT_GAP);
			const offset = (total - nDots * DOT_GAP) / 2;
			S.dots = [];
			for (let i = 0; i <= nDots; i++) {
				const target = offset + i * DOT_GAP;
				const smp = samples.find(q => q.s >= target) || samples[samples.length - 1];
				const d = svg('circle', { cx: smp.p[0].toFixed(1), cy: smp.p[1].toFixed(1), r: 3, fill: C.gold });
				arcSvg.appendChild(d);
				S.dots.push({ el: d, k: smp.k });
			}
			// Arrival rings at the two ends.
			S.arrive = [ARC_P1, ARC_P0].map(p => {
				const r = svg('circle', { cx: p[0], cy: p[1], r: 4, fill: 'none', stroke: C.goldHi, 'stroke-width': 1.5 });
				arcSvg.appendChild(r);
				return r;
			});
			layerB.appendChild(arcSvg);

			// ---- packet (+ a short trail while it hops)
			const pktLayer = h('div', { class: 'fill' });
			S.trail = [7, 5, 4].map((d, i) => {
				const el = h('i', { class: 'abs', style: { left: '0', top: '0', width: px(d), height: px(d), marginLeft: px(-d / 2), marginTop: px(-d / 2), borderRadius: '50%', background: C.goldHi, display: 'block' } });
				pktLayer.appendChild(el);
				return el;
			});
			S.packet = h('i', { class: 'abs', style: { left: '0', top: '0', width: '10px', height: '10px', marginLeft: '-5px', marginTop: '-5px', borderRadius: '50%', background: C.goldHi, boxShadow: '0 0 0 1px rgba(255,244,230,.6), 0 0 12px 3px rgba(227,207,159,.55), 0 0 28px rgba(198,167,105,.45)', display: 'block' } });
			pktLayer.appendChild(S.packet);
			layerB.appendChild(pktLayer);

			// ---- pills
			const pill = (text, style) => h('div', { class: 'abs nowrap', text, style: { left: '0', top: '0', borderRadius: '999px', lineHeight: '1', ...style } });
			S.pillLan = pill('同じ LAN 内', { padding: '10px 20px 11px', background: '#1a1716', border: '1px solid #3a3330', font: '700 24px var(--jp)', color: '#ece6de', boxShadow: '0 8px 24px rgba(0,0,0,.45)' });
			S.pillImg = pill('イメージ', { padding: '6px 14px 7px', border: '1px solid #262120', font: '500 18px var(--jp)', color: '#877c72' });
			layerB.append(S.pillLan, S.pillImg);
			for (const [el, cx, cy] of [[S.pillLan, 1104, 470], [S.pillImg, 1500, 200]]) {
				const w = el.offsetWidth, hh = el.offsetHeight;
				u.css(el, { left: px(Math.round(cx - w / 2)), top: px(Math.round(cy - hh / 2)) });
			}

			// ---- phone wireframe (textless; its UI is not in the repo)
			const P = PHONE_R;
			const phone = h('div', { class: 'fill' });
			S.phoneFill = h('div', { class: 'abs', style: { left: px(P.x + 1), top: px(P.y + 1), width: px(P.w - 2), height: px(P.h - 2), borderRadius: px(P.r - 1), background: 'linear-gradient(180deg, rgba(19,17,16,.82), rgba(11,10,9,.86))' } });
			phone.appendChild(S.phoneFill);
			const bar = (x, y, w, hh, extra = {}) => {
				const el = h('i', { class: 'abs', style: { left: px(x), top: px(y), width: px(w), height: px(hh), borderRadius: '6px', background: '#24201e', display: 'block', ...extra } });
				phone.appendChild(el);
				return el;
			};
			const L = P.x + 26, R = P.x + P.w - 26;   // inner content edges
			const user = { border: '1px solid rgba(236,230,222,.08)', background: '#2a2522' };
			S.bars = [
				bar(P.x + P.w / 2 - 54, P.y + 40, 108, 10),                 // header
				bar(L, P.y + 70, R - L, 1, { borderRadius: '0', background: 'rgba(236,230,222,.06)' }),
				bar(L, P.y + 92, 196, 12),                                   // 🎯 目標を達成しました
				bar(R - 124, P.y + 118, 124, 28, user),                      // /remote-control
				bar(L, P.y + 164, 238, 12),                                  // reply
				bar(L, P.y + 194, 118, 12),
				bar(L, P.y + 218, 250, 12),
				bar(L, P.y + 242, 232, 12),
				bar(L, P.y + 266, 156, 12),
			];
			S.newBar = bar(R - 152, P.y + 296, 152, 28, user);              // ダークモードにも対応して (sent at SEND)
			S.input = h('div', { class: 'abs', style: { left: px(L - 4), top: px(TAP_AT[1] - 24), width: px(R - L + 8), height: '48px', borderRadius: '24px', background: '#1a1716', border: '1px solid #3a3330', boxSizing: 'border-box' } });
			S.typed = h('i', { class: 'abs', style: { left: '22px', top: '18px', height: '10px', width: '0', borderRadius: '5px', background: '#877c72', display: 'block' } });
			S.sendDot = h('i', { class: 'abs', style: { right: '7px', top: '7px', width: '32px', height: '32px', borderRadius: '50%', background: '#3a3330', display: 'block' } });
			S.input.append(S.typed, S.sendDot);
			phone.appendChild(S.input);
			const outline = svg('svg', { width: 1920, height: 1080, viewBox: '0 0 1920 1080', style: { position: 'absolute', left: '0', top: '0', overflow: 'visible' } });
			// Outline as two halves that grow from where the LAN arc lands (left edge, y 560)
			// round the top and the bottom, meeting on the right edge.
			const x0 = P.x + 1, x1 = P.x + P.w - 1, y0 = P.y + 1, y1 = P.y + P.h - 1, r = P.r - 1, ym = ARC_P1[1];
			const halves = [
				`M${x0},${ym} L${x0},${y0 + r} A${r},${r} 0 0 1 ${x0 + r},${y0} L${x1 - r},${y0} A${r},${r} 0 0 1 ${x1},${y0 + r} L${x1},${ym}`,
				`M${x0},${ym} L${x0},${y1 - r} A${r},${r} 0 0 0 ${x0 + r},${y1} L${x1 - r},${y1} A${r},${r} 0 0 0 ${x1},${y1 - r} L${x1},${ym}`,
			];
			S.outline = halves.map(d => svg('path', { d, fill: 'none', stroke: 'rgba(236,230,222,.35)', 'stroke-width': 2, 'stroke-linecap': 'round', pathLength: 1 }));
			S.tapRing = svg('circle', { cx: TAP_AT[0], cy: TAP_AT[1], r: 0, fill: 'rgba(247,242,234,.18)', stroke: '#f7f2ea', 'stroke-width': 2 });
			outline.append(...S.outline, S.tapRing);
			phone.appendChild(outline);
			layerB.appendChild(phone);

			// ---- caption B (72 px, x 120, baseline 190)
			S.capB = c.captionLines(['離れても、スマホから。'], { baselines: [190], gold: ['スマホ'] });
			layerB.append(...S.capB.els);
			unlayer(S.capB.chars);

			// ======================================================== WIPE EDGE, FOOTNOTE, DIM
			S.edge = h('div', { class: 'abs', style: { left: '0', top: '0', width: '2px', height: '1080px', marginLeft: '-1px', background: 'linear-gradient(180deg, transparent 0%, rgba(227,207,159,.7) 35%, rgba(227,207,159,.7) 65%, transparent 100%)', boxShadow: '0 0 18px 2px rgba(198,167,105,.25)' } });
			root.appendChild(S.edge);
			S.foot = c.footnote('※ 同じ LAN 内・同じ Division アカウントで接続します。スマホ画面はイメージです', { x: 1800, baseline: 1030, align: 'right' });
			root.appendChild(S.foot.el);
			unlayer(S.foot.chars);
			S.dim = h('div', { class: 'fill', style: { background: 'rgb(7,6,5)' } });
			root.appendChild(S.dim);
			return S;
		},

		draw(t, S) {
			// ---------------------------------------------------- backdrop + staff
			S.bg.draw(t);
			const drift = (t * STAFF_DRIFT) % 640;
			const rings = [0, 0, 0, 0, 0];
			LANDS.forEach((at, i) => { rings[STAFF_FOR[i]] = Math.max(rings[STAFF_FOR[i]], ring(t, at, STAFF_DUR)); });
			S.staff.forEach((s, i) => {
				tf(s.line, { x: -drift });
				tf(s.glow, { o: rings[i] });
			});

			// ==================================================== BEAT A
			const wipeK = u.p(t, WIPE, WIPE_DUR, ease.inOutCubic);
			show(S.layerA, wipeK < 1);
			tf(S.layerA, { x: -200 * wipeK, o: 1 - u.p(t, WIPE, WIPE_DUR, ease.inOutSine) });
			// Beat A is also cut at the wipe edge (screen x (1 - e)·1920; the layer itself has
			// moved -200e), so the two beats never double-expose across the boundary.
			S.layerA.style.clipPath = wipeK > 0 ? `inset(0 ${(1720 * wipeK).toFixed(2)}px 0 0)` : '';

			// composer settles in under the fade
			const ck = u.p(t, 0, COMP_IN, ease.outCubic);
			tf(S.wrapA, { y: 16 * (1 - ck), o: u.p(t, COMP_FADE, COMP_FADE_DUR, ease.outCubic) });

			// panel open / close
			const openK = u.p(t, OPEN, OPEN_DUR, ease.outCubic);
			const closeK = u.p(t, CLOSE, CLOSE_DUR, ease.inCubic);
			const pk = openK * (1 - closeK);
			tf(S.panel, { y: 6 * (1 - pk), s: .96 + .04 * pk, o: pk });

			// chip: open style from the click (and kept, since tuning is on), ▾ turns over and back
			const chipK = u.p(t, OPEN, CHIP_DUR, ease.outCubic);
			S.chip.style.color = mixHex('#877c72', '#ece6de', chipK);
			S.chip.style.background = `rgba(236,230,222,${(.08 * chipK).toFixed(3)})`;
			const chevK = u.p(t, OPEN, CHEV_DUR, ease.inOutCubic) - u.p(t, CLOSE, CHEV_DUR, ease.inOutCubic);
			setTf(S.chev, `rotate(${(180 * chevK).toFixed(2)}deg)`, chevK <= 0);

			// toggle: knob springs across, track fills garnet, conditions undim, label rolls, dot appears
			const knobK = ease.spring(u.p(t, TOGGLE, KNOB_DUR));
			setTf(S.knob, `translateX(${(16 * knobK).toFixed(2)}px)`, knobK <= 0);
			const fillK = u.p(t, TOGGLE, FILL_DUR, ease.outCubic);
			S.toggle.style.background = mixHex('#0e0c0b', C.garnet, fillK);
			S.toggle.style.borderColor = mixHex('#262120', C.garnet, fillK);
			S.conds.style.opacity = String(.6 + .4 * u.p(t, TOGGLE, COND_DUR, ease.inOutSine));
			const rollK = u.p(t, TOGGLE, ROLL_DUR, ease.inOutCubic);
			setTf(S.rollIn, `translateY(${(-S.lineH * rollK).toFixed(2)}px)`, rollK <= 0);
			const dotK = u.p(t, TOGGLE, ROLL_DUR, ease.outCubic);
			const dotS = ease.outBack(u.p(t, TOGGLE + .05, .3));
			u.css(S.dot, { width: px(6 * dotK), height: '6px', marginLeft: px(-4 * (1 - dotK)), opacity: String(dotK) });
			setTf(S.dot, `scale(${dotS.toFixed(3)})`, Math.abs(dotS - 1) < 1e-9);

			// sliders: thumbs glide from the left end (outBack), values fade in after landing
			S.sliders.forEach((s, i) => {
				const k = VALUES[i] * ease.outBack(u.p(t, LANDS[i] - GLIDE, GLIDE));
				const w = S.trackW[i];
				const cx = 6 + k * (w - 12);
				setTf(s.thumb, `translateX(${(cx - 6).toFixed(2)}px)`, Math.abs(cx - 6) < 1e-9);
				s.fill.style.width = px(cx.toFixed(2));
				s.val.style.opacity = String(u.p(t, LANDS[i], VALUE_DUR, ease.inOutSine));
			});

			// cursor
			const start = [S.chipPt[0] + 230, S.chipPt[1] - 250];
			let cp;
			if (t < MOVE2) {
				const k = u.p(t, MOVE1, CLICK1 - MOVE1, ease.inOutCubic);
				cp = quad(start, [start[0] - 40, S.chipPt[1] - 40], S.chipPt, k);
			} else {
				const k = u.p(t, MOVE2, CLICK2 - MOVE2, ease.inOutCubic);
				// gentle bow (60 px off the chord) rather than a straight robotic line
				const mid = [(S.chipPt[0] + S.togglePt[0]) / 2, (S.chipPt[1] + S.togglePt[1]) / 2];
				const dx = S.togglePt[0] - S.chipPt[0], dy = S.togglePt[1] - S.chipPt[1], dl = Math.hypot(dx, dy);
				cp = quad(S.chipPt, [mid[0] + 60 * dy / dl, mid[1] - 60 * dx / dl], S.togglePt, k);
			}
			const outK = u.p(t, CUR_OUT, CUR_OUT_DUR, ease.inOutSine);
			cp = [cp[0] + 18 * outK, cp[1] + 24 * outK];
			const press = at => (t >= at - .06 && t < at + .2) ? (t < at ? u.p(t, at - .06, .06) : 1 - u.p(t, at, .2, ease.outCubic)) : 0;
			const pr = Math.max(press(CLICK1), press(CLICK2));
			tf(S.cursor, { x: cp[0] - 3, y: cp[1] - 2.5, s: 1 - .12 * pr, o: Math.min(u.p(t, CUR_IN, CUR_IN_DUR, ease.outCubic), 1 - outK) });
			const ringAt = t >= CLICK2 ? CLICK2 : CLICK1;
			const rk = u.p(t, ringAt, .35, ease.outCubic);
			const ringPt = t >= CLICK2 ? S.togglePt : S.chipPt;
			tf(S.clickRing, { x: ringPt[0], y: ringPt[1], s: .2 + .8 * rk, o: t >= CLICK1 && rk < 1 ? .5 * (1 - rk) : 0 });

			// caption A
			c.cycle(S.capA.chars, t, CAP_A, CAP_A_OUT);
			S.capA.chars.forEach(ch => { if (ch.style.transform === S.ident) { ch.style.transform = 'none'; } });

			// ==================================================== WIPE
			show(S.layerB, t >= WIPE);
			S.layerB.style.clipPath = wipeK < 1 ? `inset(0 0 0 ${((1 - wipeK) * 100).toFixed(3)}%)` : '';
			const edgeOn = t > WIPE && wipeK < 1;
			tf(S.edge, { x: (1 - wipeK) * 1920, o: edgeOn ? Math.sin(Math.PI * wipeK) * .9 : 0 });

			// ==================================================== BEAT B
			// thread
			const scroll = steps(t, S.scrollEv, .35);
			tf(S.content, { y: -scroll });
			const bubble = (el, at) => {
				const k = u.p(t, at, BUB_DUR, ease.outCubic);
				tf(el, { y: 10 * (1 - k), s: .985 + .015 * k, o: k });
			};
			bubble(S.bub1, BUB1);
			S.r12.forEach(el => tf(el, { o: u.p(t, REPLY[0], REPLY_DUR) }));
			S.r34.forEach(el => tf(el, { o: u.p(t, REPLY[1], REPLY_DUR) }));
			bubble(S.bub2, BUB2);
			const sk = u.p(t, STATUS, .25, ease.outCubic);
			tf(S.status, { y: 10 * (1 - sk), o: sk });
			S.statusText.style.backgroundImage = `linear-gradient(90deg, #877c72 0%, #877c72 40%, ${C.gold} 50%, #877c72 60%, #877c72 100%)`;
			S.statusText.style.backgroundPosition = `${(100 - ((((t - STATUS + .65) / 2.6) % 1) + 1) % 1 * 100).toFixed(2)}% 0`;
			S.loader.draw(t);

			// phone outline draws; inside fades in
			const phK = u.p(t, PHONE, PHONE_DUR, ease.inOutCubic);
			S.outline.forEach(o => {
				o.setAttribute('stroke-dasharray', phK >= 1 ? 'none' : '1 1');
				o.setAttribute('stroke-dashoffset', (1 - phK).toFixed(4));
				o.style.visibility = phK > 0 ? 'visible' : 'hidden';
			});
			tf(S.phoneFill, { o: u.p(t, PHONE + .1, .4, ease.inOutSine) });
			S.bars.forEach((b, i) => tf(b, { o: u.p(t, PHONE + .15 + i * .025, .25, ease.outCubic) }));
			tf(S.input, { o: u.p(t, PHONE + .3, .3, ease.outCubic) });

			// arc dots draw PC -> phone
			S.dots.forEach(d => { d.el.setAttribute('opacity', (.4 * u.p(t, ARC + d.k * (ARC_DUR - .08), .08)).toFixed(3)); });

			// pills
			const lanK = u.p(t, PILL_LAN, PILL_DUR, ease.outCubic);
			tf(S.pillLan, { s: .92 + .08 * ease.outBack(u.p(t, PILL_LAN, PILL_DUR)), o: lanK });
			tf(S.pillImg, { y: 6 * (1 - u.p(t, PILL_IMG, PILL_DUR, ease.outCubic)), o: u.p(t, PILL_IMG, PILL_DUR, ease.outCubic) });

			// packet: PC -> phone (5.0–5.5), phone -> PC (5.75–6.25), discrete polling hops
			// At the phone (5.5–5.75) the outgoing packet fades out while the return one fades in;
			// draw whichever is brighter, so the handover never blinks to nothing for a frame.
			let pkt = null;
			for (const [start, dir] of [[PKT_OUT, 1], [PKT_BACK, -1]]) {
				const vis = Math.min(u.p(t, start - .15, .15, ease.outCubic), 1 - u.p(t, start + HOP * HOPS, .15, ease.inCubic));
				if (vis > 0 && (!pkt || vis > pkt.vis)) { pkt = { start, dir, vis }; }
			}
			let lanGlow = 0;
			if (pkt) {
				const kAt = tt => { const k = hopK(tt, pkt.start); return pkt.dir > 0 ? k : 1 - k; };
				const k = kAt(t);
				const vis = pkt.vis;
				const p = arcAt(k);
				// placed with left/top: a fractional translate made the resting glow depend on render order
				place(S.packet, p);
				tf(S.packet, { s: .5 + .5 * vis, o: vis });
				S.trail.forEach((el, i) => {
					const q = arcAt(kAt(t - .025 * (i + 1)));
					const moving = Math.hypot(q[0] - p[0], q[1] - p[1]) > 1;
					place(el, q);
					tf(el, { o: moving ? vis * (.55 - i * .15) : 0 });
				});
				lanGlow = vis * Math.max(0, 1 - Math.abs(k - .5) / .1);
			} else {
				tf(S.packet, { o: 0 });
				S.trail.forEach(el => tf(el, { o: 0 }));
			}
			S.pillLan.style.borderColor = mixHex('#3a3330', C.gold, lanGlow);
			S.pillLan.style.boxShadow = `0 8px 24px rgba(0,0,0,.45), 0 0 ${(22 * lanGlow).toFixed(1)}px rgba(198,167,105,${(.4 * lanGlow).toFixed(3)})`;
			// arrival rings (phone at 5.5, PC at 6.25)
			[PKT_OUT, PKT_BACK].forEach((st, i) => {
				const ak = u.p(t, st + HOP * HOPS, .45, ease.outCubic);
				S.arrive[i].setAttribute('r', (4 + 22 * ak).toFixed(2));
				S.arrive[i].setAttribute('opacity', (ak > 0 && ak < 1 ? .7 * (1 - ak) : 0).toFixed(3));
			});

			// phone: tap at 5.5, abstract text fills the input, sent at 5.75
			const tk = u.p(t, TAP, .45, ease.outCubic);
			S.tapRing.setAttribute('r', (50 * tk).toFixed(2));
			S.tapRing.setAttribute('opacity', (tk > 0 && tk < 1 ? .5 * (1 - tk) : 0).toFixed(3));
			const typeK = u.p(t, TAP + .03, TYPE_DUR - .03, ease.outCubic);
			const sentK = u.p(t, SEND, .12, ease.inOutSine);
			S.typed.style.width = px((150 * typeK).toFixed(2));
			S.typed.style.opacity = String(.75 * (1 - sentK));
			S.sendDot.style.background = mixHex('#3a3330', '#ece6de', u.p(t, TAP + .1, .1) * (1 - sentK));
			const nb = u.p(t, SEND, .3, ease.outCubic);
			tf(S.newBar, { y: 12 * (1 - nb), o: nb });

			// caption B + footnote
			c.reveal(S.capB.chars, t, CAP_B);
			S.capB.chars.forEach(ch => { if (ch.style.transform === S.ident) { ch.style.transform = 'none'; } });
			tf(S.foot.el, { o: u.p(t, FOOT, FOOT_DUR, ease.outCubic) });

			// ---------------------------------------------------- dim toward noir for the cut to 09
			tf(S.dim, { o: DIM_MAX * u.p(t, DIM, DIM_DUR, ease.inOutSine) });
		},
	});
})();
