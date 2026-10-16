/*--------------------------------------------------------------------------------------
 *  Copyright 2026 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { DivisionSessionManager, type DivisionSessionStore } from '../../common/divisionSession.js';

const makeSession = (accessToken: string, refreshToken: string, userId = 'user-1'): Session => ({
	access_token: accessToken, refresh_token: refreshToken, token_type: 'bearer', expires_in: 3600,
	user: { id: userId, aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '' },
});

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>(r => resolve = r);
	return { promise, resolve };
}

function fixture() {
	let session = makeSession('saved-access', 'saved-refresh');
	const listeners = new Set<() => void>();
	const writes: Record<string, unknown>[] = [];
	const state = { globalSettings: {
		isLoggedIn: true, divisionUserId: 'user-1', divisionAccessToken: session.access_token,
		divisionRefreshToken: session.refresh_token, divisionApiKey: session.access_token, divisionUserApiKey: 'ak_keep',
	} } as unknown as DivisionSessionStore['state'];
	const store: DivisionSessionStore = {
		state, waitForInitState: Promise.resolve(),
		onDidChangeState: listener => { listeners.add(listener); return { dispose: () => listeners.delete(listener) }; },
		async setGlobalSettings(update) {
			Object.assign(state.globalSettings, update);
			writes.push(update);
			for (const listener of listeners) listener();
		},
	};
	let authListener: ((event: AuthChangeEvent, session: Session | null) => void) | undefined;
	let setCalls = 0;
	let refreshCalls = 0;
	let starts = 0;
	let stops = 0;
	const result = (value: Session | null, error: Error | null = null) => ({ data: { session: value, user: value?.user ?? null }, error });
	const controls = {
		setSession: async (tokens: { access_token: string; refresh_token: string }) => result(makeSession(tokens.access_token, tokens.refresh_token)),
		refreshSession: async (_tokens: { refresh_token: string }) => result(makeSession('new-access', 'new-refresh')),
	};
	const auth = {
		onAuthStateChange(listener: typeof authListener) { authListener = listener; return { data: { subscription: { unsubscribe: () => { authListener = undefined; } } } }; },
		async setSession(tokens: { access_token: string; refresh_token: string }) {
			setCalls++;
			const res = await controls.setSession(tokens);
			if (res.data.session) { session = res.data.session; authListener?.('SIGNED_IN', session); }
			return res;
		},
		async getSession() { return result(session); },
		async refreshSession(tokens: { refresh_token: string }) {
			refreshCalls++;
			const res = await controls.refreshSession(tokens);
			if (res.data.session) { session = res.data.session; authListener?.('TOKEN_REFRESHED', session); }
			return res;
		},
		async startAutoRefresh() { starts++; },
		async stopAutoRefresh() { stops++; },
	};
	const manager = new DivisionSessionManager(store, auth as unknown as ConstructorParameters<typeof DivisionSessionManager>[1]);
	return {
		manager, store, controls, writes, result,
		get setCalls() { return setCalls; }, get refreshCalls() { return refreshCalls; },
		get starts() { return starts; }, get stops() { return stops; },
		emit(value: Session) { session = value; authListener?.('TOKEN_REFRESHED', session); },
	};
}

suite('Division session persistence', () => {
	let f: ReturnType<typeof fixture>;
	setup(() => f = fixture());
	teardown(() => f.manager.dispose());

	test('restores an expired saved session once for concurrent requests and saves both rotated tokens', async () => {
		const gate = deferred<ReturnType<typeof f.result>>();
		f.controls.setSession = async tokens => {
			assert.strictEqual(tokens.refresh_token, 'saved-refresh');
			return gate.promise;
		};
		const requests = [f.manager.ensureSession(), f.manager.ensureSession(), f.manager.ensureSession()];
		gate.resolve(f.result(makeSession('rotated-access', 'rotated-refresh')));
		const sessions = await Promise.all(requests);
		assert.strictEqual(f.setCalls, 1);
		assert.ok(sessions.every(session => session?.access_token === 'rotated-access'));
		assert.deepStrictEqual(f.writes, [{ divisionAccessToken: 'rotated-access', divisionRefreshToken: 'rotated-refresh', divisionApiKey: 'rotated-access' }]);
		assert.strictEqual(f.store.state.globalSettings.divisionUserApiKey, 'ak_keep');
	});

	test('persists SDK background refreshes for project and chat requests', async () => {
		await f.manager.ensureSession();
		f.emit(makeSession('background-access', 'background-refresh'));
		assert.strictEqual(f.store.state.globalSettings.divisionAccessToken, 'background-access');
		assert.strictEqual(f.store.state.globalSettings.divisionRefreshToken, 'background-refresh');
		assert.strictEqual(f.store.state.globalSettings.divisionApiKey, 'background-access');
	});

	test('preserves an explicitly configured API key when the JWT rotates', async () => {
		await f.manager.ensureSession();
		await f.store.setGlobalSettings({ divisionApiKey: 'ak_explicit' });
		f.emit(makeSession('background-access', 'background-refresh'));
		assert.strictEqual(f.store.state.globalSettings.divisionApiKey, 'ak_explicit');
	});

	test('forces one refresh for a rejected JWT, including concurrent 401 responses', async () => {
		await f.manager.ensureSession();
		const sessions = await Promise.all([f.manager.ensureSession('saved-access'), f.manager.ensureSession('saved-access')]);
		assert.strictEqual(f.refreshCalls, 1);
		assert.ok(sessions.every(session => session?.access_token === 'new-access'));
		assert.strictEqual(f.store.state.globalSettings.divisionRefreshToken, 'new-refresh');
	});

	test('uses an already rotated JWT without refreshing it again after a late 401', async () => {
		await f.manager.ensureSession('saved-access');
		await f.manager.ensureSession('saved-access');
		assert.strictEqual(f.refreshCalls, 1);
	});

	test('does not return a stale cached session when restore fails', async () => {
		f.controls.setSession = async () => f.result(null, new Error('invalid refresh token'));
		assert.strictEqual(await f.manager.ensureSession(), null);
		assert.strictEqual(f.starts, 0);
		assert.strictEqual(f.store.state.globalSettings.divisionAccessToken, 'saved-access');
		assert.strictEqual(f.store.state.globalSettings.isLoggedIn, true);
	});

	test('keeps encrypted credentials on a temporary network failure', async () => {
		f.controls.setSession = async () => { throw new Error('offline'); };
		assert.strictEqual(await f.manager.ensureSession(), null);
		assert.strictEqual(f.store.state.globalSettings.divisionRefreshToken, 'saved-refresh');
		assert.deepStrictEqual(f.writes, []);
	});

	test('does not resurrect a session after sign-out during refresh', async () => {
		await f.manager.ensureSession();
		const gate = deferred<ReturnType<typeof f.result>>();
		f.controls.refreshSession = async () => gate.promise;
		const pending = f.manager.ensureSession('saved-access');
		await Promise.resolve();
		await f.store.setGlobalSettings({ isLoggedIn: false, divisionAccessToken: '', divisionRefreshToken: '', divisionApiKey: '' });
		gate.resolve(f.result(makeSession('too-late-access', 'too-late-refresh')));
		assert.strictEqual(await pending, null);
		assert.strictEqual(f.store.state.globalSettings.divisionAccessToken, '');
		assert.ok(f.stops > 0);
	});

	test('does not overwrite a new login for the same user with an old refresh result', async () => {
		await f.manager.ensureSession();
		const gate = deferred<ReturnType<typeof f.result>>();
		f.controls.refreshSession = async () => gate.promise;
		const pending = f.manager.ensureSession('saved-access');
		await Promise.resolve();
		await f.store.setGlobalSettings({ divisionAccessToken: 'login-access', divisionRefreshToken: 'login-refresh', divisionApiKey: 'login-access' });
		gate.resolve(f.result(makeSession('old-session-access', 'old-session-refresh')));
		assert.strictEqual(await pending, null);
		assert.strictEqual(f.store.state.globalSettings.divisionAccessToken, 'login-access');
		assert.strictEqual(f.store.state.globalSettings.divisionRefreshToken, 'login-refresh');
	});

	test('ignores refreshed credentials belonging to another account', async () => {
		await f.manager.ensureSession();
		f.emit(makeSession('other-access', 'other-refresh', 'other-user'));
		assert.strictEqual(f.store.state.globalSettings.divisionAccessToken, 'saved-access');
	});
});
