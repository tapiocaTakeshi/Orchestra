// Shared building blocks so every scene draws Orchestra the same way.
(() => {
	const { u } = ORC;
	ORC.c = {
		logo(size = 200) {
			return u.h('img', { src: 'assets/orchestra-logo.png', class: 'abs', style: { width: `${size}px`, height: `${size}px` } });
		},
	};
})();
