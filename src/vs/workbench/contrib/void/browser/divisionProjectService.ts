/*--------------------------------------------------------------------------------------
 *  Division Project Service
 *  Manages .division/agents.json per workspace for project-local agent role assignments.
 *  Supports multiple division projects with an active project selection.
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
import { generateUuid } from '../../../../base/common/uuid.js';


// --- Division Project types ---

export type DivisionProjectConfig = {
	id: string;
	name: string;
	projectId: string;
	agents: RoleAssignment[];
};

/** On-disk format for .division/agents.json */
export type DivisionProjectsFile = {
	activeProjectIds: string[];
	projects: DivisionProjectConfig[];
};

const generateProjectId = (): string => generateUuid();

const defaultDivisionProjectConfig = (): DivisionProjectConfig => ({
	id: generateProjectId(),
	name: 'Default Division Project',
	projectId: '',
	agents: [...defaultRoleAssignments],
});

const defaultDivisionProjectsFile = (): DivisionProjectsFile => {
	const project = defaultDivisionProjectConfig();
	return {
		activeProjectIds: [project.id],
		projects: [project],
	};
};


// --- Service interface ---

export const IDivisionProjectService = createDecorator<IDivisionProjectService>('DivisionProjectService');

export interface IDivisionProjectService {
	readonly _serviceBrand: undefined;
	readonly onDidChangeProject: Event<void>;

	/** The first active project config (null if no workspace) */
	readonly projectConfig: DivisionProjectConfig | null;

	/** All active project configs */
	readonly activeProjects: DivisionProjectConfig[];

	/** All configured division projects */
	readonly projects: DivisionProjectConfig[];

	/** The IDs of the currently active projects */
	readonly activeProjectIds: string[];

	readonly projectConfigUri: URI | null;

	/** Whether a .division/agents.json exists in the workspace */
	readonly hasProject: boolean;

	/** Re-read the config from disk */
	reload(): Promise<void>;

	/** Save a specific project config (updates it in the projects list and persists) */
	save(config: DivisionProjectConfig): Promise<void>;

	/** Toggle a project's active state */
	toggleActiveProject(id: string): Promise<void>;

	/** Set a project as the only active project (exclusive selection) */
	setActiveProject(id: string): Promise<void>;

	/** Check if a project is active */
	isProjectActive(id: string): boolean;

	/** Add a new division project */
	addProject(config: DivisionProjectConfig): Promise<void>;

	/** Remove a division project by ID */
	removeProject(id: string): Promise<void>;
}


// --- Service implementation ---

class DivisionProjectService extends Disposable implements IDivisionProjectService {
	readonly _serviceBrand: undefined;

	private readonly _onDidChangeProject = new Emitter<void>();
	readonly onDidChangeProject: Event<void> = this._onDidChangeProject.event;

	private _projects: DivisionProjectConfig[] = [];
	private _activeProjectIds: string[] = [];
	private _projectConfigUri: URI | null = null;

