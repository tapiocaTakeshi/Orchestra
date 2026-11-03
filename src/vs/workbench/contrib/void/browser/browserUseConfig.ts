/*--------------------------------------------------------------------------------------
 *  Copyright 2025 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// browser_use (Playwright でブラウザを操作するエージェント用ツール) の設定。

import * as nls from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { BrowserUseOptions } from '../common/browserUseTypes.js';

export const BROWSER_USE_HEADLESS_SETTING = 'orchestra.browserUse.headless';
export const BROWSER_USE_EXECUTABLE_SETTING = 'orchestra.browserUse.executablePath';
export const BROWSER_USE_LOCAL_ONLY_SETTING = 'orchestra.browserUse.localhostOnly';

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'orchestraBrowserUse',
	order: 101,
	title: nls.localize('orchestraBrowserUse.configTitle', "Orchestra Browser Use"),
	type: 'object',
	properties: {
		[BROWSER_USE_HEADLESS_SETTING]: {
			type: 'boolean',
			default: false,
			description: nls.localize('orchestraBrowserUse.headless', "エージェントの browser_use ツールでブラウザのウィンドウを表示せずに動かします。オフのときは操作の様子がウィンドウで見えます。"),
		},
		[BROWSER_USE_EXECUTABLE_SETTING]: {
			type: 'string',
			default: '',
			description: nls.localize('orchestraBrowserUse.executablePath', "browser_use で使う Chromium / Chrome / Edge の実行ファイル。空なら Playwright の Chromium、Chrome、Edge の順に自動で探します。"),
		},
		[BROWSER_USE_LOCAL_ONLY_SETTING]: {
			type: 'boolean',
			default: false,
			description: nls.localize('orchestraBrowserUse.localhostOnly', "有効にすると、browser_use は localhost / 127.0.0.1 のページだけを開きます (開発中のアプリの確認用)。"),
		},
	}
});

export function browserUseOptions(configurationService: IConfigurationService): BrowserUseOptions {
	return {
		headless: !!configurationService.getValue<boolean>(BROWSER_USE_HEADLESS_SETTING),
		executablePath: String(configurationService.getValue<string>(BROWSER_USE_EXECUTABLE_SETTING) ?? ''),
	};
}

export function isLocalBrowserUrl(url: string): boolean {
	try {
		const host = new URL(url).hostname.replace(/^\[|\]$/g, '');
		return host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '::1' || host.endsWith('.localhost');
	} catch {
		return false;
	}
}
