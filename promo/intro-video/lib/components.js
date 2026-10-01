// Shared building blocks so every scene draws Orchestra the same way.
// Builders return DOM (plus small draw helpers); scenes position and animate them.
(() => {
	const { u, ease } = ORC;
	const { h, svg } = u;

	// ---------------------------------------------------------------- icons (lucide, 24x24 stroke)
	const ICONS = {
		arrowUp: '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
		chevronRight: '<path d="m9 18 6-6-6-6"/>',
		chevronDown: '<path d="m6 9 6 6 6-6"/>',
		repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
		coins: '<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/>',
		sliders: '<path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4"/>',
		paperclip: '<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
		bot: '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2M20 14h2M15 13v2M9 13v2"/>',
		file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
		terminal: '<path d="m4 17 6-6-6-6"/><path d="M12 19h8"/>',
		stop: '<rect width="14" height="14" x="5" y="5" rx="2"/>',
		wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
		plus: '<path d="M5 12h14M12 5v14"/>',
		history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5M12 7v5l4 2"/>',
		listChecks: '<path d="m3 17 2 2 4-4M3 7l2 2 4-4M13 6h8M13 12h8M13 18h8"/>',
		gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1"/>',
		bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
		check: '<path d="M20 6 9 17l-5-5"/>',
		x: '<path d="M18 6 6 18M6 6l12 12"/>',
		phone: '<rect width="14" height="20" x="5" y="2" rx="2"/><path d="M12 18h.01"/>',
		search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
		layout: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/>',
		play: '<polygon points="6 3 20 12 6 21 6 3"/>',
		target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
	};
	function icon(name, size = 14, extra = {}) {
		const el = svg('svg', { viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', ...extra });
		el.innerHTML = ICONS[name];
		return el;
	}

	// ---------------------------------------------------------------- brand mark (motion law from workbench.ts / OrchestraMark.tsx)
	const MARK_SPLASH = { W: 266, H: 120, CY: 60, X0: 10, X_OPEN: 164, X_END: 232, PERIOD: 76, AMP: 14, RAMP: 56, OPEN_BASE: 28, OPEN_WOBBLE: 4, SEGMENTS: 24, ARROW: '-4.5,-7 14.5,0 -4.5,7 0,0', CYCLE: 6, STROKE: 2.4, BACK: 1.5 };
	const MARK_SMALL = { W: 76, H: 42, CY: 21, X0: 3, X_OPEN: 42, X_END: 60, PERIOD: 28, AMP: 5.6, RAMP: 20, OPEN_BASE: 11.5, OPEN_WOBBLE: 1.8, SEGMENTS: 16, ARROW: '-3.5,-5 9.5,0 -3.5,5 0,0', CYCLE: 2.6, STROKE: 2.4, BACK: 1.7 };
	const smooth = k => k * k * (3 - 2 * k);
	let markSeq = 0;

	function mark({ width = 320, variant = 'splash', glow = true, ambient = false } = {}) {
		const G = variant === 'small' ? MARK_SMALL : MARK_SPLASH;
		const id = `mk${++markSeq}`;
		const strandY = (x, phase, side) => {
			const amp = G.AMP * u.clamp((x - G.X0) / G.RAMP);
			const weave = G.CY + side * amp * Math.sin((2 * Math.PI * (x - G.X0)) / G.PERIOD + phase);
			if (x <= G.X_OPEN) { return weave; }
			const k = smooth((x - G.X_OPEN) / (G.X_END - G.X_OPEN));
			return weave * (1 - k) + (G.CY + side * (G.OPEN_BASE + G.OPEN_WOBBLE * Math.cos(phase))) * k;
		};
		const pathFor = (phase, side) => {
			const pts = [];
			for (let i = 0; i <= G.SEGMENTS; i++) {
				const x = G.X0 + ((G.X_END - G.X0) * i) / G.SEGMENTS;
				pts.push([x, strandY(x, phase, side)]);
			}
			const at = i => pts[Math.min(pts.length - 1, Math.max(0, i))];
			const n = v => v.toFixed(2);
			let d = `M${n(pts[0][0])},${n(pts[0][1])}`;
			for (let i = 0; i < pts.length - 1; i++) {
				const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
				d += ` C${n(p1[0] + (p2[0] - p0[0]) / 6)},${n(p1[1] + (p2[1] - p0[1]) / 6)} ${n(p2[0] - (p3[0] - p1[0]) / 6)},${n(p2[1] - (p3[1] - p1[1]) / 6)} ${n(p2[0])},${n(p2[1])}`;
			}
			return d;
		};
		const headTf = (phase, side, launch) => {
			const y = strandY(G.X_END, phase, side);
			const a = Math.atan2(y - strandY(G.X_END - .5, phase, side), .5) * 180 / Math.PI;
			return `translate(${(G.X_END - 4 * (1 - launch)).toFixed(2)} ${y.toFixed(2)}) rotate(${a.toFixed(1)})`;
		};

		const root = svg('svg', { viewBox: `0 0 ${G.W} ${G.H}`, width, height: width * G.H / G.W, style: { overflow: 'visible', display: 'block' } });
		const defs = svg('defs');
		const grad = svg('linearGradient', { id: `${id}-fade`, x1: G.X0, y1: 0, x2: G.X_END - 2, y2: 0, gradientUnits: 'userSpaceOnUse' },
			svg('stop', { offset: 0, 'stop-color': '#5e0b16', 'stop-opacity': 0 }),
			svg('stop', { offset: .28, 'stop-color': '#8c1223', 'stop-opacity': .9 }),
			svg('stop', { offset: .65, 'stop-color': '#c01e31' }),
			svg('stop', { offset: 1, 'stop-color': '#d8283b' }));
		const sheen = svg('linearGradient', { id: `${id}-sheen`, x1: G.X0, y1: 0, x2: G.X_END - 2, y2: 0, gradientUnits: 'userSpaceOnUse' },
			svg('stop', { offset: .2, 'stop-color': '#fff4f5', 'stop-opacity': 0 }),
			svg('stop', { offset: .45, 'stop-color': '#fff4f5' }),
			svg('stop', { offset: .8, 'stop-color': '#fff4f5' }),
			svg('stop', { offset: 1, 'stop-color': '#fff4f5', 'stop-opacity': 0 }));
		const opening = svg('linearGradient', { id: `${id}-open`, x1: G.X_OPEN - 12 * G.W / 266, y1: 0, x2: G.X_OPEN + 16 * G.W / 266, y2: 0, gradientUnits: 'userSpaceOnUse' },
			svg('stop', { offset: 0, 'stop-color': '#fff', 'stop-opacity': 0 }), svg('stop', { offset: 1, 'stop-color': '#fff' }));
		defs.append(grad, sheen, opening);
		const shifts = [];
		for (const [side, sign] of [['a', -1], ['b', 1]]) {
			const fill = svg('linearGradient', { id: `${id}-d${side}`, x1: G.X0, y1: 0, x2: G.X0 + G.PERIOD, y2: 0, gradientUnits: 'userSpaceOnUse', spreadMethod: 'repeat' });
			for (let i = 0; i <= 24; i++) {
				const z = sign * Math.cos((2 * Math.PI * i) / 24);
				fill.appendChild(svg('stop', { offset: (i / 24).toFixed(3), 'stop-color': '#fff', 'stop-opacity': smooth(u.clamp((z + .4) / .8)).toFixed(3) }));
			}
			const shift = svg('rect', { x: -20, y: -20, width: G.W + 40 + G.PERIOD, height: G.H + 40, fill: `url(#${id}-d${side})` });
			shifts.push(shift);
			defs.append(fill, svg('mask', { id: `${id}-m${side}`, maskUnits: 'userSpaceOnUse', x: -20, y: -20, width: G.W + 40, height: G.H + 40 },
				shift, svg('rect', { x: -20, y: -20, width: G.W + 40, height: G.H + 40, fill: `url(#${id}-open)` })));
		}
		if (glow) {
			defs.appendChild(svg('filter', { id: `${id}-glow`, x: '-60%', y: '-60%', width: '220%', height: '220%' },
				svg('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: 3, result: 'blur' }),
				svg('feColorMatrix', { in: 'blur', type: 'matrix', values: '1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.45 0', result: 'aura' }),
				svg('feMerge', {}, svg('feMergeNode', { in: 'aura' }), svg('feMergeNode', { in: 'SourceGraphic' }))));
		}
		root.appendChild(defs);
		if (ambient) {
			const amb = svg('radialGradient', { id: `${id}-amb`, cx: .5, cy: .5, r: .5 });
			for (let i = 0; i <= 12; i++) {
				const k = i / 12;
				amb.appendChild(svg('stop', { offset: k.toFixed(2), 'stop-color': '#c01e31', 'stop-opacity': (0.12 * Math.pow(1 - k * k, 3)).toFixed(4) }));
			}
			defs.appendChild(amb);
			root.appendChild(svg('ellipse', { cx: G.W * .455, cy: G.CY, rx: G.W * .7, ry: G.H * .87, fill: `url(#${id}-amb)` }));
		}
		const strandStyle = w => ({ fill: 'none', stroke: `url(#${id}-fade)`, 'stroke-width': w, 'stroke-linecap': 'round', pathLength: 100 });
		const backs = [svg('path', { ...strandStyle(G.BACK), opacity: .5 }), svg('path', { ...strandStyle(G.BACK), opacity: .5 })];
		root.append(...backs);
		const fronts = [], lights = [];
		for (const side of ['a', 'b']) {
			const g = svg('g', { mask: `url(#${id}-m${side})`, filter: glow ? `url(#${id}-glow)` : undefined });
			const f = svg('path', strandStyle(G.STROKE));
			const l = svg('path', { fill: 'none', stroke: `url(#${id}-sheen)`, 'stroke-width': 1, 'stroke-linecap': 'round', pathLength: 100, 'stroke-dasharray': '14 86', opacity: 0 });
			g.append(f, l);
			fronts.push(f);
			lights.push(l);
			root.appendChild(g);
		}
		const heads = [svg('polygon', { points: G.ARROW, fill: '#d8283b' }), svg('polygon', { points: G.ARROW, fill: '#d8283b' })];
		root.append(...heads);

		// t: seconds (drives the weave), reveal: 0..1 strands drawn, launch: 0..1 arrowheads, light: 0..1 sheen.
		function draw(t, { reveal = 1, launch = 1, light = 1, speed = 1 } = {}) {
			const phase = (2 * Math.PI * t * speed) / G.CYCLE;
			const sides = [-1, 1];
			for (let i = 0; i < 2; i++) {
				const d = pathFor(phase, sides[i]);
				for (const p of [backs[i], fronts[i], lights[i]]) { p.setAttribute('d', d); }
				const dash = reveal >= 1 ? 'none' : '100 100';
				backs[i].setAttribute('stroke-dasharray', dash);
				fronts[i].setAttribute('stroke-dasharray', dash);
				backs[i].setAttribute('stroke-dashoffset', 100 * (1 - reveal));
				fronts[i].setAttribute('stroke-dashoffset', 100 * (1 - reveal));
				heads[i].setAttribute('transform', headTf(phase, sides[i], launch));
				heads[i].setAttribute('opacity', u.clamp(launch));
				const cyc = ((t + (i ? 1.8 : 0)) % 3.6) / 3.6;
				lights[i].setAttribute('stroke-dashoffset', (100 * (1 - ease.inOutSine(cyc))).toFixed(2));
				lights[i].setAttribute('opacity', (.85 * light).toFixed(3));
			}
			const off = -((phase / (2 * Math.PI)) % 1) * G.PERIOD;
			for (const s of shifts) { s.setAttribute('transform', `translate(${off.toFixed(2)} 0)`); }
		}
		draw(0);
		return { el: root, draw, geom: G };
	}

	// ---------------------------------------------------------------- backdrop shared by all scenes
	function backdrop({ tint = 'red' } = {}) {
		const el = h('div', { class: 'fill' });
		const base = h('div', { class: 'fill', style: { background: 'radial-gradient(120% 90% at 50% 40%, #16120f 0%, #0e0c0b 45%, #070605 100%)' } });
		const glowA = h('div', { class: 'abs', style: { width: '1400px', height: '1000px', left: '-300px', top: '-420px', borderRadius: '50%', background: tint === 'gold' ? 'radial-gradient(closest-side, rgba(198,167,105,.10), transparent)' : 'radial-gradient(closest-side, rgba(192,30,49,.13), transparent)' } });
		const glowB = h('div', { class: 'abs', style: { width: '1300px', height: '1000px', right: '-380px', bottom: '-520px', borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(198,167,105,.07), transparent)' } });
		const grid = h('div', { class: 'fill', style: { opacity: .5, backgroundImage: 'linear-gradient(rgba(236,230,222,.025) 1px, transparent 1px), linear-gradient(90deg, rgba(236,230,222,.025) 1px, transparent 1px)', backgroundSize: '80px 80px', maskImage: 'radial-gradient(70% 70% at 50% 50%, #000 0%, transparent 100%)', WebkitMaskImage: 'radial-gradient(70% 70% at 50% 50%, #000 0%, transparent 100%)' } });
		const vignette = h('div', { class: 'fill', style: { background: 'radial-gradient(130% 100% at 50% 50%, transparent 55%, rgba(0,0,0,.55) 100%)' } });
		el.append(base, glowA, glowB, grid, vignette);
		return {
			el,
			draw(t) {
				u.tf(glowA, { x: 60 * Math.sin(t * .25), y: 40 * Math.cos(t * .2) });
				u.tf(glowB, { x: -50 * Math.sin(t * .2 + 1), y: -30 * Math.cos(t * .23) });
				u.tf(grid, { y: -(t * 6) % 80 });
			},
		};
	}

	// ---------------------------------------------------------------- kinetic type
	// Headline split into chars; animate with reveal()/hide().
	function headline(text, { cls = 't-h1', style = {} } = {}) {
		const el = h('div', { class: `abs nowrap ${cls}`, style });
		const chars = u.chars(el, text);
		return { el, chars };
	}
	function reveal(chars, t, start, { stagger = .035, dur = .55, dist = 34, blur = 10, fn = ease.outCubic } = {}) {
		chars.forEach((c, i) => {
			const k = u.p(t, start + i * stagger, dur, fn);
			u.tf(c, { y: (1 - k) * dist, o: k, blur: (1 - k) * blur });
		});
	}
	function hide(chars, t, start, { stagger = .015, dur = .35, dist = -24 } = {}) {
		chars.forEach((c, i) => {
			const k = u.p(t, start + i * stagger, dur, ease.inCubic);
			if (k <= 0) { return; }
			u.tf(c, { y: k * dist, o: 1 - k, blur: k * 8 });
		});
	}
	// Reveal then hide: the usual caption lifecycle.
	function cycle(chars, t, inAt, outAt, opts = {}) {
		reveal(chars, t, inAt, opts);
		if (t >= outAt) { hide(chars, t, outAt, opts.out); }
	}

	// Small gold label in Latin caps (e.g. "LEADER").
	function label(text, style = {}) {
		return h('div', { class: 'abs t-label', style: { color: '#c6a769', ...style }, text });
	}

	// ---------------------------------------------------------------- UI mock
	function zoomBox(zoom, style = {}) {
		return h('div', { class: 'abs o-ui', style: { zoom: String(zoom), ...style } });
	}

	function ideWindow({ width = 1200, height = 720, title = 'todo-app — Orchestra', chatWidth = '40%', running = false } = {}) {
		const tbIcons = h('div', { class: 'o-tb-icons' }, icon('file'), icon('terminal'), icon('bot'), running ? icon('stop') : null, icon('wrench'));
		const titlebar = h('div', { class: 'o-titlebar' }, h('div', { class: 'o-traffic' }, h('i'), h('i'), h('i')), h('div', { class: 'o-title', text: title }), tbIcons);
		const editor = h('div', { class: 'o-editor' });
		const viewtitle = h('div', { class: 'o-viewtitle' }, h('span', { text: 'CHAT' }), h('div', { class: 'o-tb-icons' }, icon('plus', 14), icon('history', 14), icon('listChecks', 14), icon('gear', 14)));
		const thread = h('div', { class: 'o-thread' });
		const chatFoot = h('div', { style: { padding: '0 16px 14px' } });
		const chat = h('div', { class: 'o-chatpane', style: { width: chatWidth } }, viewtitle, thread, chatFoot);
		const el = h('div', { class: 'o-window', style: { width: `${width}px`, height: `${height}px` } }, titlebar, h('div', { class: 'o-body' }, editor, chat));
		return { el, titlebar, editor, chat, thread, chatFoot };
	}

	// The agent-mode home screen in the editor area (editorGroupWatermark.ts).
	function home({ highlight = -1 } = {}) {
		const examples = ['このプロジェクトを調べて、構成を説明して', 'シンプルな TODO アプリを作って動かして', 'エラーを調べて直して', 'テストを実行して、失敗を直して'];
		const rows = examples.map((s, i) => h('div', { class: `o-example${i === highlight ? ' hot' : ''}`, text: `💬  ${s}` }));
		const el = h('div', { class: 'o-home' },
			h('img', { src: 'assets/orchestra-logo.png' }),
			h('h2', { text: 'エージェントに任せましょう' }),
			h('p', { text: '右側のエージェントに、やってほしいことをそのまま書いてください。ファイルの編集からコマンドの実行、結果の確認まで、エージェントが自分で進めます。' }),
			h('div', { class: 'o-pills' }, ...[['📝', 'ファイルの作成・編集'], ['⌨️', 'コマンドの実行'], ['🔍', 'コードの調査とエラー修正'], ['✅', '動作の確認と報告']].map(([e, s]) => h('span', { class: 'o-pill' }, e, s))),
			h('div', { class: 'o-section', text: 'たとえば、こんな仕事を任せられます' }),
			h('div', { class: 'o-examples' }, ...rows),
			h('div', { class: 'row', style: { gap: '10px' } }, h('span', { class: 'o-btn primary', text: 'エージェントに指示する' }), h('span', { class: 'o-btn secondary', text: 'ファイル一覧を見る' }), h('span', { class: 'o-btn secondary', text: 'ターミナルを開く' })));
		return { el, rows };
	}

	function greet() {
		return h('div', { class: 'o-greet' },
			h('h3', {}, icon('bot', 20), 'エージェントに何をさせますか？'),
			h('p', { text: 'やってほしいことを自分の言葉で書いてください。エージェントがファイル編集・コマンド実行・結果の確認まで自分で進めます。' }),
			h('span', { class: 'o-badge', style: { marginTop: '6px' } }, h('i', { class: 'o-dot green' }), '自律実行中: ファイル編集とコマンドは確認なしで進みます'));
	}

	// Two-row composer. setText(str, caret) types into it; setState('idle'|'running'|'waiting').
	function composer({ placeholder = '例:「シンプルな TODO アプリを作って動かして」「落ちているテストを直して」', chips = null } = {}) {
		const input = h('div', { class: 'o-input' });
		const chipEls = (chips || [
			{ icon: 'sliders', text: 'モデルなどの設定' },
			{ icon: 'coins', text: 'コスト調整: オン', on: true, dot: true, caret: true },
			{ icon: 'repeat', text: 'ループ: 自動' },
		]).map(c => h('span', { class: `o-chip${c.on ? ' on' : ''}` }, icon(c.icon, 12), c.text, c.dot ? h('i', { class: 'o-dot green' }) : null, c.caret ? h('span', { style: { fontSize: '11px' }, text: '▾' }) : null));
		const send = h('span', { class: 'o-send' }, icon('arrowUp', 13, { 'stroke-width': 2.6 }));
		const stop = h('span', { class: 'o-send', style: { display: 'none' } }, h('i', { style: { width: '8px', height: '8px', borderRadius: '2px', background: '#1a1716', display: 'block' } }));
		const waiting = h('span', { class: 'o-waiting', style: { display: 'none' } }, h('i', { class: 'o-dot yellow' }), '確認待ち');
		const right = h('div', { class: 'row', style: { gap: '8px', color: '#877c72' } }, icon('paperclip', 16), send, stop, waiting);
		const el = h('div', { class: 'o-composer' }, input, h('div', { class: 'o-comp-row' }, h('div', { class: 'o-chips' }, ...chipEls), right));
		function setText(str, caret = true, state = 'idle') {
			input.textContent = '';
			if (!str) {
				if (state === 'idle') { input.appendChild(h('span', { class: 'o-ph', text: placeholder })); } else if (state === 'running') { input.appendChild(h('span', { class: 'o-ph', text: 'エージェントが作業中です… 止めたいときは Esc' })); } else { input.appendChild(h('span', { class: 'o-ph', text: '確認待ちです。上のカードで、どうするか選んでください' })); }
			} else {
				input.appendChild(document.createTextNode(str));
			}
			if (caret) { input.appendChild(h('i', { class: 'o-caret' })); }
			send.style.display = state === 'idle' ? 'flex' : 'none';
			stop.style.display = state === 'running' ? 'flex' : 'none';
			waiting.style.display = state === 'waiting' ? 'inline-flex' : 'none';
			el.classList.toggle('focus', caret);
		}
		setText('', false);
		return { el, input, send, chips: chipEls, setText };
	}

	function bubble(text) { return h('div', { class: 'o-bubble', text }); }

	// Role step card (SidebarChat.tsx). body: HTML string. Call draw(t, state) with state 'running' | 'done'.
	function card({ n, title, role, body = '', open = false }) {
		const sheen = h('div', { class: 'o-sheen' });
		const chev = icon('chevronRight', 12, { class: 'o-chev' });
		const spinner = mark({ width: 29, variant: 'small', glow: false });
		spinner.el.style.flex = 'none';
		spinner.el.style.display = 'none';
		const head = h('div', { class: 'o-card-head' }, chev, h('span', { class: 'o-card-title', text: title }), n !== undefined ? h('span', { class: 'o-num', text: `#${n}` }) : null, spinner.el, h('span', { class: 'o-role', text: role }));
		const bodyEl = h('div', { class: 'o-card-body', html: body });
		const el = h('div', { class: 'o-card' }, sheen, head, bodyEl);
		function draw(t, state = 'done', openK = open ? 1 : 0) {
			const running = state === 'running';
			el.classList.toggle('running', running);
			spinner.el.style.display = running ? 'block' : 'none';
			if (running) { spinner.draw(t); }
			sheen.style.opacity = running ? '1' : '0';
			sheen.style.backgroundPosition = `${((t / 2.4) % 1) * 250 - 75}% 0`;
			chev.style.transform = `rotate(${90 * openK}deg)`;
			bodyEl.style.display = openK > 0.01 ? 'block' : 'none';
			bodyEl.style.maxHeight = `${openK * 220}px`;
			bodyEl.style.opacity = String(openK);
		}
		draw(0, 'done');
		return { el, head, body: bodyEl, draw };
	}

	// Flow indicator under the thread: gold dot + shimmering label + small brand mark.
	function indicator(text = '実装中') {
		const dot = h('i', { class: 'o-dot gold' });
		const lab = h('span', { class: 'o-shimmer', text });
		const m = mark({ width: 29, variant: 'small', glow: false });
		const el = h('div', { class: 'o-indicator' }, dot, lab, m.el);
		return {
			el,
			set(s) { lab.textContent = s; },
			draw(t) {
				lab.style.backgroundPosition = `${100 - ((t / 2.6) % 1) * 100}% 0`;
				dot.style.opacity = String(.55 + .45 * Math.sin(t * Math.PI * 2 / 1.4));
				m.draw(t);
			},
		};
	}

	// Syntax-coloured code lines for the editor area: [[html, 'add'?], ...]
	function code(lines) {
		return h('div', { class: 'o-code' }, ...lines.map(([html, cls], i) => h('div', { class: `ln ${cls || ''}`, html: `<i>${i + 1}</i>${html}` })));
	}

	function logo(size = 200) {
		return h('img', { src: 'assets/orchestra-logo.png', class: 'abs', style: { width: `${size}px`, height: `${size}px` } });
	}

	ORC.c = { icon, mark, backdrop, headline, reveal, hide, cycle, label, zoomBox, ideWindow, home, greet, composer, bubble, card, indicator, code, logo };
})();
