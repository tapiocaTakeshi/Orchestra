/*--------------------------------------------------------------------------------------
 *  Copyright 2026 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// IDE のログインは Division の Web サイトで行う (リダイレクト方式)。
//
//  1. start() が state を作り、ブラウザで <DIVISION_WEBSITE_URL>/orchestra/login?state=... を開く
//  2. ユーザーはサイトでログインし「Orchestra にログイン」を押す
//  3. サイトが orchestra://division-auth/callback?state=...&token_hash=... へリダイレクトする
//  4. ここで受け取り、state が一致すれば onDidReceiveToken で token_hash を渡す
//
// token_hash は 1 回だけ使える短命のトークンで、React 側 (divisionAuth.ts) が
// supabase.auth.verifyOtp で IDE 専用のセッションに交換する。Supabase SDK は
// tsup バンドルの中にしか無いので、交換はここではしない。

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IURLHandler, IURLService } from '../../../../platform/url/common/url.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { DIVISION_WEBSITE_URL } from '../common/divisionAuthConfig.js';

/** product.json の urlProtocol の後ろに付く authority。サイト側の ORCHESTRA_CALLBACK と合わせる */
export const DIVISION_AUTH_URL_AUTHORITY = 'division-auth';

export type DivisionBrowserLoginToken = { tokenHash: string };

export interface IDivisionBrowserLoginService {
	readonly _serviceBrand: undefined;

	/** サイトからトークンが届いたとき (state 一致済み) */
	readonly onDidReceiveToken: Event<DivisionBrowserLoginToken>;
	/** ブラウザでログインページを開き、返ってくるリダイレクトを待つ */
	start(): Promise<void>;
	/** 待っているログインを取り消す。以後届いたリダイレクトは無視する */
	cancel(): void;
}

export const IDivisionBrowserLoginService = createDecorator<IDivisionBrowserLoginService>('divisionBrowserLoginService');

class DivisionBrowserLoginService extends Disposable implements IDivisionBrowserLoginService, IURLHandler {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidReceiveToken = this._register(new Emitter<DivisionBrowserLoginToken>());
	readonly onDidReceiveToken = this._onDidReceiveToken.event;

	/** 開いたログインページに渡した state。届いたリダイレクトはこれと一致するものだけ受け付ける */
	private _pendingState: string | undefined;

	constructor(
		@IURLService urlService: IURLService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@IHostService private readonly _hostService: IHostService,
	) {
		super();
		this._register(urlService.registerHandler(this));
	}

	async start(): Promise<void> {
		const state = generateUuid().replace(/-/g, '');
		this._pendingState = state;
		const url = `${DIVISION_WEBSITE_URL}/orchestra/login?state=${encodeURIComponent(state)}`;
		await this._openerService.open(URI.parse(url), { openExternal: true });
	}

	cancel(): void {
		this._pendingState = undefined;
	}

	async handleURL(uri: URI): Promise<boolean> {
		if (uri.authority !== DIVISION_AUTH_URL_AUTHORITY) return false;
		const params = new URLSearchParams(uri.query);
		const state = params.get('state');
		const tokenHash = params.get('token_hash');
		// 自分が始めたログイン以外 (古いタブ・他人が作ったリンク) は受け付けない
		if (!this._pendingState || state !== this._pendingState || !tokenHash) return true;
		this._pendingState = undefined;
		await this._hostService.focus(mainWindow, { force: true });
		this._onDidReceiveToken.fire({ tokenHash });
		return true;
	}
}

registerSingleton(IDivisionBrowserLoginService, DivisionBrowserLoginService, InstantiationType.Eager);
