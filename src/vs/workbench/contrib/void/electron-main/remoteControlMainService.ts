/*--------------------------------------------------------------------------------------
 *  Copyright 2025 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// orchestra-mobile 向けのリモートコントロール HTTP サーバー (Phase 1: ping / state のみ)。
// renderer は raw な net/http を直接扱えない前提のため、electron-main 側にサーバーの実体を置き、
// ProxyChannel 経由で renderer (common/remoteControlService.ts) に公開する。

import * as crypto from 'crypto';
import * as http from 'http';
import * as os from 'os';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IRemoteControlUiService } from '../common/remoteControlService.js';
import {
	emptyChatState,
	emptyDivisionState,
	emptyKanbanState,
	PROTOCOL_VERSION,
	RemoteControlConnectionInfo,
	RemoteControlIdeInfoInput,
	RemoteControlServerState,
	Snapshot,
} from '../common/remoteControlTypes.js';

const REMOTE_CONTROL_PORT = 39231;
const TOKEN_HEADER = 'x-orchestra-token';

const buildPairingLink = (info: { url: string; token: string; workspaceName: string }): string => {
	const params = new URLSearchParams({ v: '1', url: info.url, token: info.token, workspace: info.workspaceName });
	return `orchestra://pair?${params.toString()}`;
};

/** LAN 上から見える IPv4 アドレスを 1 つ選ぶ (内部/ループバックは除外)。見つからなければ null。 */
const pickLanAddress = (): string | null => {
	const interfaces = os.networkInterfaces();
	for (const name of Object.keys(interfaces)) {
		for (const iface of interfaces[name] ?? []) {
			if (iface.family === 'IPv4' && !iface.internal) return iface.address;
		}
	}
	return null;
};

export class RemoteControlMainService extends Disposable implements IRemoteControlUiService {
	_serviceBrand: undefined;

	// state / onDidChangeState は browser 側ラッパー (RemoteControlService) が使う API。
	// main プロセスからは参照されないが、IPC 越しに同じインターフェースを満たすためスタブを置く
	// (voidUpdateMainService.ts と同じ方針)。
	get state(): RemoteControlServerState { return this._state; }

	private _server: http.Server | null = null;
	private _token = '';
	private _enabled = false;
	private _ideInfo: RemoteControlIdeInfoInput = { workspaceName: '', workspaceFolders: [], uiLanguage: 'en' };
	private _revision = 0;
	private _state: RemoteControlServerState = { kind: 'stopped' };

	private readonly _onDidChangeState = this._register(new Emitter<RemoteControlServerState>());
	readonly onDidChangeState: Event<RemoteControlServerState> = this._onDidChangeState.event;

