/*--------------------------------------------------------------------------------------
 *  Copyright 2025 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// クラウドエージェントの main プロセス側。
//
// 1. Division の /api/cloud-sessions・/api/github 配下への認証付き GET / POST の中継
//    (レンダラーから直接叩くと Division に CORS が無いので失敗する)。
//    Pull requests (GET / POST /api/cloud-sessions/:id/pull-request) go through this same relay.
// 2. ワークスペースを tar.gz にまとめてアップロードする。
//    Vercel のリクエストボディ上限 (~4.5 MB) があるので、2 MiB ずつに切って base64 で順に POST する。
//
// 既存の LLMMessageChannel._callDivisionApiRequest は 60 秒固定・GET/POST の自動判定なので、
// アップロード (1 リクエスト数 MB、合計数十〜百 MB) には使わず、ここに専用の口を作っている。
// electron-main なので workbench の実装は import しない (common/ の型だけ)。

import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { execFile } from 'child_process';
import { promisify } from 'util';
import {
	CLOUD_SESSIONS_API_PREFIX,
	GITHUB_API_PREFIX,
	DIVISION_PROJECTS_API_PREFIX,
	DECISIONS_API_PREFIX,
	CloudAgentRequestParams,
	CloudAgentResponse,
	CloudAgentUploadParams,
	CloudAgentUploadResult,
	CloudWorkspaceInfo,
	ICloudAgentMainService,
} from '../common/cloudAgentTypes.js';

const execFileAsync = promisify(execFile);

/** 1 ファイルの上限。これより大きいファイルは送らない (skipped に数える) */
const MAX_FILE_BYTES = 20 * 1024 * 1024;
/** 送るファイルの合計 (圧縮前) の上限。超えたら以降のファイルは送らない */
const MAX_TOTAL_RAW_BYTES = 300 * 1024 * 1024;
/** サーバー側の上限 (圧縮後の合計) */
const MAX_TOTAL_COMPRESSED_BYTES = 150 * 1024 * 1024;
/** 1 回の POST で送る .tar.gz の切れ端の大きさ (base64 にすると ~2.8 MB) */
const UPLOAD_SLICE_BYTES = 2 * 1024 * 1024;
const UPLOAD_TIMEOUT_MS = 120_000;
const UPLOAD_RETRIES = 2;
const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;

/** git 管理でないフォルダを歩くときに飛ばすディレクトリ (.git は git 管理でも常に飛ばす) */
const SKIP_DIRS = new Set([
	'.git', 'node_modules', '.next', 'dist', 'build', 'out', '.venv', 'venv',
	'__pycache__', '.turbo', '.cache', 'coverage', 'target',
]);


// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

const normalizeEndpoint = (endpoint: unknown): string =>
	typeof endpoint === 'string' ? endpoint.trim().replace(/\/+$/, '') : '';

/** 中継してよい API のパス (この下だけ。汎用のプロキシにしない) */
const ALLOWED_API_PREFIXES = [CLOUD_SESSIONS_API_PREFIX, GITHUB_API_PREFIX, DIVISION_PROJECTS_API_PREFIX, DECISIONS_API_PREFIX];

/** prefix そのものか、prefix + '/...' か (`/api/github-evil` のような前方一致は通さない) */
const isUnderPrefix = (pathname: string, prefix: string): boolean => {
	if (!pathname.startsWith(prefix)) return false;
	const rest = pathname.slice(prefix.length);
	return rest === '' || rest.startsWith('/');
};

/** endpoint 配下の /api/cloud-sessions… と /api/github… だけを通す (汎用のプロキシにしない) */
const buildUrl = (endpointRaw: unknown, pathRaw: unknown): URL | string => {
	const endpoint = normalizeEndpoint(endpointRaw);
	const p = typeof pathRaw === 'string' ? pathRaw : '';
	let url: URL;
	let base: URL;
	try {
		base = new URL(endpoint);
		url = new URL(endpoint + p);
	} catch {
		return 'invalid url';
	}
	// クエリ (?path=foo..bar.txt など) には '..' が入りうるので、パス部分だけを見る
	const pathname = p.split('?')[0];
	const prefixOk = ALLOWED_API_PREFIXES.some(prefix => isUnderPrefix(pathname, prefix));
	if (!/^https?:$/.test(url.protocol) || !prefixOk || pathname.includes('..') || pathname.includes('\\') || url.origin !== base.origin) {
		return 'path not allowed';
	}
	return url;
};

