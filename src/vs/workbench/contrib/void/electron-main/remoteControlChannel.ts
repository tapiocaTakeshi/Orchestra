/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// registered in app.ts
//
// Orchestra-Mobile から IDE を操作するための HTTP サーバ。
// Node の API を使うため main プロセスに置いているが、ここは「HTTP を IPC に載せ替える」
// だけの薄いプロキシで、実際の処理はレンダラ側の remoteControlService.ts が行う。
//
// ルーティングをレンダラに寄せているのは、操作対象 (カンバン・Division プロジェクト・
// チャットスレッド) のサービスがすべてワークベンチ側にしか存在しないため。

import * as http from 'http';
import * as os from 'os';
import { randomBytes, timingSafeEqual } from 'crypto';

import { Emitter, Event } from '../../../../base/common/event.js';
import { IServerChannel } from '../../../../base/parts/ipc/common/ipc.js';
import {
	RemoteControlRequest,
	RemoteControlResponse,
	RemoteControlServerStatus,
	RemoteControlStartOptions,
	REMOTE_CONTROL_MAX_BODY_BYTES,
	REMOTE_CONTROL_REQUEST_TIMEOUT_MS,
	REMOTE_CONTROL_TOKEN_HEADER,
	REMOTE_CONTROL_PROTOCOL_VERSION,
} from '../common/remoteControlTypes.js';


type PendingRequest = {
	res: http.ServerResponse;
	timer: ReturnType<typeof setTimeout>;
};

const jsonHeaders = {
	'Content-Type': 'application/json; charset=utf-8',
	'Cache-Control': 'no-store',
	// ブラウザからも叩けるようにしておく (開発時のデバッグや Expo Web で役立つ)。
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Headers': `Content-Type, Authorization, ${REMOTE_CONTROL_TOKEN_HEADER}`,
	'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
};

const writeJson = (res: http.ServerResponse, status: number, body: unknown): void => {
	let payload: string;
	try {
		payload = JSON.stringify(body ?? null);
	} catch {
		status = 500;
		payload = JSON.stringify({ error: 'serialization_failed' });
	}
	if (res.writableEnded) return;
	res.writeHead(status, jsonHeaders);
	res.end(payload);
};

/** 長さの違いで早期 return しないよう、ハッシュ長を揃えてから比較する。 */
const tokensMatch = (a: string, b: string): boolean => {
	if (!a || !b) return false;
	const bufA = Buffer.from(a, 'utf8');
	const bufB = Buffer.from(b, 'utf8');
	if (bufA.length !== bufB.length) return false;
	try {
		return timingSafeEqual(bufA, bufB);
	} catch {
		return false;
	}
};

/** 接続先候補。LAN 待ち受けのときは IPv4 のプライベートアドレスも並べる。 */
const listAddresses = (port: number, allowLan: boolean): string[] => {
	const urls = [`http://127.0.0.1:${port}`];
	if (!allowLan) return urls;
	try {
		for (const infos of Object.values(os.networkInterfaces())) {
			for (const info of infos ?? []) {
				if (info.family !== 'IPv4' || info.internal) continue;
				urls.push(`http://${info.address}:${port}`);
			}
		}
	} catch {
		// アドレス列挙は best-effort
	}
	return urls;
};


export class RemoteControlChannel implements IServerChannel {

	private readonly _onRequest = new Emitter<RemoteControlRequest>();
	private readonly _onDidChangeStatus = new Emitter<RemoteControlServerStatus>();

	private _server: http.Server | null = null;
	private _token = '';
	private _port = 0;
	private _allowLan = false;
	private _ownerId: string | null = null;
	private _lastError: string | undefined = undefined;

	private readonly _pending = new Map<string, PendingRequest>();
	private _requestSeq = 0;

	listen(_: unknown, event: string): Event<any> {
		if (event === 'onRequest') return this._onRequest.event;
		if (event === 'onDidChangeStatus') return this._onDidChangeStatus.event;
		throw new Error(`[RemoteControlChannel] unknown event: ${event}`);
	}

	async call(_: unknown, command: string, arg?: any): Promise<any> {
		switch (command) {
			case 'start': return this._start(arg as RemoteControlStartOptions);
			case 'stop': return this._stop(arg?.ownerId);
			case 'status': return this._status();
			case 'respond': return this._respond(arg as RemoteControlResponse);
			default: throw new Error(`[RemoteControlChannel] unknown command: ${command}`);
		}
	}

	// -----------------------------------------------------------------------
	// ライフサイクル
	// -----------------------------------------------------------------------

	private _status(): RemoteControlServerStatus {
		return {
			running: !!this._server?.listening,
			port: this._port,
			addresses: this._server?.listening ? listAddresses(this._port, this._allowLan) : [],
			ownerId: this._ownerId,
			error: this._lastError,
		};
	}

	private _fireStatus(): void {
		this._onDidChangeStatus.fire(this._status());
	}

