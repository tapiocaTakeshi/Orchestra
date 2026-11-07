/*--------------------------------------------------------------------------------------
 *  Copyright 2026 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { readSettingsWithFallback } from '../../common/settingsBackup.js';

const decryptOk = async (v: string) => v.replace(/^enc:/, '');
const decryptFails = async (): Promise<string> => { throw new Error('keychain key is gone'); };

suite('Settings backup', () => {
	test('prefers the encrypted settings', async () => {
		const r = await readSettingsWithFallback<{ a: number }>('enc:{"a":1}', '{"a":2}', decryptOk);
		assert.deepStrictEqual(r, { kind: 'encrypted', state: { a: 1 } });
	});

	test('uses the backup when decryption fails (e.g. after an update)', async () => {
		const r = await readSettingsWithFallback<{ a: number }>('enc:{"a":1}', '{"a":2}', decryptFails);
		assert.deepStrictEqual(r, { kind: 'backup', state: { a: 2 } });
	});

	test('uses the backup when there are no encrypted settings', async () => {
		const r = await readSettingsWithFallback<{ a: number }>(undefined, '{"a":2}', decryptFails);
		assert.deepStrictEqual(r, { kind: 'backup', state: { a: 2 } });
	});

	test('returns none when nothing usable is stored', async () => {
		assert.deepStrictEqual(await readSettingsWithFallback(undefined, undefined, decryptOk), { kind: 'none' });
		assert.deepStrictEqual(await readSettingsWithFallback('enc:x', '{broken', decryptFails), { kind: 'none' });
		assert.deepStrictEqual(await readSettingsWithFallback(undefined, 'null', decryptOk), { kind: 'none' });
	});
});
