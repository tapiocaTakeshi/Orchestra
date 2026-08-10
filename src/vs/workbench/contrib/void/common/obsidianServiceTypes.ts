/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// Obsidian 連携の型定義。
//
// Obsidian の Vault (= Markdown ファイルが入ったただのフォルダ) を Orchestra に紐づけ、
// 同期するとフォルダ名を取り込む。取り込んだフォルダ名は MCP のファンクションと同じように
// エージェントへ公開され、フォルダ名をテキストとして渡すとそのフォルダ内の .md を読み取る。
// さらに Vault 内の全 Markdown を読む `all-md` コンテキストを常に用意する。

// ---------------------------------------------------------------------------
// 永続化される設定 (GlobalSettings.obsidian)
// ---------------------------------------------------------------------------

export type ObsidianFolderUserState = {
	isOn: boolean;
};

export type ObsidianSettings = {
	/** Vault (Obsidian で開いているフォルダ) の絶対パス。'' なら未設定 */
	vaultPath: string;

	/** フォルダを読むとき、サブフォルダの .md も含めるか */
	includeSubfolders: boolean;

	/**
	 * 取り込んだフォルダを 1 つずつ個別のツール (obsidian_<folder>) として公開するか。
	 * off にしても obsidian_read_folder / obsidian_all_md は使えるので、
	 * ツール一覧を短く保ちたいときはこちらを off にする。
	 */
	exposeFolderTools: boolean;

	/** 1 回の読み取りで返す .md ファイルの最大数 */
	maxFilesPerRead: number;
	/** 1 ファイルあたりの最大文字数。超えた分は切り詰める */
	maxCharsPerFile: number;
	/** 1 回の読み取り全体の最大文字数。超えたらそこで打ち切る */
	maxTotalChars: number;

	/** フォルダごとの ON/OFF。キーは ObsidianFolder.slug */
	folderStateOfName: { [slug: string]: ObsidianFolderUserState | undefined };
};

export const defaultObsidianSettings: ObsidianSettings = {
	vaultPath: '',
	includeSubfolders: true,
	exposeFolderTools: true,
	maxFilesPerRead: 50,
	maxCharsPerFile: 20_000,
	maxTotalChars: 200_000,
	folderStateOfName: {},
};

export const MIN_OBSIDIAN_MAX_FILES_PER_READ = 1;
export const MAX_OBSIDIAN_MAX_FILES_PER_READ = 1000;
export const MIN_OBSIDIAN_MAX_CHARS_PER_FILE = 500;
export const MAX_OBSIDIAN_MAX_CHARS_PER_FILE = 500_000;
export const MIN_OBSIDIAN_MAX_TOTAL_CHARS = 1000;
export const MAX_OBSIDIAN_MAX_TOTAL_CHARS = 2_000_000;

// ---------------------------------------------------------------------------
// 同期して得られる状態 (永続化しない)
// ---------------------------------------------------------------------------

export type ObsidianFolder = {
	/** ツール名に使う識別子。relativePath から生成する */
	slug: string;
	/** 表示名 (パスの末尾の名前)。Vault 直下は Vault 名 */
	name: string;
	/** Vault ルートからの相対パス (POSIX 区切り)。'' は Vault ルート */
	relativePath: string;
	/** このフォルダ直下にある .md の数 */
	mdFileCount: number;
	/** サブフォルダも含めた .md の数 */
	totalMdFileCount: number;
};

export type ObsidianSyncStatus = 'unconfigured' | 'syncing' | 'synced' | 'error';

export type ObsidianServiceState = {
	status: ObsidianSyncStatus;
	/** 同期に成功した Vault のパス */
	vaultPath: string;
	/** Vault フォルダの名前 (表示用) */
	vaultName: string;
	/** 取り込んだフォルダ。Vault ルートを先頭に、パス順で並ぶ */
	folders: ObsidianFolder[];
	/** Vault 全体の .md の数 */
	totalMdFileCount: number;
	lastSyncedAt: number | undefined;
	error: string | undefined;
};

