/*---------------------------------------------------------------------------------------------
 *  Orchestra Mobile remote-control relay.
 *
 *  Lets the phone reach the desktop when they are not on the same LAN (e.g. on mobile data).
 *  Both sides join a Supabase Realtime broadcast channel whose name is derived from the
 *  pairing token, and every message is end-to-end encrypted with a key derived from the same
 *  token, so Supabase only relays opaque bytes. The phone still sends its Division access
 *  token inside the encrypted request, and the gateway checks it exactly like the LAN server.
 *
 *  The wire format must match Orchestra-Mobile/src/api/relayCodec.ts:
 *    key    = HKDF-SHA256(token, salt 'orchestra-remote-relay', info 'key', 32 bytes)
 *    topic  = 'orchestra-remote-' + hex(HKDF-SHA256(token, salt, info 'topic', 16 bytes))
 *    sealed = base64(iv[12] || AES-256-GCM(deflateRaw(JSON), aad = kind) || tag[16])
 *  The sealed string is split into chunks and sent as broadcast events 'req' / 'res' with
 *  the payload { id, i, n, d }.
 *--------------------------------------------------------------------------------------------*/

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'crypto';
import { deflateRawSync, inflateRawSync } from 'zlib';
import { WebSocket } from 'ws';
import { createClient, RealtimeChannel, RealtimeClientOptions, SupabaseClient } from '@supabase/supabase-js';

export type RelayKind = 'req' | 'res';

export type RelayRequest = {
	id: string;
	method: string;
	path: string;
	query: Record<string, string>;
	body?: unknown;
	/** The pairing token. Decryption already proves it, but the gateway checks it like a header. */
	token: string;
	/** The phone's Division JWT (same as X-Division-Access-Token). */
	accessToken: string;
	/** When the phone sent it (ms). Old requests are dropped so a captured message cannot be replayed. */
	sentAt: number;
};

export type RelayResponse = { id: string; status: number; body: unknown };

const SALT = Buffer.from('orchestra-remote-relay', 'utf8');
const IV_BYTES = 12;
const TAG_BYTES = 16;
/** Supabase limits a broadcast message to 256 KB on the free plan; stay well below it. */
export const RELAY_CHUNK_CHARS = 60_000;
/** Requests older (or newer) than this are rejected. */
const MAX_CLOCK_SKEW_MS = 5 * 60_000;
/** Incomplete chunked messages are dropped after this. */
const PARTIAL_TTL_MS = 60_000;

export type RelayKeys = { key: Buffer; topic: string };

export function deriveRelayKeys(token: string): RelayKeys {
	const secret = Buffer.from(token, 'utf8');
	const key = Buffer.from(hkdfSync('sha256', secret, SALT, Buffer.from('key', 'utf8'), 32));
	const topicId = Buffer.from(hkdfSync('sha256', secret, SALT, Buffer.from('topic', 'utf8'), 16)).toString('hex');
	return { key, topic: `orchestra-remote-${topicId}` };
}

export function sealRelayMessage(key: Buffer, kind: RelayKind, message: unknown): string {
	const iv = randomBytes(IV_BYTES);
	const cipher = createCipheriv('aes-256-gcm', key, iv);
	cipher.setAAD(Buffer.from(kind, 'utf8'));
	const compressed = deflateRawSync(Buffer.from(JSON.stringify(message), 'utf8'));
	const encrypted = Buffer.concat([cipher.update(compressed), cipher.final()]);
	return Buffer.concat([iv, encrypted, cipher.getAuthTag()]).toString('base64');
}

/** Throws when the message was not sealed with this key (another token) or was tampered with. */
export function openRelayMessage<T>(key: Buffer, kind: RelayKind, sealed: string): T {
	const raw = Buffer.from(sealed, 'base64');
	if (raw.length < IV_BYTES + TAG_BYTES) throw new Error('relay message is too short');
	const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, IV_BYTES));
	decipher.setAAD(Buffer.from(kind, 'utf8'));
	decipher.setAuthTag(raw.subarray(raw.length - TAG_BYTES));
	const compressed = Buffer.concat([decipher.update(raw.subarray(IV_BYTES, raw.length - TAG_BYTES)), decipher.final()]);
	return JSON.parse(inflateRawSync(compressed).toString('utf8')) as T;
}

type Chunk = { id: string; i: number; n: number; d: string };

export function splitRelayMessage(id: string, sealed: string): Chunk[] {
	const n = Math.max(1, Math.ceil(sealed.length / RELAY_CHUNK_CHARS));
	return Array.from({ length: n }, (_, i) => ({ id, i, n, d: sealed.slice(i * RELAY_CHUNK_CHARS, (i + 1) * RELAY_CHUNK_CHARS) }));
}