	private async _start(opts: RemoteControlStartOptions): Promise<RemoteControlServerStatus> {
		// 同じ設定で既に動いていれば何もしない (設定変更のたびに再起動しないため)。
		if (this._server?.listening
			&& this._ownerId === opts.ownerId
			&& this._port === opts.port
			&& this._token === opts.token
			&& this._allowLan === opts.allowLan) {
			return this._status();
		}

		await this._closeServer();

		this._ownerId = opts.ownerId;
		this._token = opts.token;
		this._port = opts.port;
		this._allowLan = opts.allowLan;
		this._lastError = undefined;

		const server = http.createServer((req, res) => { void this._handle(req, res); });
		// スマホがスリープしてもソケットを掴んだままにしない。
		server.keepAliveTimeout = 30_000;
		server.headersTimeout = 35_000;

		const host = opts.allowLan ? '0.0.0.0' : '127.0.0.1';

		const listened = await new Promise<string | undefined>((resolve) => {
			const onError = (err: Error) => {
				server.removeListener('listening', onListening);
				resolve(err.message);
			};
			const onListening = () => {
				server.removeListener('error', onError);
				resolve(undefined);
			};
			server.once('error', onError);
			server.once('listening', onListening);
			try {
				server.listen(opts.port, host);
			} catch (e) {
				resolve(e instanceof Error ? e.message : String(e));
			}
		});

		if (listened !== undefined) {
			this._lastError = listened;
			this._ownerId = null;
			try { server.close(); } catch { /* ignore */ }
			this._fireStatus();
			return this._status();
		}

		// listen 後のエラー (相手が切ったなど) でプロセスを落とさない。
		server.on('error', (err) => {
			this._lastError = err.message;
			this._fireStatus();
		});

		this._server = server;
		this._fireStatus();
		return this._status();
	}

	private async _stop(ownerId?: string): Promise<RemoteControlServerStatus> {
		// 別ウィンドウが所有権を持っているときは止めない。
		if (ownerId && this._ownerId && ownerId !== this._ownerId) return this._status();
		await this._closeServer();
		this._ownerId = null;
		this._fireStatus();
		return this._status();
	}

	private async _closeServer(): Promise<void> {
		const server = this._server;
		this._server = null;

		for (const [requestId, pending] of this._pending) {
			clearTimeout(pending.timer);
			writeJson(pending.res, 503, { error: 'server_stopped', detail: requestId });
		}
		this._pending.clear();

		if (!server) return;
		await new Promise<void>((resolve) => {
			try {
				server.close(() => resolve());
				// keep-alive で残っている接続を明示的に切る (Node 18+)。
				(server as unknown as { closeAllConnections?: () => void }).closeAllConnections?.();
			} catch {
				resolve();
			}
		});
	}

	// -----------------------------------------------------------------------
	// リクエスト処理
	// -----------------------------------------------------------------------

	private _readBody(req: http.IncomingMessage): Promise<{ raw: string; tooLarge: boolean }> {
		return new Promise((resolve) => {
			const chunks: Buffer[] = [];
			let size = 0;
			let tooLarge = false;
			req.on('data', (chunk: Buffer) => {
				if (tooLarge) return;
				size += chunk.length;
				if (size > REMOTE_CONTROL_MAX_BODY_BYTES) {
					tooLarge = true;
					chunks.length = 0;
					return;
				}
				chunks.push(chunk);
			});
			req.on('end', () => resolve({ raw: Buffer.concat(chunks).toString('utf8'), tooLarge }));
			req.on('error', () => resolve({ raw: '', tooLarge }));
		});
	}

	private _extractToken(req: http.IncomingMessage, query: Record<string, string>): string {
		const header = req.headers[REMOTE_CONTROL_TOKEN_HEADER];
		if (typeof header === 'string' && header) return header;

		const auth = req.headers['authorization'];
		if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) {
			return auth.slice('bearer '.length).trim();
		}

		return query['token'] ?? '';
	}

	private async _handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		if (req.method === 'OPTIONS') {
			res.writeHead(204, jsonHeaders);
			res.end();
			return;
		}

		const parsed = new URL(req.url ?? '/', 'http://localhost');
		const path = parsed.pathname.replace(/\/+$/, '') || '/';
		const query: Record<string, string> = {};
		parsed.searchParams.forEach((value, key) => { query[key] = value; });

		// /api/ping はトークン無しで応答する。アプリの「接続確認」で、
		// ペアリング前でも相手が Orchestra かどうかを判定できるようにするため。
		if (path === '/api/ping') {
			writeJson(res, 200, {
				ok: true,
				app: 'Orchestra',
				protocolVersion: REMOTE_CONTROL_PROTOCOL_VERSION,
				requiresToken: true,
			});
			return;
		}

		if (!tokensMatch(this._extractToken(req, query), this._token)) {
			writeJson(res, 401, { error: 'unauthorized' });
			return;
		}

		if (!path.startsWith('/api/')) {
			writeJson(res, 404, { error: 'not_found', detail: path });
			return;
		}

		const { raw, tooLarge } = await this._readBody(req);
		if (tooLarge) {
			writeJson(res, 413, { error: 'payload_too_large' });
			return;
		}

		let body: unknown = undefined;
		if (raw) {
			try {
				body = JSON.parse(raw);
			} catch {
				writeJson(res, 400, { error: 'invalid_json' });
				return;
			}
		}

		const ownerId = this._ownerId;
		if (!ownerId) {
			writeJson(res, 503, { error: 'no_window_attached' });
			return;
		}

		const requestId = `${Date.now().toString(36)}-${(this._requestSeq++).toString(36)}-${randomBytes(4).toString('hex')}`;

		const timer = setTimeout(() => {
			this._pending.delete(requestId);
			writeJson(res, 504, { error: 'ide_timeout' });
		}, REMOTE_CONTROL_REQUEST_TIMEOUT_MS);

		this._pending.set(requestId, { res, timer });

		// クライアントが切ったら待ち続けない。
		res.on('close', () => {
			const pending = this._pending.get(requestId);
			if (!pending) return;
			clearTimeout(pending.timer);
			this._pending.delete(requestId);
		});

		this._onRequest.fire({
			requestId,
			ownerId,
			method: (req.method ?? 'GET').toUpperCase(),
			path,
			query,
			body,
		});
	}

	private _respond(response: RemoteControlResponse): void {
		const pending = this._pending.get(response.requestId);
		if (!pending) return; // タイムアウト済み / 別ウィンドウが先に応答した
		clearTimeout(pending.timer);
		this._pending.delete(response.requestId);
		writeJson(pending.res, response.status, response.body);
	}
}
