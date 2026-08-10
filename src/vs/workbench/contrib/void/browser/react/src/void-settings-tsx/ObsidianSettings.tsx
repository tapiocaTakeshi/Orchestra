/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// Settings の Obsidian タブ。
// Vault の指定 → 読み取りの設定 → all-md の説明 → 取り込んだフォルダ一覧、の順に並べる。

import React, { useEffect, useState } from 'react';
import { AlertTriangle, Check, Folder, Loader2, RefreshCw } from 'lucide-react';

import { VoidButtonBgDarken, VoidSimpleInputBox, VoidSwitch } from '../util/inputs.js';
import { useAccessor, useObsidianServiceState, useSettingsState } from '../util/services.js';
import { useTranslation } from '../util/i18n.js';
import ErrorBoundary from '../sidebar-tsx/ErrorBoundary.js';
import { WarningBox } from './WarningBox.js';
import {
	ALL_MD_CONTEXT_NAME,
	defaultObsidianSettings,
	MAX_OBSIDIAN_FOLDER_TOOLS,
	MAX_OBSIDIAN_MAX_CHARS_PER_FILE,
	MAX_OBSIDIAN_MAX_FILES_PER_READ,
	MAX_OBSIDIAN_MAX_TOTAL_CHARS,
	MIN_OBSIDIAN_MAX_CHARS_PER_FILE,
	MIN_OBSIDIAN_MAX_FILES_PER_READ,
	MIN_OBSIDIAN_MAX_TOTAL_CHARS,
	OBSIDIAN_ALL_MD_TOOL_NAME,
	OBSIDIAN_READ_FOLDER_TOOL_NAME,
	OBSIDIAN_TOOL_NAME_PREFIX,
	ObsidianFolder,
	ObsidianSettings as ObsidianSettingsType,
} from '../../../../common/obsidianServiceTypes.js';


/** i18n の文字列に含まれる {name} を埋める。t() 自体はプレースホルダを扱わないのでここで行う。 */
const fmt = (template: string, values: Record<string, string | number>): string =>
	template.replace(/\{(\w+)\}/g, (whole, key) => key in values ? String(values[key]) : whole);


