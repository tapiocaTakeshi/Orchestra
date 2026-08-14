/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// Settings のカンバンタブ。
//
// ボードそのもの (カラム構成・タスク) はワークスペースのファイル側にあり、ここでは扱わない。
// ここにあるのは「To Do カラムのタスクをどうエージェントへ渡すか」だけ。

import React, { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';

import { VoidButtonBgDarken, VoidSimpleInputBox, VoidSwitch } from '../util/inputs.js';
import { useAccessor, useKanbanServiceState, useSettingsState } from '../util/services.js';
import { useTranslation } from '../util/i18n.js';
import ErrorBoundary from '../sidebar-tsx/ErrorBoundary.js';
import { toolApprovalTypes } from '../../../../common/toolsServiceTypes.js';
import {
	DEFAULT_KANBAN_PROMPT_TEMPLATE,
	defaultKanbanSettings,
	KanbanSettings as KanbanSettingsType,
	MIN_KANBAN_POLL_INTERVAL_SEC,
	MIN_KANBAN_TASK_TIMEOUT_MIN,
} from '../../../../common/kanbanServiceTypes.js';


const Field = ({ label, detail, children }: { label: string; detail?: string; children: React.ReactNode }) => (
	<div className='flex items-start justify-between gap-4 py-1.5'>
		<div className='flex flex-col min-w-0'>
			<span className='text-xs text-void-fg-2 font-medium'>{label}</span>
			{detail ? <span className='text-[11px] text-void-fg-4'>{detail}</span> : null}
		</div>
		<div className='shrink-0'>{children}</div>
	</div>
);

const Section = ({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) => (
	<div className='flex flex-col gap-1 border border-void-border-2 bg-void-bg-2 rounded-sm px-3 py-2'>
		<h3 className='text-sm text-void-fg-1 font-medium'>{title}</h3>
		{subtitle ? <p className='text-[11px] text-void-fg-4 mb-1'>{subtitle}</p> : null}
		{children}
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
			className='w-24 bg-void-bg-1 border border-void-border-3 rounded-sm px-2 py-1 text-xs text-void-fg-1 focus:outline-none focus:border-[#0e70c0]'
			aria-label={ariaLabel}
		/>
	);
};


export const KanbanSettings = () => {
	const accessor = useAccessor();
	const kanbanService = accessor.get('IKanbanService');
	const settingsService = accessor.get('IVoidSettingsService');
	const commandService = accessor.get('ICommandService');
	const { t } = useTranslation();

	const settingsState = useSettingsState();
	const kanbanState = useKanbanServiceState();
	const settings = settingsState.globalSettings.kanban ?? defaultKanbanSettings;

	const set = <K extends keyof KanbanSettingsType,>(key: K, value: KanbanSettingsType[K]) => {
		settingsService.setGlobalSetting('kanban', { ...settings, [key]: value });
	};

	// 無人実行の途中でツール承認を求められると、誰も承認しないまま止まる。
	// 実行を有効にする前に気付けるよう、承認が必要なまま残っている種類を出す。
	const autoApprove = settingsState.globalSettings.autoApprove ?? {};
	const notAutoApproved = [...toolApprovalTypes].filter(type => !autoApprove[type]);

	const [promptDraft, setPromptDraft] = useState(settings.promptTemplate);
	useEffect(() => { setPromptDraft(settings.promptTemplate); }, [settings.promptTemplate]);

	return (
		<ErrorBoundary>
			<div className='flex flex-col gap-3'>

				<Section title={t('kanban.settings.openBoard')}>
					<div className='flex items-center gap-2'>
						<VoidButtonBgDarken
							className='px-4 py-1'
							onClick={() => { void commandService.executeCommand('void.kanban.openBoard'); }}
						>
							<span className='flex items-center gap-1'>
								<ExternalLink size={12} />
								{t('kanban.settings.openBoard')}
							</span>
						</VoidButtonBgDarken>
						<span className='text-[11px] text-void-fg-4 truncate'>
							{kanbanState.source.kind === 'file'
								? t('kanban.board.storedInFile').replace('{path}', kanbanState.source.path)
								: t('kanban.board.storedInApp')}
						</span>
					</div>

					<Field label={t('kanban.settings.openInNewWindow')} detail={t('kanban.settings.openInNewWindowDetail')}>
						<VoidSwitch size='xs' value={settings.openInNewWindow} onChange={v => set('openInNewWindow', v)} />
					</Field>
				</Section>

				<Section title={t('kanban.settings.execution')} subtitle={t('kanban.settings.executionSubtitle')}>
					<Field label={t('kanban.settings.autoRun')} detail={t('kanban.settings.autoRunDetail')}>
						<VoidSwitch
							size='xs'
							value={settings.autoRunEnabled}
							onChange={enabled => { void kanbanService.setAutoRunEnabled(enabled); }}
						/>
					</Field>

					{settings.autoRunEnabled && notAutoApproved.length > 0 && (
						<p className='text-[11px] text-void-warning py-1'>
							{t('kanban.settings.approvalWarning')}
							<span className='text-void-fg-4'> ({notAutoApproved.join(', ')})</span>
						</p>
					)}

					<Field label={t('kanban.settings.pollInterval')}>
						<NumberField
							value={settings.pollIntervalSec}
							min={MIN_KANBAN_POLL_INTERVAL_SEC}
							max={3600}
							onCommit={n => set('pollIntervalSec', n)}
							ariaLabel={t('kanban.settings.pollInterval')}
						/>
					</Field>

					<Field label={t('kanban.settings.maxTasks')}>
						<NumberField
							value={settings.maxTasksPerRun}
							min={1}
							max={20}
							onCommit={n => set('maxTasksPerRun', n)}
							ariaLabel={t('kanban.settings.maxTasks')}
						/>
					</Field>

					<Field label={t('kanban.settings.timeout')}>
						<NumberField
							value={settings.taskTimeoutMin}
							min={MIN_KANBAN_TASK_TIMEOUT_MIN}
							max={600}
							onCommit={n => set('taskTimeoutMin', n)}
							ariaLabel={t('kanban.settings.timeout')}
						/>
					</Field>

					<Field label={t('kanban.settings.newThread')} detail={t('kanban.settings.newThreadDetail')}>
						<VoidSwitch size='xs' value={settings.newThreadPerTask} onChange={v => set('newThreadPerTask', v)} />
					</Field>

					<Field label={t('kanban.settings.postComment')}>
						<VoidSwitch size='xs' value={settings.postResultComment} onChange={v => set('postResultComment', v)} />
					</Field>

					<Field label={t('kanban.settings.requiredLabel')}>
						<VoidSimpleInputBox
							value={settings.requiredLabel}
							placeholder={t('kanban.settings.requiredLabelPlaceholder')}
							onChangeValue={v => set('requiredLabel', v)}
							compact
							className='w-56'
						/>
					</Field>

					<Field label={t('kanban.settings.dryRun')} detail={t('kanban.settings.dryRunDetail')}>
						<VoidSwitch size='xs' value={settings.dryRun} onChange={v => set('dryRun', v)} />
					</Field>
				</Section>

				<Section title={t('kanban.settings.prompt')} subtitle={t('kanban.settings.promptSubtitle')}>
					<textarea
						value={promptDraft}
						rows={12}
						spellCheck={false}
						placeholder={DEFAULT_KANBAN_PROMPT_TEMPLATE}
						onChange={e => setPromptDraft(e.target.value)}
						onBlur={() => { if (promptDraft !== settings.promptTemplate) set('promptTemplate', promptDraft); }}
						className='w-full bg-void-bg-1 border border-void-border-3 rounded-sm px-2 py-1.5 text-[11px] text-void-fg-1 font-mono leading-relaxed focus:outline-none focus:border-[#0e70c0]'
						aria-label={t('kanban.settings.prompt')}
					/>
					<div className='flex justify-end pt-1'>
						<VoidButtonBgDarken className='px-3 py-0.5 text-xs' onClick={() => { setPromptDraft(''); set('promptTemplate', ''); }}>
							{t('kanban.settings.promptReset')}
						</VoidButtonBgDarken>
					</div>
				</Section>
			</div>
		</ErrorBoundary>
	);
};
