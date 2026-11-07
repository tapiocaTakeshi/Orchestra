/*--------------------------------------------------------------------------------------
 *  Copyright 2025 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// A cloud agent's .division documents as files: orchestra-cloud://<session id>/.division/paper.md.
//
// The local Division Project writes its workflow (.division/workflow.json), paper, specification and design
// pages into the workspace, and the user opens and edits them in the editor. A cloud session writes the same
// files into its sandbox; this provider puts them in the editor the same way, so they open with the same
// editors (Markdown, the workflow.json diagram, the design pages) and saving writes to the sandbox.
//
// It talks to Division's /api/cloud-sessions/:id/documents… (the request function is the cloud agent
// service's, so it uses the same login). Only .division's documents are served; the provider is read-write
// for them and refuses everything else (mkdir, delete, rename). Files the agent changes while one is open are
// reported as changed (polled every few seconds while a document of that session was used recently), so an
// open editor reloads, or warns before overwriting, like a local file the agent wrote.

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import {
	FileChangeType,
	FileSystemProviderCapabilities,
	FileSystemProviderErrorCode,
	FileType,
	IFileChange,
	IFileDeleteOptions,
	IFileOverwriteOptions,
	IFileSystemProviderWithFileReadWriteCapability,
	IFileWriteOptions,
	IStat,
	IWatchOptions,
	createFileSystemProviderError,
} from '../../../../platform/files/common/files.js';
import type { CloudAgentResponse } from '../common/cloudAgentTypes.js';

export const CLOUD_DOCUMENT_SCHEME = 'orchestra-cloud';
const DIVISION_DIR = '.division';
const DESIGN_DIR = '.division/design';

export type CloudDocumentKind = 'workflow' | 'paper' | 'specification' | 'design' | 'output';
/** One document as GET /api/cloud-sessions/:id/documents lists it */
export type CloudDocument = { path: string; name: string; kind: CloudDocumentKind; size: number; mtime: number };

/** The editor's URI of a session's document (path: workspace-relative, e.g. .division/paper.md). */
export const cloudDocumentUri = (sessionId: string, path: string): URI =>
	URI.from({ scheme: CLOUD_DOCUMENT_SCHEME, authority: sessionId, path: `/${path.replace(/^\/+/, '')}` });

export const cloudDocumentLabel: Record<CloudDocumentKind, string> = {
	workflow: 'ワークフロー',
	paper: '論文',
	specification: '仕様書',
	design: 'デザイン',
	output: '成果物',
};

const KINDS: CloudDocumentKind[] = ['workflow', 'paper', 'specification', 'design', 'output'];

export const toCloudDocuments = (raw: unknown): CloudDocument[] => {
	const list = raw && typeof raw === 'object' && Array.isArray((raw as { documents?: unknown }).documents) ? (raw as { documents: unknown[] }).documents : [];
	const out: CloudDocument[] = [];
	for (const d of list) {
		if (!d || typeof d !== 'object') continue;
		const o = d as Record<string, unknown>;
		if (typeof o.path !== 'string' || !o.path.startsWith(`${DIVISION_DIR}/`)) continue;
		out.push({
			path: o.path,
			name: typeof o.name === 'string' && o.name ? o.name : o.path.slice(DIVISION_DIR.length + 1),
			kind: KINDS.includes(o.kind as CloudDocumentKind) ? o.kind as CloudDocumentKind : 'output',
			size: typeof o.size === 'number' ? o.size : 0,
			mtime: typeof o.mtime === 'number' ? o.mtime : 0,
		});
	}
	return out;
};

type Request = (method: 'GET' | 'POST', path: string, body?: unknown, timeoutMs?: number) => Promise<CloudAgentResponse>;

const LIST_FRESH_MS = 1_500;
const POLL_MS = 5_000;
/** A session's documents are polled for changes while one was read or written within this time */
const WATCH_IDLE_MS = 30 * 60_000;
const TIMEOUT_MS = 120_000;

const errorOf = (res: CloudAgentResponse): Error => {
	const data = res.data as { error?: unknown; code?: unknown } | null;
	const message = typeof data?.error === 'string' && data.error ? data.error : res.error || `HTTP ${res.status}`;
	const code = typeof data?.code === 'string' ? data.code : '';
	if (res.status === 404 || code === 'file_not_found') return createFileSystemProviderError(message, FileSystemProviderErrorCode.FileNotFound);
	if (res.status === 403 || code === 'not_a_document') return createFileSystemProviderError(message, FileSystemProviderErrorCode.NoPermissions);
	if (res.status === 413) return createFileSystemProviderError(message, FileSystemProviderErrorCode.FileTooLarge);
	if (res.status === 0 || res.status >= 500) return createFileSystemProviderError(message, FileSystemProviderErrorCode.Unavailable);
	return createFileSystemProviderError(message, FileSystemProviderErrorCode.Unknown);
};

