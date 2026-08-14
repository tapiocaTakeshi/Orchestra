/*--------------------------------------------------------------------------------------
 *  Copyright 2025 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { IVoidSettingsService } from '../common/voidSettingsService.js';
import { IRemoteControlService } from '../common/remoteControlService.js';

export const REMOTE_CONTROL_TOGGLE_ACTION_ID = 'void.remoteControl.toggle';
export const REMOTE_CONTROL_SHOW_INFO_ACTION_ID = 'void.remoteControl.showConnectionInfo';
export const REMOTE_CONTROL_REGENERATE_TOKEN_ACTION_ID = 'void.remoteControl.regenerateToken';

/** トークンをログや通知にそのまま出さないよう、先頭数文字だけ見せる。 */
const maskToken = (token: string): string => (token.length <= 8 ? '••••••••' : `${token.slice(0, 4)}…${token.slice(-4)}`);

registerAction2(class extends Action2 {
	constructor() {
		super({
			f1: true,
			id: REMOTE_CONTROL_TOGGLE_ACTION_ID,
			title: localize2('remoteControlToggle', 'Remote Control: Toggle Mobile Server'),
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const settingsService = accessor.get(IVoidSettingsService);
		const remoteControlService = accessor.get(IRemoteControlService);
		const notifService = accessor.get(INotificationService);

		const next = !settingsService.state.globalSettings.remoteControlEnabled;
		settingsService.setGlobalSetting('remoteControlEnabled', next);

		const state = await remoteControlService.configure({
			enabled: next,
			token: settingsService.state.globalSettings.remoteControlToken,
		});
		if (state.kind === 'running' && state.info.token !== settingsService.state.globalSettings.remoteControlToken) {
			settingsService.setGlobalSetting('remoteControlToken', state.info.token);
		}

		if (!next) {
			notifService.notify({ severity: Severity.Info, message: 'Orchestra: リモートコントロールを無効にしました。' });
			return;
		}
		if (state.kind === 'running') {
			notifService.notify({ severity: Severity.Info, message: `Orchestra: リモートコントロールを有効にしました (${state.info.url})。` });
		} else if (state.kind === 'error') {
			notifService.notify({ severity: Severity.Error, message: `Orchestra: リモートコントロールを開始できませんでした — ${state.message}` });
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			f1: true,
			id: REMOTE_CONTROL_SHOW_INFO_ACTION_ID,
			title: localize2('remoteControlShowInfo', 'Remote Control: Show Connection Info'),
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const remoteControlService = accessor.get(IRemoteControlService);
		const clipboardService = accessor.get(IClipboardService);
		const notifService = accessor.get(INotificationService);

		const state = await remoteControlService.getState();

		if (state.kind !== 'running') {
			const detail = state.kind === 'error' ? ` (${state.message})` : '';
			notifService.notify({
				severity: Severity.Warning,
				message: `Orchestra: リモートコントロールは有効になっていません${detail}。設定 → リモートコントロールで有効にしてください。`,
			});
			return;
		}

		const { url, token } = state.info;
		notifService.notify({
			severity: Severity.Info,
			message: `Orchestra リモートコントロール: ${url} (トークン: ${maskToken(token)})`,
			sticky: true,
			actions: {
				primary: [{
					id: 'orchestra.remoteControl.copyPairingLink',
					enabled: true,
					label: 'ペアリングリンクをコピー',
					tooltip: '',
					class: undefined,
					run: () => { void clipboardService.writeText(state.info.pairingLink); },
				}],
			},
		});
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			f1: true,
			id: REMOTE_CONTROL_REGENERATE_TOKEN_ACTION_ID,
			title: localize2('remoteControlRegenerateToken', 'Remote Control: Regenerate Token'),
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const settingsService = accessor.get(IVoidSettingsService);
		const remoteControlService = accessor.get(IRemoteControlService);
		const notifService = accessor.get(INotificationService);

		const { token, state } = await remoteControlService.regenerateToken();
		settingsService.setGlobalSetting('remoteControlToken', token);

		if (state.kind === 'running') {
			notifService.notify({ severity: Severity.Info, message: `Orchestra: トークンを再発行しました。以前のペアリングリンクは無効になります (${state.info.url})。` });
		} else {
			notifService.notify({ severity: Severity.Info, message: 'Orchestra: トークンを再発行しました。' });
		}
	}
});
