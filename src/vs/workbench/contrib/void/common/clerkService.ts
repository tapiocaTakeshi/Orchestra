/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { IVoidSettingsService } from './voidSettingsService.js';
import { IVoidUpdateService } from './voidUpdateService.js';
import { ClerkUser } from './voidSettingsTypes.js';

export const IClerkService = createDecorator<IClerkService>('ClerkService');

export interface IClerkService {
	readonly _serviceBrand: undefined;
	setAuthState(user: ClerkUser | null, sessionId: string | null): Promise<void>;
	fetchLatestUser(): Promise<{ user: ClerkUser; sessionId: string } | null>;
}

export class ClerkService extends Disposable implements IClerkService {
	_serviceBrand: undefined;

	constructor(
		@IVoidSettingsService private readonly _voidSettingsService: IVoidSettingsService,
		@IVoidUpdateService private readonly _voidUpdateService: IVoidUpdateService,
	) {
		super();
	}

	async setAuthState(user: ClerkUser | null, sessionId: string | null): Promise<void> {
		await this._voidSettingsService.setGlobalSetting('clerkUser', user);
		await this._voidSettingsService.setGlobalSetting('clerkSessionId', sessionId);
	}

	async fetchLatestUser(): Promise<{ user: ClerkUser; sessionId: string } | null> {
		// Call main process via IVoidUpdateService IPC proxy (bypass CORS)
		const session = await this._voidUpdateService.fetchClerkActiveSession();
		if (!session) {
			return null;
		}

		const userData = await this._voidUpdateService.fetchClerkUserById(session.userId);
		if (!userData) {
			return null;
		}

		const clerkUser: ClerkUser = {
			id: userData.id,
			fullName: `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || null,
			primaryEmailAddress: userData.emailAddress,
			imageUrl: userData.imageUrl,
			username: userData.username || userData.emailAddress?.split('@')[0] || null,
		};

		// Save to settings
		await this.setAuthState(clerkUser, session.sessionId);

		return { user: clerkUser, sessionId: session.sessionId };
	}
}

registerSingleton(IClerkService, ClerkService, InstantiationType.Eager);
