/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// Obsidian 連携サービス。
//
// Obsidian の Vault は「Markdown ファイルが入ったただのフォルダ」なので、連携といっても
// Obsidian 本体と通信するわけではなく、Vault フォルダをそのまま読む。
//
//   1. ユーザーが Settings > Obsidian で Vault のパスを指定して「同期」を押す
//   2. Vault を走査して .md を含むフォルダ名を取り込む (= state.folders)
//   3. 取り込んだフォルダは MCP のファンクションと同じ形でエージェントに公開される
//        - obsidian_read_folder … フォルダ名をテキストで受け取り、その中の .md を読む
//        - obsidian_<folder>    … 取り込んだフォルダ 1 つにつき 1 ツール
//        - obsidian_all_md      … Vault 内の全 Markdown を読む `all-md` コンテキスト
//
// ファイルの中身はツール呼び出しのたびにディスクから読み直すので、同期し直さなくても
// メモの編集はすぐ反映される。同期はあくまで「フォルダ名の取り込み」。

import { URI } from '../../../../base/common/uri.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IFileService, IFileStat } from '../../../../platform/files/common/files.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IPathService } from '../../../services/path/common/pathService.js';
import { Event, Emitter } from '../../../../base/common/event.js';
import { InternalToolInfo } from './prompt/prompts.js';
import { IVoidSettingsService } from './voidSettingsService.js';
import { RawMCPToolCall } from './mcpServiceTypes.js';
import {
	ALL_MD_CONTEXT_NAME,
	defaultObsidianServiceState,
	defaultObsidianSettings,
	isAllMdName,
	isIgnoredObsidianFolderName,
	isMarkdownFileName,
	MAX_OBSIDIAN_FOLDER_TOOLS,
	MAX_OBSIDIAN_MAX_CHARS_PER_FILE,
	MAX_OBSIDIAN_MAX_FILES_PER_READ,
	MAX_OBSIDIAN_MAX_TOTAL_CHARS,
	MAX_OBSIDIAN_SCAN_DEPTH,
	MIN_OBSIDIAN_MAX_CHARS_PER_FILE,
	MIN_OBSIDIAN_MAX_FILES_PER_READ,
	MIN_OBSIDIAN_MAX_TOTAL_CHARS,
	isSafeObsidianRelativePath,
	normalizeObsidianFolderKey,
	normalizeObsidianFolderPath,
	OBSIDIAN_ALL_MD_TOOL_NAME,
	OBSIDIAN_DISPLAY_NAME,
	OBSIDIAN_READ_FOLDER_TOOL_NAME,
	OBSIDIAN_TOOL_NAME_PREFIX,
	ObsidianFolder,
	obsidianSlugOfRelativePath,
	ObsidianServiceState,
	ObsidianSettings,
} from './obsidianServiceTypes.js';


export interface IObsidianService {
	readonly _serviceBrand: undefined;

	readonly state: ObsidianServiceState; // NOT persisted (設定は GlobalSettings.obsidian 側)
	onDidChangeState: Event<void>;

	/** Vault のパスを保存し、続けて同期する */
	setVaultPath(vaultPath: string): Promise<void>;
	/** フォルダ選択ダイアログを開いて Vault を選ぶ。選ばれたら同期まで行う */
	browseForVault(): Promise<void>;
	/** Vault を走査してフォルダ名を取り込み直す */
	syncVault(): Promise<void>;
	/** Vault の紐づけを解除する */
	disconnectVault(): Promise<void>;

	/** 取り込んだフォルダを個別にツールとして公開するかどうか */
	toggleFolderIsOn(slug: string, isOn: boolean): Promise<void>;
	setAllFoldersOn(isOn: boolean): Promise<void>;

	/** エージェントに見せるツール一覧 (Vault 未設定なら undefined) */
	getObsidianTools(): InternalToolInfo[] | undefined;
	callObsidianTool(toolName: string, params: Record<string, unknown> | undefined): Promise<RawMCPToolCall>;
}

export const IObsidianService = createDecorator<IObsidianService>('obsidianService');


const clamp = (n: number | undefined, min: number, max: number, fallback: number): number => {
	if (typeof n !== 'number' || !Number.isFinite(n)) return fallback;
	return Math.min(max, Math.max(min, Math.round(n)));
};