/** Reassembles chunked messages. Returns the whole sealed string once every part arrived. */
export class RelayAssembler {
	private readonly _partial = new Map<string, { parts: (string | undefined)[]; received: number; expiresAt: number }>();

	add(raw: unknown, now = Date.now()): { id: string; sealed: string } | undefined {
		for (const [id, entry] of this._partial) if (entry.expiresAt < now) this._partial.delete(id);
		const chunk = raw as Partial<Chunk> | undefined;
		if (typeof chunk?.id !== 'string' || typeof chunk.d !== 'string' || !Number.isInteger(chunk.i) || !Number.isInteger(chunk.n)) return undefined;
		const { id, i, n, d } = chunk as Chunk;
		if (n < 1 || n > 256 || i < 0 || i >= n) return undefined;
		if (n === 1) return { id, sealed: d };
		let entry = this._partial.get(id);
		if (!entry || entry.parts.length !== n) {
			entry = { parts: new Array(n), received: 0, expiresAt: now + PARTIAL_TTL_MS };
			this._partial.set(id, entry);
		}
		if (entry.parts[i] === undefined) entry.received++;
		entry.parts[i] = d;
		if (entry.received < n) return undefined;
		this._partial.delete(id);
		return { id, sealed: entry.parts.join('') };
	}
}

export type RelayHandler = (request: RelayRequest) => Promise<{ status: number; body: unknown }>;

/**
 * Listens on the relay channel for the given pairing token and answers each request with
 * `handler`. Supabase Realtime reconnects on its own after network changes or sleep.
 */
export class OrchestraMobileRelay {
	private readonly _keys: RelayKeys;
	private readonly _client: SupabaseClient;
	private readonly _assembler = new RelayAssembler();
	/** Request ids already answered, so a replayed message is not run twice. */
	private readonly _seen = new Map<string, number>();
	private _channel: RealtimeChannel | undefined;
	private _connected = false;

	constructor(
		private readonly _token: string,
		supabaseUrl: string,
		supabaseAnonKey: string,
		private readonly _handler: RelayHandler,
	) {
		this._keys = deriveRelayKeys(_token);
		this._client = createClient(supabaseUrl, supabaseAnonKey, {
			auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
			// Electron's Node has no global WebSocket yet.
			realtime: { transport: WebSocket as unknown as RealtimeClientOptions['transport'] },
		});
	}

	/** Whether the channel is joined, i.e. the phone can reach this desktop from outside the LAN. */
	get connected(): boolean { return this._connected; }

	start(): void {
		if (this._channel) return;
		this._channel = this._client
			.channel(this._keys.topic, { config: { broadcast: { self: false, ack: false } } })
			.on('broadcast', { event: 'req' }, ({ payload }) => { void this._onChunk(payload); })
			.subscribe(status => { this._connected = status === 'SUBSCRIBED'; });
	}

	async stop(): Promise<void> {
		const channel = this._channel;
		this._channel = undefined;
		this._connected = false;
		if (channel) await this._client.removeChannel(channel).catch(() => undefined);
		this._client.realtime.disconnect();
	}

	private async _onChunk(payload: unknown): Promise<void> {
		const message = this._assembler.add(payload);
		if (!message) return;
		let request: RelayRequest;
		try {
			request = openRelayMessage<RelayRequest>(this._keys.key, 'req', message.sealed);
		} catch {
			return; // Not for us, or tampered with.
		}
		const now = Date.now();
		for (const [id, expiresAt] of this._seen) if (expiresAt < now) this._seen.delete(id);
		if (request.id !== message.id || this._seen.has(request.id)) return;
		if (typeof request.sentAt !== 'number' || Math.abs(now - request.sentAt) > MAX_CLOCK_SKEW_MS) {
			await this._reply({ id: request.id, status: 401, body: { error: 'stale_request', detail: 'スマホと PC の時計がずれています。' } });
			return;
		}
		this._seen.set(request.id, now + 2 * MAX_CLOCK_SKEW_MS);
		let response: { status: number; body: unknown };
		try {
			response = request.token === this._token
				? await this._handler(request)
				: { status: 401, body: { error: 'invalid_token' } };
		} catch (error) {
			response = { status: 400, body: { error: 'invalid_request', detail: error instanceof Error ? error.message : String(error) } };
		}
		await this._reply({ id: request.id, ...response });
	}

	private async _reply(response: RelayResponse): Promise<void> {
		const channel = this._channel;
		if (!channel) return;
		const sealed = sealRelayMessage(this._keys.key, 'res', response);
		for (const chunk of splitRelayMessage(response.id, sealed)) {
			await channel.send({ type: 'broadcast', event: 'res', payload: chunk }).catch(() => undefined);
		}
	}
}
