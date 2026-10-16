/*--------------------------------------------------------------------------------------
 *  Copyright 2026 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { IVoidSettingsService } from './voidSettingsService.js';

export type DivisionSessionStore = Pick<IVoidSettingsService, 'state' | 'waitForInitState' | 'onDidChangeState' | 'setGlobalSettings'>;
type SessionAuth = Pick<SupabaseClient['auth'], 'setSession' | 'getSession' | 'refreshSession' | 'onAuthStateChange' | 'startAutoRefresh' | 'stopAutoRefresh'>;
type Credentials = { userId: string; accessToken: string; refreshToken: string };

/** Owns token rotation for the renderer, including all React bundles. */
export class DivisionSessionManager {
	private _pending: Promise<Session | null> | undefined;
	private _origin: Credentials | undefined;
	private _restoredKey = '';
	private _settingsKey = '';
	private _disposed = false;
	private readonly _subscriptions: { dispose(): void }[];

	constructor(readonly settings: DivisionSessionStore, private readonly _auth: SessionAuth) {
		const { data } = _auth.onAuthStateChange((event, session) => {
			if ((event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') && session) {
				// Never await another Auth method inside this callback: Auth holds its lock.
				void this._save(session, this._origin).catch(() => console.warn('[DivisionSession] Could not save the refreshed session'));
			}
		});
		this._subscriptions = [
			{ dispose: () => data.subscription.unsubscribe() },
			settings.onDidChangeState(() => this._sync()),
		];
		void settings.waitForInitState.then(() => this._sync());
	}

	private _credentials(): Credentials | null {
		const g = this.settings.state.globalSettings;
		return g.isLoggedIn && g.divisionUserId
			? { userId: g.divisionUserId, accessToken: g.divisionAccessToken, refreshToken: g.divisionRefreshToken }
			: null;
	}

	private _key(credentials: Credentials | null): string {
		return credentials ? JSON.stringify(credentials) : '';
	}

	private _sync(): void {
		if (this._disposed) return;
		const credentials = this._credentials();
		const key = this._key(credentials);
		if (key === this._settingsKey) return;
		this._settingsKey = key;
		if (credentials) {
			void this.ensureSession();
		} else {
			this._restoredKey = '';
			void this._auth.stopAutoRefresh();
		}
	}

	private async _save(session: Session, origin?: Credentials): Promise<boolean> {
		const current = this._credentials();
		if (this._disposed || !current || session.user.id !== current.userId) return false;
		const updated = { userId: session.user.id, accessToken: session.access_token, refreshToken: session.refresh_token };
		// A refresh may finish after sign-out or a new login. It must not replace it.
		if (origin && this._key(current) !== this._key(origin) && this._key(current) !== this._key(updated)) return false;
		this._restoredKey = this._key(updated);
		if (this._key(current) === this._restoredKey) return true;
		const g = this.settings.state.globalSettings;
		await this.settings.setGlobalSettings({
			divisionAccessToken: session.access_token,
			divisionRefreshToken: session.refresh_token,
			// The chat API uses this compatibility alias. Preserve an explicit API key.
			...(!g.divisionApiKey || g.divisionApiKey === current.accessToken ? { divisionApiKey: session.access_token } : {}),
		});
		return true;
	}

	async ensureSession(rejectedAccessToken?: string): Promise<Session | null> {
		if (this._disposed) return null;
		if (this._pending) {
			const originKey = this._key(this._origin ?? this._credentials());
			const session = await this._pending;
			if (!session && originKey !== this._key(this._credentials())) return this.ensureSession(rejectedAccessToken);
			// A normal restore may have been in flight when a caller received a 401.
			return rejectedAccessToken && session?.access_token === rejectedAccessToken
				? this.ensureSession(rejectedAccessToken) : session;
		}
		this._pending = this._restore(rejectedAccessToken);
		try {
			return await this._pending;
		} finally {
			this._pending = undefined;
		}
	}

	private async _restore(rejectedAccessToken?: string): Promise<Session | null> {
		await this.settings.waitForInitState;
		const credentials = this._credentials();
		if (this._disposed || !credentials || (!credentials.accessToken && !credentials.refreshToken)) return null;
		this._origin = credentials;
		try {
			let result = this._key(credentials) === this._restoredKey
				? await this._auth.getSession()
				: credentials.accessToken
					? await this._auth.setSession({ access_token: credentials.accessToken, refresh_token: credentials.refreshToken })
					: await this._auth.refreshSession({ refresh_token: credentials.refreshToken });
			if (result.error || !result.data.session) return null;
			if (rejectedAccessToken && result.data.session.access_token === rejectedAccessToken) {
				result = await this._auth.refreshSession({ refresh_token: result.data.session.refresh_token });
			}
			if (result.error || !result.data.session || !await this._save(result.data.session, credentials)) return null;
			if (this._disposed || this._key(this._credentials()) !== this._restoredKey) return null;
			await this._auth.startAutoRefresh();
			return result.data.session;
		} catch {
			// Offline/auth failures must not erase saved credentials or local projects.
			return null;
		} finally {
			this._origin = undefined;
		}
	}

	dispose(): void {
		this._disposed = true;
		for (const subscription of this._subscriptions) subscription.dispose();
		void this._auth.stopAutoRefresh();
	}
}

type DivisionSessionRuntime = { client?: SupabaseClient; manager?: DivisionSessionManager };
const shared = globalThis as typeof globalThis & { __orchestraDivisionSession?: DivisionSessionRuntime };
const runtime = shared.__orchestraDivisionSession ??= {};

// Keep the SDK inside a tsup bundle: the workbench cannot resolve bare browser imports.
export const getSharedDivisionSupabase = (create: () => SupabaseClient): SupabaseClient => runtime.client ??= create();

export function bindDivisionSession(settings: DivisionSessionStore, client: SupabaseClient): DivisionSessionManager {
	if (runtime.manager?.settings === settings) return runtime.manager;
	runtime.manager?.dispose();
	return runtime.manager = new DivisionSessionManager(settings, client.auth);
}

export async function ensureDivisionSession(settings: DivisionSessionStore, rejectedAccessToken?: string): Promise<Session | null> {
	return runtime.manager?.settings === settings ? runtime.manager.ensureSession(rejectedAccessToken) : null;
}

/** Billing/React callers must restore from the current store, not stale props. */
export async function restoreDivisionAuthSession(accessToken: string, refreshToken: string): Promise<Session | null> {
	if (runtime.manager) return runtime.manager.ensureSession();
	if (!runtime.client) return null;
	const { data, error } = await runtime.client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
	return error ? null : data.session;
}
