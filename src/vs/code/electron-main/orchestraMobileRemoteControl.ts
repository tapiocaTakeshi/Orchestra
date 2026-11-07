/*---------------------------------------------------------------------------------------------
 *  Orchestra Mobile remote-control gateway.
 *--------------------------------------------------------------------------------------------*/

import { randomBytes, randomUUID } from 'crypto';
import { createServer, IncomingMessage, Server, ServerResponse } from 'http';
import { hostname, networkInterfaces } from 'os';
import { promises as fs } from 'fs';
import { join } from '../../base/common/path.js';
import { app, BrowserWindow, clipboard, IpcMainEvent, WebContents } from 'electron';
import { validatedIpcMain } from '../../base/parts/ipc/electron-main/ipcMain.js';
import { OrchestraMobileRelay } from './orchestraMobileRelay.js';

const PORT = 39231;
const PROTOCOL_VERSION = 1;
const TOKEN_FILE = 'orchestra-mobile-remote.json';
const SUPABASE_URL = 'https://wmhrbhcnxglvqwvnbxlt.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtaHJiaGNueGdsdnF3dm5ieGx0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3OTg1MDAsImV4cCI6MjA5MTM3NDUwMH0.4qjCIOjFwm4XnmtqZN_N0zcZlhjGc2GQ4-x7ygMa3hM';
const REMOTE_SESSION_TABLE = 'RemoteSession';
const HEARTBEAT_MS = 25_000;
// Division の同期 (モバイル側は 45 秒待つ) より少し長くしておく
const WORKBENCH_TIMEOUT_MS = 50_000;
const MAX_BODY_BYTES = 1024 * 1024;

// The workbench handles everything except discovery and account plumbing. These
// must match vs/workbench/contrib/void/common/remoteControlTypes.ts (vs/code
// cannot import from vs/workbench).
const IPC_READY = 'vscode:orchestraRemote:ready';
const IPC_REQUEST = 'vscode:orchestraRemote:request';
const IPC_RESPONSE = 'vscode:orchestraRemote:response';
const IPC_ANNOUNCE = 'vscode:orchestraRemote:announce';
const IPC_COPY_PAIRING_LINK = 'vscode:orchestraRemote:copyPairingLink';
const ALLOWED_METHODS = new Set(['GET', 'POST', 'PATCH', 'DELETE']);

type PairingInfo = { version: number; url: string; token: string; pairingLink: string; remoteSessionId: string; remoteSessionOwner?: string };
type DivisionAccount = { userId: string; email: string; accessToken: string };

let server: Server | undefined;
let pairing: PairingInfo | undefined;
let account: DivisionAccount | undefined;
let heartbeat: ReturnType<typeof setInterval> | undefined;
/** Reaches the phone through Supabase Realtime when it is not on the same LAN. Runs while signed in. */
let relay: OrchestraMobileRelay | undefined;
/** Why the LAN server is not listening, shown in the chat reply to `/remote-control`. */
let listenError: string | undefined;

type WorkbenchResponse = { id: string; status: number; body: unknown };
type PendingRequest = { webContentsId: number; resolve: (response: WorkbenchResponse) => void };

/** Workbench windows that registered the remote-control handler, most recently focused last. */
let readyWorkbenches: WebContents[] = [];
const hookedWorkbenches = new WeakSet<WebContents>();
const pendingRequests = new Map<string, PendingRequest>();

function forgetWorkbench(contents: WebContents): void {
	readyWorkbenches = readyWorkbenches.filter(c => c !== contents);
	for (const [id, pending] of pendingRequests) {
		if (pending.webContentsId !== contents.id) continue;
		pendingRequests.delete(id);
		pending.resolve({ id, status: 503, body: { error: 'window_closed' } });
	}
}

const onWorkbenchReady = (event: IpcMainEvent) => {
	const contents = event.sender;
	if (!hookedWorkbenches.has(contents)) {
		// A reload re-sends READY from the same webContents, so only hook it once.
		hookedWorkbenches.add(contents);
		contents.once('destroyed', () => forgetWorkbench(contents));
	}
	// A reloaded window drops its handler, so anything still waiting on it is lost.
	forgetWorkbench(contents);
	readyWorkbenches.push(contents);
};

