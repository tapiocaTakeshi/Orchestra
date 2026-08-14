/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// 内蔵カンバンのコマンドパレット項目。
// ボードの開閉は kanbanPane.ts 側で登録している。ここはボードを開かずに叩ける操作だけを出す。

import { localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IVoidSettingsService } from '../common/voidSettingsService.js';
import { columnWithRole } from '../common/kanbanServiceTypes.js';
import {
	VOID_KANBAN_ADD_TASK_ACTION_ID,
	VOID_KANBAN_CANCEL_ACTION_ID,
	VOID_KANBAN_RUN_NEXT_ACTION_ID,
	VOID_KANBAN_TOGGLE_AUTO_RUN_ACTION_ID,
	VOID_OPEN_KANBAN_ACTION_ID,
} from './actionIDs.js';
import { IKanbanService } from './kanbanService.js';


// ボードを開かずにタスクを積めると、作業中に思いついたことをその場で流し込める。
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: VOID_KANBAN_ADD_TASK_ACTION_ID,
			title: localize2('voidKanbanAddTask', 'Kanban: Add Task'),
			f1: true,
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const kanbanService = accessor.get(IKanbanService);
		const quickInputService = accessor.get(IQuickInputService);
		const commandService = accessor.get(ICommandService);

		const title = await quickInputService.input({
			prompt: localize2('voidKanbanAddTaskPrompt', 'Task title').value,
			placeHolder: localize2('voidKanbanAddTaskPlaceholder', 'What needs to be done?').value,
		});
		if (!title?.trim()) return;

		const columnId = columnWithRole(kanbanService.state.board, 'todo')?.id;
		kanbanService.createTask({ title, columnId });

		await commandService.executeCommand(VOID_OPEN_KANBAN_ACTION_ID);
	}
});


registerAction2(class extends Action2 {
	constructor() {
		super({
			id: VOID_KANBAN_RUN_NEXT_ACTION_ID,
			title: localize2('voidKanbanRunNext', 'Kanban: Run Pending Tasks Now'),
			f1: true,
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		await accessor.get(IKanbanService).runNow();
	}
});


registerAction2(class extends Action2 {
	constructor() {
		super({
			id: VOID_KANBAN_TOGGLE_AUTO_RUN_ACTION_ID,
			title: localize2('voidKanbanToggleAutoRun', 'Kanban: Toggle Automatic Task Execution'),
			f1: true,
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const kanbanService = accessor.get(IKanbanService);
		const settingsService = accessor.get(IVoidSettingsService);
		const notificationService = accessor.get(INotificationService);

		const wasEnabled = settingsService.state.globalSettings.kanban.autoRunEnabled;
		await kanbanService.setAutoRunEnabled(!wasEnabled);

		const isEnabled = settingsService.state.globalSettings.kanban.autoRunEnabled;
		if (isEnabled !== wasEnabled) {
			notificationService.notify({
				severity: Severity.Info,
				message: isEnabled ? 'カンバンの自動実行を開始しました。' : 'カンバンの自動実行を停止しました。',
			});
		}
	}
});


registerAction2(class extends Action2 {
	constructor() {
		super({
			id: VOID_KANBAN_CANCEL_ACTION_ID,
			title: localize2('voidKanbanCancel', 'Kanban: Cancel Running Task'),
			f1: true,
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		await accessor.get(IKanbanService).cancelCurrent();
	}
});