const parseBody = (text: string): any => {
	if (!text) return null;
	try { return JSON.parse(text); } catch { return { error: text.slice(0, 300) }; }
};

const doFetch = async (url: URL, method: 'GET' | 'POST', token: unknown, body: unknown, timeoutMs: number): Promise<CloudAgentResponse> => {
	try {
		const res = await fetch(url, {
			method,
			headers: {
				...(typeof token === 'string' && token ? { Authorization: `Bearer ${token}` } : {}),
				'Content-Type': 'application/json',
				'Accept': 'application/json',
			},
			...(method === 'POST' ? { body: JSON.stringify(body ?? {}) } : {}),
			signal: AbortSignal.timeout(timeoutMs),
		});
		const text = await res.text();
		const data = parseBody(text);
		const error = res.ok ? undefined : (data && typeof data.error === 'string' ? data.error : `HTTP ${res.status}`);
		return { ok: res.ok, status: res.status, data, ...(error ? { error } : {}) };
	} catch (e) {
		const message = e instanceof Error ? (e.name === 'TimeoutError' ? 'タイムアウトしました' : e.message) : String(e);
		return { ok: false, status: 0, data: null, error: message };
	}
};


// ---------------------------------------------------------------------------
// ワークスペースのファイル一覧
// ---------------------------------------------------------------------------

const runGit = async (args: string[], cwd: string): Promise<string | null> => {
	try {
		const { stdout } = await execFileAsync('git', args, { cwd, maxBuffer: 256 * 1024 * 1024, windowsHide: true, encoding: 'utf8' });
		return stdout;
	} catch {
		return null;
	}
};

const hasGitSegment = (rel: string) => rel.split('/').some(seg => seg === '.git');

/** git 管理ならコミット済み + 未追跡 (ignore されていないもの) を、そうでなければ null */
const listGitFiles = async (folder: string): Promise<string[] | null> => {
	const inside = await runGit(['rev-parse', '--is-inside-work-tree'], folder);
	if (inside?.trim() !== 'true') return null;
	const out = await runGit(['ls-files', '-co', '--exclude-standard', '-z'], folder);
	if (out === null) return null;
	const seen = new Set<string>();
	const files: string[] = [];
	for (const rel of out.split('\0')) {
		if (!rel || seen.has(rel) || hasGitSegment(rel)) continue;
		seen.add(rel);
		files.push(rel);
	}
	return files;
};

/** git 管理でないときの代わり。重いディレクトリは飛ばし、シンボリックリンクはたどらない */
const walkFiles = async (folder: string): Promise<string[]> => {
	const files: string[] = [];
	const stack: string[] = [''];
	while (stack.length) {
		const relDir = stack.pop()!;
		let entries: fs.Dirent[];
		try {
			entries = await fs.promises.readdir(path.join(folder, relDir), { withFileTypes: true });
		} catch {
			continue;
		}
		for (const entry of entries) {
			const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
			if (entry.isDirectory()) {
				if (!SKIP_DIRS.has(entry.name)) stack.push(rel);
			} else if (entry.isFile()) {
				files.push(rel);
			}
		}
	}
	files.sort();
	return files;
};

const getGitInfo = async (folder: string): Promise<{ gitBranch?: string; gitCommit?: string }> => {
	const [branch, commit] = await Promise.all([
		runGit(['rev-parse', '--abbrev-ref', 'HEAD'], folder),
		runGit(['rev-parse', 'HEAD'], folder),
	]);
	const gitBranch = branch?.trim();
	const gitCommit = commit?.trim();
	return {
		...(gitBranch && gitBranch !== 'HEAD' ? { gitBranch } : {}),
		...(gitCommit && /^[0-9a-f]{7,64}$/i.test(gitCommit) ? { gitCommit } : {}),
	};
};


