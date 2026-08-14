/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// リモートコントロールのコマンドパレット項目。
// 設定パネルを開かなくても、その場でサーバの ON/OFF と接続情報の確認ができるようにする。

import { localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { IVoidSettingsService } from '../common/voidSettingsService.js';
import { encodePairingUri } from '../common/remoteControlTypes.js';
import {
	VOID_REMOTE_CONTROL_REGENERATE_TOKEN_ACTION_ID,
	VOID_REMOTE_CONTROL_SHOW_INFO_ACTION_ID,
	VOID_REMOTE_CONTROL_TOGGLE_ACTION_ID,
} from './actionIDs.js';
import { IRemoteControlService } from './remoteControlService.js';


registerAction2(class extends Action2 {
	constructor() {
		super({
			id: VOID_REMOTE_CONTROL_TOGGLE_ACTION_ID,
			title: localize2('voidRemoteControlToggle', 'Remote Control: Toggle Mobile Server'),
			f1: true,
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const remoteControlService = accessor.get(IRemoteControlService);
		const settingsService = accessor.get(IVoidSettingsService);
		const notificationService = accessor.get(INotificationService);

		const wasEnabled = settingsService.state.globalSettings.remoteControl.enabled;
		await remoteControlService.setEnabled(!wasEnabled);

		const status = remoteControlService.status;
		if (!wasEnabled && status.running) {
			notificationService.notify({
				severity: Severity.Info,
				message: `リモートコントロールを開始しました: ${status.addresses.join(' / ')}`,
			});
		} else if (!wasEnabled && !status.running) {
			notificationService.notify({
				severity: Severity.Error,
				message: `リモートコントロールを開始できませんでした: ${status.error ?? '不明なエラー'}`,
			});
		} else {
			notificationService.notify({ severity: Severity.Info, message: 'リモートコントロールを停止しました。' });
		}
	}
});


registerAction2(class extends Action2 {
	constructor() {
		super({
			id: VOID_REMOTE_CONTROL_SHOW_INFO_ACTION_ID,
			title: localize2('voidRemoteControlShowInfo', 'Remote Control: Show Connection Info'),
			f1: true,
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const remoteControlService = accessor.get(IRemoteControlService);
		const notificationService = accessor.get(INotificationService);
		const clipboardService = accessor.get(IClipboardService);

		const payload = remoteControlService.getPairingPayload();
		if (!payload) {
			notificationService.notify({
				severity: Severity.Warning,
				message: 'リモートコントロールが動いていません。設定パネルか「Remote Control: Toggle Mobile Server」で有効にしてください。',
			});
			return;
		}

		notificationService.notify({
			severity: Severity.Info,
			message: `Orchestra-Mobile 接続先: ${payload.url}  /  トークン: ${payload.token}`,
			actions: {
				primary: [{
					id: 'void.remoteControl.copyPairing',
					label: 'ペアリング URL をコピー',
					tooltip: '',
					class: undefined,
					enabled: true,
					run: async () => { await clipboardService.writeText(encodePairingUri(payload)); },
				}],
			},
		});
	}
});


registerAction2(class extends Action2 {
	constructor() {
		super({
			id: VOID_REMOTE_CONTROL_REGENERATE_TOKEN_ACTION_ID,
			title: localize2('voidRemoteControlRegenerateToken', 'Remote Control: Regenerate Token'),
			f1: true,
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const remoteControlService = accessor.get(IRemoteControlService);
		const notificationService = accessor.get(INotificationService);

		await remoteControlService.regenerateToken();
		notificationService.notify({
			severity: Severity.Info,
			message: 'トークンを再生成しました。ペアリング済みの端末は繋ぎ直しが必要です。',
		});
	}
});
