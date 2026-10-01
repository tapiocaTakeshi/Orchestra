ORC.register({
	id: '00-test-b', duration: 2, transition: 'zoom',
	build(root) { root.style.background = '#300'; const el = ORC.u.h('div', { class: 'abs t-h1 accent-grad', style: { left: '300px', top: '450px' }, text: 'マルチエージェント' }); root.append(el); return { el }; },
	draw(t, s) { ORC.u.tf(s.el, { x: t * 100 }); },
});
