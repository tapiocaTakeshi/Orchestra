/*--------------------------------------------------------------------------------------
 *  Copyright 2026 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { changeEntry, driftCheckInput, driftReport, goalDocument, goalInstructionBlock, hasDocumentsToCheck, latestChangeNote, lineChanges, parseDriftVerdict } from '../../common/divisionGoal.js';

suite('Division goal (drift prevention)', () => {

	test('goal.md is written from the first request and says AI does not change it', () => {
		const g = goalDocument('家計簿アプリを作って', new Date('2026-11-07T00:00:00Z'));
		assert.match(g, /^# 目的/);
		assert.match(g, /AI は変更しません/);
		assert.match(g, /## 最初の依頼 \(2026-11-07\)\n\n家計簿アプリを作って\n$/);
		assert.match(goalInstructionBlock(g), /^## 目的 \(\.division\/goal\.md\) — 最上位の基準[\s\S]*変更しないでください[\s\S]*家計簿アプリを作って/);
		assert.strictEqual(goalInstructionBlock('  '), '');
	});

	test('lineChanges counts added and removed lines', () => {
		assert.deepStrictEqual(lineChanges('a\nb\n', 'a\nc\nd\n'), { added: 2, removed: 1 });
		assert.deepStrictEqual(lineChanges('', 'x'), { added: 1, removed: 0 });
		assert.deepStrictEqual(lineChanges('same', 'same'), { added: 0, removed: 0 });
	});

	test('latestChangeNote reads the last line of the document\'s change log', () => {
		assert.strictEqual(latestChangeNote('# 仕様書\n\n## 変更履歴\n- 2026-11-01: 初版\n- 2026-11-07: 入力画面を追加。理由: 目的の「3 タップ以内」\n'), '2026-11-07: 入力画面を追加。理由: 目的の「3 タップ以内」');
		assert.strictEqual(latestChangeNote('## 変更履歴\n| 日付 | 内容 |\n|---|---|\n| 2026-11-07 | 画面を追加 |\n\n## 付録\n- x'), '2026-11-07 — 画面を追加');
		assert.strictEqual(latestChangeNote('# 論文\n\n本文'), '');
	});

	test('changeEntry records what changed, why and the diff', () => {
		const e = changeEntry({ label: '仕様書 (.division/specification.md)', role: 'writer', title: '仕様書を更新', request: '入力を速く', why: '入力画面を追加', added: 7, removed: 2, snapshot: '.division/history/specification/s1', date: new Date('2026-11-07T01:02:03.456Z') });
		assert.match(e, /## 2026-11-07T01:02:03Z — 仕様書 \(\.division\/specification\.md\)/);
		assert.match(e, /- 担当: \[writer\] 仕様書を更新/);
		assert.match(e, /- 何を・なぜ: 入力画面を追加/);
		assert.match(e, /- 差分: \+7 \/ -2 行 \(前の版: \.division\/history\/specification\/s1\/\)/);
	});

	test('drift check: input, verdict and report', () => {
		assert.strictEqual(hasDocumentsToCheck({ goal: 'G' }), false);
		assert.strictEqual(hasDocumentsToCheck({ goal: 'G', spec: 'S' }), true);
		assert.strictEqual(hasDocumentsToCheck({ goal: '', spec: 'S' }), false);
		const input = driftCheckInput({ goal: 'G', spec: 'S' }, 'req');
		assert.match(input, /^## 目的 \(\.division\/goal\.md\)\nG\n\n## 今回の依頼\nreq\n\n## 仕様書 \(\.division\/specification\.md\)\nS$/);
		const v = parseDriftVerdict('```json\n{"drift": true, "issues": [{"document": "仕様書", "finding": "SNS が中心", "goal": "家計簿"}, {"finding": ""}], "reason": "r"}\n```');
		assert.deepStrictEqual(v, { drift: true, issues: [{ document: '仕様書', finding: 'SNS が中心', goal: '家計簿' }], notes: '', reason: 'r' });
		assert.strictEqual(parseDriftVerdict('わかりません').drift, null);
		assert.strictEqual(parseDriftVerdict('{"drift": false}').drift, false);
		const report = driftReport(v, '実装', new Date('2026-11-07T00:00:00Z'));
		assert.match(report, /^# ドリフト検証: 実装を止めました/);
		assert.match(report, /1\. \*\*仕様書\*\*: SNS が中心\n {3}- 目的との関係: 家計簿/);
		assert.match(report, /\*\*承認\*\*/);
	});
});
