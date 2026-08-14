/*--------------------------------------------------------------------------------------
 *  Copyright 2025 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// Settings のリモートコントロールタブ。orchestra-mobile から接続するための
// 有効化トグル・接続情報・トークン再発行を扱う (Phase 1: ping/state のみ実装)。

import React, { useEffect, useState } from 'react';
import { Check, Copy, Loader2, RefreshCw, X } from 'lucide-react';

import { VoidButtonBgDarken, VoidSwitch } from '../util/inputs.js';
import { useAccessor, useSettingsState } from '../util/services.js';
import { useTranslation } from '../util/i18n.js';
import ErrorBoundary from '../sidebar-tsx/ErrorBoundary.js';
import { RemoteControlServerState } from '../../../common/remoteControlTypes.js';

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

const maskToken = (token: string): string => (token.length <= 8 ? '••••••••' : `${token.slice(0, 4)}…${token.slice(-4)}`);

export const RemoteControlSettings = () => {
	const accessor = useAccessor();
	const voidSettingsService = accessor.get('IVoidSettingsService');
	const remoteControlService = accessor.get('IRemoteControlService');
	const clipboardService = accessor.get('IClipboardService');
	const settingsState = useSettingsState();
	const { t } = useTranslation();

	const [state, setState] = useState<RemoteControlServerState>(remoteControlService.state);
	const [showToken, setShowToken] = useState(false);
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		setState(remoteControlService.state);
		const disposable = remoteControlService.onDidChangeState((s) => setState(s));
		return () => disposable.dispose();
	}, [remoteControlService]);

	const enabled = settingsState.globalSettings.remoteControlEnabled;
	const isLoggedIn = settingsState.globalSettings.isLoggedIn;

	const handleToggle = async (next: boolean) => {
		setBusy(true);
		try {
			voidSettingsService.setGlobalSetting('remoteControlEnabled', next);
			const newState = await remoteControlService.configure({
				enabled: next,
				token: voidSettingsService.state.globalSettings.remoteControlToken,
			});
			if (newState.kind === 'running' && newState.info.token !== voidSettingsService.state.globalSettings.remoteControlToken) {
				voidSettingsService.setGlobalSetting('remoteControlToken', newState.info.token);
			}
		} finally {
			setBusy(false);
		}
	};

	const handleRegenerateToken = async () => {
		setBusy(true);
		try {
			const { token } = await remoteControlService.regenerateToken();
			voidSettingsService.setGlobalSetting('remoteControlToken', token);
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className='flex flex-col gap-4 max-w-[720px]'>
			<ErrorBoundary>
				<Section title={t('remoteControl.status.title')} subtitle={t('remoteControl.status.subtitle')}>
					<Field label={t('remoteControl.status.enable')} detail={t('remoteControl.status.enableDetail')}>
						<VoidSwitch size='xs' value={enabled} onChange={(v) => { void handleToggle(v); }} disabled={busy} />
					</Field>

					<div className='flex items-center gap-2 text-xs mt-1'>
						{state.kind === 'starting' ? (
							<><Loader2 className='w-3 h-3 animate-spin' /><span className='text-void-fg-3'>{t('remoteControl.status.starting')}</span></>
						) : state.kind === 'running' ? (
							<><Check className='w-3 h-3 text-green-500' /><span className='text-void-fg-3'>{t('remoteControl.status.running')}: {state.info.url}</span></>
						) : state.kind === 'error' ? (
							<><X className='w-3 h-3 text-red-500' /><span className='text-red-500'>{state.message}</span></>
						) : (
							<span className='text-void-fg-4'>{t('remoteControl.status.stopped')}</span>
						)}
					</div>

					{!isLoggedIn && enabled ? (
						<div className='text-[11px] text-amber-500 mt-1'>{t('remoteControl.status.loginWarning')}</div>
					) : null}
				</Section>
			</ErrorBoundary>

			{state.kind === 'running' ? (
				<ErrorBoundary>
					<Section title={t('remoteControl.connection.title')} subtitle={t('remoteControl.connection.subtitle')}>
						<Field label={t('remoteControl.connection.address')}>
							<span className='text-xs font-mono text-void-fg-1'>{state.info.url}</span>
						</Field>
						<Field label={t('remoteControl.connection.token')}>
							<div className='flex items-center gap-2'>
								<span className='text-xs font-mono text-void-fg-1'>{showToken ? state.info.token : maskToken(state.info.token)}</span>
								<button type='button' className='text-void-fg-3 hover:text-void-fg-1 text-[11px] underline' onClick={() => setShowToken(v => !v)}>
									{showToken ? t('remoteControl.connection.hide') : t('remoteControl.connection.show')}
								</button>
							</div>
						</Field>

						<div className='flex flex-wrap items-center gap-2 mt-2'>
							<VoidButtonBgDarken
								className='px-4 py-1 flex items-center gap-1.5'
								onClick={() => { void clipboardService.writeText(state.info.pairingLink); }}
							>
								<Copy className='w-3 h-3' />
								{t('remoteControl.connection.copyPairingLink')}
							</VoidButtonBgDarken>
							<VoidButtonBgDarken
								className='px-4 py-1 flex items-center gap-1.5'
								disabled={busy}
								onClick={() => { void handleRegenerateToken(); }}
							>
								<RefreshCw className='w-3 h-3' />
								{t('remoteControl.connection.regenerateToken')}
							</VoidButtonBgDarken>
						</div>

						<p className='text-[11px] text-void-fg-4 mt-2'>{t('remoteControl.connection.phase1Note')}</p>
					</Section>
				</ErrorBoundary>
			) : null}
		</div>
	);
};
