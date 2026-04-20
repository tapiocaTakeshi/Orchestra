/*--------------------------------------------------------------------------------------
 *  Division Editor Actions
 *  Adds "Sync from Supabase" button to the editor title bar when .division/agents.json is open,
 *  similar to Flutter's "pub get" button on pubspec.yaml.
 *--------------------------------------------------------------------------------------*/

import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { localize2 } from '../../../../nls.js';
import { ResourceContextKey } from '../../../common/contextkeys.js';
import { IDivisionProjectService } from './divisionProjectService.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';

const DIVISION_PULL_REMOTE_ACTION_ID = 'division.pullFromRemote';
const DIVISION_PUSH_REMOTE_ACTION_ID = 'division.pushToRemote';

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: DIVISION_PULL_REMOTE_ACTION_ID,
			title: localize2('divisionPullRemote', 'Division: Pull from Remote'),
			icon: Codicon.cloudDownload,
			f1: true,
			menu: [
				{
					id: MenuId.EditorTitle,
					when: ContextKeyExpr.equals(ResourceContextKey.Filename.key, 'agents.json'),
					group: 'navigation',
					order: 1,
				},
			],
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const divisionProjectService = accessor.get(IDivisionProjectService);
		const notificationService = accessor.get(INotificationService);

		const result = await divisionProjectService.fetchFromSupabase();
		if (result.success) {
			notificationService.info(result.message);
		} else {
			notificationService.error(result.message);
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: DIVISION_PUSH_REMOTE_ACTION_ID,
			title: localize2('divisionPushRemote', 'Division: Push to Remote'),
			icon: Codicon.cloudUpload,
			f1: true,
			menu: [
				{
					id: MenuId.EditorTitle,
					when: ContextKeyExpr.equals(ResourceContextKey.Filename.key, 'agents.json'),
					group: 'navigation',
					order: 2,
				},
			],
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const divisionProjectService = accessor.get(IDivisionProjectService);
		const notificationService = accessor.get(INotificationService);

		const result = await divisionProjectService.pushToSupabase();
		if (result.success) {
			notificationService.info(result.message);
		} else {
			notificationService.error(result.message);
		}
	}
});
