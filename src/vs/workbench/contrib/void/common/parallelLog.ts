/*--------------------------------------------------------------------------------------
 *  Copyright 2026 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// The chat log of a workflow's parallel node: its branches run at the same time, so their output
// cannot be one stream of text. While they run, the chat message holds one fenced block
//
//   ```division-parallel
//   {"v":1,"lanes":[{ "key", "step", "role", "title", "status", "startedAt", "endedAt", "text" }]}
//   ```
//
// and the block is re-rendered as each branch writes. The chat (IDE) and the phone draw it as
// lanes (one per branch, with its status and elapsed time); anything else shows it as a code block.
// The JSON is on one line, so a branch's own ``` fences can never close the block.
// Orchestra Mobile keeps the same format in src/lib/parallelLog.ts.

export const PARALLEL_LOG_LANG = 'division-parallel';

export type ParallelLaneStatus = 'waiting' | 'running' | 'done' | 'error' | 'stopped';

export type ParallelLane = {
	/** The task's index in the plan. */
	key: number;
	/** The step number shown in the chat. */
	step: number;
	role: string;
	title: string;
	status: ParallelLaneStatus;
	/** ms since epoch */
	startedAt?: number;
	endedAt?: number;
	/** The branch's own log (Markdown). */
	text: string;
};

export type ParallelLog = { v: 1; lanes: ParallelLane[] };

const STATUSES: readonly ParallelLaneStatus[] = ['waiting', 'running', 'done', 'error', 'stopped'];

export const encodeParallelLog = (log: ParallelLog): string =>
	`\n\n\`\`\`${PARALLEL_LOG_LANG}\n${JSON.stringify(log)}\n\`\`\`\n\n`;

/** The block's body back to lanes; null when it is not one (or not finished being written). */
export const decodeParallelLog = (body: string): ParallelLog | null => {
	let data: unknown;
	try { data = JSON.parse(body.trim()); } catch { return null; }
	if (!data || typeof data !== 'object' || !Array.isArray((data as { lanes?: unknown }).lanes)) { return null; }
	const lanes: ParallelLane[] = [];
	for (const l of (data as { lanes: unknown[] }).lanes) {
		if (!l || typeof l !== 'object') { continue; }
		const o = l as Record<string, unknown>;
		const num = (v: unknown) => typeof v === 'number' && isFinite(v) ? v : undefined;
		lanes.push({
			key: num(o.key) ?? lanes.length,
			step: num(o.step) ?? 0,
			role: typeof o.role === 'string' ? o.role : '',
			title: typeof o.title === 'string' ? o.title : '',
			status: STATUSES.includes(o.status as ParallelLaneStatus) ? o.status as ParallelLaneStatus : 'waiting',
			startedAt: num(o.startedAt),
			endedAt: num(o.endedAt),
			text: typeof o.text === 'string' ? o.text : '',
		});
	}
	return lanes.length ? { v: 1, lanes } : null;
};

export const isParallelLaneActive = (s: ParallelLaneStatus): boolean => s === 'waiting' || s === 'running';

export const parallelLogCounts = (log: ParallelLog) => ({
	total: log.lanes.length,
	done: log.lanes.filter(l => l.status === 'done').length,
	error: log.lanes.filter(l => l.status === 'error').length,
	active: log.lanes.filter(l => isParallelLaneActive(l.status)).length,
});

/** "8s", "1m 05s", "1h 02m" */
export const formatLaneElapsed = (ms: number): string => {
	const s = Math.max(0, Math.floor(ms / 1000));
	if (s < 60) { return `${s}s`; }
	const m = Math.floor(s / 60);
	if (m < 60) { return `${m}m ${String(s % 60).padStart(2, '0')}s`; }
	return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
};

/** How long a lane has run (until now while it runs); undefined before it starts. */
export const laneElapsedMs = (lane: ParallelLane, now: number): number | undefined =>
	lane.startedAt === undefined ? undefined : (lane.endedAt ?? (isParallelLaneActive(lane.status) ? now : lane.startedAt)) - lane.startedAt;

