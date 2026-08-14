/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// Settings のリモートコントロールタブ。
//
// スマホアプリ (Orchestra-Mobile) から IDE を操作するためのローカル HTTP サーバを
// ここで ON/OFF し、接続先 URL とトークンを確認する。サーバ本体は main プロセス、
// リクエスト処理は remoteControlService.ts にある。

import React, { useEffect, useState } from 'react';
import { Copy, RefreshCw, Smartphone } from 'lucide-react';

import { VoidButtonBgDarken, VoidSimpleInputBox, VoidSwitch } from '../util/inputs.js';
import { useAccessor, useSettingsState } from '../util/services.js';
import { useTranslation } from '../util/i18n.js';
import ErrorBoundary from '../sidebar-tsx/ErrorBoundary.js';
import {
	clampRemoteControlPort,
	emptyRemoteControlStatus,
	encodePairingUri,
	MAX_REMOTE_CONTROL_PORT,
	MIN_REMOTE_CONTROL_PORT,
	RemoteControlServerStatus,
} from '../../../../common/remoteControlTypes.js';


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

/** 値をそのままは見せず、コピーだけできるようにする (肩越しに読まれないように)。 */
const SecretRow = ({ value, onCopy }: { value: string; onCopy: () => void }) => {
	const [revealed, setRevealed] = useState(false);
	return (
		<div className='flex items-center gap-2'>
			<code className='text-[11px] text-void-fg-3 bg-void-bg-1 border border-void-border-3 rounded-sm px-2 py-1 max-w-[260px] truncate'>
				{revealed ? (value || '(未生成)') : '•'.repeat(Math.min(24, Math.max(8, value.length)))}
			</code>
			<VoidButtonBgDarken onClick={() => setRevealed(r => !r)}>
				<span className='text-[11px]'>{revealed ? '隠す' : '表示'}</span>
			</VoidButtonBgDarken>
			<VoidButtonBgDarken onClick={onCopy}>
				<Copy size={12} />
			</VoidButtonBgDarken>
		</div>
	);
};


