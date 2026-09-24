/*---------------------------------------------------------------------------------------------
 *  Orchestra Mobile remote-control gateway.
 *--------------------------------------------------------------------------------------------*/

import { randomBytes, randomUUID } from 'crypto';
import { createServer, IncomingMessage, Server, ServerResponse } from 'http';
import { hostname, networkInterfaces } from 'os';
import { promises as fs } from 'fs';
import { join } from '../../base/common/path.js';
import { app, BrowserWindow } from 'electron';

const PORT = 39231;
const PROTOCOL_VERSION = 1;
const TOKEN_FILE = 'orchestra-mobile-remote.json';
const SUPABASE_URL = 'https://wmhrbhcnxglvqwvnbxlt.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtaHJiaGNueGdsdnF3dm5ieGx0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3OTg1MDAsImV4cCI6MjA5MTM3NDUwMH0.4qjCIOjFwm4XnmtqZN_N0zcZlhjGc2GQ4-x7ygMa3hM';
const REMOTE_SESSION_TABLE = 'RemoteSession';
const HEARTBEAT_MS = 25_000;

type PairingInfo = { version: number; url: string; token: string; pairingLink: string; remoteSessionId: string; remoteSessionOwner?: string };
type DivisionAccount = { userId: string; email: string; accessToken: string };

let server: Server | undefined;
let pairing: PairingInfo | undefined;
let account: DivisionAccount | undefined;
let heartbeat: ReturnType<typeof setInterval> | undefined;

function lanAddress(): string {
	for (const addresses of Object.values(networkInterfaces())) {
		for (const address of addresses ?? []) {
			if (address.family === 'IPv4' && !address.internal) return address.address;
		}
	}
	return '127.0.0.1';
}