export const defaultObsidianServiceState: ObsidianServiceState = {
	status: 'unconfigured',
	vaultPath: '',
	vaultName: '',
	folders: [],
	totalMdFileCount: 0,
	lastSyncedAt: undefined,
	error: undefined,
};

// ---------------------------------------------------------------------------
// ツール名まわり
// ---------------------------------------------------------------------------

export const OBSIDIAN_TOOL_NAME_PREFIX = 'obsidian_';
/** フォルダ名をテキストで受け取って読み取る汎用ツール */
export const OBSIDIAN_READ_FOLDER_TOOL_NAME = 'obsidian_read_folder';
/** Vault 内の全 Markdown を読む `all-md` コンテキスト */
export const OBSIDIAN_ALL_MD_TOOL_NAME = 'obsidian_all_md';
/** ユーザー / モデルが `all-md` を指すときに書く名前 */
export const ALL_MD_CONTEXT_NAME = 'all-md';
/** obsidian_read_folder に all-md を渡されたときも同じ扱いにする別名 */
export const ALL_MD_ALIASES = ['all-md', 'all_md', 'allmd', 'all md', '*'];

/** UI 表示 / 「Called <名前>」に使う表示名 */
export const OBSIDIAN_DISPLAY_NAME = 'Obsidian';

/**
 * 個別フォルダツールを出す上限。Vault のフォルダが多いとツール一覧が膨れ、
 * モデルの精度もコストも悪化するので、これを超えたら個別ツールは出さず
 * obsidian_read_folder に任せる (UI で警告する)。
 */
export const MAX_OBSIDIAN_FOLDER_TOOLS = 40;

/** 同期時に潜る最大の深さ。Vault ルートが深さ 0 */
export const MAX_OBSIDIAN_SCAN_DEPTH = 8;

/** 同期時に無視するフォルダ名 (Obsidian の内部フォルダなど) */
export const OBSIDIAN_IGNORED_FOLDER_NAMES = [
	'.obsidian',
	'.trash',
	'.git',
	'.svn',
	'.hg',
	'node_modules',
	'.DS_Store',
];

export const isMarkdownFileName = (fileName: string): boolean =>
	/\.(md|markdown|mdx)$/i.test(fileName);

export const isIgnoredObsidianFolderName = (folderName: string): boolean =>
	OBSIDIAN_IGNORED_FOLDER_NAMES.some(n => n.toLowerCase() === folderName.toLowerCase());

/**
 * 相対パスからツール名に使える slug を作る。
 * 'Projects/2025 Notes' -> 'projects_2025_notes'、Vault ルート ('') -> 'vault_root'
 */
export const obsidianSlugOfRelativePath = (relativePath: string): string => {
	const slug = relativePath.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
	return slug || 'vault_root';
};

/**
 * 比較用にフォルダ名 / パスを正規化する。
 * 区切り (\ → /)、前後の空白、先頭の './'、末尾の '/'、大文字小文字を吸収する。
 * Vault ルートを指す '.' や './' は '' になる。
 */
export const normalizeObsidianFolderPath = (name: string): string =>
	name.trim()
		.replace(/\\/g, '/')
		.replace(/^\.\/+/, '')
		.replace(/\/+$/, '')
		.replace(/^\.$/, '');

export const normalizeObsidianFolderKey = (name: string): string =>
	normalizeObsidianFolderPath(name).toLowerCase();

/** Vault の外を指す名前 (絶対パス / Windows ドライブ / '..') を弾く */
export const isSafeObsidianRelativePath = (relativePath: string): boolean => {
	if (!relativePath) return false;
	if (relativePath.startsWith('/') || /^[a-zA-Z]:/.test(relativePath)) return false;
	return relativePath.split('/').every(segment => segment !== '' && segment !== '.' && segment !== '..');
};

export const isAllMdName = (name: string): boolean => {
	const normalized = name.trim().toLowerCase();
	return ALL_MD_ALIASES.includes(normalized);
};