export class CloudDocumentFileSystemProvider extends Disposable implements IFileSystemProviderWithFileReadWriteCapability {

	readonly capabilities = FileSystemProviderCapabilities.FileReadWrite | FileSystemProviderCapabilities.PathCaseSensitive;
	readonly onDidChangeCapabilities = Event.None;

	private readonly _onDidChangeFile = this._register(new Emitter<readonly IFileChange[]>());
	readonly onDidChangeFile = this._onDidChangeFile.event;

	private readonly _lists = new Map<string, { at: number; docs: CloudDocument[]; pending?: Promise<CloudDocument[]> }>();
	private readonly _lastUse = new Map<string, number>();
	private _timer: ReturnType<typeof setTimeout> | null = null;

	constructor(private readonly _request: Request) {
		super();
		this._register(toDisposable(() => { if (this._timer) clearTimeout(this._timer); }));
	}

	/** GET /:id/documents (cached for a moment, so a stat right after a list costs nothing). */
	async listDocuments(sessionId: string, force = false): Promise<CloudDocument[]> {
		const cached = this._lists.get(sessionId);
		if (cached?.pending) return cached.pending;
		if (cached && !force && Date.now() - cached.at < LIST_FRESH_MS) return cached.docs;
		const pending = (async () => {
			const res = await this._request('GET', `/api/cloud-sessions/${encodeURIComponent(sessionId)}/documents`, undefined, TIMEOUT_MS);
			if (!res.ok) throw errorOf(res);
			return toCloudDocuments(res.data);
		})();
		this._lists.set(sessionId, { at: cached?.at ?? 0, docs: cached?.docs ?? [], pending });
		try {
			const docs = await pending;
			this._noteChanges(sessionId, cached?.docs ?? null, docs);
			this._lists.set(sessionId, { at: Date.now(), docs });
			return docs;
		} catch (e) {
			if (cached) this._lists.set(sessionId, cached); else this._lists.delete(sessionId);
			throw e;
		}
	}

	private _split(resource: URI): { sessionId: string; path: string } {
		const sessionId = resource.authority;
		const path = resource.path.replace(/^\/+/, '').replace(/\/+$/, '');
		if (!sessionId) throw createFileSystemProviderError('セッションが指定されていません。', FileSystemProviderErrorCode.FileNotFound);
		return { sessionId, path };
	}

	private _touch(sessionId: string): void {
		this._lastUse.set(sessionId, Date.now());
		if (!this._timer) this._schedule();
	}

	private _schedule(): void {
		this._timer = setTimeout(() => void this._poll(), POLL_MS);
	}

	private async _poll(): Promise<void> {
		this._timer = null;
		const now = Date.now();
		for (const [id, at] of [...this._lastUse]) {
			if (now - at > WATCH_IDLE_MS) { this._lastUse.delete(id); this._lists.delete(id); continue; }
			try { await this.listDocuments(id, true); } catch { /* offline / archived: try again next time */ }
		}
		if (this._lastUse.size) this._schedule();
	}

	/** Reports documents the agent added, changed or removed since the last list. */
	private _noteChanges(sessionId: string, before: CloudDocument[] | null, after: CloudDocument[]): void {
		if (!before) return;
		const changes: IFileChange[] = [];
		const old = new Map(before.map(d => [d.path, d]));
		for (const d of after) {
			const o = old.get(d.path);
			if (!o) changes.push({ type: FileChangeType.ADDED, resource: cloudDocumentUri(sessionId, d.path) });
			else if (o.mtime !== d.mtime || o.size !== d.size) changes.push({ type: FileChangeType.UPDATED, resource: cloudDocumentUri(sessionId, d.path) });
			old.delete(d.path);
		}
		for (const d of old.values()) changes.push({ type: FileChangeType.DELETED, resource: cloudDocumentUri(sessionId, d.path) });
		if (changes.length) this._onDidChangeFile.fire(changes);
	}