function send(res: ServerResponse, status: number, body: unknown): void {
	res.writeHead(status, {
		'Content-Type': 'application/json; charset=utf-8',
		'Cache-Control': 'no-store',
		// The desktop workbench has an opaque vscode origin. Requests are still
		// loopback-only and the Supabase JWT is verified below.
		'Access-Control-Allow-Origin': '*',
		'Access-Control-Allow-Headers': 'Content-Type, X-Orchestra-Token, X-Division-Access-Token',
	});
	res.end(status === 204 ? undefined : JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<unknown> {
	const chunks: Buffer[] = [];
	for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	if (!chunks.length) return undefined;
	return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function isLoopback(req: IncomingMessage): boolean {
	const address = req.socket.remoteAddress;
	return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

async function persistPairing(): Promise<void> {
	if (!pairing) return;
	await fs.writeFile(join(app.getPath('userData'), TOKEN_FILE), JSON.stringify(pairing, undefined, 2), { mode: 0o600 });
}

async function removeRemoteSession(activeAccount = account, activePairing = pairing): Promise<void> {
	if (!activeAccount || !activePairing) return;
	try {
		await fetch(`${SUPABASE_URL}/rest/v1/${REMOTE_SESSION_TABLE}?id=eq.${encodeURIComponent(activePairing.remoteSessionId)}`, {
			method: 'DELETE',
			headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${activeAccount.accessToken}` },
		});
	} catch {
		// A stale row naturally disappears from the mobile list after two minutes.
	}
}

async function publishRemoteSession(): Promise<void> {
	if (!account || !pairing || pairing.url.includes('127.0.0.1')) return;
	const response = await fetch(`${SUPABASE_URL}/rest/v1/${REMOTE_SESSION_TABLE}?on_conflict=id`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			apikey: SUPABASE_ANON_KEY,
			Authorization: `Bearer ${account.accessToken}`,
			Prefer: 'resolution=merge-duplicates,return=minimal',
		},
		body: JSON.stringify({
			id: pairing.remoteSessionId,
			userId: account.userId,
			deviceLabel: `${app.getName()} · ${hostname()}`,
			lanUrl: pairing.url,
			token: pairing.token,
			protocolVersion: PROTOCOL_VERSION,
			lastSeenAt: new Date().toISOString(),
		}),
	});
	if (!response.ok) throw new Error(`RemoteSession publish failed (HTTP ${response.status})`);
}

function startHeartbeat(): void {
	if (heartbeat) clearInterval(heartbeat);
	heartbeat = setInterval(() => { void publishRemoteSession().catch(() => { /* retried on the next heartbeat */ }); }, HEARTBEAT_MS);
}

async function setDivisionAccount(next: DivisionAccount | undefined): Promise<void> {
	const previous = account;
	if (previous && (!next || previous.userId !== next.userId)) await removeRemoteSession(previous);
	account = next;
	if (!next) {
		if (heartbeat) clearInterval(heartbeat);
		heartbeat = undefined;
		return;
	}
	if (!pairing) return;
	// RemoteSession rows are owner-scoped by RLS. Give a different account a
	// fresh primary key instead of trying to update another user's row.
	if (pairing.remoteSessionOwner !== next.userId) {
		pairing.remoteSessionId = randomUUID();
		pairing.remoteSessionOwner = next.userId;
		await persistPairing();
	}
	await publishRemoteSession();
	startHeartbeat();
}

type VerifiedDivisionToken = { value: string; userId: string; email: string; expiresAt: number };
let verifiedToken: VerifiedDivisionToken | undefined;

async function getDivisionTokenUser(accessToken: string): Promise<{ userId: string; email: string }> {
	if (verifiedToken?.value === accessToken && verifiedToken.expiresAt > Date.now()) {
		return { userId: verifiedToken.userId, email: verifiedToken.email };
	}
	const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
		headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` },
	});
	if (!response.ok) throw new Error('Division session is invalid');
	const user = await response.json() as { id?: unknown; email?: unknown };
	if (typeof user.id !== 'string') throw new Error('Division session has no user');
	const verified = { userId: user.id, email: typeof user.email === 'string' ? user.email : '' };
	verifiedToken = { value: accessToken, ...verified, expiresAt: Date.now() + 30_000 };
	return verified;
}

async function authenticateDivisionAccount(raw: unknown): Promise<DivisionAccount> {
	const input = raw as Partial<DivisionAccount>;
	if (typeof input?.userId !== 'string' || typeof input?.accessToken !== 'string' || !input.userId || !input.accessToken) {
		throw new Error('userId and accessToken are required');
	}
	const user = await getDivisionTokenUser(input.accessToken);
	if (user.userId !== input.userId) throw new Error('Division user does not match the session');
	return { userId: input.userId, accessToken: input.accessToken, email: user.email };
}

async function isMatchingMobileAccount(req: IncomingMessage): Promise<boolean> {
	if (!account) return false;
	const rawToken = req.headers['x-division-access-token'];
	if (typeof rawToken !== 'string' || !rawToken) return false;
	try {
		return (await getDivisionTokenUser(rawToken)).userId === account.userId;
	} catch {
		return false;
	}
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
	pairing = {
		version: PROTOCOL_VERSION,
		url,
		token,
		pairingLink: `orchestra://pair?v=${PROTOCOL_VERSION}&url=${encodeURIComponent(url)}&token=${encodeURIComponent(token)}`,
		remoteSessionId: randomUUID(),
	};
	try {
		const stored = JSON.parse(await fs.readFile(join(app.getPath('userData'), TOKEN_FILE), 'utf8')) as Partial<PairingInfo>;
		if (typeof stored.remoteSessionId === 'string') pairing.remoteSessionId = stored.remoteSessionId;
		if (typeof stored.remoteSessionOwner === 'string') pairing.remoteSessionOwner = stored.remoteSessionOwner;
	} catch { /* handled by persistPairing below */ }

	// The file is deliberately outside workspaces, so it cannot accidentally be committed.
	await persistPairing();

	server = createServer(async (req, res) => {
		try {
			const path = new URL(req.url ?? '/', url).pathname;
			if (req.method === 'OPTIONS') {
				res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, DELETE', 'Access-Control-Allow-Headers': 'Content-Type, X-Orchestra-Token, X-Division-Access-Token' });
				res.end();
				return;
			}
			if (path === '/api/internal/division-session') {
				if (!isLoopback(req)) {
					send(res, 403, { error: 'loopback_only' });
					return;
				}
				if (req.method === 'DELETE') {
					await setDivisionAccount(undefined);
					send(res, 204, {});
					return;
				}
				if (req.method === 'POST') {
					await setDivisionAccount(await authenticateDivisionAccount(await readBody(req)));
					send(res, 204, {});
					return;
				}
				send(res, 405, { error: 'method_not_allowed' });
				return;
			}
			if (req.method === 'GET' && path === '/api/ping') {
				send(res, 200, { ok: true, app: 'Orchestra', protocolVersion: PROTOCOL_VERSION });
				return;
			}
			if (req.headers['x-orchestra-token'] !== token) {
				send(res, 401, { error: 'invalid_token' });
				return;
			}
			if (!await isMatchingMobileAccount(req)) {
				send(res, 403, { error: 'account_mismatch', detail: '同じ Division アカウントでログインしてください。' });
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
	if (heartbeat) clearInterval(heartbeat);
	heartbeat = undefined;
	await removeRemoteSession();
	account = undefined;
	pairing = undefined;
	if (!server) return;
	const active = server;
	server = undefined;
	await new Promise<void>((resolve, reject) => active.close(error => error ? reject(error) : resolve()));
}
