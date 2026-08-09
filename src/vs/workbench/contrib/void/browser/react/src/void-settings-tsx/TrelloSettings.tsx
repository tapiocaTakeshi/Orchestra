/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// Settings の Trello タブ。
// 認証情報 → ボード/リストの割り当て → 実行条件 → プロンプト → 実行状況、の順に並べる。

import React, { useCallback, useEffect, useState } from 'react';
import { Check, Loader2, X } from 'lucide-react';

import { VoidButtonBgDarken, VoidCustomDropdownBox, VoidSimpleInputBox, VoidSwitch } from '../util/inputs.js';
import { useAccessor, useSettingsState, useTrelloServiceState } from '../util/services.js';
import { useTranslation } from '../util/i18n.js';
import ErrorBoundary from '../sidebar-tsx/ErrorBoundary.js';
import { toolApprovalTypes } from '../../../../common/toolsServiceTypes.js';
import {
	DEFAULT_TRELLO_PROMPT_TEMPLATE,
	defaultTrelloSettings,
	MIN_TRELLO_CARD_TIMEOUT_MIN,
	MIN_TRELLO_POLL_INTERVAL_SEC,
	TrelloList,
	TrelloRunEntry,
	TrelloSettings as TrelloSettingsType,
} from '../../../../common/trelloServiceTypes.js';


const NO_LIST_ID = '';

type ListOption = { id: string; name: string };

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

const ListDropdown = ({ lists, selectedId, onChange, allowNone, nonePlaceholder, selectPlaceholder }: {
	lists: TrelloList[];
	selectedId: string;
	onChange: (id: string) => void;
	allowNone: boolean;
	nonePlaceholder: string;
	selectPlaceholder: string;
}) => {
	const options: ListOption[] = [
		...(allowNone ? [{ id: NO_LIST_ID, name: nonePlaceholder }] : []),
		...lists.map(l => ({ id: l.id, name: l.name })),
	];
	// 選択済みだが一覧に無い (別ボードに移った / 削除された) 場合も、値が消えないよう出す
	if (selectedId && !options.some(o => o.id === selectedId)) {
		options.push({ id: selectedId, name: `${selectedId} (見つかりません)` });
	}
	const selected = options.find(o => o.id === selectedId);
	return (
		<VoidCustomDropdownBox
			options={options}
			selectedOption={selected}
			onChangeOption={o => onChange(o.id)}
			getOptionDisplayName={o => o?.name ?? selectPlaceholder}
			getOptionDropdownName={o => o.name}
			getOptionsEqual={(a, b) => a.id === b.id}
			className='w-56 bg-void-bg-1 border border-void-border-3 rounded-sm px-2 py-0.5 text-xs'
			matchInputWidth
		/>
	);
};

const runStatusColor = (status: TrelloRunEntry['status']): string => {
	switch (status) {
		case 'done': return 'text-green-500';
		case 'error': return 'text-red-500';
		case 'timeout': return 'text-amber-500';
		case 'canceled': return 'text-void-fg-4';
		case 'dry-run': return 'text-blue-400';
		default: return 'text-void-fg-3';
	}
};