	get projectConfig(): DivisionProjectConfig | null {
		const firstActiveId = this._activeProjectIds[0];
		if (!firstActiveId) return null;
		return this._projects.find(p => p.id === firstActiveId) ?? this._projects[0] ?? null;
	}
	get activeProjects(): DivisionProjectConfig[] {
		return this._projects.filter(p => this._activeProjectIds.includes(p.id));
	}
	get projects(): DivisionProjectConfig[] { return this._projects; }
	get activeProjectIds(): string[] { return this._activeProjectIds; }
	get projectConfigUri(): URI | null { return this._projectConfigUri; }
	get hasProject(): boolean { return this._projects.length > 0; }

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IVoidSettingsService private readonly voidSettingsService: IVoidSettingsService,
	) {
		super();

		// Sync active projects' config to globalSettings when they change
		this._register(this._onDidChangeProject.event(() => {
			const actives = this.activeProjects;
			if (actives.length > 0) {
				// Merge agents from all active projects (first project's agents take priority)
				const mergedAgents = actives.flatMap(p => p.agents);
				this.voidSettingsService.setGlobalSetting('roleAssignments', mergedAgents);
				this.voidSettingsService.setGlobalSetting('divisionProjectId', actives[0].projectId);
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
			this._projects = [];
			this._activeProjectIds = [];
			this._projectConfigUri = null;
			this._onDidChangeProject.fire();
			return;
		}

		const rootUri = folders[0].uri;
		const divisionDir = URI.joinPath(rootUri, '.division');
		const agentsJsonUri = URI.joinPath(divisionDir, 'agents.json');
		this._projectConfigUri = agentsJsonUri;

		try {
			const exists = await this.fileService.exists(agentsJsonUri);
			if (exists) {
				await this._readConfig(agentsJsonUri);
			} else {
				await this._createDefaultConfig(divisionDir, agentsJsonUri);
			}
		} catch (e) {
			console.error('[DivisionProjectService] Error initializing:', e);
			const file = defaultDivisionProjectsFile();
			this._projects = file.projects;
			this._activeProjectIds = file.activeProjectIds;
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

	private _parseAgents(agents: any): RoleAssignment[] {
		if (!Array.isArray(agents)) return [...defaultRoleAssignments];
		return agents.map((a: any) => ({
			role: a.role as AgentRole,
			provider: a.provider as ProviderName,
			model: String(a.model),
		}));
	}

	private async _readConfig(uri: URI): Promise<void> {
		try {
			const content = await this.fileService.readFile(uri);
			const parsed = JSON.parse(content.value.toString());

			// New multi-project format: { activeProjectId, projects: [...] }
			if (Array.isArray(parsed.projects)) {
				const projects: DivisionProjectConfig[] = parsed.projects.map((p: any) => ({
					id: p.id || generateProjectId(),
					name: p.name || 'Division Project',
					projectId: typeof p.projectId === 'string' ? p.projectId : '',
					agents: this._parseAgents(p.agents),
				}));
				if (projects.length === 0) {
					const def = defaultDivisionProjectConfig();
					projects.push(def);
				}
				this._projects = projects;
				// Support both new activeProjectIds[] and legacy activeProjectId
				if (Array.isArray(parsed.activeProjectIds)) {
					this._activeProjectIds = parsed.activeProjectIds.filter((id: string) => projects.some(p => p.id === id));
					if (this._activeProjectIds.length === 0) this._activeProjectIds = [projects[0].id];
				} else if (parsed.activeProjectId && projects.some((p: DivisionProjectConfig) => p.id === parsed.activeProjectId)) {
					this._activeProjectIds = [parsed.activeProjectId];
				} else {
					this._activeProjectIds = [projects[0].id];
				}
			}
			// Legacy single-project format: { name, projectId, agents }
			else if (parsed.name || parsed.agents) {
				const legacyProject: DivisionProjectConfig = {
					id: generateProjectId(),
					name: parsed.name || 'Division Project',
					projectId: typeof parsed.projectId === 'string' ? parsed.projectId : '',
					agents: this._parseAgents(parsed.agents),
				};
				this._projects = [legacyProject];
				this._activeProjectIds = [legacyProject.id];
				// Migrate: rewrite in new format
				await this._persistToDisk();
			}
			else {
				const file = defaultDivisionProjectsFile();
				this._projects = file.projects;
				this._activeProjectIds = file.activeProjectIds;
			}

			this._onDidChangeProject.fire();
		} catch (e) {
			console.error('[DivisionProjectService] Error reading config:', e);
			const file = defaultDivisionProjectsFile();
			this._projects = file.projects;
			this._activeProjectIds = file.activeProjectIds;
			this._onDidChangeProject.fire();
		}
	}

	private async _createDefaultConfig(divisionDir: URI, agentsJsonUri: URI): Promise<void> {
		const file = defaultDivisionProjectsFile();
		const jsonStr = JSON.stringify(file, null, 2) + '\n';

		try {
			try {
				await this.fileService.createFolder(divisionDir);
			} catch {
				// Directory may already exist
			}

			await this.fileService.writeFile(agentsJsonUri, VSBuffer.fromString(jsonStr));
			this._projects = file.projects;
			this._activeProjectIds = file.activeProjectIds;
			this._onDidChangeProject.fire();
		} catch (e) {
			console.error('[DivisionProjectService] Error creating default config:', e);
			this._projects = file.projects;
			this._activeProjectIds = file.activeProjectIds;
			this._onDidChangeProject.fire();
		}
	}

	private async _persistToDisk(): Promise<void> {
		if (!this._projectConfigUri) return;
		const file: DivisionProjectsFile = {
			activeProjectIds: this._activeProjectIds,
			projects: this._projects,
		};
		const jsonStr = JSON.stringify(file, null, 2) + '\n';
		await this.fileService.writeFile(this._projectConfigUri, VSBuffer.fromString(jsonStr));
	}

	async reload(): Promise<void> {
		if (this._projectConfigUri) {
			await this._readConfig(this._projectConfigUri);
		}
	}

	async save(config: DivisionProjectConfig): Promise<void> {
		const idx = this._projects.findIndex(p => p.id === config.id);
		if (idx >= 0) {
			this._projects[idx] = config;
		} else {
			this._projects.push(config);
		}
		await this._persistToDisk();
		this._onDidChangeProject.fire();
	}

	async toggleActiveProject(id: string): Promise<void> {
		if (!this._projects.some(p => p.id === id)) return;
		if (this._activeProjectIds.includes(id)) {
			// Don't allow deactivating the last active project
			if (this._activeProjectIds.length > 1) {
				this._activeProjectIds = this._activeProjectIds.filter(aid => aid !== id);
			}
		} else {
			this._activeProjectIds = [...this._activeProjectIds, id];
		}
		await this._persistToDisk();
		this._onDidChangeProject.fire();
	}

	isProjectActive(id: string): boolean {
		return this._activeProjectIds.includes(id);
	}

	async setActiveProject(id: string): Promise<void> {
		if (!this._projects.some(p => p.id === id)) return;
		this._activeProjectIds = [id];
		await this._persistToDisk();
		this._onDidChangeProject.fire();
	}

	async addProject(config: DivisionProjectConfig): Promise<void> {
		this._projects.push(config);
		await this._persistToDisk();
		this._onDidChangeProject.fire();
	}

	async removeProject(id: string): Promise<void> {
		if (this._projects.length <= 1) return; // Keep at least one project
		this._projects = this._projects.filter(p => p.id !== id);
		this._activeProjectIds = this._activeProjectIds.filter(aid => aid !== id);
		if (this._activeProjectIds.length === 0) {
			this._activeProjectIds = [this._projects[0]?.id ?? ''];
		}
		await this._persistToDisk();
		this._onDidChangeProject.fire();
	}
}


registerSingleton(IDivisionProjectService, DivisionProjectService, InstantiationType.Eager);
