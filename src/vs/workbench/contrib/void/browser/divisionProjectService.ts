/*--------------------------------------------------------------------------------------
 *  Division Project Service
 *  Manages .division/projects.json per workspace for project-local agent role assignments.
 *  Supports multiple division projects with an active project selection.
 *  Auto-syncs project data to Supabase when projects change (push), and periodically
 *  polls Supabase for role/provider changes made remotely (pull), so local roles stay
 *  in sync without requiring a manual "Pull from Remote".
 *--------------------------------------------------------------------------------------*/

import { generateUuid } from '../../../../base/common/uuid.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { AgentRole, defaultRoleAssignments, displayInfoOfProviderName, normalizeReasoningEffort, ProviderName, providerNames, ReasoningEffort, RoleAssignment, RoleProvider } from '../common/voidSettingsTypes.js';
import { IVoidSettingsService } from '../common/voidSettingsService.js';
import { divisionProviderIdOfRoleProvider } from '../common/divisionModelCatalog.js';
import * as dom from '../../../../base/browser/dom.js';
import { ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { CLOUD_AGENT_CHANNEL_NAME, CloudAgentResponse, DIVISION_PROJECTS_API_PREFIX, ICloudAgentMainService } from '../common/cloudAgentTypes.js';
import { DIVISION_API_BASE_URL } from '../common/divisionAuthConfig.js';
import { ensureDivisionSession } from '../common/divisionSession.js';
import { bindDivisionSession } from './react/out/division-session/index.js';


// --- Auto-pull configuration ---
// Supabase 側（Web ダッシュボード等）でロール/プロバイダが変更された場合に、
// 手動で "Pull from Remote" を叩かなくても自動的にローカルへ反映されるようにする。
const AUTO_PULL_INTERVAL_MS = 60 * 1000; // 1 minute


// --- Canonical ID normalizers ---
// projects.json と Supabase から流入する値は表示名や別名で汚れていることがあるため、
// 内部 ProviderName / AgentRole に正規化する。

const ALL_AGENT_ROLES: AgentRole[] = [
	'leader', 'coder', 'planner', 'search', 'research',
	'design', 'writing', 'ideaman', 'filesearch', 'image', 'review',
];

const PROVIDER_ALIASES: Record<string, ProviderName> = {
	'google': 'gemini',
	'google ai': 'gemini',
	'googleai': 'gemini',
	'open ai': 'openAI',
	'openai': 'openAI',
	'claude': 'anthropic',
	'grok': 'xAI',
	'xai': 'xAI',
	'azure': 'microsoftAzure',
	'bedrock': 'awsBedrock',
	'vertex': 'googleVertex',
	'lm studio': 'lmStudio',
	'lmstudio': 'lmStudio',
	'litellm': 'liteLLM',
	'vllm': 'vLLM',
	'openrouter': 'openRouter',
	'openai-compatible': 'openAICompatible',
	'openaicompatible': 'openAICompatible',
	'division api': 'divisionAPI',
	'divisionapi': 'divisionAPI',
};

const ROLE_ALIASES: Record<string, AgentRole> = {
	'reviewer': 'review',
	'designer': 'design',
	'imager': 'image',
	'writer': 'writing',
	'searcher': 'search',
	'researcher': 'research',
	'file-searcher': 'filesearch',
	'filesearcher': 'filesearch',
	'file_searcher': 'filesearch',
	'file search': 'filesearch',
};

// Supabase の Role.id (= サーバーのロール slug) は一部 Orchestra 内部名と違う。
// 同期時は ROLE_ALIASES の逆向きでサーバー側の名前にする (Role に無い ID は外部キー違反で入らない)。
const AGENT_ROLE_TO_SUPABASE_ID: Partial<Record<AgentRole, string>> = {
	review: 'reviewer',
	design: 'designer',
	image: 'imager',
	writing: 'writer',
	search: 'searcher',
	research: 'researcher',
};

function normalizeProviderName(value: string | undefined | null): ProviderName | null {
	if (!value) return null;
	const raw = String(value).trim();
	if (!raw) return null;

	if ((providerNames as string[]).includes(raw)) return raw as ProviderName;

	const lower = raw.toLowerCase();
	const ciMatch = providerNames.find(p => p.toLowerCase() === lower);
	if (ciMatch) return ciMatch;

	for (const p of providerNames) {
		try {
			if (displayInfoOfProviderName(p).title.toLowerCase() === lower) return p;
		} catch { /* ignore */ }
	}

	if (PROVIDER_ALIASES[lower]) return PROVIDER_ALIASES[lower];

	return null;
}

function normalizeAgentRole(value: string | undefined | null): AgentRole | null {
	if (!value) return null;
	const raw = String(value).trim();
	if (!raw) return null;

	const lower = raw.toLowerCase();
	const direct = ALL_AGENT_ROLES.find(r => r.toLowerCase() === lower);
	if (direct) return direct;

	if (ROLE_ALIASES[lower]) return ROLE_ALIASES[lower];

	return null;
}


// --- Supabase canonical IDs ---
// Supabase 側の Provider.id は CHECK 制約 (anthropic / openai / google / perplexity / xai / deepseek)
// のいずれかでなければ INSERT/UPSERT 不可。内部 ProviderName からの対応表を一元管理する。
const PROVIDER_NAME_TO_SUPABASE_ID: Partial<Record<ProviderName, string>> = {
	anthropic: 'anthropic',
	openAI: 'openai',
	deepseek: 'deepseek',
	gemini: 'google',
	xAI: 'xai',
	perplexity: 'perplexity',
};

function toSupabaseProviderId(providerName: string | undefined | null): string | null {
	const canonical = normalizeProviderName(providerName ?? null);
	if (!canonical) return null;
	return PROVIDER_NAME_TO_SUPABASE_ID[canonical] ?? null;
}


// --- Supabase configuration ---

const SUPABASE_URL = 'https://wmhrbhcnxglvqwvnbxlt.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtaHJiaGNueGdsdnF3dm5ieGx0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3OTg1MDAsImV4cCI6MjA5MTM3NDUwMH0.4qjCIOjFwm4XnmtqZN_N0zcZlhjGc2GQ4-x7ygMa3hM';

const SUPABASE_READ_HEADERS: Record<string, string> = {
	'apikey': SUPABASE_ANON_KEY,
	'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
};


// --- Division Project types ---

export type DivisionProjectConfig = {
	projectId: string;
	name: string;
	agents: RoleAssignment[];
};

/** Division API の RoleAssignment (Role / Provider を埋め込んだもの) */
type RemoteAssignment = {
	roleId: string;
	providerId: string;
	priority: number;
	config: string;
	Role?: { id: string; slug?: string; name?: string } | null;
	Provider?: { id: string; name?: string; displayName?: string } | null;
};

/** On-disk format for .division/projects.json */
export type DivisionProjectsFile = {
	activeProjectIds: string[];
	projects: DivisionProjectConfig[];
};

const DEFAULT_DIVISION_PROJECT_NAME = 'Default Division Project';

const defaultDivisionProjectConfig = (): DivisionProjectConfig => ({
	projectId: '',
	name: DEFAULT_DIVISION_PROJECT_NAME,
	agents: [...defaultRoleAssignments],
});

const defaultDivisionProjectsFile = (): DivisionProjectsFile => {
	const project = defaultDivisionProjectConfig();
	return {
		activeProjectIds: [project.projectId],
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

	/** Whether a .division/projects.json exists in the workspace */
	readonly hasProject: boolean;

	/** Re-read the config from disk */
	reload(): Promise<void>;

	/** Save a specific project config (updates it in the projects list and persists) */
	save(config: DivisionProjectConfig): Promise<void>;

	/** Toggle a project's active state */
	toggleActiveProject(projectId: string): Promise<void>;

	/** Set a project as the only active project (exclusive selection) */
	setActiveProject(projectId: string): Promise<void>;

	/** Check if a project is active */
	isProjectActive(projectId: string): boolean;

	/** Add a new division project */
	addProject(config: DivisionProjectConfig): Promise<void>;

	/** Remove a division project by ID */
	removeProject(id: string): Promise<void>;

	/**
	 * Fetch project data from Supabase and update projects.json.
	 * With `projectId`, only that project is refreshed.
	 * Without it, every division project owned by the signed-in account is pulled
	 * and merged into projects.json (falling back to refreshing the locally
	 * configured Project IDs when no account is signed in).
	 */
	fetchFromSupabase(projectId?: string): Promise<{ success: boolean; message: string }>;

	/** Push local projects.json data to Supabase */
	pushToSupabase(): Promise<{ success: boolean; message: string }>;
}


// --- Service implementation ---

class DivisionProjectService extends Disposable implements IDivisionProjectService {
	readonly _serviceBrand: undefined;

	private readonly _onDidChangeProject = new Emitter<void>();
	readonly onDidChangeProject: Event<void> = this._onDidChangeProject.event;

	private _projects: DivisionProjectConfig[] = [];
	private _activeProjectIds: string[] = [];
	private _projectConfigUri: URI | null = null;

	private _autoPullIntervalId: number | undefined;
	private _isAutoPulling = false;

	private readonly _main: ICloudAgentMainService;

	get projectConfig(): DivisionProjectConfig | null {
		const firstActiveId = this._activeProjectIds[0];
		if (!firstActiveId) return null;
		return this._projects.find(p => p.projectId === firstActiveId) ?? this._projects[0] ?? null;
	}
	get activeProjects(): DivisionProjectConfig[] {
		return this._projects.filter(p => this._activeProjectIds.includes(p.projectId));
	}
	get projects(): DivisionProjectConfig[] { return this._projects; }
	get activeProjectIds(): string[] { return this._activeProjectIds; }
	get projectConfigUri(): URI | null { return this._projectConfigUri; }
	get hasProject(): boolean { return this._projects.length > 0; }

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IVoidSettingsService private readonly voidSettingsService: IVoidSettingsService,
		@IMainProcessService mainProcessService: IMainProcessService,
	) {
		super();
		this._main = ProxyChannel.toService<ICloudAgentMainService>(mainProcessService.getChannel(CLOUD_AGENT_CHANNEL_NAME));
		this._register(bindDivisionSession(voidSettingsService));

		// Sync active projects' config to globalSettings and Supabase when they change
		this._register(this._onDidChangeProject.event(() => {
			const actives = this.activeProjects;
			if (actives.length > 0) {
				const mergedAgents = actives.flatMap(p => p.agents);
				this.voidSettingsService.setGlobalSetting('roleAssignments', mergedAgents);
				this.voidSettingsService.setGlobalSetting('divisionProjectId', actives[0].projectId);
			}
			this._syncToSupabase();
			void this._ensureRemoteProjectIds();
		}));

		// ログインした時点で、ID 未発行のプロジェクトを Division に登録する
		this._register(this.voidSettingsService.onDidChangeState(() => {
			void this._ensureRemoteProjectIds();
		}));

		// Initialize for existing workspace folders
		this._initForWorkspace();

		// Re-initialize when workspace folders change
		this._register(this.workspaceContextService.onDidChangeWorkspaceFolders(() => {
			this._initForWorkspace();
		}));

		// Eagerly fetch the Division API key at startup (independent of sync)
		this._fetchAndStoreDivisionApiKey();

		// Periodically pull the latest roles from Supabase so that changes made
		// remotely (e.g. via the web dashboard) are reflected locally automatically.
		this._startAutoPull();
	}

	/**
	 * 新しいワークスペースの既定プロジェクトは projectId が空のまま作られる。Division API は
	 * 実在する Project (とそのロール割り当て) を必須にしているので、空のままだとタスク作成が
	 * 「projectId must contain at least 1 character」で必ず失敗する。
	 * ログイン済みなら ID を発行して projects.json に保存する。保存後の変更通知で
	 * _syncToSupabase が Project 行 (所有者はログイン中のアカウント) とロール割り当てを作る。
	 * (Division API の POST /api/projects はレンダラーからだと CORS で呼べない。)
	 */
	private async _ensureRemoteProjectIds(): Promise<void> {
		if (!this._projectConfigUri || !this._projects.some(p => !p.projectId)) return;
		const { isLoggedIn, divisionUserId } = this.voidSettingsService.state.globalSettings;
		if (!isLoggedIn || !divisionUserId) return;

		for (const project of this._projects) {
			if (project.projectId) continue;
			const id = generateUuid();
			if (this._activeProjectIds.includes('')) {
				this._activeProjectIds = this._activeProjectIds.map(a => a === '' ? id : a);
			}
			project.projectId = id;
		}
		await this._persistToDisk();
		this._onDidChangeProject.fire();
	}

	private _startAutoPull(): void {
		const { window } = dom.getActiveWindow();
		this._autoPullIntervalId = window.setInterval(() => {
			this._autoPullFromSupabase();
		}, AUTO_PULL_INTERVAL_MS);
	}

	private async _autoPullFromSupabase(): Promise<void> {
		if (this._isAutoPulling) return;
		if (!this._projectConfigUri || this._projects.length === 0) return;

		this._isAutoPulling = true;
		try {
			const result = await this.fetchFromSupabase();
			if (result.success) {
				console.log('[DivisionProjectService] Auto-pull from Supabase:', result.message);
			} else {
				// Not logged in / no project configured yet — not an error, just skip quietly.
				console.log('[DivisionProjectService] Auto-pull skipped:', result.message);
			}
		} catch (e) {
			console.warn('[DivisionProjectService] Auto-pull from Supabase failed:', e);
		} finally {
			this._isAutoPulling = false;
		}
	}

	override dispose(): void {
		if (this._autoPullIntervalId !== undefined) {
			const { window } = dom.getActiveWindow();
			window.clearInterval(this._autoPullIntervalId);
			this._autoPullIntervalId = undefined;
		}
		super.dispose();
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
		const agentsJsonUri = URI.joinPath(divisionDir, 'projects.json');
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

	/**
	 * agents 配列を正規化された RoleAssignment[] に変換する。
	 * 表示名や別名（例: "OpenAI", "Google", "reviewer", "designer"）を内部 ID に揃える。
	 * 正規化に失敗した値は元のまま残し、UI/ストアでは扱えるが Supabase 同期で再正規化される。
	 */
	private _parseAgents(agents: any): { agents: RoleAssignment[]; changed: boolean } {
		if (!Array.isArray(agents)) {
			return { agents: [...defaultRoleAssignments], changed: true };
		}
		let changed = false;
		const result: RoleAssignment[] = agents.map((a: any) => {
			const rawRole = a?.role;
			const rawProvider = a?.provider;

			const normRole = normalizeAgentRole(rawRole);
			const normProvider = normalizeProviderName(rawProvider);

			const role: AgentRole = (normRole ?? rawRole) as AgentRole;
			const provider: RoleProvider = normProvider ?? rawProvider;

			if (rawRole !== role || rawProvider !== provider) changed = true;

			const effort = normalizeReasoningEffort(a?.effort);
			return {
				role,
				provider,
				model: String(a?.model ?? ''),
				...(effort ? { effort } : {}),
			};
		});
		return { agents: result, changed };
	}

	private async _readConfig(uri: URI): Promise<void> {
		try {
			const content = await this.fileService.readFile(uri);
			const parsed = JSON.parse(content.value.toString());

			let needsRewrite = false;

			if (Array.isArray(parsed.projects)) {
				const projects: DivisionProjectConfig[] = parsed.projects.map((p: any) => {
					const parsedAgents = this._parseAgents(p.agents);
					if (parsedAgents.changed) needsRewrite = true;
					return {
						projectId: typeof p.projectId === 'string' ? p.projectId : '',
						name: p.name || 'Division Project',
						agents: parsedAgents.agents,
					};
				});
				if (projects.length === 0) {
					const def = defaultDivisionProjectConfig();
					projects.push(def);
				}
				this._projects = projects;
				if (Array.isArray(parsed.activeProjectIds)) {
					this._activeProjectIds = parsed.activeProjectIds.filter((pid: string) => projects.some(p => p.projectId === pid));
					if (this._activeProjectIds.length === 0) this._activeProjectIds = [projects[0].projectId];
				} else {
					this._activeProjectIds = [projects[0].projectId];
				}

				// 表示名/別名を canonical ID に書き戻す（ディスクのクリーンアップ）
				if (needsRewrite) {
					await this._persistToDisk();
				}
			}
			// Legacy format: { name, projectId, agents }
			else if (parsed.name || parsed.agents) {
				const parsedAgents = this._parseAgents(parsed.agents);
				const legacyProject: DivisionProjectConfig = {
					projectId: typeof parsed.projectId === 'string' ? parsed.projectId : '',
					name: parsed.name || 'Division Project',
					agents: parsedAgents.agents,
				};
				this._projects = [legacyProject];
				this._activeProjectIds = [legacyProject.projectId];
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

	// --- Supabase sync ---

	private async _supabaseUpsert(table: string, rows: Record<string, unknown>[]): Promise<void> {
		if (rows.length === 0) return;
		const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'apikey': SUPABASE_ANON_KEY,
				'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
				'Prefer': 'resolution=merge-duplicates',
			},
			body: JSON.stringify(rows),
		});
		if (!res.ok) {
			const body = await res.text();
			console.error(`[DivisionProjectService] Supabase upsert ${table} failed (${res.status}):`, body);
		}
	}

	private async _supabaseRpc<T = unknown>(fnName: string, params: Record<string, unknown> = {}): Promise<T | null> {
		try {
			const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fnName}`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'apikey': SUPABASE_ANON_KEY,
					'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
				},
				body: JSON.stringify(params),
			});
			if (!res.ok) {
				const body = await res.text();
				console.error(`[DivisionProjectService] Supabase RPC ${fnName} failed (${res.status}):`, body);
				return null;
			}
			return await res.json() as T;
		} catch (e) {
			console.error(`[DivisionProjectService] Supabase RPC ${fnName} error:`, e);
			return null;
		}
	}

	private async _fetchAndStoreDivisionApiKey(): Promise<void> {
		// Wait for settings service to be ready
		await this.voidSettingsService.waitForInitState;

		// ログイン中はログイン時に入れたアクセストークンが Division API の認証に使われる。
		// profiles.division_api_key は古い ak_ キーのことがあり、上書きすると 401 になる。
		if (this.voidSettingsService.state.globalSettings.isLoggedIn) return;

		const projectId = this.voidSettingsService.state.globalSettings.divisionProjectId
			|| this.projectConfig?.projectId;
		if (!projectId) {
			console.log('[DivisionProjectService] No project ID available for API key fetch');
			return;
		}

		try {
			const apiKey = await this._supabaseRpc<string>('get_api_key_for_project', { p_project_id: projectId });
			if (apiKey && typeof apiKey === 'string') {
				this.voidSettingsService.setGlobalSetting('divisionApiKey', apiKey);
				console.log('[DivisionProjectService] Division API key fetched and stored successfully');
			} else {
				console.warn('[DivisionProjectService] No API key returned from RPC for project:', projectId, 'response:', apiKey);
			}
		} catch (e) {
			console.error('[DivisionProjectService] Failed to fetch Division API key:', e);
		}
	}

	private async _syncToSupabase(): Promise<void> {
		const projects = this._projects.filter(p => p.projectId);
		if (projects.length === 0) return;

		try {
			const now = new Date().toISOString();

			// ログイン中はそのアカウントを owner にする。"Pull from Remote" は
			// Project.ownerId / Project.userId でログインアカウントのプロジェクトを引くため、
			// ここで別ユーザーを owner にすると push したプロジェクトを pull し直せなくなる。
			// （フォールバックの get_default_owner_id RPC は profiles の先頭行を返すだけで、
			//   ログインユーザーとは限らない。）
			const globals = this.voidSettingsService.state.globalSettings;
			const signedInUserId = globals.isLoggedIn ? globals.divisionUserId : '';
			const ownerId = signedInUserId || await this._supabaseRpc<string>('get_default_owner_id');

			// 1) Upsert Projects (with ownerId if available)
			await this._supabaseUpsert('Project', projects.map(p => ({
				id: p.projectId,
				name: p.name,
				updatedAt: now,
				...(ownerId ? { ownerId } : {}),
			})));

			// Collect unique roles across all projects.
			// Provider は Supabase 側の CHECK 制約に合わせて canonical id（小文字）で扱う。
			// Provider テーブル自体は Division が管理する (Orchestra はそこから一覧を取るだけで書き込まない)。
			// RoleAssignment は (projectId, roleId, providerId) を主キーにしているため、
			// 同一エージェントが重複登録されているケースは前段でデデュープして
			// "ON CONFLICT DO UPDATE command cannot affect row a second time" を防ぐ。
			const roleSet = new Map<string, { slug: string; name: string }>();
			const roleAssignmentRowMap = new Map<string, Record<string, unknown>>();
			const divisionProviders = this.voidSettingsService.state.globalSettings.divisionProviders;
			const skippedProviders = new Set<string>();

			for (const project of projects) {
				let priority = 0;
				for (const agent of project.agents) {
					const agentRole = normalizeAgentRole(agent.role);
					if (!agentRole) continue; // 不明なロールは同期しない
					const roleSlug = AGENT_ROLE_TO_SUPABASE_ID[agentRole] ?? agentRole;
					// Orchestra のプロバイダ名 → Supabase id。 Orchestra に無い Division のプロバイダ (例: typesafe) は
					// Division API から取得したプロバイダ一覧の id をそのまま使う。
					const providerSupabaseId = toSupabaseProviderId(agent.provider) ?? divisionProviderIdOfRoleProvider(agent.provider, divisionProviders);
					if (!providerSupabaseId) {
						skippedProviders.add(String(agent.provider));
						continue; // CHECK 制約に通らないプロバイダは Supabase 同期対象外
					}

					if (!roleSet.has(roleSlug)) {
						roleSet.set(roleSlug, {
							slug: roleSlug,
							name: roleSlug.charAt(0).toUpperCase() + roleSlug.slice(1),
						});
					}

					const id = `${project.projectId}-${roleSlug}-${providerSupabaseId}`;
					if (!roleAssignmentRowMap.has(id)) {
						roleAssignmentRowMap.set(id, {
							id,
							projectId: project.projectId,
							roleId: roleSlug,
							providerId: providerSupabaseId,
							priority: priority++,
							config: JSON.stringify({ model: agent.model, ...(agent.effort ? { effort: agent.effort } : {}) }),
							updatedAt: now,
						});
					}
				}
			}

			if (skippedProviders.size > 0) {
				console.warn('[DivisionProjectService] Supabase sync skipped unsupported providers:', [...skippedProviders]);
			}

			const roleAssignmentRows = [...roleAssignmentRowMap.values()];

			// 2) Upsert Roles
			await this._supabaseUpsert('Role', [...roleSet.entries()].map(([id, r]) => ({
				id,
				slug: r.slug,
				name: r.name,
				updatedAt: now,
			})));

			// 3) Upsert RoleAssignments
			// 1 行ずつ送る。まとめて送ると、サーバーの Role に無いロール (例: filesearch) が 1 つでも
			// あると外部キー違反で全行が失敗し、leader の割り当てまで入らずタスク作成できなくなる。
			await Promise.all(roleAssignmentRows.map(row => this._supabaseUpsert('RoleAssignment', [row])));

			console.log(`[DivisionProjectService] Supabase sync OK — ${projects.length} project(s), ${roleAssignmentRows.length} assignment(s)`);

			// 4) Fetch and store the Division API key for the active project
			await this._fetchAndStoreDivisionApiKey();
		} catch (e) {
			console.error('[DivisionProjectService] Supabase sync error:', e);
		}
	}

	async reload(): Promise<void> {
		if (this._projectConfigUri) {
			await this._readConfig(this._projectConfigUri);
		}
	}

	async save(config: DivisionProjectConfig): Promise<void> {
		const idx = this._projects.findIndex(p => p.projectId === config.projectId);
		if (idx >= 0) {
			this._projects[idx] = config;
		} else {
			this._projects.push(config);
		}
		await this._persistToDisk();
		this._onDidChangeProject.fire();
	}

	async toggleActiveProject(projectId: string): Promise<void> {
		if (!this._projects.some(p => p.projectId === projectId)) return;
		if (this._activeProjectIds.includes(projectId)) {
			if (this._activeProjectIds.length > 1) {
				this._activeProjectIds = this._activeProjectIds.filter(aid => aid !== projectId);
			}
		} else {
			this._activeProjectIds = [...this._activeProjectIds, projectId];
		}
		await this._persistToDisk();
		this._onDidChangeProject.fire();
	}

	isProjectActive(projectId: string): boolean {
		return this._activeProjectIds.includes(projectId);
	}

	async setActiveProject(projectId: string): Promise<void> {
		if (!this._projects.some(p => p.projectId === projectId)) return;
		this._activeProjectIds = [projectId];
		await this._persistToDisk();
		this._onDidChangeProject.fire();
	}

	async addProject(config: DivisionProjectConfig): Promise<void> {
		this._projects.push(config);
		await this._persistToDisk();
		this._onDidChangeProject.fire();
	}

	async removeProject(projectId: string): Promise<void> {
		if (this._projects.length <= 1) return;
		this._projects = this._projects.filter(p => p.projectId !== projectId);
		this._activeProjectIds = this._activeProjectIds.filter(aid => aid !== projectId);
		if (this._activeProjectIds.length === 0) {
			this._activeProjectIds = [this._projects[0]?.projectId ?? ''];
		}
		await this._persistToDisk();
		this._onDidChangeProject.fire();
	}

	async pushToSupabase(): Promise<{ success: boolean; message: string }> {
		const projects = this._projects.filter(p => p.projectId);
		if (projects.length === 0) {
			return { success: false, message: 'No projects with Project ID configured' };
		}
		try {
			await this._syncToSupabase();
			return { success: true, message: `${projects.length} project(s) pushed to Supabase` };
		} catch (e) {
			return { success: false, message: `Supabase push error: ${e}` };
		}
	}

	/**
	 * Role / Provider テーブルから ID → canonical slug/name へのマップを構築する。
	 * displayName は表示用なので使わない。常に slug / name（内部識別子）を優先する。
	 */
	private async _buildRoleProviderMaps(): Promise<{ roleIdToSlug: Map<string, string>; providerIdToName: Map<string, string> }> {
		const roleIdToSlug = new Map<string, string>();
		const providerIdToName = new Map<string, string>();

		try {
			const [rolesRes, providersRes] = await Promise.all([
				fetch(`${SUPABASE_URL}/rest/v1/Role?select=id,slug,name`, { headers: SUPABASE_READ_HEADERS }),
				fetch(`${SUPABASE_URL}/rest/v1/Provider?select=id,name,displayName`, { headers: SUPABASE_READ_HEADERS }),
			]);

			if (rolesRes.ok) {
				const roles: Array<{ id: string; slug?: string; name?: string }> = await rolesRes.json();
				for (const r of roles) {
					roleIdToSlug.set(r.id, r.slug || r.id);
				}
				console.log(`[DivisionProjectService] Fetched ${roles.length} roles from Supabase`);
			} else {
				console.warn(`[DivisionProjectService] Role table fetch failed: ${rolesRes.status}`);
			}

			if (providersRes.ok) {
				const providers: Array<{ id: string; name?: string; displayName?: string }> = await providersRes.json();
				for (const p of providers) {
					providerIdToName.set(p.id, p.name || p.id);
				}
				console.log(`[DivisionProjectService] Fetched ${providers.length} providers from Supabase`);
			} else {
				console.warn(`[DivisionProjectService] Provider table fetch failed: ${providersRes.status}`);
			}
		} catch (e) {
			console.warn('[DivisionProjectService] Role/Provider lookup failed, will use raw IDs:', e);
		}

		return { roleIdToSlug, providerIdToName };
	}

	/**
	 * Project / RoleAssignment は RLS でサーバー専用になっていて、anon キーでは 0 件しか返らない。
	 * ログイン中アカウントの認証情報で Division API から読む。Division API は CORS を返さないので
	 * クラウドエージェントと同じく main プロセス経由で呼ぶ。
	 * 401 になった認証情報は飛ばして次の候補を試す (古い ak_ キーが残っているアカウントがある)。
	 */
	private async _divisionApiGet(path: string): Promise<CloudAgentResponse> {
		await ensureDivisionSession(this.voidSettingsService);
		const g = this.voidSettingsService.state.globalSettings;
		const tokens = [...new Set([g.divisionUserApiKey, g.divisionAccessToken, g.divisionApiKey].filter((t): t is string => !!t))];
		if (!g.isLoggedIn || tokens.length === 0) {
			return { ok: false, status: 401, data: null, error: 'Sign in to Division to pull the projects of your account' };
		}
		const endpoint = (this.voidSettingsService.state.settingsOfProvider.divisionAPI?.endpoint || DIVISION_API_BASE_URL).trim().replace(/\/+$/, '');
		let res: CloudAgentResponse = { ok: false, status: 0, data: null, error: 'request failed' };
		for (const token of tokens) {
			try {
				res = await this._main.request({ endpoint, token, method: 'GET', path });
			} catch (e) {
				res = { ok: false, status: 0, data: null, error: e instanceof Error ? e.message : String(e) };
			}
			if (res.status !== 401) return res;
			if (token === g.divisionAccessToken) {
				const session = await ensureDivisionSession(this.voidSettingsService, token);
				if (session && session.access_token !== token) {
					try {
						res = await this._main.request({ endpoint, token: session.access_token, method: 'GET', path });
					} catch (e) {
						res = { ok: false, status: 0, data: null, error: e instanceof Error ? e.message : String(e) };
					}
					if (res.status !== 401) return res;
				}
			}
		}
		return res;
	}

	private _describeApiError(res: CloudAgentResponse): string {
		if (res.status === 401) return res.error && !res.data ? res.error : 'Division rejected the sign-in. Sign in to Division again';
		const detail = (res.data && typeof res.data.error === 'string') ? res.data.error : res.error;
		return `HTTP ${res.status}${detail ? `: ${detail}` : ''}`;
	}

	/** GET /api/projects/:id — プロジェクトとロール割り当て (Role / Provider 付き) */
	private async _fetchRemoteProject(projectId: string): Promise<
		| { ok: true; name: string | undefined; assignments: RemoteAssignment[] }
		| { ok: false; status: number; error: string }
	> {
		const res = await this._divisionApiGet(`${DIVISION_PROJECTS_API_PREFIX}/${encodeURIComponent(projectId)}`);
		if (!res.ok || !res.data || typeof res.data !== 'object') {
			return { ok: false, status: res.status, error: this._describeApiError(res) };
		}
		const raw: any[] = Array.isArray(res.data.assignments) ? res.data.assignments : [];
		const assignments: RemoteAssignment[] = raw
			.filter(a => a && typeof a.roleId === 'string' && typeof a.providerId === 'string')
			.map(a => ({
				roleId: a.roleId,
				providerId: a.providerId,
				priority: typeof a.priority === 'number' ? a.priority : 0,
				config: typeof a.config === 'string' ? a.config : '',
				Role: a.role ?? null,
				Provider: a.provider ?? null,
			}))
			// API はロール名順で返すので、従来どおり priority 昇順に並べる
			.sort((x, y) => x.priority - y.priority);
		return { ok: true, name: typeof res.data.name === 'string' ? res.data.name : undefined, assignments };
	}

	/**
	 * 1 プロジェクト分の RoleAssignment を取得して RoleAssignment[] に変換する。
	 * 取得自体に失敗した場合は null（呼び出し側でローカル値を維持するため、空配列と区別する）。
	 */
	private async _fetchRemoteAgents(
		projectId: string,
		maps: { roleIdToSlug: Map<string, string>; providerIdToName: Map<string, string> },
	): Promise<RoleAssignment[] | null> {
		const project = await this._fetchRemoteProject(projectId);
		if (!project.ok) {
			console.warn(`[DivisionProjectService] RoleAssignment fetch failed for ${projectId}: ${project.error}`);
			return null;
		}
		console.log(`[DivisionProjectService] Fetched ${project.assignments.length} assignments for project ${projectId}:`, JSON.stringify(project.assignments).substring(0, 500));
		return this._assignmentsToAgents(project.assignments, maps);
	}

	private _assignmentsToAgents(
		assignments: RemoteAssignment[],
		maps: { roleIdToSlug: Map<string, string>; providerIdToName: Map<string, string> },
	): RoleAssignment[] {
		return assignments.map(a => {
			let model = '';
			let effort: ReasoningEffort | undefined;
			try {
				const cfg = JSON.parse(a.config || '{}');
				model = cfg.model || '';
				effort = normalizeReasoningEffort(cfg.effort);
			} catch { /* ignore */ }

			// Resolve role: 埋め込みリレーションの slug → ルックアップマップ → raw roleId の順で探索する。
			// displayName 用の `name` は使わない（内部識別子と乖離するため）。
			let roleRaw = a.roleId;
			if (a.Role && a.Role.slug) {
				roleRaw = a.Role.slug;
			} else if (maps.roleIdToSlug.has(a.roleId)) {
				roleRaw = maps.roleIdToSlug.get(a.roleId)!;
			}

			// Resolve provider: 埋め込みリレーションの name（内部識別子） → ルックアップマップ → raw providerId。
			// displayName は人間向けの表示文字列なので絶対に採用しない。
			let providerRaw = a.providerId;
			if (a.Provider && a.Provider.name) {
				providerRaw = a.Provider.name;
			} else if (maps.providerIdToName.has(a.providerId)) {
				providerRaw = maps.providerIdToName.get(a.providerId)!;
			}

			// 別名・表示名で汚れていた場合に備えて最後に正規化する。 Orchestra に無いプロバイダ (例: typesafe) は
			// 表示名 (TypeSafe API) ではなく Division のプロバイダ id のまま持つ。
			const role = (normalizeAgentRole(roleRaw) ?? roleRaw) as AgentRole;
			const provider: RoleProvider = normalizeProviderName(providerRaw) ?? normalizeProviderName(a.providerId) ?? a.providerId;

			return { role, provider, model, ...(effort ? { effort } : {}) };
		});
	}

	/**
	 * "Pull from Remote" の既定動作。
	 * ログイン中アカウントが所有する Division プロジェクトを Supabase から取得し、
	 * projects.json にマージする（ローカルにしか無いプロジェクトは残す）。
	 */
	private async _pullAccountProjectsFromSupabase(): Promise<{ success: boolean; message: string }> {
		try {
			// Project.ownerId / Project.userId のどちらにユーザー ID が入っているかは
			// 作成経路（IDE 同期 / Web）で異なるため、両方を OR で引く。
			const projectsRes = await this._divisionApiGet(DIVISION_PROJECTS_API_PREFIX);
			if (!projectsRes.ok) {
				return { success: false, message: `Project fetch failed (${this._describeApiError(projectsRes)})` };
			}

			const rows: Array<{ id?: string; name?: string; updatedAt?: string }> = Array.isArray(projectsRes.data) ? projectsRes.data : [];
			// 新しく更新されたものから (先頭が既定のアクティブプロジェクトになる)
			rows.sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')));
			const remoteProjects = rows.filter((r): r is { id: string; name?: string } => typeof r.id === 'string' && !!r.id);
			if (remoteProjects.length === 0) {
				return { success: false, message: 'No division projects found for the signed-in account' };
			}

			// 新しいワークスペースで自動生成された既定プロジェクトは、アカウントのプロジェクトを pull したら消す。
			// ログイン時に ID が振られているので空 ID では見分けられない。名前で見分け、リモートにあるものは残す。
			const remoteIds = new Set(remoteProjects.map(r => r.id));
			const isPlaceholder = (p: DivisionProjectConfig) =>
				p.name === DEFAULT_DIVISION_PROJECT_NAME && !remoteIds.has(p.projectId);
			const removedPlaceholders = this._projects.filter(isPlaceholder).length;
			this._projects = this._projects.filter(p => !isPlaceholder(p));

			const maps = await this._buildRoleProviderMaps();

			let added = 0;
			let updated = 0;

			for (const row of remoteProjects) {
				const idx = this._projects.findIndex(p => p.projectId === row.id);
				const existing = idx >= 0 ? this._projects[idx] : null;
				const agents = await this._fetchRemoteAgents(row.id, maps);

				const merged: DivisionProjectConfig = {
					projectId: row.id,
					name: row.name || existing?.name || 'Division Project',
					// リモートに RoleAssignment が 1 件も無い / 取得失敗の場合はローカル設定を維持する
					agents: agents && agents.length > 0
						? agents
						: (existing?.agents ?? [...defaultRoleAssignments]),
				};

				if (idx >= 0) {
					this._projects[idx] = merged;
					updated++;
				} else {
					this._projects.push(merged);
					added++;
				}
			}

			const validIds = new Set(this._projects.map(p => p.projectId));
			this._activeProjectIds = this._activeProjectIds.filter(id => validIds.has(id));
			if (this._activeProjectIds.length === 0) {
				this._activeProjectIds = [remoteProjects[0].id];
			}

			await this._persistToDisk();
			this._onDidChangeProject.fire();

			return {
				success: true,
				message: `Pulled ${remoteProjects.length} division project(s) from your account (${added} added, ${updated} updated`
					+ (removedPlaceholders > 0 ? `, removed the default project)` : ')'),
			};
		} catch (e) {
			return { success: false, message: `Supabase fetch error: ${e}` };
		}
	}

	/** projects.json に既に書かれている Project ID を Supabase の内容で更新する。 */
	private async _refreshLocalProjectsFromSupabase(projectIds: string[]): Promise<{ success: boolean; message: string }> {
		try {
			const targetProjects = this._projects.filter(p => p.projectId && projectIds.includes(p.projectId));
			if (targetProjects.length === 0) {
				return { success: false, message: 'No projects with Project ID configured' };
			}

			const maps = await this._buildRoleProviderMaps();

			let totalUpdated = 0;
			let lastError = '';

			for (const project of targetProjects) {
				const remote = await this._fetchRemoteProject(project.projectId);
				if (!remote.ok) {
					console.warn(`[DivisionProjectService] Project fetch failed for ${project.projectId}: ${remote.error}`);
					lastError = remote.error;
					continue;
				}

				const agents = this._assignmentsToAgents(remote.assignments, maps);

				const updatedProject: DivisionProjectConfig = {
					...project,
					name: remote.name || project.name,
					agents: agents.length > 0 ? agents : project.agents,
				};

				await this.save(updatedProject);
				totalUpdated++;
			}

			if (totalUpdated === 0) {
				return { success: false, message: lastError ? `Project fetch failed (${lastError})` : 'No projects found in Division' };
			}
			return { success: true, message: `${totalUpdated} project(s) synced from Supabase` };
		} catch (e) {
			return { success: false, message: `Supabase fetch error: ${e}` };
		}
	}

	async fetchFromSupabase(projectId?: string): Promise<{ success: boolean; message: string }> {
		// 特定プロジェクト指定時は、そのプロジェクトだけを更新する（従来動作）。
		if (projectId) {
			return this._refreshLocalProjectsFromSupabase([projectId]);
		}

		await this.voidSettingsService.waitForInitState;
		const { isLoggedIn, divisionUserId } = this.voidSettingsService.state.globalSettings;

		// ログイン済みなら、そのアカウントが所有する Division プロジェクトを取得する。
		if (isLoggedIn && divisionUserId) {
			return this._pullAccountProjectsFromSupabase();
		}

		// Project / RoleAssignment はログイン中アカウントの認証情報でしか読めない (RLS でサーバー専用)。
		return { success: false, message: 'Sign in to Division to pull the projects of your account' };
	}

	async fetchAndUpdateFromAPI(localProjectId: string): Promise<{ success: boolean; message: string }> {
		const project = this._projects.find(p => p.projectId === localProjectId);
		if (!project) {
			return { success: false, message: 'Project not found' };
		}
		if (!project.projectId) {
			return { success: false, message: 'No Project ID configured' };
		}

		try {
			const endpoint = (this.voidSettingsService.state.settingsOfProvider as any).divisionAPI?.endpoint || 'https://api.division.he-ro.io';
			const response = await fetch(`${endpoint}/api/projects/${encodeURIComponent(project.projectId)}`);
			if (!response.ok) {
				return { success: false, message: `API error: ${response.status}` };
			}
			const data = await response.json();

			const updatedProject: DivisionProjectConfig = {
				...project,
				name: typeof data.name === 'string' ? data.name : project.name,
				agents: Array.isArray(data.agents) ? this._parseAgents(data.agents).agents : project.agents,
			};

			await this.save(updatedProject);
			return { success: true, message: 'Project updated successfully' };
		} catch (e) {
			return { success: false, message: `Error: ${e}` };
		}
	}

	async fetchAndUpdateAllFromAPI(): Promise<{ success: boolean; message: string }> {
		const projectsWithId = this._projects.filter(p => p.projectId);
		if (projectsWithId.length === 0) {
			return { success: false, message: 'No projects with Project ID configured' };
		}

		const results = await Promise.all(
			projectsWithId.map(p => this.fetchAndUpdateFromAPI(p.projectId))
		);

		const errors = results.filter(r => !r.success).map(r => r.message);
		if (errors.length === results.length) {
			return { success: false, message: errors[0] || 'All updates failed' };
		}
		if (errors.length > 0) {
			return { success: true, message: `Updated with some errors: ${errors.join(', ')}` };
		}
		return { success: true, message: `Updated ${results.length} project(s) successfully` };
	}
}


registerSingleton(IDivisionProjectService, DivisionProjectService, InstantiationType.Eager);