/** The last non-empty line of a lane's log, as plain text (for a one-line preview). */
export const laneLastLine = (lane: ParallelLane, max = 80): string => {
	const lines = lane.text.split('\n').map(s => s.replace(/[#>*_`|]/g, '').trim()).filter(Boolean);
	const last = lines[lines.length - 1] || '';
	return last.length > max ? `${last.slice(0, max - 1)}…` : last;
};

/** The parallel group being run: the orchestrator writes into it, and renders it into the chat message. */
export class ParallelLogBuilder {
	private readonly lanes: ParallelLane[];

	constructor(lanes: Array<{ key: number; step: number; role: string; title: string }>) {
		this.lanes = lanes.map(l => ({ ...l, status: 'waiting' as ParallelLaneStatus, text: '' }));
	}

	get keys(): number[] { return this.lanes.map(l => l.key); }
	get firstKey(): number | undefined { return this.lanes[0]?.key; }
	has(key: number): boolean { return this.lanes.some(l => l.key === key); }
	private lane(key: number) { return this.lanes.find(l => l.key === key); }

	start(key: number, now: number): void {
		const l = this.lane(key);
		if (!l) { return; }
		l.status = 'running';
		l.startedAt ??= now;
		l.endedAt = undefined;
	}

	append(key: number, text: string): void {
		const l = this.lane(key);
		if (l) { l.text += text; }
	}

	finish(key: number, status: 'done' | 'error', now: number): void {
		const l = this.lane(key);
		if (!l) { return; }
		l.status = status;
		l.startedAt ??= now;
		l.endedAt = now;
	}

	/** The run stopped here (paused for approval, cancelled): branches still going are shown as stopped. */
	seal(now: number): void {
		for (const l of this.lanes) {
			if (isParallelLaneActive(l.status)) {
				l.status = 'stopped';
				if (l.startedAt !== undefined) { l.endedAt = now; }
			}
		}
	}

	snapshot(): ParallelLog { return { v: 1, lanes: this.lanes.map(l => ({ ...l })) }; }

	render(): string { return encodeParallelLog({ v: 1, lanes: this.lanes }); }
}

const PARALLEL_BLOCK_RE = new RegExp('```' + PARALLEL_LOG_LANG + '\\n([^\\n]*)\\n```', 'g');

/** Keep only the latest part of each lane's log, so the block stays small enough to send to the phone. */
export const compactParallelLogs = (text: string, laneMax = 1_200): string =>
	text.replace(PARALLEL_BLOCK_RE, (whole, body: string) => {
		const log = decodeParallelLog(body);
		if (!log) { return whole; }
		for (const lane of log.lanes) {
			lane.text = markdownTail(lane.text, laneMax);
		}
		return encodeParallelLog(log).trim();
	});

/** The end of a piece of Markdown, at most `max` characters; reopens a code fence the cut fell inside. */
const markdownTail = (text: string, max: number): string => {
	if (text.length <= max) { return text; }
	let tail = text.slice(-max);
	const nl = tail.indexOf('\n');
	if (nl >= 0 && nl < 200) { tail = tail.slice(nl + 1); }
	const fences = (tail.match(/^\s*```/gm) || []).length;
	return `…\n\n${fences % 2 === 1 ? '```\n' : ''}${tail}`;
};

/**
 * A chat message cut down for the phone (remote control) to `max` characters of text.
 * Without a parallel block it keeps the beginning, as before. With one, the parallel blocks are kept whole
 * (each lane cut to its latest part) and the text keeps its latest part, so the block is never cut in the middle.
 */
export const truncateChatTextForRemote = (text: string, max: number): string => {
	if (!text.includes('```' + PARALLEL_LOG_LANG)) {
		return text.length > max ? `${text.slice(0, max)}…` : text;
	}
	const compacted = compactParallelLogs(text);
	const parts: Array<{ block: boolean; text: string }> = [];
	let at = 0;
	for (const m of compacted.matchAll(PARALLEL_BLOCK_RE)) {
		parts.push({ block: false, text: compacted.slice(at, m.index) });
		parts.push({ block: true, text: m[0] });
		at = m.index! + m[0].length;
	}
	parts.push({ block: false, text: compacted.slice(at) });

	let budget = max;
	const out: string[] = [];
	for (let i = parts.length - 1; i >= 0; i--) {
		const p = parts[i];
		if (p.block) { out.unshift(p.text); continue; }
		if (budget <= 0) { if (p.text.trim()) { out.unshift('…\n\n'); budget = -1; } continue; }
		if (p.text.length <= budget) { out.unshift(p.text); budget -= p.text.length; continue; }
		out.unshift(markdownTail(p.text, budget));
		budget = -1;
	}
	// Separate runs of "…" placeholders collapse into one.
	return out.join('').replace(/(…\n\n){2,}/g, '…\n\n');
};
