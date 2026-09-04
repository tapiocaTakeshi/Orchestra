/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// Settings > 一般 の「表示モード」。
// かんたんモード (初心者向け・IDE 的な部品を隠す) と 上級者モード (VS Code そのまま) を
// 2 枚のカードで選ぶ。実体は VS Code 設定 `orchestra.ui.mode` で、切替の処理は
// orchestraUiMode.ts 側のコマンドに任せる (通知やユーザー設定の書き戻しをそこに集約している)。

import React from 'react';
import { Check, Sparkles, Wrench } from 'lucide-react';

import { useAccessor, useOrchestraUiMode } from '../util/services.js';
import { useTranslation } from '../util/i18n.js';
import { ORCHESTRA_UI_SET_PRO_MODE_ACTION_ID, ORCHESTRA_UI_SET_SIMPLE_MODE_ACTION_ID, OrchestraUiMode } from '../../../orchestraUiModeTypes.js';


const ModeCard = ({ selected, icon, title, description, currentLabel, onSelect }: {
	selected: boolean;
	icon: React.ReactNode;
	title: string;
	description: string;
	currentLabel: string;
	onSelect: () => void;
}) => (
	<button
		type='button'
		onClick={onSelect}
		aria-pressed={selected}
		className={`flex flex-col items-start gap-2 text-left rounded-lg border px-4 py-3 transition-colors w-full
			${selected
				? 'border-[var(--vscode-focusBorder)] bg-[color-mix(in_srgb,var(--vscode-focusBorder)_10%,var(--void-bg-2))]'
				: 'border-void-border-2 bg-void-bg-2 hover:bg-void-bg-3'}`}
	>
		<div className='flex items-center gap-2 w-full'>
			<span className='text-void-fg-2'>{icon}</span>
			<span className='text-sm font-medium text-void-fg-1'>{title}</span>
			{selected && (
				<span className='ml-auto flex items-center gap-1 text-[11px] text-void-fg-3'>
					<Check size={12} />
					{currentLabel}
				</span>
			)}
		</div>
		<span className='text-[12px] text-void-fg-3 leading-relaxed'>{description}</span>
	</button>
);


export const UiModeSettings = () => {
	const accessor = useAccessor();
	const commandService = accessor.get('ICommandService');
	const mode = useOrchestraUiMode();
	const { t } = useTranslation();

	const select = (next: OrchestraUiMode) => {
		if (next === mode) return;
		commandService.executeCommand(next === 'pro' ? ORCHESTRA_UI_SET_PRO_MODE_ACTION_ID : ORCHESTRA_UI_SET_SIMPLE_MODE_ACTION_ID);
	};

	return (
		<div>
			<h2 className='text-3xl mb-2'>{t('general.uiMode.title')}</h2>
			<h4 className='text-void-fg-3 mb-4'>{t('general.uiMode.subtitle')}</h4>
			<div className='grid grid-cols-1 md:grid-cols-2 gap-3 max-w-2xl'>
				<ModeCard
					selected={mode === 'simple'}
					icon={<Sparkles size={16} />}
					title={t('general.uiMode.simple')}
					description={t('general.uiMode.simple.desc')}
					currentLabel={t('general.uiMode.current')}
					onSelect={() => select('simple')}
				/>
				<ModeCard
					selected={mode === 'pro'}
					icon={<Wrench size={16} />}
					title={t('general.uiMode.pro')}
					description={t('general.uiMode.pro.desc')}
					currentLabel={t('general.uiMode.current')}
					onSelect={() => select('pro')}
				/>
			</div>
		</div>
	);
};
