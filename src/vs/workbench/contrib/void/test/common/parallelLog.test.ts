/*--------------------------------------------------------------------------------------
 *  Copyright 2026 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { decodeParallelLog, encodeParallelLog, formatLaneElapsed, laneElapsedMs, laneLastLine, PARALLEL_LOG_LANG, ParallelLogBuilder, parallelLogCounts } from '../../common/parallelLog.js';

const bodyOf = (block: string): string => {
	const m = new RegExp('```' + PARALLEL_LOG_LANG + '\\n([\\s\\S]*?)\\n```').exec(block);
	assert.ok(m, 'fenced block');
	return m![1];
};

suite('Parallel log', () => {

	test('lanes are written, finished and round-trip through the fenced block', () => {
		const b = new ParallelLogBuilder([
			{ key: 2, step: 3, role: 'researcher', title: '市場調査' },
			{ key: 3, step: 4, role: 'designer', title: '画面' },
		]);
		assert.deepStrictEqual(b.keys, [2, 3]);
		assert.strictEqual(b.firstKey, 2);
		b.start(2, 1000);
		b.start(3, 1100);
		b.append(2, '# 結果\n```js\nconst a = 1;\n```\n');
		b.append(3, 'デザイン');
		b.finish(3, 'done', 5100);

		const log = decodeParallelLog(bodyOf(b.render()))!;
		assert.strictEqual(log.lanes.length, 2);
		assert.strictEqual(log.lanes[0].text, '# 結果\n```js\nconst a = 1;\n```\n');
		assert.strictEqual(log.lanes[0].status, 'running');
		assert.strictEqual(log.lanes[1].status, 'done');
		assert.strictEqual(laneElapsedMs(log.lanes[1], 9999), 4000);
		assert.strictEqual(laneElapsedMs(log.lanes[0], 3000), 2000);
		assert.deepStrictEqual(parallelLogCounts(log), { total: 2, done: 1, error: 0, active: 1 });
	});

	test('the branch output never closes the block: the JSON stays on one line', () => {
		const b = new ParallelLogBuilder([{ key: 0, step: 1, role: 'coder', title: '' }, { key: 1, step: 2, role: 'writer', title: '' }]);
		b.append(0, '```\n```\n```');
		const lines = b.render().trim().split('\n');
		assert.strictEqual(lines.length, 3);
		assert.strictEqual(lines[0], '```' + PARALLEL_LOG_LANG);
		assert.strictEqual(lines[2], '```');
	});

	test('seal marks branches still going as stopped', () => {
		const b = new ParallelLogBuilder([{ key: 0, step: 1, role: 'a', title: '' }, { key: 1, step: 2, role: 'b', title: '' }, { key: 2, step: 3, role: 'c', title: '' }]);
		b.start(0, 0); b.finish(0, 'error', 10);
		b.start(1, 0);
		b.seal(50);
		const lanes = b.snapshot().lanes;
		assert.deepStrictEqual(lanes.map(l => l.status), ['error', 'stopped', 'stopped']);
		assert.strictEqual(lanes[1].endedAt, 50);
		assert.strictEqual(lanes[2].endedAt, undefined);
	});

	test('decode is tolerant and rejects what is not a parallel log', () => {
		assert.strictEqual(decodeParallelLog('{"lanes":'), null);
		assert.strictEqual(decodeParallelLog('{"lanes":[]}'), null);
		assert.strictEqual(decodeParallelLog('[1,2]'), null);
		const log = decodeParallelLog(bodyOf(encodeParallelLog({ v: 1, lanes: [{ key: 5, step: 2, role: 'x', title: 't', status: 'bogus' as never, text: 'hi' }] })))!;
		assert.strictEqual(log.lanes[0].status, 'waiting');
	});

	test('elapsed and preview', () => {
		assert.strictEqual(formatLaneElapsed(8_400), '8s');
		assert.strictEqual(formatLaneElapsed(65_000), '1m 05s');
		assert.strictEqual(formatLaneElapsed(3_720_000), '1h 02m');
		assert.strictEqual(laneLastLine({ key: 0, step: 1, role: 'r', title: '', status: 'running', text: '## 見出し\n\n**本文** の途中\n\n' }), '本文 の途中');
	});
});
