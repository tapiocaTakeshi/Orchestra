/*--------------------------------------------------------------------------------------
 *  Copyright 2025 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// Orchestra Design (extensions/orchestra-design) と IDE 本体の橋渡し。
//
// Design モードの「AI Designer」は、IDE の Division ロール割り当てで design ロールに
// 選ばれているモデルに、ログイン済みの Division 認証情報で依頼する。拡張機能からは
// IDE の設定 (IVoidSettingsService) を直接読めないので、ここで内部コマンドとして公開する。
//
// 返す認証情報は Division API にだけ送る。拡張機能側も endpoint 以外へは送らない。

import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IVoidSettingsService } from '../common/voidSettingsService.js';

export const DESIGN_GET_DESIGNER_CONNECTION_COMMAND_ID = 'orchestra.design.getDesignerConnection';

export type DesignerConnection = {
	/** Division API のベース URL (例: https://api.division.he-ro.io) */
	endpoint: string;
	/** 優先順に並べた認証トークン。401 のときは次を試す。 */
	tokens: string[];
	/** design ロールに割り当てられたモデル ID。未設定なら undefined。 */
	model: string | undefined;
	/** 推論エフォート (未設定ならモデル既定) */
	effort: string | undefined;
	projectId: string | undefined;
};

CommandsRegistry.registerCommand(DESIGN_GET_DESIGNER_CONNECTION_COMMAND_ID, (accessor: ServicesAccessor): DesignerConnection => {
	const settings = accessor.get(IVoidSettingsService).state;
	const g = settings.globalSettings;
	const endpoint = (settings.settingsOfProvider.divisionAPI?.endpoint || 'https://api.division.he-ro.io').replace(/\/+$/, '');
	const tokens = [...new Set([g.divisionUserApiKey, g.divisionAccessToken, g.divisionApiKey].filter((t): t is string => !!t))];
	const assignment = (g.roleAssignments ?? []).find(a => a.role === 'design');
	return {
		endpoint,
		tokens,
		model: assignment?.model || undefined,
		effort: assignment?.effort || undefined,
		projectId: g.divisionProjectId || undefined,
	};
});