	constructor(
		@IProductService private readonly _productService: IProductService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	private _setState(s: RemoteControlServerState): void {
		this._state = s;
		this._onDidChangeState.fire(s);
	}

	async getState(): Promise<RemoteControlServerState> {
		return this._state;
	}

	async setIdeInfo(info: RemoteControlIdeInfoInput): Promise<void> {
		this._ideInfo = info;
		this._revision++;
		// 実行中なら、ペアリングリンクに載る workspaceName を最新化するため接続情報も更新する。
		if (this._state.kind === 'running') {
			const info2 = this._connectionInfo();
			if (info2) this._setState({ kind: 'running', info: info2 });
		}
	}

	async configure(opts: { enabled: boolean; token: string }): Promise<RemoteControlServerState> {
		if (opts.token) this._token = opts.token;
		this._enabled = opts.enabled;

		if (this._enabled) {
			if (!this._token) this._token = crypto.randomBytes(24).toString('hex');
			await this._start();
		} else {
			await this._stop();
		}
		return this._state;
	}

	async regenerateToken(): Promise<{ token: string; state: RemoteControlServerState }> {
		this._token = crypto.randomBytes(24).toString('hex');
		if (this._enabled) await this._start(); // 実行中なら再起動して接続情報 (トークン) を更新する
		return { token: this._token, state: this._state };
	}

	private _start(): Promise<void> {
		return new Promise<void>((resolve) => {
			// 既に立っているなら閉じてから作り直す (トークン変更後の再起動などで通る)。
			const proceed = () => {
				this._setState({ kind: 'starting' });
				const server = http.createServer((req, res) => this._handleRequest(req, res));
				this._server = server;

				server.once('error', (err: NodeJS.ErrnoException) => {
					const message = err.code === 'EADDRINUSE'
						? `ポート ${REMOTE_CONTROL_PORT} は既に使用されています。他のアプリを終了するか、しばらく待ってから再試行してください。`
						: (err.message || String(err));
					this._logService.warn(`[remoteControl] server error: ${message}`);
					this._server = null;
					this._setState({ kind: 'error', message });
					resolve();
				});

				server.listen(REMOTE_CONTROL_PORT, '0.0.0.0', () => {
					const info = this._connectionInfo();
					if (info) this._setState({ kind: 'running', info });
					else this._setState({ kind: 'error', message: 'LAN 上の IP アドレスを検出できませんでした。Wi-Fi に接続されているか確認してください。' });
					resolve();
				});
			};

			if (this._server) {
				const old = this._server;
				this._server = null;
				old.close(() => proceed());
			} else {
				proceed();
			}
		});
	}

	private async _stop(): Promise<void> {
		const server = this._server;
		this._server = null;
		if (!server) {
			if (this._state.kind !== 'stopped') this._setState({ kind: 'stopped' });
			return;
		}
		await new Promise<void>((resolve) => server.close(() => resolve()));
		this._setState({ kind: 'stopped' });
	}

	private _connectionInfo(): RemoteControlConnectionInfo | null {
		const address = pickLanAddress();
		if (!address) return null;
		const url = `http://${address}:${REMOTE_CONTROL_PORT}`;
		const workspaceName = this._ideInfo.workspaceName || '';
		return { url, token: this._token, workspaceName, pairingLink: buildPairingLink({ url, token: this._token, workspaceName }) };
	}

	private _handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
		const send = (status: number, body: unknown) => {
			const text = JSON.stringify(body);
			res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(text) });
			res.end(text);
		};

		let pathname: string;
		try {
			pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
		} catch {
			send(400, { error: 'bad_request' });
			return;
		}

		// /api/ping はハンドシェイク用。相手が Orchestra かどうかの判定に使うため認証不要。
		if (req.method === 'GET' && pathname === '/api/ping') {
			send(200, { ok: true, app: this._productService.nameShort ?? 'Orchestra', protocolVersion: PROTOCOL_VERSION, requiresToken: true });
			return;
		}

		const tokenHeader = req.headers[TOKEN_HEADER];
		const providedToken = Array.isArray(tokenHeader) ? tokenHeader[0] : tokenHeader;
		if (!this._token || providedToken !== this._token) {
			send(401, { error: 'unauthorized' });
			return;
		}

		if (req.method === 'GET' && pathname === '/api/state') {
			send(200, this._buildSnapshot());
			return;
		}

		// Phase 1 ではカンバン / チャット / Division / ファイル操作は未実装。
		// モバイル側の OrchestraApiError.userMessage が 404 を「対応していない IDE です」と表示する。
		send(404, { error: 'not_implemented', detail: 'Phase 1 ではこの操作はまだ実装されていません。' });
	}

	private _buildSnapshot(): Snapshot {
		return {
			ide: {
				protocolVersion: PROTOCOL_VERSION,
				appName: this._productService.nameShort ?? 'Orchestra',
				version: this._productService.version ?? '0.0.0',
				workspaceName: this._ideInfo.workspaceName,
				workspaceFolders: this._ideInfo.workspaceFolders,
				uiLanguage: this._ideInfo.uiLanguage,
			},
			division: emptyDivisionState(),
			kanban: emptyKanbanState(),
			chat: emptyChatState(),
			threads: [],
			revision: this._revision,
			generatedAt: Date.now(),
		};
	}

	override dispose(): void {
		const server = this._server;
		this._server = null;
		server?.close();
		super.dispose();
	}
}
