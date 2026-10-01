// 04-score-relay — global 24.0–40.0 (MAIN, cut on the 24 hit).
// The Leader writes the score (📋 FLOW) exactly as the product prints it, then on
// a concert stage synced to the real step cards the AI roles take one gold baton
// strictly one at a time: file reading (no AI) → 検索 → プランナー → コーダー, and
// the npm test command steps in before review. Ends by pushing into the command
// card for 05-review.
(() => {
	const { u, c, ease } = ORC;
	const { h, svg } = u;
	const K = ORC.k;
	const C = K.COLORS;

	// ------------------------------------------------------------ timing (scene seconds)
	const FLASH_END = .35;
	const PODIUM_ON = .2, PODIUM_OFF = 3.2;
	// Exits start early enough that c.hide (stagger .015, .35 s inCubic) has fully finished when
	// the next caption reveals in the same spot (4.9 / 9.6): leaving at the board's 4.6 / 9.4
	// double-exposed both captions for ~.3 s. Still ≥ 3 s fully on screen (rule: 2.0 / 2.75 s).
	const CAP1 = .4, CAP1_OUT = 4.4, CAP2 = 4.9, CAP2_OUT = 9.0, CAP3 = 9.6;
	const SEATS_IN = .4, SEAT_STAGGER = .06, SEAT_FADE = .4;
	const LEADER_LINE = .2, LEADER_SETTLE = 1.0;
	const FLOW_H = 1.0, PREP_LINE = 1.3, ROUND_P = 1.6, LIST = [2.0, 2.25, 2.5, 2.75];
	const GHOST = .45;
	const SCORE = 3.2, SCORE_DUR = .6;
	const PREP = 3.5, PREP_DONE = 4.5, SCAN = 3.6, SCAN_DUR = .8;
	const STEPS = [
		{ seat: 0, comet: 4.5, open: 4.5, wait: 4.75, stream: 5.15, close: 6.75, done: 7.0 },
		{ seat: 1, comet: 7.0, open: 7.0, wait: 7.25, stream: 7.65, close: 9.25, done: 9.5 },
		{ seat: 2, comet: 9.5, open: 9.5, wait: 9.75, stream: 10.0, close: 12.75, done: 13.0 },
	];
	const COMET = .5;
	const FILES_AT = [10.0, 10.5, 11.0, 11.5], FILE_FLY = .5;
	const CODE_FROM = 10.0, CODE_STEP = 1 / 3, CODE_TYPE = .3, FENCE = 12.2;
	const CMD = 13.0, CMD_ACTIVE = CMD + COMET;
	const NEXT = 13.5;
	const PUSH = 14.5, PUSH_END = 16.0;
	const RISE_TEXT = .25, RISE_CARD = .42, OPEN = .25, SCROLL = .4, SCROLL_LEAD = .3;
	// Panel chrome dissolves during the push, leaving the command card. Done by 15.5 so the thread
	// above the card is (nearly) gone before the rising panel carries it out through the top edge.
	const CHROME_OUT = 14.5, CHROME_DUR = 1.0;

	// ------------------------------------------------------------ stage geometry (1920x1080 px)
	const BATON = [530, 878];
	const SEAT_W = 150, SEAT_H = 52;
	const CAST = [
		{ label: '検索', x: 305, y: 830 },
		{ label: 'プランナー', x: 441, y: 716 },
		{ label: 'コーダー', x: 619, y: 716 },
		{ label: 'レビュー', x: 755, y: 830 },
	];
	const UNCAST = [
		{ label: 'アイデア', x: 219, y: 719 },
		{ label: 'リサーチ', x: 354, y: 587 },
		{ label: 'デザイン', x: 530, y: 540 },
		{ label: 'イメージ', x: 706, y: 587 },
		{ label: 'ライティング', x: 841, y: 719 },
	];
	const NOTE_UP = 26; // note-head centre sits this far above the pill's top edge
	const PREP_CHIP = { x: 300, y: 965, w: 230, h: 48 };
	const CMD_CHIP = { x: 760, y: 965, w: 200, h: 48 };
	const FILES = ['package.json', 'index.html', 'app.js', 'app.test.js'];
	const STACK = { x: 800, w: 190, h: 36, tops: [390, 434, 478, 522] };

	// ------------------------------------------------------------ chat panel (native px, CSS zoom)
	const PANEL = { x: 1035, y: 54, w: 425, h: 540 };
	const Z0 = 1.8, Z1 = 2.1;
	// Where the command card's top-left lands at the end of the push: 05-review's
	// column left (≈ 851) and command card top (≈ 110).
	const CMD_CARD_END = [851, 110];
	const BOTTOM_GAP = 16;

	// ------------------------------------------------------------ helpers
	const px = v => `${v}px`;
	const hex = s => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16), 1];
	const mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
	const rgba = col => `rgba(${Math.round(col[0])}, ${Math.round(col[1])}, ${Math.round(col[2])}, ${u.clamp(col[3]).toFixed(3)})`;
	const GOLD = hex(C.gold), GOLD_HI = hex(C.goldHi);
	const goldA = a => [GOLD[0], GOLD[1], GOLD[2], a];
	const COL = {
		fill: hex('#1a1716'), line: hex('#262120'), line2: hex('#3a3330'),
		muted: hex('#877c72'), side: hex('#bdb3a8'), ivory: hex('#f7f2ea'), text: hex('#ece6de'),
	};
	const frac = x => x - Math.floor(x);
	const cubic = (a, b, c2, d, k) => { const m = 1 - k; return [0, 1].map(j => m * m * m * a[j] + 3 * m * m * k * b[j] + 3 * m * k * k * c2[j] + k * k * k * d[j]); };
	const quad = (a, cp, b, k) => [(1 - k) ** 2 * a[0] + 2 * (1 - k) * k * cp[0] + k * k * b[0], (1 - k) ** 2 * a[1] + 2 * (1 - k) * k * cp[1] + k * k * b[1]];
	// Sum of eased steps: value starts at v0 and moves by (v_i − v_{i−1}) over [t_i, t_i + dur].
	const steps = (t, v0, evs, dur, fn = ease.inOutCubic) => {
		let v = v0, prev = v0;
		for (const e of evs) { v += (e.v - prev) * u.p(t, e.t, dur, fn); prev = e.v; }
		return v;
	};
	const checkSvg = (size, color, width = 2.6) => {
		const el = svg('svg', { viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: color, 'stroke-width': width, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', style: { display: 'block', flex: 'none' } });
		el.appendChild(svg('path', { d: 'M20 6 9 17l-5-5' }));
		return el;
	};

	// Demo coder output (storyboard ui_mock) as [class, text] tokens.
	const CODE = [
		[['kw', 'export'], ' ', ['kw', 'function'], ' ', ['fn', 'addTodo'], '(list, text) {'],
		['  ', ['kw', 'return'], ' [...list, { text, done: ', ['kw', 'false'], ' }];'],
		['}'],
		[['kw', 'export'], ' ', ['kw', 'function'], ' ', ['fn', 'removeDone'], '(list) {'],
		['  ', ['kw', 'return'], ' list.', ['fn', 'filter'], '(t => !t.done);'],
		['}'],
	];
	const CODE_COLORS = { kw: '#d0808a', fn: '#e6d3a8', str: '#cbb27a', cm: '#6f665f' };

	ORC.register({
		id: '04-score-relay',
		duration: 16,
		transition: 'cut',

		build(root) {
			const S = {};
			const backdrop = c.backdrop({ tint: 'gold' });
			root.appendChild(backdrop.el);
			S.backdrop = backdrop;

			// ======================================================== STAGE
			const stage = h('div', { class: 'fill' });
			root.appendChild(stage);
			S.stage = stage;
			stage.appendChild(h('div', { class: 'abs', style: { left: px(530 - 350), top: px(640 - 450), width: '700px', height: '900px', borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(198,167,105,.08) 0%, rgba(198,167,105,.05) 45%, rgba(198,167,105,0) 100%)' } }));

			// Ripple rings (under the pills).
			const ripples = CAST.map(() => [0, 1].map(() => {
				const r = h('div', { class: 'abs', style: { border: '1px solid #c6a769', boxSizing: 'border-box' } });
				stage.appendChild(r);
				return r;
			}));
			S.ripples = ripples;

			// The comet travels under the pills so it disappears into the seat it reaches.
			const comet = c.comet();
			stage.appendChild(comet.el);
			S.comet = comet;

			// Seats.
			const makeSeat = ({ label, x, y }, cast) => {
				const lab = h('span', { text: label, style: { whiteSpace: 'nowrap' } });
				const tick = h('span', { style: { display: 'inline-flex', justifyContent: 'flex-end', overflow: 'hidden', width: '0px', flex: 'none' } }, checkSvg(16, C.gold));
				const pill = h('div', {
					class: 'abs',
					style: { left: px(x - SEAT_W / 2), top: px(y - SEAT_H / 2), width: px(SEAT_W), height: px(SEAT_H), borderRadius: '10px', boxSizing: 'border-box', border: '1px solid #262120', background: '#1a1716', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '700 24px/1 var(--jp)', fontFeatureSettings: '"palt"', color: '#877c72' },
				}, lab, tick);
				stage.appendChild(pill);
				return { pill, lab, tick, x, y, cast };
			};
			const uncast = UNCAST.map(s => makeSeat(s, false));
			const cast = CAST.map(s => makeSeat(s, true));
			S.uncast = uncast;
			S.cast = cast;
			S.seatOrder = [...uncast, ...cast];

			// Score line through the note-heads (drawn 3.2–3.8), under the note-heads.
			const N = CAST.map(s => [s.x, s.y - SEAT_H / 2 - NOTE_UP]);
			const scoreD = `M${N[0][0]},${N[0][1]} C${N[0][0]},${N[0][1] - 78} ${N[1][0] - 61},${N[1][1]} ${N[1][0]},${N[1][1]} L${N[2][0]},${N[2][1]} C${N[2][0] + 61},${N[2][1]} ${N[3][0]},${N[3][1] - 78} ${N[3][0]},${N[3][1]}`;
			const scoreSvg = svg('svg', { width: 1920, height: 1080, viewBox: '0 0 1920 1080', style: { position: 'absolute', left: '0', top: '0', overflow: 'visible' } });
			const maskId = 'sr04-score-mask';
			const revealPath = svg('path', { d: scoreD, fill: 'none', stroke: '#fff', 'stroke-width': 10, pathLength: 1, 'stroke-linecap': 'butt' });
			scoreSvg.appendChild(svg('defs', {}, svg('mask', { id: maskId, maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: 1920, height: 1080 }, revealPath)));
			const scorePath = svg('path', { d: scoreD, fill: 'none', stroke: 'rgba(198,167,105,.5)', 'stroke-width': 1.5, 'stroke-dasharray': '6 6', mask: `url(#${maskId})` });
			scoreSvg.appendChild(scorePath);
			stage.appendChild(scoreSvg);
			S.revealPath = revealPath;
			S.scoreSvg = scoreSvg;

			// Note-heads (ready state), numbered 1–4.
			S.notes = CAST.map((s, i) => {
				const el = h('div', { class: 'abs', style: { left: px(s.x - 13), top: px(N[i][1] - 13), width: '26px', height: '26px', borderRadius: '50%', background: C.gold, color: C.ink, display: 'flex', alignItems: 'center', justifyContent: 'center', font: '700 16px/1 var(--en)', boxShadow: '0 0 12px rgba(198,167,105,.35)' }, text: String(i + 1) });
				stage.appendChild(el);
				return el;
			});

			// Podium + baton.
			const podium = h('div', { class: 'abs', style: { left: px(530 - 85), top: px(960 - 30), width: '170px', height: '60px', borderRadius: '12px', boxSizing: 'border-box', border: `2px solid ${C.gold}`, background: '#1a1716', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '700 26px/1 var(--jp)', color: C.ivory }, text: 'リーダー' });
			stage.appendChild(podium);
			S.podium = podium;
			const baton = c.mark({ width: 150, variant: 'small' });
			const batonH = 150 * baton.geom.H / baton.geom.W;
			const batonBox = h('div', { class: 'abs', style: { left: px(BATON[0] - 75), top: px(BATON[1] - batonH / 2), width: '150px', height: px(batonH) } }, baton.el);
			stage.appendChild(batonBox);
			S.baton = baton;

			// Floor chips (non-AI steps).
			const prepIcon = h('span', { style: { position: 'relative', display: 'inline-block', width: '1.1em', height: '1em', marginRight: '.3em', flex: 'none' } },
				h('span', { class: 'abs', style: { left: '0', top: '0', lineHeight: '1' }, text: '📂' }),
				h('span', { class: 'abs', style: { left: '0', top: '0', width: '1.1em', height: '1em', display: 'flex', alignItems: 'center', justifyContent: 'center' } }, checkSvg(20, '#ece6de', 2.6)));
			const prepFolder = prepIcon.children[0], prepTick = prepIcon.children[1];
			const prepScan = h('div', { class: 'abs', style: { left: '0', top: '0', bottom: '0', width: '45%', background: 'linear-gradient(90deg, rgba(236,230,222,0), rgba(236,230,222,.25), rgba(236,230,222,0))' } });
			const prepChip = h('div', {
				class: 'abs',
				style: { left: px(PREP_CHIP.x - PREP_CHIP.w / 2), top: px(PREP_CHIP.y - PREP_CHIP.h / 2), width: px(PREP_CHIP.w), height: px(PREP_CHIP.h), borderRadius: '10px', boxSizing: 'border-box', border: '1.5px dashed #877c72', background: 'rgba(19,17,16,.85)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '500 22px/1 var(--jp)', fontFeatureSettings: '"palt"', color: '#bdb3a8' },
			}, prepScan, prepIcon, h('span', { text: 'ファイル読み込み', style: { position: 'relative' } }));
			stage.appendChild(prepChip);
			S.prep = { chip: prepChip, folder: prepFolder, tick: prepTick, scan: prepScan };

			const dots = [0, 1, 2].map(() => h('i', { style: { width: '6px', height: '6px', borderRadius: '50%', background: '#ece6de', display: 'block' } }));
			const dotsBox = h('span', { style: { display: 'inline-flex', gap: '5px', overflow: 'hidden', width: '0px', justifyContent: 'flex-end', alignItems: 'center', flex: 'none' } }, ...dots);
			const cmdChip = h('div', {
				class: 'abs',
				style: { left: px(CMD_CHIP.x - CMD_CHIP.w / 2), top: px(CMD_CHIP.y - CMD_CHIP.h / 2), width: px(CMD_CHIP.w), height: px(CMD_CHIP.h), borderRadius: '10px', boxSizing: 'border-box', border: '1px solid #3a3330', background: '#1a1716', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '600 22px/1 var(--mono)', color: '#ece6de' },
			}, h('span', { text: '$ npm test', style: { whiteSpace: 'pre' } }), dotsBox);
			stage.appendChild(cmdChip);
			S.cmdChip = { chip: cmdChip, dots, dotsBox };

			// File chips ejected by the coder.
			S.files = FILES.map(name => {
				const el = h('div', { class: 'abs', style: { left: '0', top: '0', width: px(STACK.w), height: px(STACK.h), borderRadius: '6px', boxSizing: 'border-box', border: '1px solid rgba(198,167,105,.6)', background: '#1a1716', display: 'flex', alignItems: 'center', padding: '0 14px', font: '400 20px/1 var(--mono)', color: '#ece6de', whiteSpace: 'pre' }, text: name });
				stage.appendChild(el);
				return el;
			});

			// ======================================================== CHAT PANEL
			const panelWrap = h('div', { class: 'abs', style: { left: '0', top: '0', transformOrigin: '0 0' } });
			const zb = c.zoomBox(Z0, { left: '0', top: '0' });
			const panel = h('div', { style: { position: 'absolute', left: '0', top: '0', width: px(PANEL.w), height: px(PANEL.h), boxSizing: 'border-box', background: '#131110', border: '1px solid #3a3330', borderRadius: '10px', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 22px 66px rgba(0,0,0,.6)' } });
			zb.appendChild(panel);
			panelWrap.appendChild(zb);
			root.appendChild(panelWrap);
			S.panelWrap = panelWrap;

			const viewtitle = h('div', { class: 'o-viewtitle' }, h('span', { text: 'CHAT' }), h('div', { class: 'o-tb-icons' }, c.icon('plus', 14), c.icon('history', 14), c.icon('listChecks', 14), c.icon('gear', 14)));
			const viewport = h('div', { style: { flex: '1', position: 'relative', overflow: 'hidden', maskImage: 'linear-gradient(to bottom, transparent 0, #000 60px)', WebkitMaskImage: 'linear-gradient(to bottom, transparent 0, #000 60px)' } });
			const content = h('div', { style: { position: 'absolute', left: '0', right: '0', top: '0', padding: '12px 16px', display: 'flex', flexDirection: 'column' } });
			viewport.appendChild(content);
			const composer = c.composer({ chips: [
				{ icon: 'sliders', text: 'モデルなどの設定' },
				{ icon: 'coins', text: 'コスト調整: オフ', caret: true },
				{ icon: 'repeat', text: 'ループ: 自動' },
			] });
			composer.setText('', false, 'running');
			const foot = h('div', { style: { padding: '0 16px 14px', flex: 'none' } }, composer.el);
			panel.append(viewtitle, viewport, foot);
			S.content = content;
			S.chrome = { panel, viewtitle, foot };

			// ---- thread content. Earlier lines from 03 sit above (scrolled under the fade).
			const md = (html, style = {}) => h('div', { class: 'o-md', html, style });
			const bubble = c.bubble(K.REQUEST);
			bubble.style.marginTop = '0';
			const status03 = md('🎯 <b style="color:inherit">Leader</b> が目標を設定しています...', { marginTop: '12px', color: '#877c72' });
			const goal03 = h('div', { class: 'o-md', style: { marginTop: '8px' } },
				h('div', { text: '🎯 目標', style: { fontSize: '16px', fontWeight: '700', color: '#f7f2ea', lineHeight: '1.4' } }),
				h('div', { html: `<b>${K.GOAL}</b>`, style: { marginTop: '2px' } }),
				h('div', { text: '達成条件:', style: { marginTop: '2px' } }),
				h('div', { text: `1. ${K.COND1}` }),
				h('div', { text: `2. ${K.COND2}` }),
				// At this 425px pane the quote wraps; break it after 「、」 instead of orphaning 「す。」.
				h('blockquote', { html: '🔁 Reviewer が達成と判定するまで、<br>最大 5 ラウンド繰り返します。', style: { borderLeft: '3px solid #3a3330', color: '#bdb3a8' } }));

			// Leader status line with a champagne shimmer band and a small loader.
			const leaderText = h('span', { html: '<b style="color:inherit">Leader AI</b> がタスクを分析中...', style: { WebkitBackgroundClip: 'text', backgroundClip: 'text', backgroundSize: '300% 100%' } });
			const leaderLoader = c.mark({ width: 29, variant: 'small', glow: false });
			leaderLoader.el.style.flex = 'none';
			const leaderLine = h('div', { class: 'o-md', style: { marginTop: '14px', display: 'flex', alignItems: 'center', gap: '8px' } }, leaderText, leaderLoader.el);
			const flowH = h('div', { class: 'o-md', text: '📋 FLOW', style: { marginTop: '10px', fontSize: '16px', fontWeight: '700', color: '#f7f2ea', lineHeight: '1.4' } });
			const prepLine = md('📂 <b>準備:</b> 作業フォルダのファイルを読み込み、各 AI に渡します（AI は使いません）', { marginTop: '6px' });
			const roundP = md('ラウンド 1: Leader が以下の 4 ステップのフローを作成しました。以降、各ロールの AI はこの順番通りに実行されます。', { marginTop: '6px' });
			const listText = K.TASKS.map(tk => `${tk.n}. ${tk.role} — ${tk.title}`);
			const listLines = K.TASKS.map((tk, i) => md(`${tk.n}. <b>${tk.role}</b> — ${tk.title}`, { marginTop: i ? '1px' : '4px', whiteSpace: 'nowrap' }));

			// Step cards.
			const prepCard = c.card({ title: K.PREP.title, role: K.PREP.badge });
			prepCard.el.style.marginTop = '12px';
			const barsBody = () => {
				const ph = h('div', { text: '(出力待機中…)', style: { position: 'absolute', left: '0', top: '0', fontStyle: 'italic', color: '#877c72', lineHeight: '1.5' } });
				const bars = [92, 80, 66, 40].map(w => h('div', { style: { height: '8px', borderRadius: '4px', background: '#24201e', width: '0%', maxWidth: `${w}%` } }));
				const inner = h('div', { style: { position: 'relative', height: '50px', display: 'flex', flexDirection: 'column', gap: '6px', paddingTop: '3px' } }, ph, ...bars);
				return { inner, ph, bars, widths: [92, 80, 66, 40] };
			};
			const stepCards = STEPS.map((st, i) => {
				const tk = K.TASKS[i];
				const card = c.card({ n: tk.n, title: tk.title, role: tk.badge });
				card.el.style.marginTop = '6px';
				return card;
			});
			const b1 = barsBody(), b2 = barsBody();
			stepCards[0].body.innerHTML = '';
			stepCards[0].body.appendChild(b1.inner);
			stepCards[1].body.innerHTML = '';
			stepCards[1].body.appendChild(b2.inner);

			// Coder card body: placeholder, then streamed code, then a bash fence.
			const ph3 = h('div', { text: '(出力待機中…)', style: { fontStyle: 'italic', color: '#877c72', lineHeight: '1.5' } });
			const codeLines = CODE.map(tokens => {
				const line = h('div', { style: { whiteSpace: 'pre', height: '17px', lineHeight: '17px' } });
				let len = 0;
				for (const tok of tokens) {
					const [cls, text] = typeof tok === 'string' ? [null, tok] : tok;
					line.appendChild(h('span', { text, style: cls ? { color: CODE_COLORS[cls] } : {} }));
					len += text.length;
				}
				return { line, len };
			});
			const codeBlock = h('div', { style: { background: '#0e0c0b', borderRadius: '4px', padding: '5px 8px', font: '400 11px/17px var(--mono)', fontVariantLigatures: 'none', color: '#c9c0b5' } }, ...codeLines.map(l => l.line));
			const fence = h('div', { style: { marginTop: '6px', background: '#0e0c0b', borderRadius: '4px', overflow: 'hidden' } },
				h('div', { text: 'bash', style: { padding: '3px 8px 2px', font: '400 10px/14px var(--mono)', color: '#877c72', borderBottom: '1px solid #1f1b19' } }),
				h('div', { text: 'npm test', style: { padding: '4px 8px 5px', font: '400 11px/17px var(--mono)', color: '#ece6de' } }));
			stepCards[2].body.innerHTML = '';
			stepCards[2].body.append(ph3, codeBlock, fence);

			const hr = h('div', { style: { height: '1px', background: '#262120', margin: '10px 0' } });
			const cmdCard = c.card({ title: K.CMD.title, role: K.CMD.badge, body: '<b style="font-family:var(--mono);font-weight:600;color:#f7f2ea">$ npm test</b>' });

			content.append(bubble, status03, goal03, leaderLine, flowH, prepLine, roundP, ...listLines, prepCard.el, ...stepCards.map(cd => cd.el), hr, cmdCard.el);
			S.thread = { prior: [bubble, status03, goal03], leaderLine, leaderText, leaderLoader, flowH, prepLine, roundP, listLines, prepCard, stepCards, bars: [b1, b2], ph3, codeLines, codeBlock, fence, hr, cmdCard };

			// ---- measure the thread (native px) once, then derive the scroll keyframes.
			const zf = panel.getBoundingClientRect().width / PANEL.w;
			const cTop = () => content.getBoundingClientRect().top;
			const relTop = el => (el.getBoundingClientRect().top - cTop()) / zf;
			const relBottom = el => (el.getBoundingClientRect().bottom - cTop()) / zf;
			const panelRect = panel.getBoundingClientRect();
			const vpRect = viewport.getBoundingClientRect();
			const viewH = vpRect.height / zf;
			// Content origin relative to the panel's border-box (native px).
			const contentOrigin = [(content.getBoundingClientRect().left - panelRect.left) / zf, (content.getBoundingClientRect().top - panelRect.top) / zf];

			// Card body heights in each content state.
			const setBody = (card, show) => { card.body.style.display = show ? 'block' : 'none'; card.body.style.maxHeight = 'none'; };
			const allCards = [prepCard, ...stepCards, cmdCard];
			allCards.forEach(cd => setBody(cd, false));
			const bodyH = card => card.body.getBoundingClientRect().height / zf;
			setBody(stepCards[0], true);
			const H_BARS = bodyH(stepCards[0]);
			setBody(stepCards[0], false);
			setBody(stepCards[2], true);
			codeBlock.style.display = 'none';
			fence.style.display = 'none';
			const H3 = [bodyH(stepCards[2])]; // placeholder only
			ph3.style.display = 'none';
			codeBlock.style.display = 'block';
			for (let n = 1; n <= CODE.length; n++) {
				codeLines.forEach((l, i) => { l.line.style.display = i < n ? 'block' : 'none'; });
				H3.push(bodyH(stepCards[2]));
			}
			fence.style.display = 'block';
			H3.push(bodyH(stepCards[2]));
			setBody(stepCards[2], false);
			setBody(cmdCard, true);
			const H_CMD = bodyH(cmdCard);
			setBody(cmdCard, false);
			ph3.style.display = 'block';
			codeBlock.style.display = 'none';
			fence.style.display = 'none';
			codeLines.forEach(l => { l.line.style.display = 'block'; });

			// Collapsed geometry (all bodies closed).
			const geo = el => ({ top: relTop(el), bottom: relBottom(el) });
			const g = {
				goal03: geo(goal03), leader: geo(leaderLine), flowH: geo(flowH), prepLine: geo(prepLine), roundP: geo(roundP),
				list: listLines.map(geo), prepCard: geo(prepCard.el), cards: stepCards.map(cd => geo(cd.el)), cmdCard: geo(cmdCard.el),
			};
			S.listGeo = listLines.map(el => ({ left: (el.getBoundingClientRect().left - content.getBoundingClientRect().left) / zf, top: relTop(el), h: (el.getBoundingClientRect().height) / zf }));

			// Scroll events: the newest content's bottom stays ≥ 16 native px above the composer.
			// While content grows the target never decreases; see the settle event below.
			const target = bottom => Math.max(0, bottom + BOTTOM_GAP - viewH);
			const raw = [
				[LEADER_LINE, g.leader.bottom], [FLOW_H, g.flowH.bottom], [PREP_LINE, g.prepLine.bottom], [ROUND_P, g.roundP.bottom],
				...LIST.map((tt, i) => [tt, g.list[i].bottom]),
				[PREP, g.prepCard.bottom],
				[STEPS[0].open, g.cards[0].bottom + H_BARS],
				[STEPS[1].open, g.cards[1].bottom + H_BARS],
				[STEPS[2].open, g.cards[2].bottom + H3[0]],
				...CODE.map((_, i) => [CODE_FROM + i * CODE_STEP, g.cards[2].bottom + H3[i + 1]]),
				[FENCE, g.cards[2].bottom + H3[CODE.length + 1]],
			];
			const s0 = target(g.goal03.bottom);
			let cur = s0;
			S.scroll0 = s0;
			S.scrollEv = raw.map(([tt, b]) => { cur = Math.max(cur, target(b)); return { t: tt - SCROLL_LEAD, v: cur }; });
			// When card #3 collapses the thread gets shorter. Like the product's stick-to-bottom chat,
			// the content settles back down as it collapses (one .4 s move from 12.75), so the command
			// card arrives 16 px above the composer instead of leaving ~110 native px of dead space.
			S.scrollEv.push({ t: STEPS[2].close, v: target(g.cmdCard.bottom + H_CMD) });
			S.H = { BARS: H_BARS, C3: H3, CMD: H_CMD };
			S.contentOrigin = contentOrigin;
			// Command card position inside the panel once the thread has settled (for the push).
			const finalScroll = S.scrollEv[S.scrollEv.length - 1].v;
			S.cmdCardNative = [contentOrigin[0] + (cmdCard.el.getBoundingClientRect().left - content.getBoundingClientRect().left) / zf, contentOrigin[1] + g.cmdCard.top - finalScroll];
			S.listText = listText;

			// ======================================================== GHOSTS (above the panel)
			const ghostLayer = h('div', { class: 'fill', style: { pointerEvents: 'none' } });
			root.appendChild(ghostLayer);
			S.ghosts = listText.map(txt => {
				const el = h('div', { class: 'abs nowrap', text: txt, style: { left: '0', top: '0', font: '500 22px/1 var(--jp)', color: C.goldHi, textShadow: '0 0 6px rgba(227,207,159,.9), 0 0 16px rgba(198,167,105,.9), 0 0 34px rgba(198,167,105,.6)', transformOrigin: '50% 50%' } });
				ghostLayer.appendChild(el);
				return el;
			});
			S.ghostW = S.ghosts.map(el => el.getBoundingClientRect().width);
			S.ghostH = S.ghosts.map(el => el.getBoundingClientRect().height);

			// ======================================================== CAPTIONS
			const capLayer = h('div', { class: 'fill' });
			root.appendChild(capLayer);
			const kicker = c.textAt('LEADER', { x: 120, baseline: 150, size: 20, weight: 600, family: 'var(--en)', color: C.gold, letterSpacing: '.32em', shadow: false, parent: capLayer });
			const cap1 = c.captionLines(['指揮者が、', '楽譜を書く。'], { gold: ['楽譜'] });
			const cap2 = c.captionLines(['専門の AI が、', '順番に奏でる。'], { gold: ['順番'] });
			const cap3 = c.captionLines(['書いたら、', 'テストも走らせる。'], { gold: ['テスト'] });
			for (const cp of [cap1, cap2, cap3]) { capLayer.append(...cp.els); }
			S.kicker = kicker;
			S.caps = [cap1, cap2, cap3];

			// ======================================================== FLASH (carried over from 03)
			S.flash = h('div', { class: 'fill', style: { background: '#fff4e6' } });
			root.appendChild(S.flash);
			// base.css gives every .ch span will-change, so Chromium caches each glyph's raster from the
			// sub-pixel offset it was first drawn at and a frame's anti-aliasing depended on draw order
			// (thousands of caption pixels differed between forward / reverse renders). Without it every
			// frame rasterizes from scratch, so a frame is a pure function of t (same fix as 05-review).
			for (const ch of root.querySelectorAll('.ch')) { ch.style.willChange = 'auto'; }
			return S;
		},

		draw(t, S) {
			S.backdrop.draw(t);

			// ---------------------------------------------------- panel camera
			const pk = u.p(t, PUSH, PUSH_END - PUSH, ease.inOutCubic);
			const z = u.lerp(Z0, Z1, pk);
			const endX = CMD_CARD_END[0] - S.cmdCardNative[0] * Z1, endY = CMD_CARD_END[1] - S.cmdCardNative[1] * Z1;
			const PX = u.lerp(PANEL.x, endX, pk), PY = u.lerp(PANEL.y, endY, pk);
			S.panelWrap.style.transform = `translate(${PX.toFixed(2)}px, ${PY.toFixed(2)}px) scale(${(z / Z0).toFixed(5)})`;

			// Everything but the command card dissolves during the push (05 has no panel chrome).
			const chrome = 1 - u.p(t, CHROME_OUT, CHROME_DUR, ease.inOutCubic);
			S.chrome.panel.style.background = `rgba(19, 17, 16, ${chrome.toFixed(3)})`;
			S.chrome.panel.style.borderColor = `rgba(58, 51, 48, ${chrome.toFixed(3)})`;
			S.chrome.panel.style.boxShadow = `0 22px 66px rgba(0, 0, 0, ${(.6 * chrome).toFixed(3)})`;
			u.tf(S.chrome.viewtitle, { o: chrome });
			u.tf(S.chrome.foot, { o: chrome });

			// ---------------------------------------------------- thread
			const scroll = stepsScroll(t, S);
			S.content.style.transform = `translateY(${(-scroll).toFixed(2)}px)`;
			const T = S.thread;
			const riseText = (el, at) => { const k = u.p(t, at, RISE_TEXT, ease.outCubic); u.tf(el, { y: (1 - k) * 10, o: k * chrome }); return k; };
			const riseCard = (el, at, fade = chrome) => { const k = u.p(t, at, RISE_CARD, ease.outCubic); u.tf(el, { y: (1 - k) * 10, o: k * fade }); return k; };
			for (const el of T.prior) { u.tf(el, { o: chrome }); }

			// Leader status: shimmer band 0.2–1.0, then settles to muted.
			riseText(T.leaderLine, LEADER_LINE);
			const band = 1 - u.p(t, LEADER_SETTLE - .15, .25, ease.inOutSine);
			const bandCol = rgba(mix(COL.muted, GOLD_HI, band));
			T.leaderText.style.color = 'transparent';
			T.leaderText.style.backgroundImage = `linear-gradient(90deg, #877c72 0%, #877c72 41%, ${bandCol} 47%, ${bandCol} 53%, #877c72 59%, #877c72 100%)`;
			// Band crosses the middle of the line during the shimmer window (2.6 s period).
			const ph = .5 + (t - .6) / 2.6;
			T.leaderText.style.backgroundPosition = `${(100 - frac(ph) * 100).toFixed(2)}% 0`;
			const loaderK = 1 - u.p(t, LEADER_SETTLE - .1, .25);
			T.leaderLoader.el.style.opacity = String(loaderK);
			T.leaderLoader.el.style.visibility = loaderK > .001 ? 'visible' : 'hidden';
			T.leaderLoader.draw(t);

			riseText(T.flowH, FLOW_H);
			riseText(T.prepLine, PREP_LINE);
			riseText(T.roundP, ROUND_P);
			T.listLines.forEach((el, i) => riseText(el, LIST[i]));

			// PREP card: runs closed 3.5–4.5.
			riseCard(T.prepCard.el, PREP);
			T.prepCard.draw(t, t < PREP_DONE ? 'running' : 'done', 0);

			// Step cards #1–#3.
			STEPS.forEach((st, i) => {
				const card = T.stepCards[i];
				riseCard(card.el, st.open);
				const openK = u.p(t, st.open, OPEN, ease.outCubic) * (1 - u.p(t, st.close, OPEN, ease.inOutCubic));
				const running = t < st.close;
				card.draw(t, running ? 'running' : 'done', openK);
				// The loader leaves the header when the card is done; slide '#N' over instead of letting it jump.
				const num = card.head.querySelector('.o-num');
				num.style.marginRight = running ? '0px' : `${((1 - u.p(t, st.close, OPEN, ease.inOutCubic)) * 35).toFixed(2)}px`;
				let bodyH;
				if (i < 2) {
					bodyH = S.H.BARS;
					const B = T.bars[i];
					const phK = u.p(t, st.wait, .15) * (1 - u.p(t, st.stream, .15));
					B.ph.style.opacity = String(phK);
					B.ph.style.visibility = phK > .001 ? 'visible' : 'hidden';
					B.bars.forEach((bar, j) => {
						const k = u.p(t, st.stream + j * .2, .8, ease.inOutSine);
						bar.style.width = `${(k * B.widths[j]).toFixed(2)}%`;
						bar.style.opacity = k > 0 ? '1' : '0';
					});
				} else {
					// Coder: placeholder → streamed code lines → bash fence; the body grows with them.
					const H3 = S.H.C3;
					const evs = CODE.map((_, j) => ({ t: CODE_FROM + j * CODE_STEP, v: H3[j + 1] }));
					evs.push({ t: FENCE, v: H3[CODE.length + 1] });
					bodyH = steps(t, H3[0], evs, .2, ease.outCubic);
					const phK = u.p(t, st.wait, .15);
					T.ph3.style.display = t < CODE_FROM ? 'block' : 'none';
					T.ph3.style.opacity = String(phK);
					T.codeBlock.style.display = t >= CODE_FROM ? 'block' : 'none';
					T.codeLines.forEach((l, j) => {
						const at = CODE_FROM + j * CODE_STEP;
						l.line.style.display = t >= at ? 'block' : 'none';
						const n = t < at ? 0 : Math.min(l.len, 1 + Math.floor(u.p(t, at, CODE_TYPE) * l.len));
						l.line.style.clipPath = n >= l.len ? 'none' : `inset(0 calc(100% - ${n}ch) 0 0)`;
					});
					T.fence.style.display = t >= FENCE ? 'block' : 'none';
					T.fence.style.opacity = String(u.p(t, FENCE, .25, ease.outCubic));
				}
				card.body.style.maxHeight = `${(openK * bodyH).toFixed(2)}px`;
			});

			// Separator + command card (running, open) from 13.0.
			const hrK = u.p(t, CMD, RISE_CARD, ease.outCubic);
			T.hr.style.opacity = String(hrK * chrome);
			riseCard(T.cmdCard.el, CMD, 1);
			T.cmdCard.draw(t, 'running', t >= CMD ? 1 : 0);
			T.cmdCard.body.style.maxHeight = `${S.H.CMD}px`;

			// ---------------------------------------------------- stage
			const dim = 1 - .75 * u.p(t, PUSH, PUSH_END - PUSH, ease.inOutCubic);
			S.stage.style.opacity = String(dim);
			S.baton.draw(t);

			// Podium: active (gold glow) 0.2–3.2.
			const podK = u.env(t, PODIUM_ON, .3, PODIUM_OFF, .4);
			S.podium.style.boxShadow = `0 0 ${(32 * podK).toFixed(1)}px rgba(198,167,105,${(.45 * podK).toFixed(3)})`;
			S.podium.style.background = rgba(mix(COL.fill, GOLD, .12 * podK));

			// Seats fade in: outer row left→right, then the inner row.
			S.seatOrder.forEach((seat, i) => {
				const k = u.p(t, SEATS_IN + i * SEAT_STAGGER, SEAT_FADE, ease.outCubic);
				seat.inK = k;
				seat.pill.style.transform = `translateY(${((1 - k) * 14).toFixed(2)}px)`;
			});
			for (const seat of S.uncast) {
				const o = .55 * seat.inK;
				seat.pill.style.opacity = String(o);
				seat.pill.style.visibility = o > .001 ? 'visible' : 'hidden';
			}

			// Cast seats: idle → ready → active → done.
			const ready = CAST.map((_, i) => LIST[i] + GHOST);
			const activeAt = [null, null, null, null], doneAt = [null, null, null, null];
			STEPS.forEach(st => { activeAt[st.seat] = st.comet + COMET; doneAt[st.seat] = st.done; });
			S.cast.forEach((seat, i) => {
				const r = u.p(t, ready[i], .25, ease.outCubic);
				const a = activeAt[i] === null ? 0 : u.p(t, activeAt[i], .25, ease.outCubic) * (1 - u.p(t, doneAt[i], .3, ease.inOutCubic));
				const d = doneAt[i] === null ? 0 : u.p(t, doneAt[i], .3, ease.inOutCubic);
				let border = mix(COL.line, goldA(.4), r);
				border = mix(border, goldA(1), a);
				border = mix(border, goldA(.55), d);
				let text = mix(COL.muted, COL.side, r);
				text = mix(text, COL.ivory, a);
				text = mix(text, COL.side, d);
				seat.pill.style.borderColor = rgba(border);
				seat.pill.style.color = rgba(text);
				seat.pill.style.background = rgba(mix(COL.fill, GOLD, .12 * a));
				seat.pill.style.boxShadow = a > .001 ? `inset 0 0 0 ${a.toFixed(3)}px ${C.gold}, 0 0 32px rgba(198,167,105,${(.45 * a).toFixed(3)})` : 'none';
				seat.tick.style.width = `${(22 * d).toFixed(2)}px`;
				seat.tick.style.opacity = String(d);
				// 'Next' pulse on the reviewer while the command runs.
				let base = u.lerp(.85, 1, r);
				if (i === 3) {
					const pulse = .65 + .15 * Math.cos(2 * Math.PI * (t - NEXT));
					base = u.lerp(base, pulse, u.p(t, NEXT, .3, ease.inOutSine));
				}
				const o = base * seat.inK;
				seat.pill.style.opacity = String(o);
				seat.pill.style.visibility = o > .001 ? 'visible' : 'hidden';
				// Note-head pops in on landing and stays.
				const nk = u.p(t, ready[i], .35, ease.outBack);
				const nOp = u.p(t, ready[i], .15);
				u.tf(S.notes[i], { s: u.lerp(.4, 1, nk), o: nOp * (i === 3 ? u.lerp(1, .8, u.p(t, NEXT, .3)) : 1) });
				// Ripples while active.
				S.ripples[i].forEach((ring, j) => {
					const start = activeAt[i] === null ? Infinity : activeAt[i] + j * .5;
					const on = t >= start && a > .001;
					const k = on ? frac((t - start) / 1.0) : 0;
					const rr = 60 * ease.outQuad(k);
					ring.style.visibility = on ? 'visible' : 'hidden';
					ring.style.opacity = on ? String((.5 * (1 - k) * a).toFixed(3)) : '0';
					ring.style.left = px(seat.x - SEAT_W / 2 - rr);
					ring.style.top = px(seat.y - SEAT_H / 2 - rr);
					ring.style.width = px(SEAT_W + 2 * rr);
					ring.style.height = px(SEAT_H + 2 * rr);
					ring.style.borderRadius = px(10 + rr);
				});
			});

			// Score line 3.2–3.8.
			const sk = u.p(t, SCORE, SCORE_DUR, ease.inOutCubic);
			S.revealPath.setAttribute('stroke-dasharray', `${sk.toFixed(4)} 1`);
			S.scoreSvg.style.visibility = sk > 0 ? 'visible' : 'hidden';

			// Comet: one handoff at a time.
			const hand = [
				{ at: STEPS[0].comet, from: BATON, to: [CAST[0].x, CAST[0].y], lift: 160 },
				{ at: STEPS[1].comet, from: [CAST[0].x, CAST[0].y], to: [CAST[1].x, CAST[1].y], lift: 160 },
				{ at: STEPS[2].comet, from: [CAST[1].x, CAST[1].y], to: [CAST[2].x, CAST[2].y], lift: 160 },
				// To the floor: bows below the line so it passes left of the レビュー seat.
				{ at: CMD, from: [CAST[2].x, CAST[2].y], to: [CMD_CHIP.x, CMD_CHIP.y], lift: -160 },
			];
			const hd = hand.find(hh => t > hh.at && t < hh.at + COMET);
			if (hd) { S.comet.draw(ease.inOutCubic(u.p(t, hd.at, COMET)), hd.from, hd.to, hd.lift); } else { S.comet.draw(0, [0, 0], [0, 0]); }

			// PREP chip: fades in with the 📂 準備 line, glows ivory 3.5–4.5, ✓ at 4.5.
			{
				const P = S.prep;
				const inK = u.p(t, PREP_LINE, .4, ease.outCubic);
				const act = u.p(t, PREP, .25, ease.outCubic) * (1 - u.p(t, PREP_DONE, .3, ease.inOutCubic));
				const dn = u.p(t, PREP_DONE, .3, ease.outCubic);
				u.tf(P.chip, { y: (1 - inK) * 12, o: inK });
				P.chip.style.borderColor = rgba(mix(mix(COL.muted, COL.text, act), mix(COL.muted, COL.side, .6), dn));
				P.chip.style.color = rgba(mix(mix(COL.side, COL.text, act), COL.side, dn));
				P.chip.style.boxShadow = act > .001 ? `0 0 ${(26 * act).toFixed(1)}px rgba(236,230,222,${(.22 * act).toFixed(3)})` : 'none';
				const sc = u.p(t, SCAN, SCAN_DUR, ease.inOutSine);
				const scanOn = t > SCAN && t < SCAN + SCAN_DUR;
				P.scan.style.visibility = scanOn ? 'visible' : 'hidden';
				P.scan.style.transform = `translateX(${(-100 + sc * (100 / .45 + 100)).toFixed(2)}%)`;
				// ✓ replaces the folder glyph when reading is done.
				P.folder.style.opacity = String(1 - dn);
				u.tf(P.tick, { s: u.lerp(.5, 1, u.p(t, PREP_DONE, .35, ease.outBack)), o: dn });
			}

			// CMD chip: pops in at 13.0, active with three pulsing dots once the comet lands.
			{
				const M = S.cmdChip;
				const popK = u.p(t, CMD, .4, ease.outBack);
				const inK = u.p(t, CMD, .2);
				u.tf(M.chip, { s: u.lerp(.6, 1, popK), o: inK });
				const act = u.p(t, CMD_ACTIVE, .25, ease.outCubic);
				M.chip.style.borderColor = rgba(mix(COL.line2, COL.text, act));
				M.chip.style.boxShadow = act > .001 ? `0 0 ${(26 * act).toFixed(1)}px rgba(236,230,222,${(.22 * act).toFixed(3)})` : 'none';
				M.dotsBox.style.width = `${(28 * act).toFixed(2)}px`;
				M.dotsBox.style.marginLeft = `${(10 * act).toFixed(2)}px`;
				M.dots.forEach((dt, j) => {
					const w = .5 + .5 * Math.sin(2 * Math.PI * ((t - CMD_ACTIVE) / 1.2 - j * .18));
					dt.style.opacity = String(((.25 + .75 * w) * act).toFixed(3));
				});
			}

			// File chips: eject from the coder seat on the beats, settle into the stack.
			S.files.forEach((el, i) => {
				const at = FILES_AT[i];
				const k = u.p(t, at, FILE_FLY, ease.outCubic);
				const to = [STACK.x + STACK.w / 2, STACK.tops[i] + STACK.h / 2];
				const from = [CAST[2].x + 40, CAST[2].y - 14]; // top-right of the コーダー pill, clear of ライティング
				const cp = [to[0] + 20, from[1] - 40]; // rises through the gap right of イメージ, left of ライティング
				const [x, y] = quad(from, cp, to, k);
				const o = u.p(t, at, .12);
				u.tf(el, { x: x - STACK.w / 2, y: y - STACK.h / 2, s: u.lerp(.35, 1, Math.pow(k, 1.5)), o }); // stays small through the gap
			});

			// ---------------------------------------------------- ghosts: FLOW lines lift to their seats
			S.ghosts.forEach((el, i) => {
				const t0 = LIST[i];
				if (t < t0 || t > t0 + GHOST) { u.tf(el, { o: 0, blur: 0 }); return; }
				const G = S.listGeo[i];
				const sc = stepsScroll(t, S);
				const lx = PX + (S.contentOrigin[0] + G.left) * z;
				const rise = (1 - u.p(t, t0, RISE_TEXT, ease.outCubic)) * 10; // the line is still rising in
				const ly = PY + (S.contentOrigin[1] + G.top + G.h / 2 + rise - sc) * z;
				const w = S.ghostW[i], gh = S.ghostH[i];
				const start = [lx + w / 2, ly];
				// It lands where the seat's note-head pops in (above the pill), so the line becomes the
				// note instead of shrinking into a smudge over the seat label.
				const end = [CAST[i].x, CAST[i].y - SEAT_H / 2 - NOTE_UP];
				// The note-heads sit in the two clear lanes of the stage (y ≈ 615–688 between the outer and
				// inner rows, y ≈ 748–800 between the inner row and 検索 / レビュー). The ghost settles into
				// its note's lane while still over the panel, then glides in level, so the gold text never
				// drags across a seat label. It shrinks fastest early, while it is widest.
				const e = u.p(t, t0, GHOST, ease.outCubic);
				// (Line 4 sits right above the composer, so its ghost leaves nearly level and drops into
				// its lane only once past the composer's placeholder text, still right of ライティング.
				// Control points checked frame by frame against every seat pill and the composer text.)
				const cp1 = i === 3 ? [start[0] - 190, start[1] + 35] : [start[0] - 180, end[1]];
				const [x, y] = cubic(start, cp1, [end[0] + 220, end[1]], end, e);
				const o = Math.min(u.p(t, t0, .06), 1 - u.p(t, t0 + .22, .2, ease.inOutSine));
				u.tf(el, { x: x - w / 2, y: y - gh / 2, s: u.lerp(1, .22, Math.sqrt(e)), o: o, blur: 3 * u.p(t, t0 + .22, .2) });
			});

			// ---------------------------------------------------- captions
			const [cap1, cap2, cap3] = S.caps;
			c.cycle(S.kicker.chars, t, -1, CAP1_OUT); // already on screen from 03; carried across the cut
			c.cycle(cap1.chars, t, CAP1, CAP1_OUT);
			c.cycle(cap2.chars, t, CAP2, CAP2_OUT);
			c.reveal(cap3.chars, t, CAP3);

			// ---------------------------------------------------- flash carried over the cut
			const fk = u.p(t, 0, FLASH_END);
			const fo = .6 * (1 - fk) * (1 - fk);
			S.flash.style.opacity = String(fo);
			S.flash.style.visibility = fo > .001 ? 'visible' : 'hidden';
		},
	});

	function stepsScroll(t, S) {
		return steps(t, S.scroll0, S.scrollEv, SCROLL, ease.inOutCubic);
	}
})();
