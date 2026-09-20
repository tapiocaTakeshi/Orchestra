/*---------------------------------------------------------------------------------------------
 *  Orchestra Mobile remote-control gateway.
 *--------------------------------------------------------------------------------------------*/

import { randomBytes } from 'crypto';
import { createServer, IncomingMessage, Server, ServerResponse } from 'http';
import { networkInterfaces } from 'os';
import { promises as fs } from 'fs';
import { join } from '../../base/common/path.js';
import { app, BrowserWindow } from 'electron';

const PORT = 39231;
const PROTOCOL_VERSION = 1;
const TOKEN_FILE = 'orchestra-mobile-remote.json';

type PairingInfo = { version: number; url: string; token: string; pairingLink: string };

let server: Server | undefined;

function lanAddress(): string {
	for (const addresses of Object.values(networkInterfaces())) {
		for (const address of addresses ?? []) {
			if (address.family === 'IPv4' && !address.internal) return address.address;
		}
	}
	return '127.0.0.1';
}

function send(res: ServerResponse, status: number, body: unknown): void {
	res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
	res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<unknown> {
	const chunks: Buffer[] = [];
	for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	if (!chunks.length) return undefined;
	return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

/**
 * Starts the LAN-only control server used by Orchestra Mobile. The pairing token
 * is random, survives restarts and is never accepted through a URL query string.
 */
export async function startOrchestraMobileRemoteControl(): Promise<void> {
	if (server) return;
	const url = `http://${lanAddress()}:${PORT}`;
	let token = randomBytes(32).toString('base64url');
	try {
		const stored = JSON.parse(await fs.readFile(join(app.getPath('userData'), TOKEN_FILE), 'utf8')) as Partial<PairingInfo>;
		if (typeof stored.token === 'string' && /^[A-Za-z0-9_-]{32,}$/.test(stored.token)) token = stored.token;
	} catch {
		// First use or an unreadable old file: create a new token below.
	}
	const pairing: PairingInfo = {
		version: PROTOCOL_VERSION,
		url,
		token,
		pairingLink: `orchestra://pair?v=${PROTOCOL_VERSION}&url=${encodeURIComponent(url)}&token=${encodeURIComponent(token)}`
	};

	// The file is deliberately outside workspaces, so it cannot accidentally be committed.
	await fs.writeFile(join(app.getPath('userData'), TOKEN_FILE), JSON.stringify(pairing, undefined, 2), { mode: 0o600 });

	server = createServer(async (req, res) => {
		try {
			const path = new URL(req.url ?? '/', url).pathname;
			if (req.method === 'GET' && path === '/api/ping') {
				send(res, 200, { ok: true, app: 'Orchestra', protocolVersion: PROTOCOL_VERSION });
				return;
			}
			if (req.headers['x-orchestra-token'] !== token) {
				send(res, 401, { error: 'invalid_token' });
				return;
			}
			if (req.method === 'GET' && path === '/api/state') {
				send(res, 200, {
					ide: { protocolVersion: PROTOCOL_VERSION, appName: 'Orchestra', version: app.getVersion(), workspaceName: '', workspaceFolders: [], uiLanguage: 'ja' },
					division: { projects: [], activeProjectIds: [], configPath: null, hasProject: false },
					kanban: { board: { version: 1, title: 'Orchestra', columns: [], tasks: [], updatedAt: Date.now() }, runtime: { isLoaded: false, source: { kind: 'storage' }, isPolling: false, isRunning: false, awaitingApproval: false, runningTaskId: null, queuedTaskIds: [], lastPolledAt: Date.now(), autoRunEnabled: false } },
					chat: { threadId: '', messages: [], isRunning: false, awaitingApproval: false }, threads: [], revision: Date.now(), generatedAt: Date.now()
				});
				return;
			}
			if (req.method === 'POST' && path === '/api/commands/run') {
				const body = await readBody(req) as { commandId?: unknown; args?: unknown };
				if (typeof body?.commandId !== 'string' || !body.commandId) {
					send(res, 400, { error: 'commandId is required' });
					return;
				}
				BrowserWindow.getFocusedWindow()?.webContents.send('vscode:runAction', { id: body.commandId, from: 'orchestra-mobile', args: Array.isArray(body.args) ? body.args : [] });
				send(res, 200, { result: null });
				return;
			}
			send(res, 404, { error: 'not_found' });
		} catch (error) {
			send(res, 400, { error: 'invalid_request', detail: error instanceof Error ? error.message : String(error) });
		}
	});

	await new Promise<void>((resolve, reject) => {
		server!.once('error', reject);
		server!.listen(PORT, '0.0.0.0', () => { server!.off('error', reject); resolve(); });
	});
}

export async function stopOrchestraMobileRemoteControl(): Promise<void> {
	if (!server) return;
	const active = server;
	server = undefined;
	await new Promise<void>((resolve, reject) => active.close(error => error ? reject(error) : resolve()));
}
