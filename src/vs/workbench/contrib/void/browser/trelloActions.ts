/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// Trello 連携のコマンドパレット項目。
// 設定は Settings の Trello タブから行う想定で、ここは日常的に叩く操作だけを出す。

import { localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IVoidSettingsService } from '../common/voidSettingsService.js';
import {
	VOID_TRELLO_CANCEL_ACTION_ID,
	VOID_TRELLO_RUN_NOW_ACTION_ID,
	VOID_TRELLO_TOGGLE_AUTO_RUN_ACTION_ID,
} from './actionIDs.js';
import { ITrelloService } from './trelloService.js';


registerAction2(class extends Action2 {
	constructor() {
		super({
			id: VOID_TRELLO_RUN_NOW_ACTION_ID,
			title: localize2('voidTrelloRunNow', 'Trello: Run Pending Cards Now'),
			f1: true,
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		await accessor.get(ITrelloService).runNow();
	}
});


registerAction2(class extends Action2 {
	constructor() {
		super({
			id: VOID_TRELLO_TOGGLE_AUTO_RUN_ACTION_ID,
			title: localize2('voidTrelloToggleAutoRun', 'Trello: Toggle Automatic Card Execution'),
			f1: true,
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const trelloService = accessor.get(ITrelloService);
		const settingsService = accessor.get(IVoidSettingsService);
		const notificationService = accessor.get(INotificationService);

		const wasEnabled = settingsService.state.globalSettings.trello.autoRunEnabled;
		await trelloService.setAutoRunEnabled(!wasEnabled);

		const isEnabled = settingsService.state.globalSettings.trello.autoRunEnabled;
		if (isEnabled !== wasEnabled) {
			notificationService.notify({
				severity: Severity.Info,
				message: isEnabled ? 'Trello の自動実行を開始しました。' : 'Trello の自動実行を停止しました。',
			});
		}
	}
});


registerAction2(class extends Action2 {
	constructor() {
		super({
			id: VOID_TRELLO_CANCEL_ACTION_ID,
			title: localize2('voidTrelloCancel', 'Trello: Cancel Running Card'),
			f1: true,
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		await accessor.get(ITrelloService).cancelCurrent();
	}
});
