// 09-finale — global 69.5–76.0 (ENDING, final chord Aadd9 at 70.0).
// The brand mark is drawn on the pickup (0.0–0.5), dissolves into the red halo on the
// chord while the ring logo settles, and the tagline 「指揮は、Orchestra に。」 answers 01's
// 「指揮者は、いつも自分。」. A CTA plus a textless composer silhouette invites the first single
// request; the fine print states the requirements (login + Plus plan or credits).
// FIXED LAYOUT: nothing moves while it is being read. 6.2–6.5 fades to black with the music.
(() => {
	const { u, c, ease } = ORC;
	const { h } = u;

	// ------------------------------------------------------------ timing (scene seconds)
	const LIFT_DUR = .6;                          // 08 cut in dimmed to noir: the backdrop rises out of it
	const HALO_DUR = .8;                          // halo builds during the pickup, full as the mark dissolves
	const DRAW_DUR = .5;                          // pickup: the mark draws left -> right
	const LAUNCH = .35, LAUNCH_DUR = .15;         // its arrowheads launch
	const SHEEN = [.08, .12], SHEEN_DUR = .5;     // the #fff4f5 highlight runs once per strand, behind the draw head
	const CHORD = .5;                             // global 70.0, FINAL CHORD
	// Bloom, logo and tagline attack one frame-step early (local .47) so the 70.000 frame
	// itself carries the hit (69.967 stays dark). The mark dissolve stays on CHORD.
	const HIT = CHORD - .03;
	const DISSOLVE_DUR = .5;                      // mark: opacity 1 -> 0, scale 1 -> 1.1
	const LOGO_DUR = .8, LOGO_FADE = .4;          // logo: scale .85 -> 1, rotate -24 -> 0 (outBack), opacity 0 -> .95
	const BLOOM_ATTACK = .07, BLOOM_DUR = .8;     // bloom: pulse to .8, decays to .3 by HIT + .8
	const TAG = HIT;                              // tagline per-character reveal, on the chord
	const WORD = 1.2, WORD_DUR = .6;              // wordmark
	const FOOT = 1.5, FOOT_DUR = .6;              // footnote
	const KICK = 1.6, KICK_DUR = .5;              // kicker
	const CTA = 2.4, CTA_DUR = .5;                // CTA rises 16px
	const COMP = 2.6, COMP_DUR = .6;              // composer silhouette
	const SPIN = 2.4, SPIN_RATE = 2, SPIN_RAMP = .6; // logo turns clockwise at 2 deg/s (eased in)
	// Fade to black 6.2–6.5. The video's last frame is 6.5 - 1/30, so the fade completes on
	// it: the film ends on true black, with the music fade.
	const FADE = 6.2, FADE_DUR = 6.5 - 1 / 30 - 6.2;

	// ------------------------------------------------------------ layout (screen px)
	const CX = 960;
	const HALO = { x: 960, y: 330, w: 1100, h: 600 };
	const MARK = { left: 510, top: 127, width: 900 };
	const LOGO = { x: 960, y: 300, size: 220 };
	const BLOOM_D = 210;
	const WORD_BASE = 450, KICK_BASE = 492, TAG_BASE = 610, CTA_BASE = 735, FOOT_BASE = 975;
	const BOX = { x: 640, y: 770, w: 640, h: 96, r: 16 };
	const CARET = { x: 680, w: 2, h: 30 };
	const SEND = { cx: 1232, d: 48 };

	const TAGLINE = ['指揮は、', 'Orchestra', ' に。'];
	const TAG_SIZE = 104, TAG_EN_SIZE = 104;
	const RED_GRAD = 'linear-gradient(90deg, #c9273b 0%, #ff6174 48%, #e02431 100%)';
	const SHADOW = '0 4px 24px rgba(0,0,0,.6)';

	// ------------------------------------------------------------ helpers
	const px = v => `${v}px`;
	// Blank space before the first glyph's ink and after the last glyph's ink (canvas metrics),
	// so centred lines ending in 「。」 are centred on their ink, not on the advance box.
	const ctx = document.createElement('canvas').getContext('2d');
	const sideBlanks = (first, last, font) => {
		ctx.font = font;
		const a = ctx.measureText(first), b = ctx.measureText(last);
		return { lead: Math.max(0, -a.actualBoundingBoxLeft), trail: Math.max(0, b.width - b.actualBoundingBoxRight) };
	};
	// Put a built line element so its alphabetic baseline sits on `baseline` and its ink is
	// centred on CX. `el` must already be in the DOM (scene root is visible during build).
	const placeCentred = (el, baseline, blanks = { lead: 0, trail: 0 }, extraRight = 0) => {
		const probe = h('span', { style: { display: 'inline-block', width: '0', height: '0', verticalAlign: 'baseline' } });
		el.appendChild(probe);
		const base = probe.offsetTop;
		probe.remove();
		const w = el.offsetWidth - extraRight;
		el.style.left = px(Math.round(CX - (w + blanks.lead - blanks.trail) / 2));
		el.style.top = px(baseline - base);
		return w;
	};
	// Logo spin: 0 until SPIN, then eases up to SPIN_RATE deg/s over SPIN_RAMP (no velocity step).
	const spin = t => {
		const x = t - SPIN;
		if (x <= 0) { return 0; }
		if (x < SPIN_RAMP) { return SPIN_RATE * x * x / (2 * SPIN_RAMP); }
		return SPIN_RATE * (x - SPIN_RAMP / 2);
	};
	// Smooth radial falloff (no hard ring edge): opacity a·(1-k²)³ across n stops.
	const radial = (rgb, a, n = 14) => {
		const stops = [];
		for (let i = 0; i <= n; i++) {
			const k = i / n;
			stops.push(`rgba(${rgb}, ${(a * Math.pow(1 - k * k, 3)).toFixed(4)}) ${(k * 100).toFixed(1)}%`);
		}
		return `radial-gradient(closest-side, ${stops.join(', ')})`;
	};

	ORC.register({
		id: '09-finale',
		duration: 6.5,
		transition: 'cut',

		build(root) {
			const S = {};

			// ======================================================== BACKGROUND
			S.bg = c.backdrop({ tint: 'red' });
			root.appendChild(S.bg.el);
			// 08 ends dimmed toward noir (rgba(7,6,5,.7)); the backdrop starts there and lifts.
			S.dim = h('div', { class: 'fill', style: { background: 'rgb(7,6,5)' } });
			root.appendChild(S.dim);
			const haloBox = { left: px(HALO.x - HALO.w / 2), top: px(HALO.y - HALO.h / 2), width: px(HALO.w), height: px(HALO.h) };
			S.halo = h('div', { class: 'abs', style: { ...haloBox, background: radial('224, 36, 49', .24) } });
			S.white = h('div', { class: 'abs', style: { ...haloBox, background: radial('255, 255, 255', .035) } });
			root.append(S.halo, S.white);

			// ======================================================== BRAND MARK (pickup)
			S.mark = c.mark({ width: MARK.width, variant: 'splash' });
			const markH = MARK.width * S.mark.geom.H / S.mark.geom.W;
			S.markWrap = h('div', { class: 'abs', style: { left: px(MARK.left), top: px(MARK.top), width: px(MARK.width), height: px(markH), transformOrigin: '50% 50%' } }, S.mark.el);
			root.appendChild(S.markWrap);
			// The mark's own sheen loops every 3.6 s; here it must run exactly once. Take over its
			// two light paths: a single 14-unit dash (period > path length, so it never wraps).
			S.lights = [...S.mark.el.querySelectorAll('path')].filter(p => /-sheen\)$/.test(p.getAttribute('stroke') || ''));
			for (const l of S.lights) { l.setAttribute('stroke-dasharray', '14 200'); }

			// ======================================================== BLOOM + RING LOGO
			S.bloom = h('div', { class: 'abs', style: { left: px(LOGO.x - BLOOM_D / 2), top: px(LOGO.y - BLOOM_D / 2), width: px(BLOOM_D), height: px(BLOOM_D), borderRadius: '50%', background: '#e02431', filter: 'blur(60px)' } });
			root.appendChild(S.bloom);
			S.logo = c.logo(LOGO.size);
			u.css(S.logo, { left: px(LOGO.x - LOGO.size / 2), top: px(LOGO.y - LOGO.size / 2), transformOrigin: '50% 50%' });
			root.appendChild(S.logo);

			// ======================================================== COMPOSER SILHOUETTE (no text)
			S.comp = h('div', { class: 'abs', style: { left: px(BOX.x), top: px(BOX.y), width: px(BOX.w), height: px(BOX.h), borderRadius: px(BOX.r), boxSizing: 'border-box', border: '1px solid #262120', background: 'linear-gradient(180deg, #1a1716, color-mix(in srgb, #c6a769 8%, #1a1716))' } });
			const midY = BOX.h / 2 - 1;                                // inside the 1px border
			S.caret = h('i', { class: 'abs', style: { left: px(CARET.x - BOX.x - 1), top: px(midY - CARET.h / 2), width: px(CARET.w), height: px(CARET.h), background: '#ece6de', borderRadius: '1px', display: 'block' } });
			const send = h('div', { class: 'abs', style: { left: px(SEND.cx - SEND.d / 2 - BOX.x - 1), top: px(midY - SEND.d / 2), width: px(SEND.d), height: px(SEND.d), borderRadius: '50%', background: '#ece6de', color: '#1a1716', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 10px rgba(236,230,222,.22)' } }, c.icon('arrowUp', 24, { 'stroke-width': 2.6 }));
			S.comp.append(S.caret, send);
			root.appendChild(S.comp);

			// ======================================================== TYPE
			const text = h('div', { class: 'fill' });
			root.appendChild(text);

			// Wordmark: Inter 400 26px, #ece6de at 85%, letter-spacing .62em (splash style).
			S.word = h('div', { class: 'abs nowrap', text: 'ORCHESTRA', style: { left: '0', top: '0', font: "400 26px/1 'Inter', sans-serif", letterSpacing: '.62em', color: 'rgba(236,230,222,.85)' } });
			text.appendChild(S.word);
			// The trailing .62em after the last letter is not ink: centre without it.
			placeCentred(S.word, WORD_BASE, undefined, 26 * .62);

			// Kicker: Noto Sans JP 500 22px #877c72.
			S.kick = h('div', { class: 'abs nowrap', text: 'VS Code ベースの AI IDE', style: { left: '0', top: '0', font: '500 22px/1 var(--jp)', color: '#877c72', letterSpacing: '.02em' } });
			text.appendChild(S.kick);
			placeCentred(S.kick, KICK_BASE);

			// Tagline: Noto Sans JP 900 104px #f7f2ea; 'Orchestra' in Inter 800 with the brand red
			// gradient, continuous across the word even though each letter is its own span.
			S.tag = h('div', { class: 'abs nowrap', style: { left: '0', top: '0', font: `900 ${TAG_SIZE}px/1 var(--jp)`, color: '#f7f2ea', letterSpacing: '-.005em', textShadow: SHADOW } });
			const parts = TAGLINE.map((s, i) => {
				const span = h('span', i === 1 ? { style: { font: `800 ${TAG_EN_SIZE}px/1 var(--en)`, letterSpacing: '-.01em' } } : {});
				S.tag.appendChild(span);
				return u.chars(span, s);
			});
			text.appendChild(S.tag);
			const red = parts[1];
			const x0 = red[0].offsetLeft;
			const redW = red[red.length - 1].offsetLeft + red[red.length - 1].offsetWidth - x0;
			for (const ch of red) {
				u.css(ch, { backgroundImage: RED_GRAD, backgroundSize: `${redW}px 100%`, backgroundPosition: `${x0 - ch.offsetLeft}px 0`, backgroundRepeat: 'no-repeat', webkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', textShadow: 'none' });
			}
			// The full-width 「、」 leaves ~70px of air before the Latin 'O' at this size, which reads
			// as a stray space; take back .12em so the pause stays but the line holds together.
			parts[0][parts[0].length - 1].style.marginRight = '-.12em';
			S.tagChars = parts.flat();
			placeCentred(S.tag, TAG_BASE, sideBlanks('指', '。', `900 ${TAG_SIZE}px 'Noto Sans JP'`));

			// CTA: Noto Sans JP 700 44px #ece6de.
			S.cta = h('div', { class: 'abs nowrap', text: 'まずは、ひとこと。', style: { left: '0', top: '0', font: '700 44px/1 var(--jp)', color: '#ece6de', textShadow: SHADOW } });
			text.appendChild(S.cta);
			placeCentred(S.cta, CTA_BASE, sideBlanks('ま', '。', "700 44px 'Noto Sans JP'"));

			// Footnote: Noto Sans JP 500 20px #877c72, centred, baseline 975.
			const foot = c.footnote('※ 画面はイメージです。マルチエージェント実行には Division へのログインと、Orchestra Plus プランまたはクレジットが必要です。', { x: CX, baseline: FOOT_BASE, align: 'center' });
			S.foot = foot.el;
			root.appendChild(S.foot);
			// Centre on the ink: the trailing 「。」 is mostly blank.
			const fb = sideBlanks('※', '。', "500 20px 'Noto Sans JP'");
			S.foot.style.left = px(Math.round(parseFloat(S.foot.style.left) + (fb.trail - fb.lead) / 2));

			// ======================================================== FADE TO BLACK
			S.black = h('div', { class: 'fill', style: { background: '#000' } });
			root.appendChild(S.black);

			// base.css gives every .ch span will-change, which caches each glyph raster and can
			// make a frame depend on what was drawn before. Rasterize from scratch every frame.
			for (const ch of root.querySelectorAll('.ch')) { ch.style.willChange = 'auto'; }
			return S;
		},

		draw(t, S) {
			// ---------------------------------------------------- background: lift out of 08's noir
			S.bg.draw(t);
			u.tf(S.dim, { o: .7 * (1 - u.p(t, 0, LIFT_DUR, ease.inOutSine)) });
			const haloK = u.p(t, 0, HALO_DUR, ease.inOutSine);
			u.tf(S.halo, { o: haloK });
			u.tf(S.white, { o: haloK });

			// ---------------------------------------------------- pickup: the mark draws, launches, glints
			const reveal = u.p(t, 0, DRAW_DUR, ease.outCubic);
			const launch = u.p(t, LAUNCH, LAUNCH_DUR, ease.outBack);
			S.mark.draw(t, { reveal, launch, light: 1 });
			S.lights.forEach((l, i) => {
				const k = u.p(t, SHEEN[i], SHEEN_DUR, ease.inOutSine);
				// dash start s runs -14 -> 100 (pathLength 100): enters at the tail, leaves past the arrowhead
				l.setAttribute('stroke-dashoffset', (-(-14 + 114 * k)).toFixed(2));
				l.setAttribute('opacity', k > 0 && k < 1 ? '.85' : '0');
			});
			// chord: the mark dissolves into the halo. (At reveal 0, c.mark's '100 100' dash leaves a
			// zero-length dash exactly at the path end, which round caps paint as two dots: hide it.)
			const dk = u.p(t, CHORD, DISSOLVE_DUR);
			u.tf(S.markWrap, { s: u.lerp(1, 1.1, ease.outCubic(dk)), o: reveal > 0 ? 1 - ease.inOutSine(dk) : 0, blur: 6 * ease.inQuad(dk) });

			// ---------------------------------------------------- chord: bloom + ring logo settle
			const atk = u.p(t, HIT, BLOOM_ATTACK, ease.outCubic);
			const dec = u.p(t, HIT + BLOOM_ATTACK, BLOOM_DUR - BLOOM_ATTACK, ease.outCubic);
			const bloomO = t < HIT ? 0 : atk < 1 ? .8 * atk : u.lerp(.8, .3, dec);
			u.tf(S.bloom, { s: u.lerp(.85, 1, ease.outCubic(u.p(t, HIT, BLOOM_DUR))), o: bloomO });
			const lk = ease.outBack(u.p(t, HIT, LOGO_DUR));
			u.tf(S.logo, { s: u.lerp(.85, 1, lk), r: u.lerp(-24, 0, lk) + spin(t), o: .95 * u.p(t, HIT, LOGO_FADE, ease.outCubic) });

			// ---------------------------------------------------- type (fixed layout)
			c.reveal(S.tagChars, t, TAG);
			const wk = u.p(t, WORD, WORD_DUR, ease.outCubic);
			u.tf(S.word, { o: wk, blur: 10 * (1 - wk) });
			u.tf(S.foot, { o: u.p(t, FOOT, FOOT_DUR, ease.inOutSine) });
			const kk = u.p(t, KICK, KICK_DUR, ease.outCubic);
			u.tf(S.kick, { y: 8 * (1 - kk), o: kk });
			u.rise(S.cta, t, CTA, CTA_DUR, 16);

			// ---------------------------------------------------- composer silhouette
			const ck = u.p(t, COMP, COMP_DUR, ease.outCubic);
			u.tf(S.comp, { y: 10 * (1 - ck), o: ck });
			const ring = .15 + .15 * (.5 + .5 * Math.sin(Math.PI * t));
			S.comp.style.boxShadow = `0 0 0 3px rgba(198,167,105,${ring.toFixed(3)}), 0 8px 24px -8px rgba(0,0,0,.4)`;
			S.caret.style.visibility = Math.floor(2 * t) % 2 === 0 ? 'visible' : 'hidden';

			// ---------------------------------------------------- fade to black with the music
			u.tf(S.black, { o: u.p(t, FADE, FADE_DUR, ease.inOutSine) });
		},
	});
})();