	watch(_resource: URI, _opts: IWatchOptions): IDisposable {
		return Disposable.None;
	}

	async stat(resource: URI): Promise<IStat> {
		const { sessionId, path } = this._split(resource);
		if (path === '' || path === DIVISION_DIR || path === DESIGN_DIR) return { type: FileType.Directory, mtime: 0, ctime: 0, size: 0 };
		this._touch(sessionId);
		const doc = (await this.listDocuments(sessionId)).find(d => d.path === path);
		if (!doc) {
			// Not listed (e.g. a design page's CSS): ask for the file itself.
			const res = await this._request('GET', `/api/cloud-sessions/${encodeURIComponent(sessionId)}/documents/content?path=${encodeURIComponent(path)}`, undefined, TIMEOUT_MS);
			if (!res.ok) throw errorOf(res);
			const d = res.data as { size?: number; mtime?: number } | null;
			return { type: FileType.File, mtime: d?.mtime ?? 0, ctime: d?.mtime ?? 0, size: d?.size ?? 0 };
		}
		return { type: FileType.File, mtime: doc.mtime, ctime: doc.mtime, size: doc.size };
	}

	async readdir(resource: URI): Promise<[string, FileType][]> {
		const { sessionId, path } = this._split(resource);
		if (path === '') return [[DIVISION_DIR, FileType.Directory]];
		if (path !== DIVISION_DIR && path !== DESIGN_DIR) throw createFileSystemProviderError(path, FileSystemProviderErrorCode.FileNotADirectory);
		this._touch(sessionId);
		const docs = await this.listDocuments(sessionId);
		const prefix = `${path}/`;
		const entries: [string, FileType][] = [];
		if (path === DIVISION_DIR && docs.some(d => d.path.startsWith(`${DESIGN_DIR}/`))) entries.push(['design', FileType.Directory]);
		for (const d of docs) {
			const rest = d.path.slice(prefix.length);
			if (d.path.startsWith(prefix) && rest && !rest.includes('/')) entries.push([rest, FileType.File]);
		}
		return entries;
	}

	async readFile(resource: URI): Promise<Uint8Array> {
		const { sessionId, path } = this._split(resource);
		this._touch(sessionId);
		const res = await this._request('GET', `/api/cloud-sessions/${encodeURIComponent(sessionId)}/documents/content?path=${encodeURIComponent(path)}`, undefined, TIMEOUT_MS);
		if (!res.ok) throw errorOf(res);
		const content = (res.data as { content?: unknown } | null)?.content;
		return VSBuffer.fromString(typeof content === 'string' ? content : '').buffer;
	}

	async writeFile(resource: URI, content: Uint8Array, _opts: IFileWriteOptions): Promise<void> {
		const { sessionId, path } = this._split(resource);
		this._touch(sessionId);
		// The editor has already compared the file's mtime with the one it opened (and asked before overwriting).
		const res = await this._request('POST', `/api/cloud-sessions/${encodeURIComponent(sessionId)}/documents/content`, { path, content: VSBuffer.wrap(content).toString() }, TIMEOUT_MS);
		if (!res.ok) throw errorOf(res);
		// Our own write: refresh the list quietly so it is not reported back as the agent's change.
		const saved = res.data as { size?: number; mtime?: number } | null;
		const cached = this._lists.get(sessionId);
		if (cached && !cached.pending) {
			const others = cached.docs.filter(d => d.path !== path);
			const prev = cached.docs.find(d => d.path === path);
			const name = path.slice(DIVISION_DIR.length + 1);
			const doc: CloudDocument = { path, name, kind: prev?.kind ?? 'output', size: saved?.size ?? content.byteLength, mtime: saved?.mtime ?? Date.now() };
			this._lists.set(sessionId, { at: 0, docs: [...others, doc] });
		}
	}

	async mkdir(_resource: URI): Promise<void> {
		throw createFileSystemProviderError('クラウドの文書のフォルダは作れません。', FileSystemProviderErrorCode.NoPermissions);
	}

	async delete(_resource: URI, _opts: IFileDeleteOptions): Promise<void> {
		throw createFileSystemProviderError('クラウドの文書は削除できません。', FileSystemProviderErrorCode.NoPermissions);
	}

	async rename(_from: URI, _to: URI, _opts: IFileOverwriteOptions): Promise<void> {
		throw createFileSystemProviderError('クラウドの文書の名前は変えられません。', FileSystemProviderErrorCode.NoPermissions);
	}
}
