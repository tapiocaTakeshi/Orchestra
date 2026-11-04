/*--------------------------------------------------------------------------------------
 *  Copyright 2026 He-ro Corporation. All rights reserved.
 *--------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { appendAppDocumentVersion, ensureAppWorkflowTasks, isAppCreationRequest } from '../../common/appCreationFlow.js';

suite('Persistent app creation flow', () => {
	test('only app production requests trigger the workflow', () => {
		assert.strictEqual(isAppCreationRequest('新しいメモアプリを制作して'), true);
		assert.strictEqual(isAppCreationRequest('Build a web app for notes'), true);
		assert.strictEqual(isAppCreationRequest('この論文を要約して'), false);
		assert.strictEqual(isAppCreationRequest('既存コードのバグを修正して'), false);
	});

	test('fills missing stages and orders research, writing, design, coder', () => {
		const tasks = ensureAppWorkflowTasks([{ taskId: 'coder-task', role: 'coder', title: 'アプリ実装', dependsOn: [] }]);
		assert.strictEqual(tasks.length, 4);
		const research = tasks.find(t => t.role === 'research');
		const writer = tasks.find(t => t.role === 'writing');
		const designer = tasks.find(t => t.role === 'design');
		const coder = tasks.find(t => t.role === 'coder');
		assert.ok(research && writer && designer && coder);
		assert.ok(writer.dependsOn?.includes(research.taskId));
		assert.ok(designer.dependsOn?.includes(writer.taskId));
		assert.ok(coder.dependsOn?.includes(designer.taskId));
	});

	test('preserves existing research/search tasks and their identities', () => {
		const tasks = ensureAppWorkflowTasks([
			{ taskId: 'search1', role: 'searcher', title: '情報収集' },
			{ taskId: 'research1', role: 'researcher', title: '論文確認' },
			{ taskId: 'writer1', role: 'writer', title: '仕様書' },
			{ taskId: 'designer1', role: 'designer', title: '画面設計' },
			{ taskId: 'coder1', role: 'coder', title: '実装' },
		]);
		assert.strictEqual(tasks.length, 5);
		assert.ok(tasks.find(t => t.taskId === 'writer1')?.dependsOn?.includes('search1'));
		assert.ok(tasks.find(t => t.taskId === 'writer1')?.dependsOn?.includes('research1'));
		assert.ok(tasks.find(t => t.taskId === 'coder1')?.dependsOn?.includes('designer1'));
	});

	test('does not erase a paper/specification on subsequent updates', () => {
		const original = '# 仕様書\n\n## 機能 A\n機能 A を保持します。';
		const next = appendAppDocumentVersion(original, '## 機能 B\n追加する機能。', '2026-11-04T00:00:00Z');
		assert.ok(next.includes('機能 A を保持します。'));
		assert.ok(next.includes('機能 B'));
		assert.ok(next.includes('2026-11-04T00:00:00Z'));
	});
});
