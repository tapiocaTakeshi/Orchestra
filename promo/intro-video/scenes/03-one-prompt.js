// 03-one-prompt — global 17.0–24.0 (BUILD; SEND on 20.0 where the riser starts).
// The real agent-mode UI. 02's gold point becomes the titlebar robot icon, the
// camera settles on the chat pane, one request is typed and sent, and the Leader
// sets the goal and two yes/no conditions. The conditions fly out as the two goal
// tokens used through to 07. Ends on a white-gold flash that carries over the cut.
(() => {
	const { u, c, ease } = ORC;
	const { h } = u;
	const K = ORC.k;
	const C = K.COLORS;

	// ------------------------------------------------------------ timing (scene seconds)
	const BG_IN = .4;
	const POINT_OUT = .4, WIN_IN = .5;
	const CAM_A = .6, CAM_B = 1.8;
	// Caption 1 exits at 3.2 rather than 3.55. c.hide's inCubic exit keeps glyphs nearly
	// opaque for most of its .35 s (plus .135 s of stagger), and caption 2 reveals in the
	// same two lines at 3.7. From 3.2 the last glyph is gone by 3.685, so the captions never
	// double-expose. It still holds 1.835 s fully revealed (rule: 5 chars → 1.75 s).
	const CAP1 = .5, CAP1_OUT = 3.2, CAP2 = 3.7;
	const FOOT = .6, FOOT_DUR = .4;
	const ZONE = .35, ZONE_DUR = .6, BLUR = 4; // left zone dims (and the editor softens) as caption 1 arrives
	const FOCUS = 1.4, CPS = 15;
	const HOVER = 2.6, HOVER_DUR = .3;
	const PRESS = 3.0, PRESS_DIP = .05, SPRING = .25, RIPPLE = .4;
	const FLY = 3.0, FLY_DUR = .4, GREET_DUR = .3;
	const RUNNING = 3.3;
	const STATUS = 3.4, SETTLE = 4.2, SETTLE_DUR = .3;
	const LINES = [4.2, 4.55, 4.9, 5.25, 5.6, 5.95], LINE_DUR = .25, LINE_RISE = 10;
	const GHOSTS = [5.25, 5.6], GHOST_DUR = .45;
	const SCROLL = .4, BOTTOM_GAP = 16;
	const VIG = 6.6, VIG_DUR = .4, FLASH = 6.8, FLASH_DUR = .2, FLASH_PEAK = .6;

	// ------------------------------------------------------------ camera: screen = offset + native · zoom
	const Z0 = 1.3, O0 = [180, 150];
	const Z1 = 2.0, O1 = [-580, -190];
	const P = K.P_ROBOT;
	// Thread content starts this far below the thread top (native px) so that, at
	// zoom 2.0 with the titlebar off-screen, the first line sits inside the safe area
	// (bubble top at screen y 100). The greeting starts at its natural spot (PAD0)
	// and drifts down to PAD with the camera move.
	const PAD = 80, PAD0 = 36;

	// ------------------------------------------------------------ goal tokens
	const TOKEN_SIZE = 48, LABEL_SIZE = 34;
	// Condition 1 arcs left through VIA. Condition 2 cannot take the same arc: any path
	// through VIA down to TOKEN_2 drags its ghost across label 1, so it swoops down the
	// right of label 1 first and sweeps in underneath it (cubic, control points C2A/C2B).
	const VIA = [700, 420];
	const C2A = [800, 640], C2B = [560, 700];
	const CONDS = [K.COND1, K.COND2];
	const MONO = [[], ['npm test']];

	// ------------------------------------------------------------ helpers
	const px = v => `${v}px`;
	const hex = s => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
	const mixHex = (a, b, k) => { const A = hex(a), B = hex(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * k)).join(', ')})`; };
	const quad = (a, cp, b, k) => [(1 - k) ** 2 * a[0] + 2 * (1 - k) * k * cp[0] + k * k * b[0], (1 - k) ** 2 * a[1] + 2 * (1 - k) * k * cp[1] + k * k * b[1]];
	const cubic = (a, b1, b2, b, k) => [0, 1].map(j => (1 - k) ** 3 * a[j] + 3 * (1 - k) ** 2 * k * b1[j] + 3 * (1 - k) * k * k * b2[j] + k ** 3 * b[j]);
	const show = (el, on, display = 'block') => { el.style.display = on ? display : 'none'; };
	const cam = t => {
		const k = u.p(t, CAM_A, CAM_B - CAM_A, ease.inOutCubic);
		return { z: u.lerp(Z0, Z1, k), x: u.lerp(O0[0], O1[0], k), y: u.lerp(O0[1], O1[1], k) };
	};
	// Sum of eased steps (thread scroll): starts at 0, moves to each v over [t, t + dur].
	const steps = (t, evs, dur) => {
		let v = 0, prev = 0;
		for (const e of evs) { v += (e.v - prev) * u.p(t, e.t, dur, ease.inOutCubic); prev = e.v; }
		return v;
	};
	// Native-px rect of el relative to the window (measured at zoom 1).
	const rel = (el, base) => {
		const r = el.getBoundingClientRect(), b = base.getBoundingClientRect();
		return { x: r.left - b.left, y: r.top - b.top, w: r.width, h: r.height };
	};
	// Native-px baseline of the first line of el relative to the window.
	const baselineOf = (el, base) => {
		const probe = h('span', { style: { display: 'inline-block', width: '0', height: '0', verticalAlign: 'baseline' } });
		el.appendChild(probe);
		const y = probe.getBoundingClientRect().top - base.getBoundingClientRect().top;
		probe.remove();
		return y;
	};

	ORC.register({
		id: '03-one-prompt',
		duration: 7,
		transition: 'cut',

		build(root) {
			const S = {};

			// ======================================================== BACKDROP
			// 02 ends on the red-tinted noir; the gold tint fades in over it.
			S.bgRed = c.backdrop({ tint: 'red' });
			S.bgGold = c.backdrop({ tint: 'gold' });
			root.append(S.bgRed.el, S.bgGold.el);

			// ======================================================== WINDOW (camera rig)
			const win = c.ideWindow({ width: 1200, height: 600, title: '', chatWidth: '40%' });
			u.css(win.el, { left: '0', top: '0' });
			const zb = c.zoomBox(1, { left: '0', top: '0' });
			zb.appendChild(win.el);
			const camEl = h('div', { class: 'abs', style: { left: '0', top: '0', transformOrigin: '0 0' } }, zb);
			const intro = h('div', { class: 'fill', style: { transformOrigin: `${P.x}px ${P.y}px` } }, camEl);
			root.appendChild(intro);
			Object.assign(S, { win, zb, camEl, intro });
			S.robot = win.titlebar.querySelector('.o-tb-icons').children[2];

			// Editor: agent-mode home screen.
			// Its default 18px rhythm overflows a 566px-tall editor by a few px (the
			// button row was clipped), so tighten the gaps slightly.
			const home = c.home();
			u.css(home.el, { gap: '14px', paddingTop: '16px', paddingBottom: '16px' });
			win.editor.appendChild(home.el);
			S.home = home.el;
			// Left caption zone: a darkening layer over the editor (above the home screen).
			S.zone = h('div', { class: 'abs', style: { inset: '0', pointerEvents: 'none' } });
			win.editor.appendChild(S.zone);
			S.editorX = rel(win.editor, win.el).x;

			// Thread: greeting, then (after send) bubble, status line and the goal block.
			const thread = win.thread;
			u.css(thread, { position: 'relative', padding: '0', display: 'block' });
			const greet = c.greet();
			const greetWrap = h('div', { class: 'abs', style: { left: '16px', right: '16px', top: px(PAD - 24) } }, greet);
			const content = h('div', { class: 'abs', style: { left: '16px', right: '16px', top: px(PAD), display: 'flex', flexDirection: 'column' } });
			thread.append(greetWrap, content);
			S.greetWrap = greetWrap;
			S.content = content;

			const bubble = c.bubble(K.REQUEST);
			const statusText = h('span', { html: '<b style="color:inherit">Leader</b> が目標を設定しています...', style: { WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', backgroundSize: '300% 100%' } });
			const loader = c.mark({ width: 29, variant: 'small', glow: false });
			loader.el.style.flex = 'none';
			const status = h('div', { class: 'o-md', style: { marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px' } }, h('span', { text: '🎯' }), statusText, loader.el);
			const condLine = (n, text) => {
				const span = h('span', { text });
				return { el: h('div', {}, h('span', { text: `${n}. ` }), span), span };
			};
			const c1 = condLine(1, K.COND1), c2 = condLine(2, K.COND2);
			const lines = [
				h('div', { text: '🎯 目標', style: { fontSize: '16px', fontWeight: '700', color: '#f7f2ea', lineHeight: '1.4' } }),
				h('div', { html: `<b>${K.GOAL}</b>`, style: { marginTop: '2px' } }),
				h('div', { text: '達成条件:', style: { marginTop: '2px' } }),
				c1.el,
				c2.el,
				h('blockquote', { text: '🔁 Reviewer が達成と判定するまで、最大 5 ラウンド繰り返します。', style: { borderLeft: '3px solid #3a3330', color: '#bdb3a8' } }),
			];
			const goal = h('div', { class: 'o-md', style: { marginTop: '8px' } }, ...lines);
			content.append(bubble, status, goal);
			Object.assign(S, { bubble, status, statusText, loader, lines });

			// Composer (chips passed explicitly: cost tuning is OFF here).
			const comp = c.composer({ chips: [
				{ icon: 'sliders', text: 'モデルなどの設定' },
				{ icon: 'coins', text: 'コスト調整: オフ', caret: true },
				{ icon: 'repeat', text: 'ループ: 自動' },
			] });
			win.chatFoot.appendChild(comp.el);
			comp.setText('', false, 'idle');
			const phIdle = comp.input.querySelector('.o-ph').textContent;
			comp.input.textContent = '';
			const ph = h('span', { class: 'o-ph' });
			const typed = h('span', { style: { display: 'inline-block', whiteSpace: 'pre' } });
			const caret = h('i', { class: 'o-caret' });
			comp.input.append(ph, typed, caret);
			comp.el.style.position = 'relative';
			const ripple = h('i', { style: { position: 'absolute', borderRadius: '50%', border: '1.5px solid #ece6de', boxSizing: 'border-box', pointerEvents: 'none' } });
			comp.el.appendChild(ripple);
			Object.assign(S, { comp, ph, phIdle, typed, caret, ripple });

			// ======================================================== MEASURE (native px)
			// The send fly, the ripple and the ghost launches all happen once the camera
			// has settled, so measure at that exact zoom and divide it out. Text widths and
			// line boxes round differently at zoom 1. The right-aligned bubble and the
			// bottom-anchored composer then sat ~2 native px off, so the two crossfading
			// copies of the request double-exposed visibly during the fly.
			const ZF = Z1 - 1e-4; // the zoom draw() applies from CAM_B on
			zb.style.zoom = String(ZF);
			const relF = (el, base) => { const r = rel(el, base); return { x: r.x / ZF, y: r.y / ZF, w: r.w / ZF, h: r.h / ZF }; };
			const baseF = (el, base) => baselineOf(el, base) / ZF;
			typed.textContent = K.REQUEST;
			const tr = relF(typed, win.el), br = relF(bubble, win.el);
			// Left edge of an element's text run (not border + padding: at zoom 1.9999 the 1px
			// border is floored to one device pixel, i.e. half a native px).
			const textX = el => { const rg = document.createRange(); rg.selectNodeContents(el); return (rg.getBoundingClientRect().left - win.el.getBoundingClientRect().left) / ZF; };
			const tX = textX(typed), bX = textX(bubble);
			// Fly vector: typed text (left, baseline) -> bubble text (left, baseline).
			const bBase = baseF(bubble, win.el), tBase = baseF(typed, win.el);
			S.flyD = [bX - tX, bBase - tBase];
			// Scale both about their text's left baseline so the crossfading copies stay registered.
			typed.style.transformOrigin = `${tX - tr.x}px ${tBase - tr.y}px`;
			bubble.style.transformOrigin = `${bX - br.x}px ${bBase - br.y}px`;
			typed.textContent = '';
			const sr = relF(comp.send, comp.el);
			S.sendC = [sr.x + sr.w / 2, sr.y + sr.h / 2];
			// Scroll so each new line's bottom sits >= BOTTOM_GAP above the composer.
			const threadH = thread.getBoundingClientRect().height / ZF;
			const evs = [];
			const tops = [status, ...lines];
			const times = [STATUS, ...LINES];
			let need = 0;
			tops.forEach((el, i) => {
				const r = relF(el, thread);
				const s = Math.max(need, r.y + r.h + BOTTOM_GAP - threadH);
				if (s > need + .5) { evs.push({ t: times[i], v: s }); need = s; }
			});
			S.scrollEv = evs;
			// Condition text anchors (left edge, baseline) for the ghosts.
			S.condAnchor = [c1.span, c2.span].map(sp => [relF(sp, win.el).x, baseF(sp, win.el)]);
			zb.style.zoom = '1';

			// ======================================================== GOLD POINT (from 02)
			S.point = h('div', { class: 'abs', style: { left: px(P.x - 6), top: px(P.y - 6), width: '12px', height: '12px', borderRadius: '50%', background: C.goldHi, boxShadow: `0 0 24px ${C.gold}` } });
			root.appendChild(S.point);

			// ======================================================== GOAL TOKENS + GHOSTS
			const tokenLayer = h('div', { class: 'fill' });
			root.appendChild(tokenLayer);
			S.tokens = K.TOKENS.map((p, i) => {
				const tk = c.goalToken({ x: p.x, y: p.y, size: TOKEN_SIZE, label: CONDS[i], labelSize: LABEL_SIZE, mono: MONO[i] });
				tk.set('empty');
				tokenLayer.appendChild(tk.el);
				return tk;
			});
			S.ghosts = K.TOKENS.map((p, i) => {
				const baseline = p.y + LABEL_SIZE * .36;
				const g = c.textAt(CONDS[i], { x: p.x + TOKEN_SIZE / 2 + 22, baseline, size: LABEL_SIZE, weight: 700, color: C.goldHi, letterSpacing: '0', shadow: false, parent: tokenLayer });
				for (const word of MONO[i]) {
					const from = Array.from(CONDS[i].slice(0, CONDS[i].indexOf(word))).length;
					for (let j = from; j < from + Array.from(word).length; j++) { g.chars[j].style.fontFamily = 'var(--mono)'; g.chars[j].style.fontWeight = '600'; }
				}
				g.el.style.textShadow = '0 0 14px rgba(227,207,159,.75), 0 0 32px rgba(198,167,105,.45)';
				const top = parseFloat(g.el.style.top), left = parseFloat(g.el.style.left);
				g.el.style.transformOrigin = `0 ${baseline - top}px`;
				return { el: g.el, end: [left, baseline] };
			});

			// ======================================================== VIGNETTE (riser peak)
			// The backdrop's vignette ellipse (130% x 100%, clear to 55%) shrunk by 15%, laid
			// over the UI so the tightening reads even where the window covers the backdrop.
			S.vig = h('div', { class: 'fill', style: { background: 'radial-gradient(110.5% 85% at 50% 50%, transparent 47%, rgba(0,0,0,.6) 100%)' } });
			root.appendChild(S.vig);

			// ======================================================== CAPTIONS
			const capLayer = h('div', { class: 'fill' });
			root.appendChild(capLayer);
			S.cap1 = c.captionLines(['頼むのは、', 'ひとこと。'], { gold: ['ひとこと'] });
			S.kicker = c.textAt('LEADER', { x: 120, baseline: 150, size: 20, weight: 600, family: 'var(--en)', color: C.gold, letterSpacing: '.32em', shadow: false, parent: capLayer });
			S.cap2 = c.captionLines(['まず、', 'ゴールを決める。'], { gold: ['ゴール'] });
			capLayer.append(...S.cap1.els, ...S.cap2.els);

			S.foot = c.footnote('※ 画面はイメージです');
			root.appendChild(S.foot.el);

			// ======================================================== FLASH (carries over the cut into 04)
			S.flash = h('div', { class: 'fill', style: { background: '#fff4e6' } });
			root.appendChild(S.flash);
			return S;
		},

		draw(t, S) {
			// ---------------------------------------------------- backdrop
			const bgK = u.p(t, 0, BG_IN, ease.inOutSine);
			S.bgRed.draw(t + 5);
			S.bgRed.el.style.display = bgK < 1 ? 'block' : 'none';
			S.bgGold.draw(t);
			u.tf(S.bgGold.el, { o: bgK });

			// ---------------------------------------------------- camera + window entrance
			const cm = cam(t);
			// Chromium floors zoomed 1px borders to whole pixels: they are 1px all through the
			// move but would snap to 2px the moment zoom hits exactly 2.0, nudging the whole UI
			// 1-2px at the end of the camera move. Stopping a hair short keeps it seamless.
			S.zb.style.zoom = String(Math.min(cm.z, Z1 - 1e-4));
			u.tf(S.camEl, { x: cm.x, y: cm.y });
			const inK = u.p(t, 0, WIN_IN, ease.outCubic);
			u.tf(S.intro, { s: u.lerp(.96, 1, inK), o: inK });
			S.robot.style.color = mixHex(C.goldHi, '#bdb3a8', u.p(t, 0, POINT_OUT, ease.inOutSine));

			// Gold point from 02 shrinks into the robot icon.
			const pk = u.p(t, 0, POINT_OUT, ease.inOutCubic);
			u.tf(S.point, { s: 1 - pk, o: pk < 1 ? 1 : 0 });

			// Left caption zone: darkens the editor with a screen-space gradient, .88 at
			// screen x 0 to .55 at the chat pane's edge (x 860 once the camera settles).
			// It lives inside the editor so it follows the window and never splits the titlebar.
			const zoneK = u.p(t, ZONE, ZONE_DUR, ease.inOutSine);
			const x0 = Math.max(0, -cm.x / cm.z - S.editorX);
			S.zone.style.background = `linear-gradient(90deg, rgba(14,12,11,.88) ${x0.toFixed(2)}px, rgba(14,12,11,.55) 100%)`;
			u.tf(S.zone, { o: zoneK });
			// The home screen softens behind the captions (native px, so 2x on screen at zoom 2).
			S.home.style.filter = zoneK > .001 ? `blur(${(BLUR * zoneK).toFixed(3)}px)` : 'none';

			// ---------------------------------------------------- composer
			const focused = t >= FOCUS && t < RUNNING;
			const focusK = u.p(t, FOCUS, .15) * (1 - u.p(t, RUNNING, .2));
			S.comp.el.style.borderColor = mixHex('#262120', '#7e6b48', focusK);
			S.comp.el.style.boxShadow = `0 0 0 3px rgba(198,167,105,${(.15 * focusK).toFixed(3)}), 0 8px 24px -8px rgba(0,0,0,${(.4 * focusK).toFixed(3)})`;
			// Idle placeholder until focus, cleared while typing, running placeholder from 3.3.
			// Text, display and opacity are all set on every call.
			const running = t >= RUNNING;
			S.ph.textContent = running ? 'エージェントが作業中です… 止めたいときは Esc' : S.phIdle;
			show(S.ph, t < FOCUS || running, 'inline');
			S.ph.style.opacity = running ? String(u.p(t, RUNNING, .25, ease.outCubic)) : '1';
			// Typed text, then the fly into the bubble.
			const flyK = u.p(t, FLY, FLY_DUR, ease.outCubic);
			S.typed.textContent = focused ? (t < FLY ? u.typed(K.REQUEST, t, FOCUS, CPS) : K.REQUEST) : '';
			if (t >= FLY) {
				u.tf(S.typed, { x: S.flyD[0] * flyK, y: S.flyD[1] * flyK, s: u.lerp(1, 12.5 / 13, flyK), o: 1 - u.p(t, FLY, .24, ease.inQuad) });
			} else {
				u.tf(S.typed, { o: 1 });
			}
			show(S.caret, t >= FOCUS && t < FLY, 'inline-block');
			// Send circle: hover, press on 3.0 (riser start), spring back. Then running buttons.
			let ss = 1 + .06 * u.p(t, HOVER, HOVER_DUR, ease.inOutSine);
			if (t >= PRESS - PRESS_DIP) { ss = u.lerp(1.06, .92, u.p(t, PRESS - PRESS_DIP, PRESS_DIP, ease.inQuad)); }
			if (t >= PRESS) { ss = u.lerp(.92, 1, ease.spring(u.p(t, PRESS, SPRING))); }
			u.tf(S.comp.send, { s: ss });
			show(S.comp.send, t < RUNNING, 'flex');
			show(S.comp.stop, t >= RUNNING, 'flex');
			show(S.comp.queue, t >= RUNNING, 'flex');
			// The send circle swaps to the stop circle in place (as in the product); the queue
			// circle grows in from zero width so the paperclip slides over instead of jumping.
			const qk = u.p(t, RUNNING, .3, ease.outCubic);
			u.css(S.comp.queue, { width: px(22 * qk), marginLeft: px(-8 * (1 - qk)), overflow: 'hidden', opacity: String(qk) });
			// Ivory ripple from the send circle.
			const rk = u.p(t, PRESS, RIPPLE);
			const r = 40 * ease.outCubic(rk);
			show(S.ripple, rk > 0 && rk < 1);
			u.css(S.ripple, { left: px(S.sendC[0] - r), top: px(S.sendC[1] - r), width: px(2 * r), height: px(2 * r), opacity: String(.5 * (1 - rk)) });

			// ---------------------------------------------------- thread
			const camK = u.p(t, CAM_A, CAM_B - CAM_A, ease.inOutCubic);
			u.tf(S.greetWrap, { y: -(PAD - PAD0) * (1 - camK) - 20 * u.p(t, FLY, GREET_DUR, ease.outCubic), o: 1 - u.p(t, FLY, GREET_DUR, ease.inOutSine) });
			u.tf(S.bubble, { x: -S.flyD[0] * (1 - flyK), y: -S.flyD[1] * (1 - flyK), s: u.lerp(13 / 12.5, 1, flyK), o: u.p(t, FLY + .06, .3, ease.outCubic) });
			const scroll = steps(t, S.scrollEv, SCROLL);
			u.tf(S.content, { y: -scroll });
			const riseIn = (el, at) => {
				const k = u.p(t, at, LINE_DUR, ease.outCubic);
				u.tf(el, { y: LINE_RISE * (1 - k), o: k });
				return k;
			};
			riseIn(S.status, STATUS);
			S.lines.forEach((el, i) => riseIn(el, LINES[i]));
			// Status line: champagne shimmer band (2.6 s period) until 4.2, then settles to muted.
			const settle = u.p(t, SETTLE, SETTLE_DUR, ease.inOutSine);
			const band = mixHex(C.gold, '#877c72', settle);
			S.statusText.style.backgroundImage = `linear-gradient(90deg, #877c72 0%, #877c72 40%, ${band} 50%, #877c72 60%, #877c72 100%)`;
			S.statusText.style.backgroundPosition = `${(100 - (((t - STATUS + .65) / 2.6) % 1 + 1) % 1 * 100).toFixed(2)}% 0`;
			S.loader.draw(t);
			S.loader.el.style.opacity = String(1 - u.p(t, SETTLE, SETTLE_DUR));

			// ---------------------------------------------------- goal tokens
			S.ghosts.forEach((g, i) => {
				const at = GHOSTS[i], land = at + GHOST_DUR;
				const tk = S.tokens[i];
				// Ghost starts on the condition's text in the thread (following its rise and the scroll).
				const lineK = u.p(t, LINES[3 + i], LINE_DUR, ease.outCubic);
				const a = S.condAnchor[i];
				const p0 = [cm.x + a[0] * cm.z, cm.y + (a[1] + LINE_RISE * (1 - lineK) - scroll) * cm.z];
				const p2 = g.end;
				const k = u.p(t, at, GHOST_DUR, ease.outCubic);
				const q = i === 0
					? quad(p0, [2 * VIA[0] - (p0[0] + p2[0]) / 2, 2 * VIA[1] - (p0[1] + p2[1]) / 2], p2, k)
					: cubic(p0, C2A, C2B, p2, k);
				const o = t < at ? 0 : Math.min(u.p(t, at, .1), 1 - u.p(t, land, .3));
				u.tf(g.el, { x: q[0] - p2[0], y: q[1] - p2[1], s: u.lerp(cm.z * 13 / LABEL_SIZE, 1, k), o });
				// The empty token appears on landing.
				const dk = u.p(t, land, .35);
				u.tf(tk.disc, { s: u.lerp(.4, 1, ease.outBack(dk)), o: u.p(t, land, .2) });
				u.tf(tk.label, { o: u.p(t, land, .25, ease.inOutSine) });
			});

			// ---------------------------------------------------- captions
			c.cycle(S.cap1.chars, t, CAP1, CAP1_OUT);
			c.reveal(S.kicker.chars, t, CAP2);
			c.reveal(S.cap2.chars, t, CAP2);
			u.tf(S.foot.el, { o: u.p(t, FOOT, FOOT_DUR, ease.outCubic) });

			// ---------------------------------------------------- riser peak: vignette + flash
			u.tf(S.vig, { o: u.p(t, VIG, VIG_DUR, ease.inOutSine) });
			u.tf(S.flash, { o: FLASH_PEAK * ease.inQuad(u.p(t, FLASH, FLASH_DUR)) });
		},
	});
})();
