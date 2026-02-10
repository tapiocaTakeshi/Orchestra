/*--------------------------------------------------------------------------------------
 *  Division Project Service
 *  Manages .division/agents.json per workspace for project-local agent role assignments.
 *--------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { AgentRole, defaultRoleAssignments, ProviderName, RoleAssignment } from '../common/voidSettingsTypes.js';
import { IVoidSettingsService } from '../common/voidSettingsService.js';


// --- Division Project types ---

export type DivisionProjectConfig = {
	name: string;
	agents: RoleAssignment[];
};

const defaultDivisionProjectConfig = (): DivisionProjectConfig => ({
	name: 'Default Division Project',
	agents: [...defaultRoleAssignments],
});


// --- Service interface ---

export const IDivisionProjectService = createDecorator<IDivisionProjectService>('DivisionProjectService');

export interface IDivisionProjectService {
	readonly _serviceBrand: undefined;
	readonly onDidChangeProject: Event<void>;
	readonly projectConfig: DivisionProjectConfig | null;
	readonly projectConfigUri: URI | null;

	/** Re-read the config from disk */
	reload(): Promise<void>;

	/** Save current config to disk */
	save(config: DivisionProjectConfig): Promise<void>;

	/** Whether a .division/agents.json exists in the workspace */
	readonly hasProject: boolean;
}


// --- Service implementation ---

class DivisionProjectService extends Disposable implements IDivisionProjectService {
	readonly _serviceBrand: undefined;

	private readonly _onDidChangeProject = new Emitter<void>();
	readonly onDidChangeProject: Event<void> = this._onDidChangeProject.event;

	private _projectConfig: DivisionProjectConfig | null = null;
	private _projectConfigUri: URI | null = null;

	get projectConfig(): DivisionProjectConfig | null { return this._projectConfig; }
	get projectConfigUri(): URI | null { return this._projectConfigUri; }
	get hasProject(): boolean { return this._projectConfig !== null; }

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IVoidSettingsService private readonly voidSettingsService: IVoidSettingsService,
	) {
		super();

		// Sync project config to globalSettings.roleAssignments when it changes
		this._register(this._onDidChangeProject.event(() => {
			if (this._projectConfig) {
				this.voidSettingsService.setGlobalSetting('roleAssignments', this._projectConfig.agents);
			}
		}));

		// Initialize for existing workspace folders
		this._initForWorkspace();

		// Re-initialize when workspace folders change
		this._register(this.workspaceContextService.onDidChangeWorkspaceFolders(() => {
			this._initForWorkspace();
		}));
	}

	private async _initForWorkspace(): Promise<void> {
		const folders = this.workspaceContextService.getWorkspace().folders;
		if (folders.length === 0) {
			this._projectConfig = null;
			this._projectConfigUri = null;
			this._onDidChangeProject.fire();
			return;
		}

		const rootUri = folders[0].uri;
		const divisionDir = URI.joinPath(rootUri, '.division');
		const agentsJsonUri = URI.joinPath(divisionDir, 'agents.json');
		this._projectConfigUri = agentsJsonUri;

		try {
			// Check if .division/agents.json exists
			const exists = await this.fileService.exists(agentsJsonUri);
			if (exists) {
				await this._readConfig(agentsJsonUri);
			} else {
				// Create default .division/agents.json
				await this._createDefaultConfig(divisionDir, agentsJsonUri);
			}
		} catch (e) {
			console.error('[DivisionProjectService] Error initializing:', e);
			this._projectConfig = defaultDivisionProjectConfig();
			this._onDidChangeProject.fire();
		}

		// Watch for changes to the file
		try {
			const watcher = this.fileService.watch(agentsJsonUri);
			this._register(watcher);
			this._register(this.fileService.onDidFilesChange(async (e) => {
				if (e.affects(agentsJsonUri)) {
					await this._readConfig(agentsJsonUri);
				}
			}));
		} catch {
			// Watching is best-effort
		}
	}

	private async _readConfig(uri: URI): Promise<void> {
		try {
			const content = await this.fileService.readFile(uri);
			const parsed = JSON.parse(content.value.toString());
			this._projectConfig = {
				name: parsed.name || 'Division Project',
				agents: Array.isArray(parsed.agents) ? parsed.agents.map((a: any) => ({
					role: a.role as AgentRole,
					provider: a.provider as ProviderName,
					model: String(a.model),
				})) : defaultRoleAssignments,
			};
			this._onDidChangeProject.fire();
		} catch (e) {
			console.error('[DivisionProjectService] Error reading config:', e);
			this._projectConfig = defaultDivisionProjectConfig();
			this._onDidChangeProject.fire();
		}
	}

	private async _createDefaultConfig(divisionDir: URI, agentsJsonUri: URI): Promise<void> {
		const config = defaultDivisionProjectConfig();
		const jsonStr = JSON.stringify(config, null, 2) + '\n';

		try {
			// Create .division directory if needed
			try {
				await this.fileService.createFolder(divisionDir);
			} catch {
				// Directory may already exist
			}

			await this.fileService.writeFile(agentsJsonUri, VSBuffer.fromString(jsonStr));
			this._projectConfig = config;
			this._onDidChangeProject.fire();
		} catch (e) {
			console.error('[DivisionProjectService] Error creating default config:', e);
			this._projectConfig = config;
			this._onDidChangeProject.fire();
		}
	}

	async reload(): Promise<void> {
		if (this._projectConfigUri) {
			await this._readConfig(this._projectConfigUri);
		}
	}

	async save(config: DivisionProjectConfig): Promise<void> {
		if (!this._projectConfigUri) return;

		const jsonStr = JSON.stringify(config, null, 2) + '\n';
		await this.fileService.writeFile(this._projectConfigUri, VSBuffer.fromString(jsonStr));
		this._projectConfig = config;
		this._onDidChangeProject.fire();
	}
}


registerSingleton(IDivisionProjectService, DivisionProjectService, InstantiationType.Eager);