export const TrelloSettings = () => {
	const accessor = useAccessor();
	const trelloService = accessor.get('ITrelloService');
	const voidSettingsService = accessor.get('IVoidSettingsService');
	const settingsState = useSettingsState();
	const trelloState = useTrelloServiceState();
	const { t } = useTranslation();

	// 設定 JSON をインポートしたケースなど、trello キーごと欠けている状態でも落ちないようにする
	const settings = settingsState.globalSettings.trello ?? defaultTrelloSettings;
	const [isConnecting, setIsConnecting] = useState(false);

	// 無人実行では誰もツール承認を押せないので、承認が要るカテゴリが残っていたら警告する
	const autoApprove = settingsState.globalSettings.autoApprove ?? {};
	const missingAutoApprovals = [...toolApprovalTypes].filter(type => !autoApprove[type]);

	const update = useCallback((patch: Partial<TrelloSettingsType>) => {
		voidSettingsService.setGlobalSetting('trello', { ...settings, ...patch });
	}, [voidSettingsService, settings]);

	const handleConnect = async () => {
		setIsConnecting(true);
		try {
			const result = await trelloService.testConnection();
			if (result.success && settings.boardId) await trelloService.refreshLists(settings.boardId);
		} finally {
			setIsConnecting(false);
		}
	};

	const handleBoardChange = async (boardId: string) => {
		// ボードを変えたらリスト ID は全部無効になるので一緒にクリアする
		update({ boardId, todoListId: '', inProgressListId: '', doneListId: '', errorListId: '' });
		await trelloService.refreshLists(boardId);
	};

	const connection = trelloState.connection;
	const hasCredentials = !!settings.apiKey && !!settings.token;
	const canConfigureBoard = connection.kind === 'ok';

	return (
		<div className='flex flex-col gap-4 max-w-[720px]'>

			{/* ---- Credentials ---- */}
			<ErrorBoundary>
				<Section title={t('trello.credentials.title')} subtitle={t('trello.credentials.subtitle')}>
					<Field label={t('trello.credentials.apiKey')}>
						<VoidSimpleInputBox
							value={settings.apiKey}
							onChangeValue={v => update({ apiKey: v.trim() })}
							placeholder='xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
							passwordBlur
							compact
							className='w-56'
						/>
					</Field>
					<Field label={t('trello.credentials.token')}>
						<VoidSimpleInputBox
							value={settings.token}
							onChangeValue={v => update({ token: v.trim() })}
							placeholder='ATTA…'
							passwordBlur
							compact
							className='w-56'
						/>
					</Field>

					<div className='flex items-center gap-3 mt-2'>
						<VoidButtonBgDarken
							className='px-4 py-1'
							disabled={!hasCredentials || isConnecting}
							onClick={() => { void handleConnect(); }}
						>
							{connection.kind === 'ok' ? t('trello.credentials.reconnect') : t('trello.credentials.connect')}
						</VoidButtonBgDarken>

						<span className='text-xs flex items-center gap-1'>
							{isConnecting || connection.kind === 'checking' ? (
								<><Loader2 className='w-3 h-3 animate-spin' />{t('trello.credentials.checking')}</>
							) : connection.kind === 'ok' ? (
								<><Check className='w-3 h-3 text-green-500' /><span className='text-void-fg-3'>{t('trello.credentials.connected')} {connection.member.fullName || connection.member.username}</span></>
							) : connection.kind === 'error' ? (
								<><X className='w-3 h-3 text-red-500' /><span className='text-red-500'>{connection.error}</span></>
							) : (
								<span className='text-void-fg-4'>{t('trello.credentials.notConfigured')}</span>
							)}
						</span>
					</div>
				</Section>
			</ErrorBoundary>

			{/* ---- Board & lists ---- */}
			<ErrorBoundary>
				<Section title={t('trello.board.title')} subtitle={t('trello.board.subtitle')}>
					{!canConfigureBoard ? (
						<p className='text-[11px] text-void-fg-4'>{t('trello.credentials.notConfigured')}</p>
					) : (
						<>
							<Field label={t('trello.board.board')}>
								<VoidCustomDropdownBox
									options={trelloState.boards}
									selectedOption={trelloState.boards.find(b => b.id === settings.boardId)}
									onChangeOption={b => { void handleBoardChange(b.id); }}
									getOptionDisplayName={b => b?.name ?? t('trello.board.selectPlaceholder')}
									getOptionDropdownName={b => b.name}
									getOptionsEqual={(a, b) => a.id === b.id}
									className='w-56 bg-void-bg-1 border border-void-border-3 rounded-sm px-2 py-0.5 text-xs'
									matchInputWidth
								/>
							</Field>

							<Field label={t('trello.board.todoList')}>
								<ListDropdown
									lists={trelloState.lists}
									selectedId={settings.todoListId}
									onChange={id => update({ todoListId: id })}
									allowNone={false}
									nonePlaceholder={t('trello.board.noMove')}
									selectPlaceholder={t('trello.board.selectPlaceholder')}
								/>
							</Field>
							<Field label={t('trello.board.inProgressList')}>
								<ListDropdown
									lists={trelloState.lists}
									selectedId={settings.inProgressListId}
									onChange={id => update({ inProgressListId: id })}
									allowNone
									nonePlaceholder={t('trello.board.noMove')}
									selectPlaceholder={t('trello.board.selectPlaceholder')}
								/>
							</Field>
							<Field label={t('trello.board.doneList')}>
								<ListDropdown
									lists={trelloState.lists}
									selectedId={settings.doneListId}
									onChange={id => update({ doneListId: id })}
									allowNone
									nonePlaceholder={t('trello.board.noMove')}
									selectPlaceholder={t('trello.board.selectPlaceholder')}
								/>
							</Field>
							<Field label={t('trello.board.errorList')}>
								<ListDropdown
									lists={trelloState.lists}
									selectedId={settings.errorListId}
									onChange={id => update({ errorListId: id })}
									allowNone
									nonePlaceholder={t('trello.board.noMove')}
									selectPlaceholder={t('trello.board.selectPlaceholder')}
								/>
							</Field>

							<div className='mt-2'>
								<VoidButtonBgDarken
									className='px-4 py-1'
									disabled={!settings.boardId}
									onClick={() => { void trelloService.refreshLists(settings.boardId); }}
								>
									{t('trello.board.refreshLists')}
								</VoidButtonBgDarken>
							</div>
						</>
					)}
				</Section>
			</ErrorBoundary>

			{/* ---- Execution ---- */}
			<ErrorBoundary>
				<Section title={t('trello.execution.title')}>
					<Field label={t('trello.execution.autoRun')} detail={t('trello.execution.autoRunDetail')}>
						<VoidSwitch
							size='xs'
							value={settings.autoRunEnabled}
							onChange={v => { void trelloService.setAutoRunEnabled(v); }}
						/>
					</Field>
					{settings.autoRunEnabled && missingAutoApprovals.length > 0 ? (
						<div className='text-[11px] text-amber-500 py-1'>
							{t('trello.execution.autoApproveWarning')} ({missingAutoApprovals.join(', ')})
						</div>
					) : null}

					<Field label={t('trello.execution.pollInterval')}>
						<NumberField
							value={settings.pollIntervalSec}
							min={MIN_TRELLO_POLL_INTERVAL_SEC}
							max={3600}
							onCommit={n => update({ pollIntervalSec: n })}
							ariaLabel='Trello poll interval in seconds'
						/>
					</Field>
					<Field label={t('trello.execution.maxCards')}>
						<NumberField
							value={settings.maxCardsPerRun}
							min={1}
							max={20}
							onCommit={n => update({ maxCardsPerRun: n })}
							ariaLabel='Max Trello cards per poll'
						/>
					</Field>
					<Field label={t('trello.execution.cardTimeout')}>
						<NumberField
							value={settings.cardTimeoutMin}
							min={MIN_TRELLO_CARD_TIMEOUT_MIN}
							max={600}
							onCommit={n => update({ cardTimeoutMin: n })}
							ariaLabel='Trello per-card timeout in minutes'
						/>
					</Field>
					<Field label={t('trello.execution.requiredLabel')}>
						<VoidSimpleInputBox
							value={settings.requiredLabel}
							onChangeValue={v => update({ requiredLabel: v })}
							placeholder={t('trello.execution.requiredLabelPlaceholder')}
							compact
							className='w-56'
						/>
					</Field>
					<Field label={t('trello.execution.newThreadPerCard')}>
						<VoidSwitch size='xs' value={settings.newThreadPerCard} onChange={v => update({ newThreadPerCard: v })} />
					</Field>
					<Field label={t('trello.execution.postComment')}>
						<VoidSwitch size='xs' value={settings.postCommentOnDone} onChange={v => update({ postCommentOnDone: v })} />
					</Field>
					<Field label={t('trello.execution.dryRun')} detail={t('trello.execution.dryRunDetail')}>
						<VoidSwitch size='xs' value={settings.dryRun} onChange={v => update({ dryRun: v })} />
					</Field>
				</Section>
			</ErrorBoundary>

			{/* ---- Prompt template ---- */}
			<ErrorBoundary>
				<Section title={t('trello.prompt.title')} subtitle={t('trello.prompt.subtitle')}>
					<textarea
						value={settings.promptTemplate}
						onChange={e => update({ promptTemplate: e.target.value })}
						placeholder={DEFAULT_TRELLO_PROMPT_TEMPLATE}
						rows={12}
						spellCheck={false}
						className='w-full bg-void-bg-1 border border-void-border-3 rounded-sm px-2 py-1 text-xs text-void-fg-1 font-mono resize-y focus:outline-none focus:border-[#0e70c0]'
						aria-label='Trello prompt template'
					/>
					<div className='mt-2'>
						<VoidButtonBgDarken className='px-4 py-1' onClick={() => update({ promptTemplate: '' })}>
							{t('trello.prompt.reset')}
						</VoidButtonBgDarken>
					</div>
				</Section>
			</ErrorBoundary>

			{/* ---- Status ---- */}
			<ErrorBoundary>
				<Section title={t('trello.status.title')}>
					<div className='flex flex-wrap items-center gap-3 text-xs text-void-fg-3'>
						<span className={trelloState.isPolling ? 'text-green-500' : 'text-void-fg-4'}>
							{trelloState.isPolling ? t('trello.status.polling') : t('trello.status.notPolling')}
						</span>
						<span>·</span>
						<span>
							{trelloState.isRunning && trelloState.currentCard
								? `${t('trello.status.running')}: ${trelloState.currentCard.name}`
								: t('trello.status.idle')}
						</span>
						<span>·</span>
						<span>
							{t('trello.status.lastPolled')}: {trelloState.lastPolledAt ? new Date(trelloState.lastPolledAt).toLocaleTimeString() : t('trello.status.never')}
						</span>
					</div>

					{trelloState.awaitingApproval ? (
						<div className='text-xs text-amber-500 mt-1'>{t('trello.status.awaitingApproval')}</div>
					) : null}

					{trelloState.lastError ? (
						<div className='text-xs text-red-500 mt-1'>{trelloState.lastError}</div>
					) : null}

					{trelloState.queue.length > 0 ? (
						<div className='text-xs text-void-fg-3 mt-1'>
							{trelloState.queue.length} 件待機中: {trelloState.queue.map(q => q.name).join(', ')}
						</div>
					) : null}

					<div className='flex flex-wrap items-center gap-2 mt-2'>
						<VoidButtonBgDarken
							className='px-4 py-1'
							disabled={trelloState.isRunning}
							onClick={() => { void trelloService.runNow(); }}
						>
							{t('trello.status.runNow')}
						</VoidButtonBgDarken>
						<VoidButtonBgDarken
							className='px-4 py-1'
							disabled={!trelloState.isRunning}
							onClick={() => { void trelloService.cancelCurrent(); }}
						>
							{t('trello.status.cancel')}
						</VoidButtonBgDarken>
						<VoidButtonBgDarken
							className='px-4 py-1'
							onClick={() => trelloService.clearProcessedCards()}
						>
							{t('trello.status.clearProcessed')}
						</VoidButtonBgDarken>
					</div>

					<div className='mt-3'>
						<h4 className='text-xs text-void-fg-2 font-medium mb-1'>{t('trello.status.history')}</h4>
						{trelloState.history.length === 0 ? (
							<p className='text-[11px] text-void-fg-4'>{t('trello.status.noHistory')}</p>
						) : (
							<ul className='flex flex-col gap-1'>
								{trelloState.history.map(entry => (
									<li key={`${entry.cardId}-${entry.startedAt}`} className='text-[11px] text-void-fg-3 flex items-start gap-2'>
										<span className={`shrink-0 ${runStatusColor(entry.status)}`}>[{entry.status}]</span>
										<span className='shrink-0 text-void-fg-4'>{new Date(entry.startedAt).toLocaleTimeString()}</span>
										<a
											href={entry.cardUrl}
											target='_blank'
											rel='noreferrer'
											className='truncate hover:underline'
											title={entry.error || entry.resultSummary || entry.cardName}
										>
											{entry.cardName}
										</a>
									</li>
								))}
							</ul>
						)}
					</div>
				</Section>
			</ErrorBoundary>
		</div>
	);
};
