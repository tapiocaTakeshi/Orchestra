/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { IVoidSettingsService } from './voidSettingsService.js';
import { ClerkUser } from './voidSettingsTypes.js';

export const IClerkService = createDecorator<IClerkService>('ClerkService');

export interface IClerkService {
	readonly _serviceBrand: undefined;
	setAuthState(user: ClerkUser | null, sessionId: string | null): Promise<void>;
}

export class ClerkService extends Disposable implements IClerkService {
	_serviceBrand: undefined;

	constructor(
		@IVoidSettingsService private readonly _voidSettingsService: IVoidSettingsService,
	) {
		super();
	}

	async setAuthState(user: ClerkUser | null, sessionId: string | null): Promise<void> {
		await this._voidSettingsService.setGlobalSetting('clerkUser', user);
		await this._voidSettingsService.setGlobalSetting('clerkSessionId', sessionId);
	}

}

registerSingleton(IClerkService, ClerkService, InstantiationType.Eager);
