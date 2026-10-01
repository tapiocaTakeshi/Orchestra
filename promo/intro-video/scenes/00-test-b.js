ORC.register({
	id: '00-test-b', duration: 3, transition: 'zoom',
	build(root) {
		const { u, c } = ORC;
		const bg = c.backdrop(); root.appendChild(bg.el);
		const box = c.zoomBox(1.45, { left: '60px', top: '40px' });
		const win = c.ideWindow({ width: 1240, height: 700, running: true });
		win.el.style.position = 'relative';
		const hm = c.home({ highlight: 1 }); win.editor.appendChild(hm.el);
		win.thread.appendChild(c.bubble('シンプルな TODO アプリを作って動かして。npm test が通るまで仕上げて'));
		const goal = u.h('div', { class: 'o-md', html: '<h4>🎯 目標</h4><b>TODO アプリが動き、npm test がすべて通る</b><div style="margin-top:4px">達成条件:</div><ol><li>タスクの追加・完了・削除ができる</li><li>npm test が成功する</li></ol><blockquote>🔁 Reviewer が達成と判定するまで、最大 5 ラウンド繰り返します。</blockquote>' });
		win.thread.appendChild(goal);
		const cards = [c.card({ n: 1, title: '要件と構成を決める', role: 'プランナー' }), c.card({ n: 2, title: 'TODO アプリを実装する', role: 'コーダー', body: 'src/App.tsx を作成しました<br>src/todo.test.ts を作成しました', open: true }), c.card({ n: 3, title: '最終レビュー', role: 'レビュー' })];
		cards.forEach(k => win.thread.appendChild(k.el));
		const ind = c.indicator('実装中'); win.thread.appendChild(ind.el);
		const comp = c.composer(); win.chatFoot.appendChild(comp.el);
		box.appendChild(win.el); root.appendChild(box);
		return { bg, cards, ind, comp };
	},
	draw(t, s) { s.bg.draw(t); s.cards[0].draw(t, 'done'); s.cards[1].draw(t, 'running', 1); s.cards[2].draw(t, 'done'); s.ind.draw(t); s.comp.setText('', false, 'running'); },
});
