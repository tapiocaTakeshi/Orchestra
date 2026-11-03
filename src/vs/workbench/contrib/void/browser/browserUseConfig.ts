/*--------------------------------------------------------------------------------------
 *  Copyright 2025 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// browser_use (Vercel の agent-browser でブラウザを操作するエージェント用ツール) の設定と、
// agent-browser 用の Chrome をダウンロードするコマンド。

import * as nls from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IProgressService, ProgressLocation } from '../../../../platform/progress/common/progress.js';
import { ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { BROWSER_USE_CHANNEL_NAME, BrowserUseOptions, IBrowserUseMainService } from '../common/browserUseTypes.js';

export const BROWSER_USE_HEADLESS_SETTING = 'orchestra.browserUse.headless';
export const BROWSER_USE_EXECUTABLE_SETTING = 'orchestra.browserUse.executablePath';
export const BROWSER_USE_LOCAL_ONLY_SETTING = 'orchestra.browserUse.localhostOnly';
export const BROWSER_USE_AGENT_BROWSER_SETTING = 'orchestra.browserUse.agentBrowserPath';

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
			description: nls.localize('orchestraBrowserUse.executablePath', "browser_use で使う Chrome / Chromium の実行ファイル。空なら agent-browser が自動で探します (Chrome for Testing・インストール済みの Chrome / Brave など)。見つからないときはコマンド「Orchestra: Install Browser for Agent」でダウンロードできます。"),
		},
		[BROWSER_USE_LOCAL_ONLY_SETTING]: {
			type: 'boolean',
			default: false,
			description: nls.localize('orchestraBrowserUse.localhostOnly', "有効にすると、browser_use は localhost / 127.0.0.1 のページだけを開きます (開発中のアプリの確認用)。ページが読み込む外部のスクリプトや画像も agent-browser が止めます。"),
		},
		[BROWSER_USE_AGENT_BROWSER_SETTING]: {
			type: 'string',
			default: '',
			description: nls.localize('orchestraBrowserUse.agentBrowserPath', "agent-browser (Vercel) の実行ファイル。空なら Orchestra に同梱のものを使います。別のバージョンを使うとき (npm i -g agent-browser など) だけ設定してください。"),
		},
	}
});

export function browserUseOptions(configurationService: IConfigurationService): BrowserUseOptions {
	return {
		headless: !!configurationService.getValue<boolean>(BROWSER_USE_HEADLESS_SETTING),
		executablePath: String(configurationService.getValue<string>(BROWSER_USE_EXECUTABLE_SETTING) ?? ''),
		localhostOnly: !!configurationService.getValue<boolean>(BROWSER_USE_LOCAL_ONLY_SETTING),
		agentBrowserPath: String(configurationService.getValue<string>(BROWSER_USE_AGENT_BROWSER_SETTING) ?? ''),
	};
}

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'orchestra.browserUse.install',
			title: nls.localize2('orchestraBrowserUse.install', "Install Browser for Agent (agent-browser)"),
			category: nls.localize2('orchestraCategory', "Orchestra"),
			f1: true,
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const notifications = accessor.get(INotificationService);
		const progress = accessor.get(IProgressService);
		const options = browserUseOptions(accessor.get(IConfigurationService));
		const service = ProxyChannel.toService<IBrowserUseMainService>(accessor.get(IMainProcessService).getChannel(BROWSER_USE_CHANNEL_NAME));
		try {
			const summary = await progress.withProgress(
				{ location: ProgressLocation.Notification, title: nls.localize('orchestraBrowserUse.installing', "エージェント用のブラウザ (Chrome for Testing) をダウンロードしています…") },
				() => service.install(options),
			);
			notifications.notify({ severity: Severity.Info, message: nls.localize('orchestraBrowserUse.installed', "エージェント用のブラウザを準備しました。\n{0}", summary) });
		} catch (e) {
			notifications.notify({ severity: Severity.Error, message: nls.localize('orchestraBrowserUse.installFailed', "ブラウザのダウンロードに失敗しました: {0}", e instanceof Error ? e.message : String(e)) });
		}
	}
});

export function isLocalBrowserUrl(url: string): boolean {
	try {
		const host = new URL(url).hostname.replace(/^\[|\]$/g, '');
		return host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '::1' || host.endsWith('.localhost');
	} catch {
		return false;
	}
}
