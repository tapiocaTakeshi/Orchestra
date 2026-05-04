/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useCallback, useState } from 'react'
import { CheckCircle2, Download, ExternalLink, Loader2, RefreshCw, AlertTriangle } from 'lucide-react'
import { useAccessor, useOrchestraUpdateState } from '../util/services.js'
import { VoidButtonBgDarken } from '../util/inputs.js'
import { ChatMarkdownRender } from '../markdown/ChatMarkdownRender.js'
import { URI } from '../../../../../../../base/common/uri.js'
import ErrorBoundary from '../sidebar-tsx/ErrorBoundary.js'

const formatDate = (iso: string | null) => {
	if (!iso) return null
	try {
		const d = new Date(iso)
		if (isNaN(d.getTime())) return null
		return d.toLocaleString()
	} catch { return null }
}

const formatRelative = (ts: number) => {
	const diff = Date.now() - ts
	if (diff < 0 || diff < 60_000) return 'たった今'
	if (diff < 60 * 60_000) return `${Math.floor(diff / 60_000)} 分前`
	if (diff < 24 * 60 * 60_000) return `${Math.floor(diff / 60 / 60_000)} 時間前`
	return `${Math.floor(diff / 24 / 60 / 60_000)} 日前`
}


export const OrchestraUpdatesPane: React.FC = () => {
	const accessor = useAccessor()
	const voidUpdateService = accessor.get('IVoidUpdateService')
	const openerService = accessor.get('IOpenerService')
	const metricsService = accessor.get('IMetricsService')
	const state = useOrchestraUpdateState()

	const [isChecking, setIsChecking] = useState(false)

	const onCheck = useCallback(async () => {
		setIsChecking(true)
		try {
			await voidUpdateService.fetchLatestRelease()
			metricsService.capture('Click', { action: 'Manual update check from Settings' })
		} finally {
			setIsChecking(false)
		}
	}, [voidUpdateService, metricsService])

	const onOpenRelease = useCallback(async (url: string) => {
		await openerService.open(URI.parse(url))
	}, [openerService])

	const info = state.kind === 'ok' ? state.info : null

	const hasUpdate = !!info?.hasUpdate
	const checkingNow = isChecking || state.kind === 'checking'

	return (
		<ErrorBoundary>
			<div className='max-w-[700px] flex flex-col gap-8'>
				<div>
					<h2 className='text-3xl mb-2'>Updates</h2>
					<h4 className='text-void-fg-3 mb-4'>
						GitHub Release から Orchestra の最新バージョンを確認します。
						自動チェックは起動 5 秒後 + 3 時間ごとに実行されます。
					</h4>
				</div>

				{/* ステータスカード */}
				<div className={`
					rounded-lg border bg-void-bg-1 p-4 flex flex-col gap-3
					${hasUpdate ? 'border-amber-500/60' : 'border-void-border-2'}
				`}>
					<div className='flex items-start gap-3'>
						<div className='mt-0.5'>
							{checkingNow ? (
								<Loader2 className='w-5 h-5 text-void-fg-3 animate-spin' />
							) : state.kind === 'error' ? (
								<AlertTriangle className='w-5 h-5 text-amber-500' />
							) : hasUpdate ? (
								<Download className='w-5 h-5 text-amber-500' />
							) : (
								<CheckCircle2 className='w-5 h-5 text-emerald-500' />
							)}
						</div>
						<div className='flex-1 min-w-0'>
							<div className='text-base text-void-fg-1 font-medium'>
								{checkingNow ? '最新バージョンを確認しています…'
									: state.kind === 'error' ? 'アップデート確認に失敗しました'
										: hasUpdate ? `新しいバージョン ${info?.tagName ?? ''} が利用可能です`
											: state.kind === 'ok' ? 'Orchestra は最新です'
												: 'まだ確認していません'}
							</div>
							<div className='mt-1 text-xs text-void-fg-3 flex flex-wrap gap-x-4 gap-y-1'>
								{info && (
									<>
										<span>現在: <code className='text-void-fg-2'>v{info.currentVersion}</code></span>
										<span>最新: <code className='text-void-fg-2'>{info.tagName}</code></span>
										<span>確認: {formatRelative(info.checkedAt)}</span>
										{info.publishedAt && <span>公開: {formatDate(info.publishedAt)}</span>}
									</>
								)}
								{state.kind === 'error' && (
									<span className='text-amber-500'>{state.message}</span>
								)}
							</div>
						</div>
					</div>

					<div className='flex flex-wrap items-center gap-2 mt-1'>
						<VoidButtonBgDarken
							onClick={onCheck}
							disabled={checkingNow}
							className='px-4 py-1.5 flex items-center gap-2'
						>
							{checkingNow ? <Loader2 className='w-3.5 h-3.5 animate-spin' /> : <RefreshCw className='w-3.5 h-3.5' />}
							{checkingNow ? '確認中…' : 'アップデートを確認'}
						</VoidButtonBgDarken>

						{info && (
							<VoidButtonBgDarken
								onClick={() => onOpenRelease(info.htmlUrl)}
								className='px-4 py-1.5 flex items-center gap-2'
							>
								<ExternalLink className='w-3.5 h-3.5' />
								リリースを開く
							</VoidButtonBgDarken>
						)}

						{!info && (
							<VoidButtonBgDarken
								onClick={() => onOpenRelease('https://github.com/tapiocaTakeshi/Orchestra/releases/latest')}
								className='px-4 py-1.5 flex items-center gap-2'
							>
								<ExternalLink className='w-3.5 h-3.5' />
								リリース一覧を開く
							</VoidButtonBgDarken>
						)}
					</div>
				</div>

				{/* リリース情報 */}
				{info && (
					<div className='flex flex-col gap-3'>
						<div className='flex items-baseline justify-between gap-2'>
							<h3 className='text-xl'>
								{info.name || info.tagName}
								{info.isPrerelease && (
									<span className='ml-2 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 align-middle'>
										pre-release
									</span>
								)}
							</h3>
							<span className='text-xs text-void-fg-3'>
								{info.repo}
							</span>
						</div>
						{info.body ? (
							<div className='rounded-md border border-void-border-2 bg-void-bg-2/40 px-4 py-3 max-h-[420px] overflow-auto'>
								<ChatMarkdownRender string={info.body} chatMessageLocation={undefined} />
							</div>
						) : (
							<div className='text-xs text-void-fg-3'>
								リリースノートはありません。
							</div>
						)}
					</div>
				)}

				<div className='text-xs text-void-fg-4'>
					アップデートのソース:&nbsp;
					<a
						className='underline hover:text-void-fg-2 cursor-pointer'
						onClick={() => onOpenRelease(`https://github.com/${info?.repo ?? 'tapiocaTakeshi/Orchestra'}/releases`)}
					>
						{info?.repo ?? 'tapiocaTakeshi/Orchestra'}
					</a>
				</div>
			</div>
		</ErrorBoundary>
	)
}
