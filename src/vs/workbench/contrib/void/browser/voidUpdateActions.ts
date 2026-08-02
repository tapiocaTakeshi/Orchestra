/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import Severity from '../../../../base/common/severity.js';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { INotificationActions, INotificationHandle, INotificationService } from '../../../../platform/notification/common/notification.js';
import { IProgressService, ProgressLocation } from '../../../../platform/progress/common/progress.js';
import { IMetricsService } from '../common/metricsService.js';
import { IOrchestraUpdateUiService, IVoidUpdateService } from '../common/voidUpdateService.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import * as dom from '../../../../base/browser/dom.js';
import { VoidCheckUpdateRespose } from '../common/voidUpdateServiceTypes.js';
import { IAction } from '../../../../base/common/actions.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { URI } from '../../../../base/common/uri.js';


// "Open Release" action ID (Settings 画面と Sidebar から共通して呼び出す)
export const VOID_OPEN_LATEST_RELEASE_ACTION_ID = 'orchestra.openLatestRelease'
export const VOID_CHECK_UPDATE_ACTION_ID = 'void.voidCheckUpdate'


const formatBytes = (n: number): string => {
	if (!n || n <= 0) return '0 MB'
	const mb = n / (1024 * 1024)
	return `${mb.toFixed(1)} MB`
}


const openReleasePage = async (openerService: IOpenerService, voidUpdateService: IOrchestraUpdateUiService) => {
	// 既知のキャッシュがあればそれを使う、なければ取り直す
	let url: string | null = voidUpdateService.state.kind === 'ok' ? voidUpdateService.state.info.htmlUrl : null
	if (!url) {
		const res = await voidUpdateService.fetchLatestRelease()
		if (!('error' in res)) url = res.htmlUrl
	}
	if (!url) {
		// 最後の手段として GitHub のリリース一覧へ飛ばす
		url = 'https://github.com/tapiocaTakeshi/Orchestra/releases/latest'
	}
	await openerService.open(URI.parse(url))
}


// ダウンロード → (確認) → 再起動してインストール、までを一気通貫で行う。
// 進捗は Notification 上のプログレスバーで表示する。
const downloadAndOfferInstall = async (
	progressService: IProgressService,
	notifService: INotificationService,
	voidUpdateService: IOrchestraUpdateUiService,
	metricsService: IMetricsService,
): Promise<void> => {
	metricsService.capture('Orchestra Update: Download start', {})

	const result = await progressService.withProgress(
		{ location: ProgressLocation.Notification, title: 'Orchestra をダウンロードしています…', cancellable: false },
		async (progress) => {
			let lastPct = 0
			const listener = voidUpdateService.onDownloadProgress((p) => {
				if (p.totalBytes > 0) {
					const pct = Math.min(100, Math.floor((p.receivedBytes / p.totalBytes) * 100))
					progress.report({ message: `${pct}% (${formatBytes(p.receivedBytes)} / ${formatBytes(p.totalBytes)})`, increment: Math.max(0, pct - lastPct) })
					lastPct = pct
				} else {
					progress.report({ message: `${formatBytes(p.receivedBytes)} ダウンロード済み` })
				}
			})
			try {
				return await voidUpdateService.downloadUpdate()
			} finally {
				listener.dispose()
			}
		},
	)

	if ('error' in result) {
		metricsService.capture('Orchestra Update: Download Error', { result })
		notifService.notify({
			severity: Severity.Error,
			message: `Orchestra: アップデートのダウンロードに失敗しました: ${result.error}`,
			sticky: true,
		})
		return
	}

	metricsService.capture('Orchestra Update: Download OK', {})

	notifService.notify({
		severity: Severity.Info,
		message: 'Orchestra のダウンロードが完了しました。再起動してインストールしますか?',
		sticky: true,
		actions: {
			primary: [{
				id: 'orchestra.updater.installNow',
				enabled: true,
				label: '再起動してインストール',
				tooltip: '',
				class: undefined,
				run: async () => {
					metricsService.capture('Orchestra Update: Install start', {})
					const installRes = await voidUpdateService.quitAndInstall()
					// 成功時はアプリが終了するため、通常はここに到達する前にウィンドウが閉じる
					if (installRes && 'error' in installRes) {
						metricsService.capture('Orchestra Update: Install Error', { installRes })
						notifService.notify({
							severity: Severity.Error,
							message: `Orchestra: インストールに失敗しました: ${installRes.error}`,
							sticky: true,
						})
					}
				},
			}],
			secondary: [{
				id: 'orchestra.updater.installLater',
				enabled: true,
				label: 'あとで',
				tooltip: '',
				class: undefined,
				run: () => { },
			}],
		},
	})
}


