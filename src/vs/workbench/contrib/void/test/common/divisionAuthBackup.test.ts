/*--------------------------------------------------------------------------------------
 *  Copyright 2026 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { parseDivisionAuthBackup, serializeDivisionAuthBackup } from '../../common/divisionAuthBackup.js';
import { defaultGlobalSettings, type GlobalSettings } from '../../common/voidSettingsTypes.js';

const loggedIn: GlobalSettings = {
	...defaultGlobalSettings,
	isLoggedIn: true,
	divisionUserId: 'user-1',
	divisionUserEmail: 'a@example.com',
	divisionAccessToken: 'access',
	divisionRefreshToken: 'refresh',
	divisionApiKey: 'access',
	divisionUserApiKey: 'ak_1',
};

suite('Division auth backup', () => {
	test('round-trips only the login fields', () => {
		const raw = serializeDivisionAuthBackup(loggedIn);
		assert.ok(raw);
		assert.deepStrictEqual(parseDivisionAuthBackup(raw), {
			isLoggedIn: true,
			divisionUserId: 'user-1',
			divisionUserEmail: 'a@example.com',
			divisionAccessToken: 'access',
			divisionRefreshToken: 'refresh',
			divisionApiKey: 'access',
			divisionUserApiKey: 'ak_1',
		});
	});

	test('keeps no backup after sign-out', () => {
		assert.strictEqual(serializeDivisionAuthBackup({ ...loggedIn, isLoggedIn: false }), undefined);
		assert.strictEqual(serializeDivisionAuthBackup({ ...loggedIn, divisionAccessToken: '', divisionRefreshToken: '' }), undefined);
	});

	test('ignores broken or incomplete backups', () => {
		assert.strictEqual(parseDivisionAuthBackup(undefined), undefined);
		assert.strictEqual(parseDivisionAuthBackup('{not json'), undefined);
		assert.strictEqual(parseDivisionAuthBackup('null'), undefined);
		assert.strictEqual(parseDivisionAuthBackup(JSON.stringify({ isLoggedIn: true, divisionUserId: '' })), undefined);
	});
});