const onWorkbenchResponse = (event: IpcMainEvent, response: WorkbenchResponse) => {
	const pending = typeof response?.id === 'string' ? pendingRequests.get(response.id) : undefined;
	if (!pending || pending.webContentsId !== event.sender.id) return;
	pendingRequests.delete(response.id);
	pending.resolve(response);
};

const onWindowFocus = (_event: unknown, window: BrowserWindow) => {
	const contents = window.webContents;
	if (!readyWorkbenches.includes(contents)) return;
	readyWorkbenches = [...readyWorkbenches.filter(c => c !== contents), contents];
};

/** The focused workbench, else the one focused most recently. The phone is usually used while the PC is unattended. */
function targetWorkbench(): WebContents | undefined {
	const focused = BrowserWindow.getFocusedWindow()?.webContents;
	if (focused && readyWorkbenches.includes(focused) && !focused.isDestroyed()) return focused;
	return [...readyWorkbenches].reverse().find(c => !c.isDestroyed());
}

function forwardToWorkbench(method: string, path: string, query: Record<string, string>, body: unknown): Promise<WorkbenchResponse> {
	const target = targetWorkbench();
	const id = randomUUID();
	if (!target) {
		return Promise.resolve({ id, status: 503, body: { error: 'no_window', detail: 'Orchestra のウィンドウが開いていません。' } });
	}
	return new Promise(resolve => {
		const timer = setTimeout(() => {
			pendingRequests.delete(id);
			resolve({ id, status: 504, body: { error: 'workbench_timeout' } });
		}, WORKBENCH_TIMEOUT_MS);
		pendingRequests.set(id, {
			webContentsId: target.id,
			resolve: response => { clearTimeout(timer); resolve(response); },
		});
		target.send(IPC_REQUEST, { id, method, path, query, body });
	});
}

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
		'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE',
	});
	res.end(status === 204 ? undefined : JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<unknown> {
	const chunks: Buffer[] = [];
	let size = 0;
	for await (const chunk of req) {
		const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		size += buffer.length;
		if (size > MAX_BODY_BYTES) throw new Error('request body is too large');
		chunks.push(buffer);
	}
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

/**
 * Upserts this desktop's RemoteSession row. `syncedAt` is only sent by `/remote-control`;
 * heartbeats leave it out, so the merge keeps the last sync time and the phone's Realtime
 * UPDATE listener only notifies when a chat is actually synced.
 */
async function publishRemoteSession(syncedAt?: number): Promise<void> {
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
			deviceLabel: deviceLabel(),
			lanUrl: pairing.url,
			token: pairing.token,
			protocolVersion: PROTOCOL_VERSION,
			lastSeenAt: new Date().toISOString(),
			...(syncedAt !== undefined ? { syncedAt: new Date(syncedAt).toISOString() } : {}),
		}),
	});
	if (!response.ok) throw new Error(`RemoteSession publish failed (HTTP ${response.status})`);
}

function deviceLabel(): string {
	return `${app.getName()} · ${hostname()}`;
}

/** Mirrors RemoteGatewayStatus in vs/workbench/contrib/void/browser/remoteSessionSyncService.ts. */
type GatewayStatus = { listening: boolean; url: string; deviceLabel: string; accountEmail: string | null; published: boolean; relayConnected: boolean; error?: string };

/**
 * `/remote-control` in the chat: republish the RemoteSession right away instead of
 * waiting for the next heartbeat, so the phone finds this desktop immediately.
 * With `syncedAt` (a chat was synced, not just `/remote-control status`) the row carries
 * it, and the phone notifies as soon as Realtime delivers the update.
 */
async function announce(_event: unknown, rawSyncedAt?: unknown): Promise<GatewayStatus> {
	const syncedAt = typeof rawSyncedAt === 'number' && Number.isFinite(rawSyncedAt) && rawSyncedAt > 0 ? rawSyncedAt : undefined;
	const status: GatewayStatus = {
		listening: !!server?.listening,
		url: pairing?.url ?? '',
		deviceLabel: deviceLabel(),
		accountEmail: account ? (account.email || account.userId) : null,
		published: false,
		relayConnected: !!relay?.connected,
	};
	if (!status.listening) return { ...status, error: listenError };
	if (!account || !pairing) return status;
	if (pairing.url.includes('127.0.0.1')) return { ...status, error: 'この PC が LAN に繋がっていません' };
	try {
		await publishRemoteSession(syncedAt);
		startHeartbeat();
		return { ...status, published: true };
	} catch (error) {
		return { ...status, error: error instanceof Error ? error.message : String(error) };
	}
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
		await stopRelay();
		return;
	}
	if (!pairing) return;
	startRelay(pairing.token);
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