const notifyUpdate = (
	res: VoidCheckUpdateRespose & { message: string },
	notifService: INotificationService,
	openerService: IOpenerService,
	progressService: IProgressService,
	voidUpdateService: IOrchestraUpdateUiService,
	metricsService: IMetricsService,
): INotificationHandle => {
	const message = res?.message || 'Orchestra の最新版が利用可能です。GitHub リリースページから取得してください。'

	let actions: INotificationActions | undefined

	if (res?.action) {
		const primary: IAction[] = []

		if (res.action === 'download') {
			primary.push({
				label: `ダウンロードしてインストール`,
				id: 'orchestra.updater.downloadAndInstall',
				enabled: true,
				tooltip: '',
				class: undefined,
				run: () => {
					notifController.close()
					downloadAndOfferInstall(progressService, notifService, voidUpdateService, metricsService)
				},
			})
		} else if (res.action === 'open_release') {
			primary.push({
				label: `リリースを開く`,
				id: 'orchestra.updater.openRelease',
				enabled: true,
				tooltip: '',
				class: undefined,
				run: () => openReleasePage(openerService, voidUpdateService),
			})
		} else if (res.action === 'reinstall') {
			primary.push({
				label: `再インストール`,
				id: 'void.updater.reinstall',
				enabled: true,
				tooltip: '',
				class: undefined,
				run: () => openReleasePage(openerService, voidUpdateService),
			})
		}

		actions = {
			primary: primary,
			secondary: [{
				id: 'void.updater.close',
				enabled: true,
				label: `現在のバージョンのまま`,
				tooltip: '',
				class: undefined,
				run: () => {
					notifController.close()
				}
			}]
		}
	}

	const notifController = notifService.notify({
		severity: Severity.Info,
		message: message,
		sticky: true,
		actions: actions,
	})

	return notifController
}

const notifyErrChecking = (notifService: INotificationService, openerService: IOpenerService): INotificationHandle => {
	const message = `Orchestra: アップデート確認時にエラーが発生しました。GitHub リリースページから手動で確認してください。`
	const notifController = notifService.notify({
		severity: Severity.Info,
		message: message,
		sticky: true,
		actions: {
			primary: [{
				id: 'orchestra.updater.openReleaseOnError',
				enabled: true,
				label: `リリースを開く`,
				tooltip: '',
				class: undefined,
				run: () => openerService.open(URI.parse('https://github.com/tapiocaTakeshi/Orchestra/releases/latest')),
			}],
		},
	})
	return notifController
}


const performVoidCheck = async (
	explicit: boolean,
	notifService: INotificationService,
	voidUpdateService: IOrchestraUpdateUiService,
	metricsService: IMetricsService,
	openerService: IOpenerService,
	progressService: IProgressService,
): Promise<INotificationHandle | null> => {

	const metricsTag = explicit ? 'Manual' : 'Auto'

	metricsService.capture(`Orchestra Update ${metricsTag}: Checking...`, {})
	// fetchLatestRelease を経由することで browser 側の state も更新される
	await voidUpdateService.fetchLatestRelease()
	const res = await voidUpdateService.check(explicit)
	if (!res) {
		const notifController = notifyErrChecking(notifService, openerService);
		metricsService.capture(`Orchestra Update ${metricsTag}: Error`, { res })
		return notifController
	}
	else {
		if (res.message) {
			const notifController = notifyUpdate(res, notifService, openerService, progressService, voidUpdateService, metricsService)
			metricsService.capture(`Orchestra Update ${metricsTag}: Yes`, { res })
			return notifController
		}
		else {
			metricsService.capture(`Orchestra Update ${metricsTag}: No`, { res })
			return null
		}
	}
}


let lastNotifController: INotificationHandle | null = null


registerAction2(class extends Action2 {
	constructor() {
		super({
			f1: true,
			id: VOID_CHECK_UPDATE_ACTION_ID,
			title: localize2('voidCheckUpdate', 'Orchestra: Check for Updates'),
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const voidUpdateService = accessor.get(IVoidUpdateService)
		const notifService = accessor.get(INotificationService)
		const metricsService = accessor.get(IMetricsService)
		const openerService = accessor.get(IOpenerService)
		const progressService = accessor.get(IProgressService)

		const currNotifController = lastNotifController

		const newController = await performVoidCheck(true, notifService, voidUpdateService, metricsService, openerService, progressService)

		if (newController) {
			currNotifController?.close()
			lastNotifController = newController
		}
	}
})


registerAction2(class extends Action2 {
	constructor() {
		super({
			f1: true,
			id: VOID_OPEN_LATEST_RELEASE_ACTION_ID,
			title: localize2('orchestraOpenRelease', 'Orchestra: Open Latest Release Page'),
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const voidUpdateService = accessor.get(IVoidUpdateService)
		const openerService = accessor.get(IOpenerService)
		await openReleasePage(openerService, voidUpdateService)
	}
})


// on mount
class VoidUpdateWorkbenchContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.void.voidUpdate'
	constructor(
		@IVoidUpdateService voidUpdateService: IOrchestraUpdateUiService,
		@IMetricsService metricsService: IMetricsService,
		@INotificationService notifService: INotificationService,
		@IOpenerService openerService: IOpenerService,
		@IProgressService progressService: IProgressService,
	) {
		super()

		const autoCheck = () => {
			performVoidCheck(false, notifService, voidUpdateService, metricsService, openerService, progressService)
		}

		const { window } = dom.getActiveWindow()

		// 起動 5 秒後に 1 回チェック
		const initId = window.setTimeout(() => autoCheck(), 5 * 1000)
		this._register({ dispose: () => window.clearTimeout(initId) })

		// 以降 3 時間ごとにチェック
		const intervalId = window.setInterval(() => autoCheck(), 3 * 60 * 60 * 1000)
		this._register({ dispose: () => window.clearInterval(intervalId) })

	}
}
registerWorkbenchContribution2(VoidUpdateWorkbenchContribution.ID, VoidUpdateWorkbenchContribution, WorkbenchPhase.BlockRestore);
