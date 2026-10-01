ORC.register({
	id: '00-test-a', duration: 2,
	build(root) {
		const { u } = ORC;
		const title = u.h('div', { class: 'abs t-hero', style: { left: '200px', top: '400px' }, text: 'オーケストラ Orchestra' });
		const logo = ORC.c.logo(300); logo.style.left = '1400px'; logo.style.top = '300px';
		root.append(title, logo);
		return { title, logo };
	},
	draw(t, s) { const { u } = ORC; u.rise(s.title, t, 0, .8); u.tf(s.logo, { r: t * 90, s: u.range(t, 0, 1, .5, 1, ORC.ease.outBack) }); },
});