/**
 * A phone's Division JWT that Supabase already accepted. It is trusted until the JWT's own `exp`
 * (Supabase access tokens live about an hour), so the phone's polling does not ask Supabase every
 * 30 seconds, and a Supabase hiccup in between cannot make a signed-in phone look like another account.
 */
type VerifiedDivisionToken = { userId: string; email: string; expiresAt: number };
const verifiedTokens = new Map<string, VerifiedDivisionToken>();
const MAX_VERIFIED_TOKENS = 32;
/** Without a readable `exp`, ask Supabase again after this long. */
const VERIFIED_TOKEN_FALLBACK_MS = 5 * 60_000;

/** Why a phone's Division token was not accepted. */
class DivisionTokenError extends Error {
	/** invalid: Supabase rejected it (expired, revoked); unavailable: Supabase could not be asked */
	constructor(readonly reason: 'invalid' | 'unavailable', message: string) { super(message); }
}

function jwtExpiresAt(token: string): number | undefined {
	try {
		const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')) as { exp?: unknown };
		return typeof payload.exp === 'number' ? payload.exp * 1000 : undefined;
	} catch {
		return undefined;
	}
}

async function getDivisionTokenUser(accessToken: string): Promise<{ userId: string; email: string }> {
	const now = Date.now();
	const cached = verifiedTokens.get(accessToken);
	if (cached && cached.expiresAt > now) return { userId: cached.userId, email: cached.email };
	verifiedTokens.delete(accessToken);
	const exp = jwtExpiresAt(accessToken);
	if (exp !== undefined && exp <= now) throw new DivisionTokenError('invalid', 'Division session has expired');
	let response: Response;
	try {
		response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
			headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` },
			signal: AbortSignal.timeout(10_000),
		});
	} catch (error) {
		throw new DivisionTokenError('unavailable', error instanceof Error ? error.message : String(error));
	}
	if (response.status === 401 || response.status === 403) throw new DivisionTokenError('invalid', 'Division session is invalid');
	if (!response.ok) throw new DivisionTokenError('unavailable', `Supabase answered HTTP ${response.status}`);
	const user = await response.json() as { id?: unknown; email?: unknown };
	if (typeof user.id !== 'string') throw new DivisionTokenError('invalid', 'Division session has no user');
	const verified = { userId: user.id, email: typeof user.email === 'string' ? user.email : '' };
	for (const [token, entry] of verifiedTokens) { if (entry.expiresAt <= now) verifiedTokens.delete(token); }
	if (verifiedTokens.size >= MAX_VERIFIED_TOKENS) verifiedTokens.delete(verifiedTokens.keys().next().value!);
	verifiedTokens.set(accessToken, { ...verified, expiresAt: Math.min(exp ?? now + VERIFIED_TOKEN_FALLBACK_MS, now + 60 * 60_000) });
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

/**
 * Checks the phone's Division account against this desktop's. Only a phone signed in as another
 * user gets `account_mismatch` (the phone disconnects on it). An expired token is 401
 * `division_token_invalid` (the phone refreshes it and retries), and anything that only means
 * "could not check right now" is 503, so the phone keeps the connection and tries again.
 */
async function checkMobileAccount(rawToken: unknown): Promise<{ status: number; body: unknown } | undefined> {
	if (!account) {
		return { status: 503, body: { error: 'pc_not_signed_in', detail: 'PC の Orchestra が Division にログインしていません。' } };
	}
	if (typeof rawToken !== 'string' || !rawToken) {
		return { status: 401, body: { error: 'division_token_invalid', detail: 'Division のログイン情報がありません。' } };
	}
	try {
		if ((await getDivisionTokenUser(rawToken)).userId === account.userId) return undefined;
		return { status: 403, body: { error: 'account_mismatch', detail: '同じ Division アカウントでログインしてください。' } };
	} catch (error) {
		if (error instanceof DivisionTokenError && error.reason === 'invalid') {
			return { status: 401, body: { error: 'division_token_invalid', detail: 'Division のログインの有効期限が切れています。' } };
		}
		return { status: 503, body: { error: 'auth_unavailable', detail: 'Division のログインを確認できませんでした。少し待ってからもう一度試します。' } };
	}
}

function startRelay(token: string): void {
	if (relay) return;
	relay = new OrchestraMobileRelay(token, SUPABASE_URL, SUPABASE_ANON_KEY, request =>
		handleApiRequest(request.method, request.path, request.query, request.body, request.token, request.accessToken));
	relay.start();
}

async function stopRelay(): Promise<void> {
	const active = relay;
	relay = undefined;
	await active?.stop();
}

/**
 * Answers one `/api/*` request from the phone, whether it came over the LAN or the relay:
 * checks the pairing token and the Division account, then hands it to the workbench.
 */
async function handleApiRequest(method: string, path: string, query: Record<string, string>, body: unknown, orchestraToken: unknown, divisionAccessToken: unknown): Promise<{ status: number; body: unknown }> {
	if (method === 'GET' && path === '/api/ping') {
		return { status: 200, body: { ok: true, app: 'Orchestra', protocolVersion: PROTOCOL_VERSION } };
	}
	if (!pairing || orchestraToken !== pairing.token) {
		return { status: 401, body: { error: 'invalid_token' } };
	}
	const rejected = await checkMobileAccount(divisionAccessToken);
	if (rejected) return rejected;
	if (path.startsWith('/api/') && !path.startsWith('/api/internal/') && ALLOWED_METHODS.has(method)) {
		const response = await forwardToWorkbench(method, path, query, body);
		return { status: response.status, body: response.body };
	}
	return { status: 404, body: { error: 'not_found' } };
}

/**
 * Starts the LAN-only control server used by Orchestra Mobile. The pairing token
 * is random, survives restarts and is never accepted through a URL query string.
 */
export async function startOrchestraMobileRemoteControl(): Promise<void> {
	if (server) return;
	// Register before any await so a window that finishes loading early still gets counted.
	validatedIpcMain.on(IPC_READY, onWorkbenchReady);
	validatedIpcMain.on(IPC_RESPONSE, onWorkbenchResponse);
	validatedIpcMain.handle(IPC_ANNOUNCE, announce);
	validatedIpcMain.handle(IPC_COPY_PAIRING_LINK, async () => { if (pairing) clipboard.writeText(pairing.pairingLink); });
	app.on('browser-window-focus', onWindowFocus);
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
				res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE', 'Access-Control-Allow-Headers': 'Content-Type, X-Orchestra-Token, X-Division-Access-Token' });
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
			const method = req.method ?? '';
			const query = Object.fromEntries(new URL(req.url ?? '/', url).searchParams.entries());
			const body = method === 'GET' ? undefined : await readBody(req);
			const response = await handleApiRequest(method, path, query, body, req.headers['x-orchestra-token'], req.headers['x-division-access-token']);
			send(res, response.status, response.body);
		} catch (error) {
			send(res, 400, { error: 'invalid_request', detail: error instanceof Error ? error.message : String(error) });
		}
	});

	try {
		await new Promise<void>((resolve, reject) => {
			server!.once('error', reject);
			server!.listen(PORT, '0.0.0.0', () => { server!.off('error', reject); resolve(); });
		});
		listenError = undefined;
	} catch (error) {
		listenError = (error as NodeJS.ErrnoException)?.code === 'EADDRINUSE'
			? `ポート ${PORT} が別のアプリで使われています`
			: error instanceof Error ? error.message : String(error);
		throw error;
	}
}

export async function stopOrchestraMobileRemoteControl(): Promise<void> {
	if (heartbeat) clearInterval(heartbeat);
	heartbeat = undefined;
	await stopRelay();
	await removeRemoteSession();
	account = undefined;
	pairing = undefined;
	validatedIpcMain.removeListener(IPC_READY, onWorkbenchReady);
	validatedIpcMain.removeListener(IPC_RESPONSE, onWorkbenchResponse);
	validatedIpcMain.removeHandler(IPC_ANNOUNCE);
	validatedIpcMain.removeHandler(IPC_COPY_PAIRING_LINK);
	app.removeListener('browser-window-focus', onWindowFocus);
	for (const [id, pending] of pendingRequests) pending.resolve({ id, status: 503, body: { error: 'shutting_down' } });
	pendingRequests.clear();
	readyWorkbenches = [];
	if (!server) return;
	const active = server;
	server = undefined;
	await new Promise<void>((resolve, reject) => active.close(error => error ? reject(error) : resolve()));
}
