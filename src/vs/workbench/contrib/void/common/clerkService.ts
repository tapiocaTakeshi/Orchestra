/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';

export const IClerkService = createDecorator<IClerkService>('ClerkService');

export interface IClerkService {
	readonly _serviceBrand: undefined;
}

export class ClerkService extends Disposable implements IClerkService {
	_serviceBrand: undefined;
}

registerSingleton(IClerkService, ClerkService, InstantiationType.Eager);