/** 'C:\\Vault\\Notes' も '/vault/notes' も POSIX 区切りに揃える */
const toPosixPath = (p: string): string => p.replace(/\\/g, '/');

const basenameOfPath = (p: string): string => {
	const segments = toPosixPath(p).replace(/\/+$/, '').split('/');
	return segments[segments.length - 1] || p;
};


class ObsidianService extends Disposable implements IObsidianService {
	_serviceBrand: undefined;

	state: ObsidianServiceState = { ...defaultObsidianServiceState };

	private readonly _onDidChangeState = new Emitter<void>();
	public readonly onDidChangeState = this._onDidChangeState.event;

	/** 同期が二重に走らないようにする */
	private _syncPromise: Promise<void> | undefined;

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IPathService private readonly pathService: IPathService,
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
		@IVoidSettingsService private readonly voidSettingsService: IVoidSettingsService,
	) {
		super();
		this._initialize();
	}

	private async _initialize() {
		try {
			await this.voidSettingsService.waitForInitState;
			if (!this._settings().vaultPath) return;
			await this.syncVault();
		} catch (error) {
			console.error('Error initializing ObsidianService:', error);
		}
	}

	// ---------------------------------------------------------------- 設定

	private _settings(): ObsidianSettings {
		return {
			...defaultObsidianSettings,
			...(this.voidSettingsService.state.globalSettings.obsidian ?? {}),
		};
	}

	private async _updateSettings(partial: Partial<ObsidianSettings>): Promise<void> {
		await this.voidSettingsService.setGlobalSetting('obsidian', { ...this._settings(), ...partial });
	}

	private _setState(partial: Partial<ObsidianServiceState>) {
		this.state = { ...this.state, ...partial };
		this._onDidChangeState.fire();
	}

	// ---------------------------------------------------------------- Vault

	private async _vaultUri(vaultPath: string): Promise<URI> {
		return this.pathService.fileURI(vaultPath);
	}

	public async setVaultPath(vaultPath: string): Promise<void> {
		const trimmed = vaultPath.trim();
		// Vault を差し替えたらフォルダの ON/OFF は前の Vault のものなので捨てる
		const previousPath = this._settings().vaultPath;
		await this._updateSettings({
			vaultPath: trimmed,
			...(trimmed === previousPath ? {} : { folderStateOfName: {} }),
		});
		if (!trimmed) {
			this._setState({ ...defaultObsidianServiceState });
			return;
		}
		await this.syncVault();
	}

	public async browseForVault(): Promise<void> {
		const picked = await this.fileDialogService.showOpenDialog({
			canSelectFiles: false,
			canSelectFolders: true,
			canSelectMany: false,
			title: 'Select your Obsidian vault folder',
		});
		const uri = picked?.[0];
		if (!uri) return;
		await this.setVaultPath(uri.fsPath);
	}

	public async disconnectVault(): Promise<void> {
		await this._updateSettings({ vaultPath: '', folderStateOfName: {} });
		this._setState({ ...defaultObsidianServiceState });
	}

	public async syncVault(): Promise<void> {
		if (this._syncPromise) return this._syncPromise;
		this._syncPromise = this._syncVaultNow().finally(() => { this._syncPromise = undefined; });
		return this._syncPromise;
	}

	private async _syncVaultNow(): Promise<void> {
		const { vaultPath } = this._settings();
		if (!vaultPath) {
			this._setState({ ...defaultObsidianServiceState });
			return;
		}

		this._setState({ status: 'syncing', vaultPath, error: undefined });

		let vaultUri: URI;
		try {
			vaultUri = await this._vaultUri(vaultPath);
		} catch (error) {
			this._setState({ status: 'error', error: `Could not resolve the vault path: ${error}` });
			return;
		}

		try {
			const exists = await this.fileService.exists(vaultUri);
			if (!exists) {
				this._setState({ status: 'error', folders: [], totalMdFileCount: 0, error: `The folder "${vaultPath}" does not exist.` });
				return;
			}
			const rootStat = await this.fileService.resolve(vaultUri);
			if (!rootStat.isDirectory) {
				this._setState({ status: 'error', folders: [], totalMdFileCount: 0, error: `"${vaultPath}" is a file, not a folder. Point this at the vault folder that Obsidian opens.` });
				return;
			}

			const vaultName = basenameOfPath(vaultPath);
			const folders: ObsidianFolder[] = [];
			const usedSlugs = new Set<string>();
			const totalMdFileCount = await this._collectFolders(vaultUri, '', vaultName, 0, folders, usedSlugs);
			// Vault ルートを先頭に、あとはパス順
			folders.sort((a, b) => a.relativePath === '' ? -1 : b.relativePath === '' ? 1 : a.relativePath.localeCompare(b.relativePath));

			// 取り込んだフォルダのうち、まだ ON/OFF が決まっていないものは ON にする。
			// 消えたフォルダの状態は捨てる。
			const { folderStateOfName } = this._settings();
			const nextFolderStateOfName: ObsidianSettings['folderStateOfName'] = {};
			for (const folder of folders) {
				nextFolderStateOfName[folder.slug] = folderStateOfName[folder.slug] ?? { isOn: true };
			}
			await this._updateSettings({ folderStateOfName: nextFolderStateOfName });

			this._setState({
				status: 'synced',
				vaultPath,
				vaultName,
				folders,
				totalMdFileCount,
				lastSyncedAt: Date.now(),
				error: undefined,
			});
		} catch (error) {
			this._setState({ status: 'error', folders: [], totalMdFileCount: 0, error: `Error scanning the vault: ${error}` });
		}
	}

	/**
	 * フォルダを再帰的に走査し、.md を 1 つでも持つフォルダを `out` へ push する。
	 * 戻り値はこのフォルダ以下 (サブフォルダ込み) の .md の数。
	 */
	private async _collectFolders(
		uri: URI,
		relativePath: string,
		displayName: string,
		depth: number,
		out: ObsidianFolder[],
		usedSlugs: Set<string>,
	): Promise<number> {
		let stat: IFileStat;
		try {
			stat = await this.fileService.resolve(uri);
		} catch {
			return 0; // 読めないフォルダ (権限など) は黙って飛ばす
		}
		const children = stat.children ?? [];

		let mdFileCount = 0;
		for (const child of children) {
			if (!child.isDirectory && isMarkdownFileName(child.name)) mdFileCount++;
		}

		let totalMdFileCount = mdFileCount;
		if (depth < MAX_OBSIDIAN_SCAN_DEPTH) {
			for (const child of children) {
				if (!child.isDirectory) continue;
				if (isIgnoredObsidianFolderName(child.name)) continue;
				const childRelativePath = relativePath ? `${relativePath}/${child.name}` : child.name;
				totalMdFileCount += await this._collectFolders(child.resource, childRelativePath, child.name, depth + 1, out, usedSlugs);
			}
		}

		// Vault ルートは .md が 0 件でも「all-md の入り口」として常に出す
		const isVaultRoot = relativePath === '';
		if (mdFileCount === 0 && !isVaultRoot) return totalMdFileCount;

		let slug = obsidianSlugOfRelativePath(relativePath);
		while (usedSlugs.has(slug)) slug = `${slug}_`;
		usedSlugs.add(slug);

		out.push({ slug, name: displayName, relativePath, mdFileCount, totalMdFileCount });
		return totalMdFileCount;
	}

	// ---------------------------------------------------------------- フォルダの ON/OFF

	public async toggleFolderIsOn(slug: string, isOn: boolean): Promise<void> {
		const { folderStateOfName } = this._settings();
		await this._updateSettings({ folderStateOfName: { ...folderStateOfName, [slug]: { isOn } } });
		this._onDidChangeState.fire();
	}

	public async setAllFoldersOn(isOn: boolean): Promise<void> {
		const folderStateOfName: ObsidianSettings['folderStateOfName'] = {};
		for (const folder of this.state.folders) folderStateOfName[folder.slug] = { isOn };
		await this._updateSettings({ folderStateOfName });
		this._onDidChangeState.fire();
	}

	private _enabledFolders(): ObsidianFolder[] {
		const { folderStateOfName } = this._settings();
		return this.state.folders.filter(f => folderStateOfName[f.slug]?.isOn !== false);
	}

	// ---------------------------------------------------------------- ツール

	public getObsidianTools(): InternalToolInfo[] | undefined {
		const settings = this._settings();
		// 未設定なら何も出さない。同期に失敗している間も、必ず失敗するツールを見せても
		// モデルを迷わせるだけなので出さない (エラーは Settings 側に出ている)。
		if (!settings.vaultPath || this.state.status === 'error') return undefined;

		const vaultName = this.state.vaultName || basenameOfPath(settings.vaultPath);
		const enabledFolders = this._enabledFolders();
		// Vault ルートはフォルダ名として渡すものがないので、名前一覧からは省く
		const folderNames = enabledFolders.filter(f => f.relativePath).map(f => f.relativePath);

		const knownFoldersStr = folderNames.length === 0
			? `(no folders imported yet - run a sync from Settings > Obsidian)`
			: folderNames.join(', ');

		const tools: InternalToolInfo[] = [
			{
				name: OBSIDIAN_READ_FOLDER_TOOL_NAME,
				description: `Reads the Markdown notes in one folder of the user's Obsidian vault "${vaultName}". `
					+ `Use this whenever the user refers to their Obsidian notes by folder name. `
					+ `Imported folder names: ${knownFoldersStr}. `
					+ `Pass "${ALL_MD_CONTEXT_NAME}" to read every Markdown file in the whole vault instead of one folder.`,
				params: {
					folder_name: {
						description: `The folder to read, written exactly as one of the imported folder names above `
							+ `(a nested folder can be given as its path relative to the vault root, e.g. "Projects/2025"). `
							+ `Use "${ALL_MD_CONTEXT_NAME}" for the whole vault, or "" / "." for the notes directly in the vault root.`,
					},
				},
				mcpServerName: OBSIDIAN_DISPLAY_NAME,
			},
			{
				name: OBSIDIAN_ALL_MD_TOOL_NAME,
				description: `The "${ALL_MD_CONTEXT_NAME}" context: reads every Markdown file in the user's Obsidian vault "${vaultName}" `
					+ `(${this.state.totalMdFileCount} file${this.state.totalMdFileCount === 1 ? '' : 's'} at the last sync). `
					+ `This can be a lot of text - prefer ${OBSIDIAN_READ_FOLDER_TOOL_NAME} when you already know which folder the notes are in.`,
				params: {},
				mcpServerName: OBSIDIAN_DISPLAY_NAME,
			},
		];

		// 取り込んだフォルダを 1 つずつツールにする (MCP のファンクションと同じ見え方)。
		// 多すぎるとツール一覧が膨れるので上限を超えたら出さない。read_folder があるので機能は失われない。
		if (settings.exposeFolderTools && enabledFolders.length <= MAX_OBSIDIAN_FOLDER_TOOLS) {
			for (const folder of enabledFolders) {
				if (!folder.relativePath) continue; // ルートは all-md / read_folder で足りる
				tools.push({
					name: `${OBSIDIAN_TOOL_NAME_PREFIX}${folder.slug}`,
					description: `Reads the Markdown notes in the "${folder.relativePath}" folder of the Obsidian vault "${vaultName}" `
						+ `(${folder.mdFileCount} file${folder.mdFileCount === 1 ? '' : 's'} directly inside`
						+ `${settings.includeSubfolders && folder.totalMdFileCount > folder.mdFileCount ? `, ${folder.totalMdFileCount} including subfolders` : ''}).`,
					params: {},
					mcpServerName: OBSIDIAN_DISPLAY_NAME,
				});
			}
		}

		return tools;
	}

	public async callObsidianTool(toolName: string, params: Record<string, unknown> | undefined): Promise<RawMCPToolCall> {
		const settings = this._settings();
		if (!settings.vaultPath) {
			return { toolName, event: 'error', text: `No Obsidian vault is connected. Connect one in Settings > Obsidian.` };
		}

		try {
			if (toolName === OBSIDIAN_ALL_MD_TOOL_NAME) {
				return await this._readFolder(toolName, '', { forceRecursive: true, label: ALL_MD_CONTEXT_NAME });
			}

			if (toolName === OBSIDIAN_READ_FOLDER_TOOL_NAME) {
				const rawName = typeof params?.['folder_name'] === 'string' ? params['folder_name'] as string : '';
				if (isAllMdName(rawName)) {
					return await this._readFolder(toolName, '', { forceRecursive: true, label: ALL_MD_CONTEXT_NAME });
				}
				const folder = this._resolveFolderByName(rawName);
				if (folder) return await this._readFolder(toolName, folder.relativePath, {});

				// 取り込み済みの一覧に無くても、Vault に実在するフォルダなら読む。
				// (同期後に作られたフォルダや、まだ一度も同期していない場合)
				const onDiskPath = await this._resolveFolderOnDisk(rawName);
				if (onDiskPath !== undefined) return await this._readFolder(toolName, onDiskPath, {});

				const known = this.state.folders.filter(f => f.relativePath).map(f => f.relativePath).join(', ');
				return {
					toolName, event: 'error',
					text: `There is no folder named "${rawName}" in the Obsidian vault. Imported folders: ${known || '(none)'}. `
						+ `Use "${ALL_MD_CONTEXT_NAME}" to read the whole vault.`,
				};
			}

			// obsidian_<slug>
			const slug = toolName.startsWith(OBSIDIAN_TOOL_NAME_PREFIX) ? toolName.slice(OBSIDIAN_TOOL_NAME_PREFIX.length) : toolName;
			const folder = this.state.folders.find(f => f.slug === slug);
			if (!folder) {
				return { toolName, event: 'error', text: `The Obsidian folder "${slug}" was not found. Re-sync the vault in Settings > Obsidian.` };
			}
			return await this._readFolder(toolName, folder.relativePath, {});
		} catch (error) {
			return { toolName, event: 'error', text: `Error reading from the Obsidian vault: ${error}` };
		}
	}

	/** 取り込んだフォルダを、slug / 相対パス / 末尾の名前 のどれでも引けるようにする */
	private _resolveFolderByName(name: string): ObsidianFolder | undefined {
		const key = normalizeObsidianFolderKey(name);
		if (!key) return this.state.folders.find(f => f.relativePath === ''); // '' や '.' は Vault ルート

		const folders = this.state.folders;
		return folders.find(f => normalizeObsidianFolderKey(f.relativePath) === key)
			?? folders.find(f => f.slug === obsidianSlugOfRelativePath(name))
			?? folders.find(f => f.name.toLowerCase() === key)
			// 'Projects/2025' に対して '2025' のような末尾一致も拾う
			?? folders.find(f => normalizeObsidianFolderKey(f.relativePath).endsWith(`/${key}`));
	}

	/**
	 * 取り込み済みの一覧に無い名前を、Vault 内の実在するフォルダとして解決する。
	 * Vault の外へ出る名前 ('..' や絶対パス) は弾く。見つからなければ undefined。
	 */
	private async _resolveFolderOnDisk(name: string): Promise<string | undefined> {
		const relativePath = normalizeObsidianFolderPath(name);
		if (!isSafeObsidianRelativePath(relativePath)) return undefined;
		const segments = relativePath.split('/');

		try {
			const vaultUri = await this._vaultUri(this._settings().vaultPath);
			const folderUri = URI.joinPath(vaultUri, ...segments);
			const stat = await this.fileService.resolve(folderUri);
			if (!stat.isDirectory) return undefined;
			return relativePath;
		} catch {
			return undefined;
		}
	}

	// ---------------------------------------------------------------- 読み取り

	private async _readFolder(
		toolName: string,
		relativePath: string,
		opts: { forceRecursive?: boolean, label?: string },
	): Promise<RawMCPToolCall> {
		const settings = this._settings();
		const recursive = opts.forceRecursive || settings.includeSubfolders;

		const vaultUri = await this._vaultUri(settings.vaultPath);
		const folderUri = relativePath ? URI.joinPath(vaultUri, ...relativePath.split('/')) : vaultUri;

		if (!(await this.fileService.exists(folderUri))) {
			return { toolName, event: 'error', text: `The folder "${relativePath || '.'}" no longer exists in the Obsidian vault. Re-sync the vault in Settings > Obsidian.` };
		}

		const files: { uri: URI, relativePath: string }[] = [];
		await this._collectMarkdownFiles(folderUri, relativePath, recursive, 0, files);
		files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

		const maxFiles = clamp(settings.maxFilesPerRead, MIN_OBSIDIAN_MAX_FILES_PER_READ, MAX_OBSIDIAN_MAX_FILES_PER_READ, defaultObsidianSettings.maxFilesPerRead);
		const maxCharsPerFile = clamp(settings.maxCharsPerFile, MIN_OBSIDIAN_MAX_CHARS_PER_FILE, MAX_OBSIDIAN_MAX_CHARS_PER_FILE, defaultObsidianSettings.maxCharsPerFile);
		const maxTotalChars = clamp(settings.maxTotalChars, MIN_OBSIDIAN_MAX_TOTAL_CHARS, MAX_OBSIDIAN_MAX_TOTAL_CHARS, defaultObsidianSettings.maxTotalChars);

		const label = opts.label ?? (relativePath || `${this.state.vaultName || 'vault'} (vault root)`);
		const headerLines = [
			`# Obsidian vault: ${this.state.vaultName || basenameOfPath(settings.vaultPath)}`,
			`Context: ${label}`,
			`Scope: ${relativePath ? `folder "${relativePath}"` : recursive ? 'the whole vault' : 'the vault root folder'}${recursive ? ' (including subfolders)' : ' (this folder only, not its subfolders)'}`,
			`Markdown files found: ${files.length}`,
		];

		if (files.length === 0) {
			return { toolName, event: 'text', text: `${headerLines.join('\n')}\n\n(no Markdown files here)` };
		}

		const shownFiles = files.slice(0, maxFiles);
		if (shownFiles.length < files.length) {
			headerLines.push(`Showing the first ${shownFiles.length} (limit set in Settings > Obsidian).`);
		}

		const parts: string[] = [headerLines.join('\n')];
		let totalChars = parts[0].length;
		let truncatedAtFileIndex: number | undefined;

		for (let i = 0; i < shownFiles.length; i++) {
			const file = shownFiles[i];
			if (totalChars >= maxTotalChars) { truncatedAtFileIndex = i; break; }

			let content: string;
			try {
				content = (await this.fileService.readFile(file.uri)).value.toString();
			} catch (error) {
				parts.push(`===== ${file.relativePath} =====\n(could not be read: ${error})`);
				continue;
			}

			let body = content.trim();
			if (body.length > maxCharsPerFile) {
				body = `${body.slice(0, maxCharsPerFile)}\n\n[...truncated, ${content.length - maxCharsPerFile} more characters in this note]`;
			}
			const part = `===== ${file.relativePath} =====\n${body || '(empty note)'}`;
			parts.push(part);
			totalChars += part.length;
		}

		if (truncatedAtFileIndex !== undefined) {
			parts.push(`[...stopped after ${truncatedAtFileIndex} of ${shownFiles.length} notes: the total character limit was reached. Read a smaller folder, or raise the limit in Settings > Obsidian.]`);
		}

		return { toolName, event: 'text', text: parts.join('\n\n') };
	}

	private async _collectMarkdownFiles(
		uri: URI,
		relativePath: string,
		recursive: boolean,
		depth: number,
		out: { uri: URI, relativePath: string }[],
	): Promise<void> {
		let stat: IFileStat;
		try {
			stat = await this.fileService.resolve(uri);
		} catch {
			return;
		}
		for (const child of stat.children ?? []) {
			const childRelativePath = relativePath ? `${relativePath}/${child.name}` : child.name;
			if (child.isDirectory) {
				if (!recursive) continue;
				if (depth >= MAX_OBSIDIAN_SCAN_DEPTH) continue;
				if (isIgnoredObsidianFolderName(child.name)) continue;
				await this._collectMarkdownFiles(child.resource, childRelativePath, recursive, depth + 1, out);
			}
			else if (isMarkdownFileName(child.name)) {
				out.push({ uri: child.resource, relativePath: childRelativePath });
			}
		}
	}
}

registerSingleton(IObsidianService, ObsidianService, InstantiationType.Eager);