const Section = ({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) => (
	<div className='flex flex-col gap-1 border border-void-border-2 bg-void-bg-2 rounded-sm px-3 py-2'>
		<h3 className='text-sm text-void-fg-1 font-medium'>{title}</h3>
		{subtitle ? <p className='text-[11px] text-void-fg-4 mb-1'>{subtitle}</p> : null}
		{children}
	</div>
);

const Field = ({ label, detail, children }: { label: string; detail?: string; children: React.ReactNode }) => (
	<div className='flex items-start justify-between gap-4 py-1.5'>
		<div className='flex flex-col min-w-0'>
			<span className='text-xs text-void-fg-2 font-medium'>{label}</span>
			{detail ? <span className='text-[11px] text-void-fg-4'>{detail}</span> : null}
		</div>
		<div className='shrink-0'>{children}</div>
	</div>
);

const NumberField = ({ value, min, max, onCommit, ariaLabel }: {
	value: number;
	min: number;
	max: number;
	onCommit: (n: number) => void;
	ariaLabel: string;
}) => {
	const [draft, setDraft] = useState(String(value));
	useEffect(() => { setDraft(String(value)); }, [value]);
	const commit = (raw: string) => {
		const parsed = parseInt(raw, 10);
		const clamped = Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : value;
		setDraft(String(clamped));
		if (clamped !== value) onCommit(clamped);
	};
	return (
		<input
			type='number'
			min={min}
			max={max}
			step={1}
			value={draft}
			onChange={e => setDraft(e.target.value)}
			onBlur={e => commit(e.target.value)}
			onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
			className='w-28 bg-void-bg-1 border border-void-border-3 rounded-sm px-2 py-1 text-xs text-void-fg-1 focus:outline-none focus:border-[#0e70c0]'
			aria-label={ariaLabel}
		/>
	);
};

/** 取り込んだフォルダ 1 行。ツール名も出して、エージェントから何と呼ばれるか分かるようにする。 */
const FolderRow = ({ folder, isOn, showToolName, onToggle }: {
	folder: ObsidianFolder;
	isOn: boolean;
	showToolName: boolean;
	onToggle: (isOn: boolean) => void;
}) => {
	const { t } = useTranslation();
	const isVaultRoot = folder.relativePath === '';
	const countLabel = folder.totalMdFileCount > folder.mdFileCount
		? fmt(t('obsidian.folders.fileCountWithNested'), { count: folder.mdFileCount, total: folder.totalMdFileCount })
		: fmt(t('obsidian.folders.fileCount'), { count: folder.mdFileCount });

	return (
		<div className='flex items-center justify-between gap-3 border-b border-void-border-3 last:border-b-0 py-1.5'>
			<div className='flex flex-col min-w-0'>
				<span className='text-xs text-void-fg-1 truncate'>
					{isVaultRoot ? `${folder.name} / ${t('obsidian.folders.vaultRoot')}` : folder.relativePath}
				</span>
				<span className='text-[11px] text-void-fg-4 truncate'>
					{countLabel}
					{showToolName && !isVaultRoot ? ` · ${OBSIDIAN_TOOL_NAME_PREFIX}${folder.slug}` : ''}
				</span>
			</div>
			<VoidSwitch value={isOn} size='xs' onChange={() => onToggle(!isOn)} />
		</div>
	);
};


export const ObsidianSettings = () => {
	const accessor = useAccessor();
	const obsidianService = accessor.get('IObsidianService');
	const voidSettingsService = accessor.get('IVoidSettingsService');
	const settingsState = useSettingsState();
	const obsidianState = useObsidianServiceState();
	const { t } = useTranslation();

	const settings: ObsidianSettingsType = { ...defaultObsidianSettings, ...(settingsState.globalSettings.obsidian ?? {}) };

	// パスは入力中に毎キー同期をかけたくないので、確定 (Enter / blur / ボタン) まで手元で持つ
	const [pathDraft, setPathDraft] = useState(settings.vaultPath);
	useEffect(() => { setPathDraft(settings.vaultPath); }, [settings.vaultPath]);

	const isSyncing = obsidianState.status === 'syncing';

	const update = (partial: Partial<ObsidianSettingsType>) => {
		voidSettingsService.setGlobalSetting('obsidian', { ...settings, ...partial });
	};

	const commitPath = async () => {
		const trimmed = pathDraft.trim();
		if (trimmed === settings.vaultPath) return;
		await obsidianService.setVaultPath(trimmed);
	};

	const enabledFolderCount = obsidianState.folders.filter(f => settings.folderStateOfName[f.slug]?.isOn !== false).length;
	const tooManyFolderTools = settings.exposeFolderTools && enabledFolderCount > MAX_OBSIDIAN_FOLDER_TOOLS;

	return (
		<ErrorBoundary>
			<div className='flex flex-col gap-3'>

				{/* Vault */}
				<Section title={t('obsidian.vault.title')} subtitle={t('obsidian.vault.subtitle')}>
					<div className='flex items-center gap-2 py-1'>
						<VoidSimpleInputBox
							value={pathDraft}
							onChangeValue={setPathDraft}
							onBlur={commitPath}
							onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
							placeholder={t('obsidian.vault.pathPlaceholder')}
							className='flex-1 min-w-0'
							aria-label={t('obsidian.vault.pathLabel')}
							compact
						/>
						<VoidButtonBgDarken className='px-3 py-1 shrink-0' onClick={() => { obsidianService.browseForVault(); }}>
							<Folder size={12} className='mr-1' />
							{t('obsidian.vault.browse')}
						</VoidButtonBgDarken>
					</div>

					<div className='flex items-center gap-2 py-1'>
						<VoidButtonBgDarken
							className='px-3 py-1'
							disabled={isSyncing || !pathDraft.trim()}
							onClick={async () => { await commitPath(); await obsidianService.syncVault(); }}
						>
							{isSyncing
								? <Loader2 size={12} className='animate-spin mr-1' />
								: <RefreshCw size={12} className='mr-1' />}
							{isSyncing ? t('obsidian.vault.syncing') : t('obsidian.vault.sync')}
						</VoidButtonBgDarken>

						{settings.vaultPath ? (
							<VoidButtonBgDarken className='px-3 py-1' onClick={() => { obsidianService.disconnectVault(); }}>
								{t('obsidian.vault.disconnect')}
							</VoidButtonBgDarken>
						) : null}
					</div>

					{/* 状態 */}
					{obsidianState.status === 'synced' ? (
						<div className='flex items-center gap-1.5 text-[11px] text-void-fg-3 pt-1'>
							<Check size={12} className='text-green-500' />
							<span>
								{fmt(t('obsidian.vault.syncedSummary'), { folders: obsidianState.folders.length, files: obsidianState.totalMdFileCount })}
								{obsidianState.lastSyncedAt
									? ` · ${fmt(t('obsidian.vault.lastSynced'), { time: new Date(obsidianState.lastSyncedAt).toLocaleTimeString() })}`
									: ''}
							</span>
						</div>
					) : !settings.vaultPath ? (
						<div className='text-[11px] text-void-fg-4 pt-1'>{t('obsidian.vault.notConnected')}</div>
					) : null}

					{obsidianState.error ? <div className='pt-2'><WarningBox text={obsidianState.error} /></div> : null}
				</Section>

				{/* all-md */}
				<Section title={t('obsidian.allMd.title')}>
					<div className='text-[11px] text-void-fg-3'>{t('obsidian.allMd.detail')}</div>
					<div className='flex flex-wrap gap-1.5 pt-2'>
						{[OBSIDIAN_ALL_MD_TOOL_NAME, `${OBSIDIAN_READ_FOLDER_TOOL_NAME}("${ALL_MD_CONTEXT_NAME}")`].map(name => (
							<code key={name} className='text-[11px] bg-void-bg-1 border border-void-border-3 rounded-sm px-1.5 py-0.5 text-void-fg-2'>
								{name}
							</code>
						))}
					</div>
				</Section>

				{/* 読み取りの設定 */}
				<Section title={t('obsidian.options.title')} subtitle={t('obsidian.options.subtitle')}>
					<Field label={t('obsidian.options.includeSubfolders')} detail={t('obsidian.options.includeSubfoldersDetail')}>
						<VoidSwitch value={settings.includeSubfolders} size='xs' onChange={v => update({ includeSubfolders: v })} />
					</Field>
					<Field label={t('obsidian.options.exposeFolderTools')} detail={t('obsidian.options.exposeFolderTools.detail')}>
						<VoidSwitch value={settings.exposeFolderTools} size='xs' onChange={v => update({ exposeFolderTools: v })} />
					</Field>
					<Field label={t('obsidian.options.maxFiles')}>
						<NumberField
							value={settings.maxFilesPerRead}
							min={MIN_OBSIDIAN_MAX_FILES_PER_READ}
							max={MAX_OBSIDIAN_MAX_FILES_PER_READ}
							onCommit={n => update({ maxFilesPerRead: n })}
							ariaLabel={t('obsidian.options.maxFiles')}
						/>
					</Field>
					<Field label={t('obsidian.options.maxCharsPerFile')}>
						<NumberField
							value={settings.maxCharsPerFile}
							min={MIN_OBSIDIAN_MAX_CHARS_PER_FILE}
							max={MAX_OBSIDIAN_MAX_CHARS_PER_FILE}
							onCommit={n => update({ maxCharsPerFile: n })}
							ariaLabel={t('obsidian.options.maxCharsPerFile')}
						/>
					</Field>
					<Field label={t('obsidian.options.maxTotalChars')}>
						<NumberField
							value={settings.maxTotalChars}
							min={MIN_OBSIDIAN_MAX_TOTAL_CHARS}
							max={MAX_OBSIDIAN_MAX_TOTAL_CHARS}
							onCommit={n => update({ maxTotalChars: n })}
							ariaLabel={t('obsidian.options.maxTotalChars')}
						/>
					</Field>
				</Section>

				{/* 取り込んだフォルダ */}
				<Section title={t('obsidian.folders.title')} subtitle={t('obsidian.folders.subtitle')}>
					{obsidianState.folders.length === 0 ? (
						<div className='text-[11px] text-void-fg-4'>{t('obsidian.folders.noneFound')}</div>
					) : (
						<>
							<div className='flex items-center gap-2 pb-1'>
								<VoidButtonBgDarken className='px-2 py-0.5 text-[11px]' onClick={() => { obsidianService.setAllFoldersOn(true); }}>
									{t('obsidian.folders.enableAll')}
								</VoidButtonBgDarken>
								<VoidButtonBgDarken className='px-2 py-0.5 text-[11px]' onClick={() => { obsidianService.setAllFoldersOn(false); }}>
									{t('obsidian.folders.disableAll')}
								</VoidButtonBgDarken>
							</div>

							{tooManyFolderTools ? (
								<div className='flex items-start gap-1.5 text-[11px] text-amber-500 pb-1'>
									<AlertTriangle size={12} className='mt-0.5 shrink-0' />
									<span>{fmt(t('obsidian.folders.tooManyForTools'), { max: MAX_OBSIDIAN_FOLDER_TOOLS })}</span>
								</div>
							) : null}

							<div className='max-h-96 overflow-y-auto'>
								{obsidianState.folders.map(folder => (
									<FolderRow
										key={folder.slug}
										folder={folder}
										isOn={settings.folderStateOfName[folder.slug]?.isOn !== false}
										showToolName={settings.exposeFolderTools && !tooManyFolderTools}
										onToggle={isOn => { obsidianService.toggleFolderIsOn(folder.slug, isOn); }}
									/>
								))}
							</div>
						</>
					)}
				</Section>

			</div>
		</ErrorBoundary>
	);
};
