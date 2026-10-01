// Orchestra intro video runtime.
//
// Every scene is a pure function of time: build() creates its DOM once, and
// draw(t) sets every style from the scene-local time t (seconds). Nothing may
// depend on wall-clock time, requestAnimationFrame, CSS transitions/animations
// or Math.random() — that is what makes frame-by-frame rendering exact.
(() => {
	const W = 1920, H = 1080, FPS = 30;

	// ---------------------------------------------------------------- easing
	const ease = {
		linear: k => k,
		inQuad: k => k * k,
		outQuad: k => 1 - (1 - k) * (1 - k),
		inOutQuad: k => k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2,
		inCubic: k => k * k * k,
		outCubic: k => 1 - Math.pow(1 - k, 3),
		inOutCubic: k => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2,
		outQuart: k => 1 - Math.pow(1 - k, 4),
		inOutQuart: k => k < .5 ? 8 * k ** 4 : 1 - Math.pow(-2 * k + 2, 4) / 2,
		outQuint: k => 1 - Math.pow(1 - k, 5),
		outExpo: k => k === 1 ? 1 : 1 - Math.pow(2, -10 * k),
		inOutExpo: k => k === 0 ? 0 : k === 1 ? 1 : k < .5 ? Math.pow(2, 20 * k - 10) / 2 : (2 - Math.pow(2, -20 * k + 10)) / 2,
		inOutSine: k => -(Math.cos(Math.PI * k) - 1) / 2,
		outSine: k => Math.sin(k * Math.PI / 2),
		outBack: k => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); },
		inBack: k => { const c1 = 1.70158, c3 = c1 + 1; return c3 * k * k * k - c1 * k * k; },
		// Critically-damped-ish spring settle (overshoots ~4%).
		spring: k => k >= 1 ? 1 : 1 - Math.exp(-7 * k) * Math.cos(9 * k),
	};

	// ---------------------------------------------------------------- utils
	const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
	const lerp = (a, b, k) => a + (b - a) * k;

	const u = {
		W, H, FPS, ease, clamp, lerp,
		// Progress 0..1 of t through [start, start + dur], optionally eased.
		p(t, start, dur, fn) {
			const k = dur <= 0 ? (t >= start ? 1 : 0) : clamp((t - start) / dur);
			return fn ? fn(k) : k;
		},
		// Value moving from -> to while t crosses [start, start + dur].
		range(t, start, dur, from, to, fn) { return lerp(from, to, u.p(t, start, dur, fn)); },
		// Envelope: 0 before inStart, ramps to 1 over inDur, holds, ramps to 0 from outStart over outDur.
		env(t, inStart, inDur, outStart = Infinity, outDur = .4, fn = ease.outCubic) {
			return Math.min(u.p(t, inStart, inDur, fn), 1 - u.p(t, outStart, outDur, ease.inCubic));
		},
		// Piecewise keyframes: u.keys(t, [[0, 0], [1, 100, ease.outCubic], [2, 50]]).
		// Each later key's optional easing shapes the segment that ends at it.
		keys(t, frames) {
			if (t <= frames[0][0]) { return frames[0][1]; }
			for (let i = 1; i < frames.length; i++) {
				const [t1, v1, fn] = frames[i];
				const [t0, v0] = frames[i - 1];
				if (t <= t1) { return lerp(v0, v1, u.p(t, t0, t1 - t0, fn || ease.inOutCubic)); }
			}
			return frames[frames.length - 1][1];
		},
		// Typewriter: the prefix of str visible at t, cps characters per second.
		typed(str, t, start, cps = 24) {
			const chars = Array.from(str);
			return chars.slice(0, clamp(Math.floor((t - start) * cps), 0, chars.length)).join('');
		},
		// Number counting up from `from` to `to`.
		count(t, start, dur, from, to, decimals = 0, fn = ease.outCubic) {
			return u.range(t, start, dur, from, to, fn).toFixed(decimals);
		},
		// Deterministic PRNG (mulberry32).
		rng(seed = 1) {
			let a = seed >>> 0;
			return () => {
				a = (a + 0x6D2B79F5) >>> 0;
				let x = a;
				x = Math.imul(x ^ (x >>> 15), x | 1);
				x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
				return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
			};
		},
		// Smooth 1-D value noise in [-1, 1], deterministic per seed.
		noise(x, seed = 0) {
			const hash = n => { const s = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453; return (s - Math.floor(s)) * 2 - 1; };
			const i = Math.floor(x), f = x - i, k = f * f * (3 - 2 * f);
			return lerp(hash(i), hash(i + 1), k);
		},

		// ------------------------------------------------------------ DOM
		// h('div', {class: 'x', style: {left: '10px'}, text: 'hi'}, child, ...)
		h(tag, props = {}, ...children) {
			const el = document.createElement(tag);
			applyProps(el, props);
			appendAll(el, children);
			return el;
		},
		// SVG element builder: u.svg('path', {d: '...', fill: 'none'})
		svg(tag, attrs = {}, ...children) {
			const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
			for (const [k, v] of Object.entries(attrs)) {
				if (k === 'style' && typeof v === 'object') { Object.assign(el.style, v); } else if (k === 'text') { el.textContent = v; } else { el.setAttribute(k, v); }
			}
			appendAll(el, children);
			return el;
		},
		// Set transform / opacity / filter in one call. Units: px, deg.
		// u.tf(el, {x, y, s, sx, sy, r, o, blur, origin})
		tf(el, { x = 0, y = 0, s = 1, sx = 1, sy = 1, r = 0, o, blur, origin } = {}) {
			el.style.transform = `translate(${x}px, ${y}px) rotate(${r}deg) scale(${s * sx}, ${s * sy})`;
			if (o !== undefined) { el.style.opacity = String(clamp(o)); el.style.visibility = o <= 0.001 ? 'hidden' : 'visible'; }
			if (blur !== undefined) { el.style.filter = blur > 0.05 ? `blur(${blur}px)` : 'none'; }
			if (origin !== undefined) { el.style.transformOrigin = origin; }
		},
		css(el, styles) { Object.assign(el.style, styles); },
		// Standard entrance: fade + rise + un-blur over dur starting at start.
		rise(el, t, start, dur = .6, dist = 40, fn = ease.outCubic) {
			const k = u.p(t, start, dur, fn);
			u.tf(el, { y: (1 - k) * dist, o: k, blur: (1 - k) * 8 });
			return k;
		},
		// Split text into per-character spans (for kinetic type). Returns the spans.
		chars(el, text) {
			el.textContent = '';
			return Array.from(text).map(ch => {
				const s = u.h('span', { class: 'ch', text: ch === ' ' ? ' ' : ch });
				el.appendChild(s);
				return s;
			});
		},
	};

	function applyProps(el, props) {
		for (const [k, v] of Object.entries(props)) {
			if (v === undefined || v === null) { continue; }
			if (k === 'class') { el.className = v; } else if (k === 'style') { typeof v === 'string' ? (el.style.cssText = v) : Object.assign(el.style, v); } else if (k === 'text') { el.textContent = v; } else if (k === 'html') { el.innerHTML = v; } else { el.setAttribute(k, v); }
		}
	}
	function appendAll(el, children) {
		for (const c of children.flat()) {
			if (c === null || c === undefined || c === false) { continue; }
			el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
		}
	}

	// ---------------------------------------------------------------- timeline
	const defs = new Map();
	const TRANSITION = .45; // default length of a scene's incoming transition

	function register(def) {
		if (!def.id || !(def.duration > 0) || !def.build || !def.draw) {
			throw new Error(`bad scene definition: ${def.id}`);
		}
		defs.set(def.id, def);
	}

	let timeline = [];
	function layout() {
		let start = 0;
		timeline = ORC.manifest.map(id => {
			const def = defs.get(id);
			if (!def) { throw new Error(`scene ${id} is in the manifest but never registered`); }
			const item = { id, def, start, end: start + def.duration, root: null, state: null };
			start = item.end;
			return item;
		});
		return start;
	}

	function transitionOf(item) {
		const tr = item.def.transition || 'fade';
		return typeof tr === 'string' ? { type: tr, dur: tr === 'cut' ? 0 : TRANSITION } : { dur: TRANSITION, ...tr };
	}

	// Composite the incoming scene (k: 0 -> 1) over the outgoing one.
	function applyTransition(type, k, inRoot, outRoot) {
		const e = ease.inOutCubic(k);
		inRoot.style.clipPath = '';
		inRoot.style.filter = '';
		outRoot.style.filter = '';
		switch (type) {
			case 'zoom':
				u.tf(inRoot, { s: lerp(1.08, 1, ease.outCubic(k)), o: ease.outCubic(k) });
				u.tf(outRoot, { s: lerp(1, .94, e), o: 1 - e });
				break;
			case 'push': // incoming slides up from below, outgoing leaves upward
				u.tf(inRoot, { y: lerp(H, 0, e), o: 1 });
				u.tf(outRoot, { y: lerp(0, -H * .35, e), o: 1 - e * .6 });
				break;
			case 'wipe':
				u.tf(inRoot, { o: 1 });
				inRoot.style.clipPath = `inset(0 0 0 ${(1 - e) * 100}%)`;
				u.tf(outRoot, { x: lerp(0, -120, e), o: 1 });
				break;
			case 'blur':
				u.tf(inRoot, { o: ease.outCubic(k), blur: (1 - k) * 24 });
				u.tf(outRoot, { o: 1 - e, blur: e * 24 });
				break;
			case 'fade':
			default:
				u.tf(inRoot, { o: ease.inOutSine(k) });
				u.tf(outRoot, { o: 1 });
		}
	}

	function resetRoot(root) {
		root.style.transform = '';
		root.style.opacity = '1';
		root.style.visibility = 'visible';
		root.style.clipPath = '';
		root.style.filter = '';
	}

	function drawItem(item, t) {
		item.def.draw(t, item.state, item.root);
	}

	// Draw the frame at global time T (seconds).
	function seek(T) {
		let i = timeline.findIndex(it => T < it.end);
		if (i < 0) { i = timeline.length - 1; }
		const cur = timeline[i];
		const prev = timeline[i - 1];
		const tr = transitionOf(cur);
		const inTransition = prev && tr.dur > 0 && T - cur.start < tr.dur;
		for (const it of timeline) {
			const visible = it === cur || (inTransition && it === prev);
			it.root.style.display = visible ? 'block' : 'none';
			it.root.style.zIndex = it === cur ? 2 : 1;
		}
		resetRoot(cur.root);
		drawItem(cur, T - cur.start);
		if (inTransition) {
			resetRoot(prev.root);
			// The outgoing scene keeps playing past its end while it is covered.
			drawItem(prev, T - prev.start);
			applyTransition(tr.type, (T - cur.start) / tr.dur, cur.root, prev.root);
		}
		ORC.time = T;
	}

	// Draw a single scene alone at local time t (for stills and debugging).
	function seekScene(id, t) {
		const it = timeline.find(x => x.id === id);
		if (!it) { throw new Error(`no scene ${id}`); }
		for (const x of timeline) { x.root.style.display = x === it ? 'block' : 'none'; }
		resetRoot(it.root);
		drawItem(it, t);
	}

	async function boot() {
		const stage = document.getElementById('stage');
		const total = layout();
		for (const it of timeline) {
			it.root = u.h('div', { class: 'scene', 'data-scene': it.id });
			stage.appendChild(it.root);
			it.state = it.def.build(it.root) || {};
		}
		// Load every font face up front and make sure all images are decoded.
		await Promise.all([...document.fonts].map(f => f.load().catch(() => null)));
		await document.fonts.ready;
		await Promise.all([...document.images].map(img => img.decode().catch(() => null)));
		ORC.total = total;
		return total;
	}

	window.ORC = {
		W, H, FPS, u, ease, register, seek, seekScene,
		manifest: [],
		total: 0,
		time: 0,
		timeline: () => timeline.map(({ id, start, end }) => ({ id, start, end, transition: transitionOf(timeline.find(x => x.id === id)) })),
		boot,
	};
})();