export const RemoteControlSettings = () => {
	const accessor = useAccessor();
	const remoteControlService = accessor.get('IRemoteControlService');
	const settingsService = accessor.get('IVoidSettingsService');
	const clipboardService = accessor.get('IClipboardService');
	const settingsState = useSettingsState();
	const { t } = useTranslation();

	const settings = settingsState.globalSettings.remoteControl;
	const [status, setStatus] = useState<RemoteControlServerStatus>(remoteControlService.status ?? emptyRemoteControlStatus());
	const [portDraft, setPortDraft] = useState(String(settings.port));

	useEffect(() => {
		setStatus(remoteControlService.status);
		const d = remoteControlService.onDidChangeStatus(s => setStatus(s));
		return () => d.dispose();
	}, [remoteControlService]);

	useEffect(() => { setPortDraft(String(settings.port)); }, [settings.port]);

	const patch = (p: Partial<typeof settings>) => {
		void settingsService.setGlobalSetting('remoteControl', { ...settings, ...p });
	};

	const pairingUri = status.running ? encodePairingUri({
		v: 1,
		url: status.addresses.find(a => !a.includes('127.0.0.1')) ?? status.addresses[0] ?? '',
		token: settings.token,
		workspace: '',
	}) : '';

	return (
		<ErrorBoundary>
			<div className='flex flex-col gap-3'>

				<Section title={t('remote.server.title')} subtitle={t('remote.server.subtitle')}>
					<Field label={t('remote.server.enabled')} detail={t('remote.server.enabledDetail')}>
						<VoidSwitch value={settings.enabled} onChange={v => { void remoteControlService.setEnabled(v); }} size='sm' />
					</Field>
					<Field label={t('remote.server.port')} detail={`${MIN_REMOTE_CONTROL_PORT} - ${MAX_REMOTE_CONTROL_PORT}`}>
						<input
							type='number'
							min={MIN_REMOTE_CONTROL_PORT}
							max={MAX_REMOTE_CONTROL_PORT}
							value={portDraft}
							onChange={e => setPortDraft(e.target.value)}
							onBlur={e => patch({ port: clampRemoteControlPort(e.target.value) })}
							onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
							className='w-24 bg-void-bg-1 border border-void-border-3 rounded-sm px-2 py-1 text-xs text-void-fg-1 focus:outline-none focus:border-[#0e70c0]'
							aria-label='port'
						/>
					</Field>
					<Field label={t('remote.server.allowLan')} detail={t('remote.server.allowLanDetail')}>
						<VoidSwitch value={settings.allowLan} onChange={v => patch({ allowLan: v })} size='sm' />
					</Field>

					<div className='mt-2 text-[11px] text-void-fg-4'>
						{status.running
							? <span className='text-void-fg-2'>● {t('remote.server.running')}</span>
							: <span>○ {t('remote.server.stopped')}{status.error ? ` — ${status.error}` : ''}</span>}
					</div>
				</Section>

				<Section title={t('remote.pairing.title')} subtitle={t('remote.pairing.subtitle')}>
					<Field label={t('remote.pairing.addresses')}>
						<div className='flex flex-col items-end gap-1'>
							{status.addresses.length === 0
								? <span className='text-[11px] text-void-fg-4'>—</span>
								: status.addresses.map(a => (
									<code key={a} className='text-[11px] text-void-fg-3 bg-void-bg-1 border border-void-border-3 rounded-sm px-2 py-0.5'>{a}</code>
								))}
						</div>
					</Field>
					<Field label={t('remote.pairing.token')} detail={t('remote.pairing.tokenDetail')}>
						<SecretRow value={settings.token} onCopy={() => { void clipboardService.writeText(settings.token); }} />
					</Field>
					<Field label={t('remote.pairing.uri')} detail={t('remote.pairing.uriDetail')}>
						<div className='flex items-center gap-2'>
							<VoidButtonBgDarken disabled={!pairingUri} onClick={() => { void clipboardService.writeText(pairingUri); }}>
								<div className='flex items-center gap-1'>
									<Smartphone size={12} />
									<span className='text-[11px]'>{t('remote.pairing.copy')}</span>
								</div>
							</VoidButtonBgDarken>
							<VoidButtonBgDarken onClick={() => { void remoteControlService.regenerateToken(); }}>
								<div className='flex items-center gap-1'>
									<RefreshCw size={12} />
									<span className='text-[11px]'>{t('remote.pairing.regenerate')}</span>
								</div>
							</VoidButtonBgDarken>
						</div>
					</Field>
				</Section>

				<Section title={t('remote.permissions.title')} subtitle={t('remote.permissions.subtitle')}>
					<Field label={t('remote.permissions.agent')}>
						<VoidSwitch value={settings.allowAgentPrompts} onChange={v => patch({ allowAgentPrompts: v })} size='sm' />
					</Field>
					<Field label={t('remote.permissions.kanban')}>
						<VoidSwitch value={settings.allowKanbanWrites} onChange={v => patch({ allowKanbanWrites: v })} size='sm' />
					</Field>
					<Field label={t('remote.permissions.projects')}>
						<VoidSwitch value={settings.allowProjectWrites} onChange={v => patch({ allowProjectWrites: v })} size='sm' />
					</Field>
					<Field label={t('remote.permissions.commands')} detail={t('remote.permissions.commandsDetail')}>
						<VoidSwitch value={settings.allowCommands} onChange={v => patch({ allowCommands: v })} size='sm' />
					</Field>
				</Section>

				<Section title={t('remote.manual.title')} subtitle={t('remote.manual.subtitle')}>
					<div className='flex flex-col gap-1 text-[11px] text-void-fg-3'>
						<span>1. {t('remote.manual.step1')}</span>
						<span>2. {t('remote.manual.step2')}</span>
						<span>3. {t('remote.manual.step3')}</span>
					</div>
					<div className='mt-2'>
						<VoidSimpleInputBox
							value={pairingUri}
							onChangeValue={() => { /* 表示専用 */ }}
							placeholder='orchestra://pair?...'
							disabled
						/>
					</div>
				</Section>

			</div>
		</ErrorBoundary>
	);
};
