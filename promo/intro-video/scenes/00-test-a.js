ORC.register({
	id: '00-test-a', duration: 3,
	build(root) {
		const { u, c } = ORC;
		const bg = c.backdrop(); root.appendChild(bg.el);
		const m = c.mark({ width: 900, ambient: true }); m.el.style.position = 'absolute'; m.el.style.left = '510px'; m.el.style.top = '300px';
		root.appendChild(m.el);
		const hl = c.headline('AI チームを、指揮する。', { cls: 't-h1', style: { left: '0', right: '0', top: '760px', textAlign: 'center' } });
		root.appendChild(hl.el);
		return { bg, m, hl };
	},
	draw(t, s) { const { u, c } = ORC; s.bg.draw(t); s.m.draw(t, { reveal: u.p(t, 0, 1.2, ORC.ease.inOutCubic), launch: u.p(t, .9, .5, ORC.ease.outExpo), light: u.p(t, 1.4, .6) }); c.reveal(s.hl.chars, t, .8); },
});
