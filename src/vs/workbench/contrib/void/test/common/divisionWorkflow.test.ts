/*--------------------------------------------------------------------------------------
 *  Copyright 2026 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { DivisionWorkflow, insertAfter, layoutWorkflow, normalizeWorkflow, removeNode, setApprovalAfter, tasksToWorkflow, workflowErrors, workflowSteps, workflowToTasks } from '../../common/divisionWorkflow.js';

// The leader's draft: start → research → writer → approval → (design | coder) → reviewer → end
const draft = (): DivisionWorkflow => normalizeWorkflow({
	version: 1, enabled: true,
	nodes: [
		{ id: 'start', type: 'start', position: { x: 0, y: 0 }, data: {} },
		{ id: 's1', type: 'role', position: { x: 0, y: 0 }, data: { role: 'research', title: '調査' } },
		{ id: 's2', type: 'role', position: { x: 0, y: 0 }, data: { role: 'writer', title: '仕様', systemPrompt: '短く' } },
		{ id: 'a2', type: 'approval', position: { x: 0, y: 0 }, data: {} },
		{ id: 's3', type: 'role', position: { x: 0, y: -1 }, data: { role: 'design' } },
		{ id: 's4', type: 'role', position: { x: 0, y: 1 }, data: { role: 'coder' } },
		{ id: 's5', type: 'role', position: { x: 0, y: 0 }, data: { role: 'reviewer' } },
		{ id: 'end', type: 'end', position: { x: 0, y: 0 }, data: {} },
	],
	edges: [['start', 's1'], ['s1', 's2'], ['s2', 'a2'], ['a2', 's3'], ['a2', 's4'], ['s3', 's5'], ['s4', 's5'], ['s5', 'end']].map(([source, target], i) => ({ id: `e${i}`, source, target })),
})!;

suite('Division workflow', () => {

	test('layout and the steps as flow tasks (dependencies, approvals, system prompts)', () => {
		const w = layoutWorkflow(draft());
		const pos = Object.fromEntries(w.nodes.map(n => [n.id, n.position]));
		assert.ok(pos.s3.x === pos.s4.x && pos.s3.y < pos.s4.y && pos.s5.x > pos.s4.x);
		const tasks = workflowToTasks(w);
		assert.deepStrictEqual(tasks.map(t => [t.taskId, t.role, t.dependsOn, t.approval]), [
			['wf-1', 'research', [], false],
			['wf-2', 'writer', ['wf-1'], true],
			['wf-3', 'design', ['wf-2'], false],
			['wf-4', 'coder', ['wf-2'], false],
			['wf-5', 'reviewer', ['wf-3', 'wf-4'], false],
		]);
		assert.strictEqual(tasks[1].systemPrompt, '短く');
	});

	test('the leader\'s task list as a workflow (written even without approval mode)', () => {
		const w = tasksToWorkflow([
			{ taskId: 'a', role: 'research', title: '調査', input: '調べる' },
			{ taskId: 'b', role: 'writer', title: '仕様', dependsOn: ['a'], approval: true },
			{ taskId: 'c', role: 'design', dependsOn: ['b'] },
			{ taskId: 'd', role: 'coder', dependsOn: ['b', 'missing'] },
		]);
		assert.deepStrictEqual(workflowErrors(w), []);
		assert.deepStrictEqual(workflowSteps(w).map(s => [s.role, s.dependsOn, s.approval]), [
			['research', [], false],
			['writer', [0], true],
			['design', [1], false],
			['coder', [1], false],
		]);
		assert.strictEqual(workflowSteps(w)[0].instruction, '調べる');
		assert.deepStrictEqual(normalizeWorkflow(JSON.parse(JSON.stringify(w))), w);
	});

	test('editing: approval off/on, insert after a step, remove a step', () => {
		let w = setApprovalAfter(layoutWorkflow(draft()), 's2', false);
		assert.ok(!w.nodes.some(n => n.type === 'approval'));
		w = insertAfter(w, 's4', { id: 'new', type: 'role', data: { role: 'coder', title: 'テスト' } });
		w = removeNode(w, 's3');
		// no redundant writer → reviewer edge: writer already reaches it through the coder steps
		assert.deepStrictEqual(workflowToTasks(w).map(t => [t.role, t.dependsOn]), [['research', []], ['writer', ['wf-1']], ['coder', ['wf-2']], ['coder', ['wf-3']], ['reviewer', ['wf-4']]]);
		assert.deepStrictEqual(workflowErrors(w), []);
		w = setApprovalAfter(w, 'new', true);
		assert.strictEqual(workflowSteps(w)[3].approval, true);
	});

	test('errors: a cycle, a missing start', () => {
		const w = draft();
		assert.ok(workflowErrors({ nodes: w.nodes, edges: [...w.edges, { id: 'c', source: 's5', target: 's1' }] }).some(e => e.includes('ループ')));
		assert.ok(workflowErrors({ nodes: w.nodes.filter(n => n.type !== 'start'), edges: w.edges }).length > 0);
		assert.strictEqual(normalizeWorkflow('not json'), null);
	});
});