// ---------------------------------------------------------------------------
// POSIX ustar (+ PAX の path レコード) の最小実装
// ---------------------------------------------------------------------------

const BLOCK = 512;

/** 数値フィールド: 0 埋めの 8 進数 + NUL */
const writeOctal = (buf: Buffer, value: number, offset: number, length: number) => {
	const str = Math.max(0, Math.floor(value)).toString(8).padStart(length - 1, '0');
	buf.write(str.slice(-(length - 1)), offset, length - 1, 'ascii');
	buf[offset + length - 1] = 0;
};

/** 文字列フィールド。UTF-8 で length バイトに収まるところまで (マルチバイト文字の途中では切らない) */
const writeString = (buf: Buffer, value: string, offset: number, length: number) => {
	let bytes = Buffer.from(value, 'utf8');
	if (bytes.length > length) {
		let end = length;
		// 継続バイト (10xxxxxx) の途中なら、文字の先頭まで戻る
		while (end > 0 && (bytes[end] & 0xC0) === 0x80) end--;
		bytes = bytes.subarray(0, end);
	}
	bytes.copy(buf, offset);
};

const makeHeader = (opts: { name: string; size: number; mode: number; mtime: number; type: '0' | 'x' }): Buffer => {
	const h = Buffer.alloc(BLOCK, 0);
	writeString(h, opts.name, 0, 100);
	writeOctal(h, opts.mode, 100, 8);
	writeOctal(h, 0, 108, 8); // uid
	writeOctal(h, 0, 116, 8); // gid
	writeOctal(h, opts.size, 124, 12);
	writeOctal(h, opts.mtime, 136, 12);
	h.fill(0x20, 148, 156); // checksum 計算中は空白で埋める
	h.write(opts.type, 156, 1, 'ascii');
	h.write('ustar\0', 257, 6, 'ascii');
	h.write('00', 263, 2, 'ascii');
	writeString(h, 'orchestra', 265, 32); // uname
	writeString(h, 'orchestra', 297, 32); // gname
	let sum = 0;
	for (let i = 0; i < BLOCK; i++) sum += h[i];
	// 6 桁の 8 進数 + NUL + 空白
	h.write(sum.toString(8).padStart(6, '0').slice(-6), 148, 6, 'ascii');
	h[154] = 0;
	h[155] = 0x20;
	return h;
};

/** PAX レコード "<len> path=<value>\n" (len はレコード全体のバイト数で、len 自身の桁も含む) */
const paxRecord = (key: string, value: string): Buffer => {
	const body = ` ${key}=${value}\n`;
	const bodyLen = Buffer.byteLength(body, 'utf8');
	let len = bodyLen + 1;
	while (String(len).length + bodyLen !== len) len = String(len).length + bodyLen;
	return Buffer.from(`${len}${body}`, 'utf8');
};

const padding = (size: number): Buffer => {
	const rem = size % BLOCK;
	return rem === 0 ? Buffer.alloc(0) : Buffer.alloc(BLOCK - rem, 0);
};

/** 1 ファイル分の tar エントリ (必要なら PAX ヘッダー + ヘッダー + 中身 + 埋め) */
const tarEntry = (rel: string, content: Buffer, mode: number, mtime: number): Buffer[] => {
	const parts: Buffer[] = [];
	if (Buffer.byteLength(rel, 'utf8') > 100) {
		const pax = paxRecord('path', rel);
		parts.push(makeHeader({ name: `PaxHeader/${rel.slice(-80)}`, size: pax.length, mode: 0o644, mtime, type: 'x' }));
		parts.push(pax, padding(pax.length));
	}
	parts.push(makeHeader({ name: rel, size: content.length, mode, mtime, type: '0' }));
	parts.push(content, padding(content.length));
	return parts;
};


// ---------------------------------------------------------------------------
// gzip ストリームに書いて、出てきたバイト列を集める
// ---------------------------------------------------------------------------

class GzipCollector {
	private readonly _gzip = zlib.createGzip({ level: 6 });
	private readonly _chunks: Buffer[] = [];
	private _bytes = 0;
	private _error: Error | null = null;
	private readonly _ended: Promise<void>;

