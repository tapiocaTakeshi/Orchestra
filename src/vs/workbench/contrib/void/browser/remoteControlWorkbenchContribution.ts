/*--------------------------------------------------------------------------------------
 *  Copyright 2025 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// 起動時に設定を読み、リモートコントロールサーバーの起動/停止・IDE情報の反映・
// Division アカウントへのセッション登録 (ハートビート) の面倒をみる。

import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IVoidSettingsService } from '../common/voidSettingsService.js';
import { IRemoteControlService, IRemoteControlUiService } from '../common/remoteControlService.js';
import { RemoteControlServerState } from '../common/remoteControlTypes.js';
import { RemoteSessionHeartbeat } from './remoteControlSessionSync.js';

class RemoteControlWorkbenchContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.void.remoteControl';

	private readonly _heartbeat = new RemoteSessionHeartbeat();

	// 直近に configure() へ渡した値。設定が変わるたびに毎回 configure しないためのガード。
	private _lastConfiguredEnabled: boolean | undefined;
	private _lastConfiguredToken: string | undefined;

	constructor(
		@IVoidSettingsService private readonly _settingsService: IVoidSettingsService,
		@IRemoteControlService private readonly _remoteControlService: IRemoteControlUiService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
	) {
		super();
		this._register(toDisposable(() => this._heartbeat.stop()));

		this._register(this._workspaceContextService.onDidChangeWorkspaceFolders(() => this._pushIdeInfo()));
		this._register(this._settingsService.onDidChangeState(() => { void this._syncWithSettings(); }));
		this._register(this._remoteControlService.onDidChangeState((state) => this._syncHeartbeat(state)));

		void this._initialize();
	}

	private async _initialize(): Promise<void> {
		try {
			await this._settingsService.waitForInitState;

			// この端末を Supabase 上で識別する安定 ID。無ければここで一度だけ生成して永続化する。
			if (!this._settingsService.state.globalSettings.remoteControlDeviceId) {
				this._settingsService.setGlobalSetting('remoteControlDeviceId', generateUuid());
			}

			this._pushIdeInfo();
			await this._syncWithSettings();
		} catch (e) {
			console.error('[remoteControl] failed to initialize:', e);
		}
	}

	private _pushIdeInfo(): void {
		const folders = this._workspaceContextService.getWorkspace().folders;
		void this._remoteControlService.setIdeInfo({
			workspaceName: folders[0]?.name ?? '',
			workspaceFolders: folders.map(f => f.name),
			uiLanguage: this._settingsService.state.globalSettings.uiLanguage,
		});
	}

	private async _syncWithSettings(): Promise<void> {
		const settings = this._settingsService.state.globalSettings;
		if (settings.remoteControlEnabled === this._lastConfiguredEnabled && settings.remoteControlToken === this._lastConfiguredToken) {
			// enabled/token は変わっていない (isLoggedIn などが変わっただけ) → ハートビートの要否だけ見直す
			this._syncHeartbeat(this._remoteControlService.state);
			return;
		}
		this._lastConfiguredEnabled = settings.remoteControlEnabled;
		this._lastConfiguredToken = settings.remoteControlToken;

		const state = await this._remoteControlService.configure({ enabled: settings.remoteControlEnabled, token: settings.remoteControlToken });

		// 初回有効化などでトークンが新規生成された場合は設定側にも書き戻す (次回起動時も同じトークンを使うため)。
		if (state.kind === 'running' && state.info.token && state.info.token !== settings.remoteControlToken) {
			this._lastConfiguredToken = state.info.token;
			this._settingsService.setGlobalSetting('remoteControlToken', state.info.token);
		}

		this._syncHeartbeat(state);
	}

	private _syncHeartbeat(state: RemoteControlServerState): void {
		const settings = this._settingsService.state.globalSettings;
		const deviceId = settings.remoteControlDeviceId;
		const canHeartbeat = state.kind === 'running'
			&& settings.remoteControlEnabled
			&& settings.isLoggedIn
			&& !!settings.divisionUserId
			&& !!settings.divisionAccessToken
			&& !!deviceId;

		if (canHeartbeat && state.kind === 'running') {
			this._heartbeat.start({
				deviceId,
				userId: settings.divisionUserId,
				accessToken: settings.divisionAccessToken,
				deviceLabel: state.info.workspaceName || 'Orchestra',
				info: state.info,
			});
		} else {
			this._heartbeat.stop();
		}
	}
}

registerWorkbenchContribution2(RemoteControlWorkbenchContribution.ID, RemoteControlWorkbenchContribution, WorkbenchPhase.BlockRestore);