	constructor() {
		this._gzip.on('data', (chunk: Buffer) => { this._chunks.push(chunk); this._bytes += chunk.length; });
		this._ended = new Promise<void>((resolve, reject) => {
			this._gzip.on('end', () => resolve());
			this._gzip.on('error', (e) => { this._error = e; reject(e); });
		});
		// end 前にエラーになっても unhandled rejection にしない
		this._ended.catch(() => { });
	}

	get compressedBytes() { return this._bytes; }

	async write(buf: Buffer): Promise<void> {
		if (this._error) throw this._error;
		if (buf.length === 0) return;
		if (!this._gzip.write(buf)) {
			await new Promise<void>((resolve) => this._gzip.once('drain', () => resolve()));
		}
	}

	async finish(): Promise<Buffer> {
		this._gzip.end();
		await this._ended;
		return Buffer.concat(this._chunks, this._bytes);
	}

	destroy() {
		try { this._gzip.destroy(); } catch { /* noop */ }
	}
}

type Archive = { data: Buffer; info: CloudWorkspaceInfo };

const buildArchive = async (folder: string): Promise<Archive> => {
	const gitFiles = await listGitFiles(folder);
	const files = gitFiles ?? await walkFiles(folder);
	const gitInfo = gitFiles ? await getGitInfo(folder) : {};

	const gz = new GzipCollector();
	let fileCount = 0;
	let bytes = 0;
	let skipped = 0;
	try {
		for (const rel of files) {
			const posixRel = rel.replace(/\\/g, '/').replace(/^\.\//, '');
			if (!posixRel || posixRel.startsWith('/') || posixRel.split('/').includes('..') || hasGitSegment(posixRel)) continue;
			const abs = path.join(folder, ...posixRel.split('/'));
			let stat: fs.Stats;
			try {
				stat = await fs.promises.lstat(abs);
			} catch {
				continue; // git に登録されているがディスクから消えたファイルなど
			}
			if (stat.isSymbolicLink()) { skipped++; continue; }
			if (!stat.isFile()) continue; // サブモジュール (ディレクトリ) など
			if (stat.size > MAX_FILE_BYTES || bytes + stat.size > MAX_TOTAL_RAW_BYTES) { skipped++; continue; }
			let content: Buffer;
			try {
				content = await fs.promises.readFile(abs);
			} catch {
				skipped++;
				continue;
			}
			if (bytes + content.length > MAX_TOTAL_RAW_BYTES) { skipped++; continue; }
			const mode = (stat.mode & 0o111) ? 0o755 : 0o644;
			for (const part of tarEntry(posixRel, content, mode, stat.mtimeMs / 1000)) {
				await gz.write(part);
			}
			fileCount++;
			bytes += content.length;
			if (gz.compressedBytes > MAX_TOTAL_COMPRESSED_BYTES) {
				throw new Error('ワークスペースが大きすぎます (圧縮後 150 MB 超)。不要なファイルを .gitignore に入れてから再度お試しください。');
			}
		}
		await gz.write(Buffer.alloc(BLOCK * 2, 0)); // アーカイブの終わり
		const data = await gz.finish();
		if (data.length > MAX_TOTAL_COMPRESSED_BYTES) {
			throw new Error('ワークスペースが大きすぎます (圧縮後 150 MB 超)。不要なファイルを .gitignore に入れてから再度お試しください。');
		}
		return { data, info: { fileCount, bytes, skipped, ...gitInfo } };
	} catch (e) {
		gz.destroy();
		throw e;
	}
};


// ---------------------------------------------------------------------------
// サービス本体
// ---------------------------------------------------------------------------

const shouldRetry = (res: CloudAgentResponse) => res.status === 0 || res.status === 408 || res.status === 429 || res.status >= 500;

/** 同じフォルダを短い間に何度も送るとき (並列起動) に、tar.gz を作り直さないための保持時間 */
const ARCHIVE_CACHE_MS = 60_000;

export class CloudAgentMainService implements ICloudAgentMainService {
	readonly _serviceBrand: undefined;

	// 並列数 N で起動すると、同じワークスペースのアップロードが N 本同時に来る。
	// 1 回だけまとめて、できた tar.gz を全セッションで使い回す。
	private _archiveCache: { folder: string; at: number; promise: Promise<Archive> } | null = null;

	private _getArchive(folder: string): Promise<Archive> {
		const now = Date.now();
		const cached = this._archiveCache;
		if (cached && cached.folder === folder && now - cached.at < ARCHIVE_CACHE_MS) {
			return cached.promise;
		}
		const promise = buildArchive(folder);
		const entry = { folder, at: now, promise };
		this._archiveCache = entry;
		promise.then(
			// 大きな Buffer を握りっぱなしにしない
			() => setTimeout(() => { if (this._archiveCache === entry) this._archiveCache = null; }, ARCHIVE_CACHE_MS),
			() => { if (this._archiveCache === entry) this._archiveCache = null; },
		);
		return promise;
	}

	async request(params: CloudAgentRequestParams): Promise<CloudAgentResponse> {
		try {
			const url = buildUrl(params?.endpoint, params?.path);
			if (typeof url === 'string') return { ok: false, status: 0, data: null, error: url };
			const method = params.method === 'POST' ? 'POST' : 'GET';
			const timeoutMs = typeof params.timeoutMs === 'number' && params.timeoutMs > 0 ? Math.min(params.timeoutMs, 600_000) : DEFAULT_REQUEST_TIMEOUT_MS;
			return await doFetch(url, method, params.token, params.body, timeoutMs);
		} catch (e) {
			return { ok: false, status: 0, data: null, error: e instanceof Error ? e.message : String(e) };
		}
	}

	async uploadWorkspace(params: CloudAgentUploadParams): Promise<CloudAgentUploadResult> {
		try {
			const sessionId = typeof params?.sessionId === 'string' ? params.sessionId : '';
			if (!/^[A-Za-z0-9_-]{1,128}$/.test(sessionId)) {
				return { ok: false, status: 0, error: 'invalid session id' };
			}
			const folder = typeof params.folderPath === 'string' ? params.folderPath : '';
			let stat: fs.Stats;
			try {
				stat = await fs.promises.stat(folder);
			} catch {
				return { ok: false, status: 0, error: `フォルダが見つかりません: ${folder}` };
			}
			if (!stat.isDirectory()) return { ok: false, status: 0, error: `フォルダではありません: ${folder}` };

			const uploadPath = `${CLOUD_SESSIONS_API_PREFIX}/${sessionId}/upload`;
			const url = buildUrl(params.endpoint, uploadPath);
			if (typeof url === 'string') return { ok: false, status: 0, error: url };

			const { data, info } = await this._getArchive(folder);

			// 空のフォルダなら何も送らない (チャンク 0 個で /start すると空のフォルダで始まる)
			if (info.fileCount === 0) return { ok: true, info };

			const total = Math.max(1, Math.ceil(data.length / UPLOAD_SLICE_BYTES));
			for (let index = 0; index < total; index++) {
				const slice = data.subarray(index * UPLOAD_SLICE_BYTES, Math.min(data.length, (index + 1) * UPLOAD_SLICE_BYTES));
				const body = { index, total, data: slice.toString('base64') };
				let res: CloudAgentResponse = { ok: false, status: 0, data: null, error: 'not sent' };
				for (let attempt = 0; attempt <= UPLOAD_RETRIES; attempt++) {
					if (attempt > 0) await new Promise(r => setTimeout(r, 1500 * attempt));
					res = await doFetch(url, 'POST', params.token, body, UPLOAD_TIMEOUT_MS);
					if (res.ok || !shouldRetry(res)) break;
				}
				if (!res.ok) {
					return { ok: false, status: res.status, error: `アップロードに失敗しました (${index + 1}/${total}): ${res.error ?? `HTTP ${res.status}`}` };
				}
			}
			return { ok: true, info };
		} catch (e) {
			return { ok: false, status: 0, error: e instanceof Error ? e.message : String(e) };
		}
	}
}
