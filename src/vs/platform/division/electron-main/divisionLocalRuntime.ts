/*---------------------------------------------------------------------------------------------
 *  Local Execution Layer for Division API.
 *
 *  Division API is the "brain" (task decomposition, model routing) and stays wherever it runs
 *  (the cloud by default; override with DIVISION_API_BASE_URL for a local dev instance). It no
 *  longer needs to run *on this machine* to read/write files or run commands: this module
 *  connects out to it, long-polling for tool calls it has queued for the
 *  workspace's active Division project (see `.division/projects.json`, written by
 *  divisionProjectService.ts), executes them locally against this machine's filesystem/shell —
 *  confined to the open workspace — and posts the result back. Tool names/args mirror
 *  Division's own NATIVE_TOOLS (division repo: src/services/agent-tools.ts) so the two stay a
 *  drop-in match: read_file, write_file, edit_file, execute_command, search_files,
 *  list_directory.
 *--------------------------------------------------------------------------------------------*/

import { exec, execFile } from 'child_process';
import { existsSync, promises as fsp } from 'fs';
import { dirname, join, resolve as resolvePath } from '../../../base/common/path.js';

// Division API base URL. Defaults to the hosted service; set DIVISION_API_BASE_URL to point at
// a local dev instance instead.
const DIVISION_API_BASE_URL = process.env['DIVISION_API_BASE_URL'] || 'https://api.division.he-ro.jp';

// Duplicated from workbench/contrib/void/browser/divisionProjectService.ts: platform code must
// not depend on workbench code. These are the public Supabase anon-key values already exposed
// there — real access control is enforced by Supabase RLS / the RPC itself, not by keeping this
// value secret.
const DIVISION_SUPABASE_URL = 'https://wmhrbhcnxglvqwvnbxlt.supabase.co';
const DIVISION_SUPABASE_ANON_KEY =
	'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtaHJiaGNueGdsdnF3dm5ieGx0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3OTg1MDAsImV4cCI6MjA5MTM3NDUwMH0.4qjCIOjFwm4XnmtqZN_N0zcZlhjGc2GQ4-x7ygMa3hM';

interface ToolCallRequest {
	id: string;
	tool: string;
	args: Record<string, unknown>;
}

// --- Permission layer: same destructive-command denylist Division itself enforces server-side
// (division repo: src/services/agent-tools.ts), applied again here since this is the layer that
// actually touches the user's machine. ---
const BLOCKED_COMMANDS: RegExp[] = [
	/\brm\s+-rf\s+\/(?!\S)/,
	/\bmkfs\b/,
	/\bdd\s+if=/,
	/>\s*\/dev\/sd/,
	/\bshutdown\b/,
	/\breboot\b/,
	/\bsudo\b/,
];

function isCommandSafe(cmd: string): boolean {
	return !BLOCKED_COMMANDS.some(re => re.test(cmd));
}

/** Resolves `relativePath` against `root`, refusing to leave the workspace. */
function resolveWithinWorkspace(root: string, relativePath: string): string | undefined {
	const resolved = resolvePath(root, relativePath || '.');
	if (resolved === root || resolved.startsWith(root + '/')) {
		return resolved;
	}
	return undefined;
}

async function toolReadFile(root: string, args: Record<string, unknown>): Promise<string> {
	const relPath = String(args.path ?? '');
	const filePath = resolveWithinWorkspace(root, relPath);
	if (!filePath) return 'Error: Path is outside workspace';
	if (!existsSync(filePath)) return `Error: File not found: ${relPath}`;

	const stat = await fsp.stat(filePath);
	if (stat.isDirectory()) return `Error: ${relPath} is a directory. Use list_directory.`;

	const raw = await fsp.readFile(filePath, 'utf-8');
	const lines = raw.split('\n');
	const start = Math.max(1, Number(args.startLine) || 1);
	const end = Math.min(lines.length, Number(args.endLine) || lines.length);
	const selected = lines.slice(start - 1, end);
	const numbered = selected.map((line, i) => `${String(start + i).padStart(5)}| ${line}`).join('\n');
	const header = `File: ${relPath} (${lines.length} lines total, showing ${start}-${end})\n`;

	const maxReadChars = 900_000;
	if (numbered.length > maxReadChars) {
		return header + numbered.slice(0, maxReadChars) + '\n...[truncated]';
	}
	return header + numbered;
}

async function toolWriteFile(root: string, args: Record<string, unknown>): Promise<string> {
	const relPath = String(args.path ?? '');
	const filePath = resolveWithinWorkspace(root, relPath);
	if (!filePath) return 'Error: Path is outside workspace';

	await fsp.mkdir(dirname(filePath), { recursive: true });
	const content = String(args.content ?? '');
	await fsp.writeFile(filePath, content, 'utf-8');
	return `Successfully wrote ${content.split('\n').length} lines to ${relPath}`;
}

async function toolEditFile(root: string, args: Record<string, unknown>): Promise<string> {
	const relPath = String(args.path ?? '');
	const filePath = resolveWithinWorkspace(root, relPath);
	if (!filePath) return 'Error: Path is outside workspace';
	if (!existsSync(filePath)) return `Error: File not found: ${relPath}`;

	const content = await fsp.readFile(filePath, 'utf-8');
	const oldStr = String(args.old_string ?? '');
	const newStr = String(args.new_string ?? '');
	if (oldStr === newStr) return 'Error: old_string and new_string are identical';

	const occurrences = content.split(oldStr).length - 1;
	if (occurrences === 0) return `Error: old_string not found in ${relPath}. Make sure it matches exactly (including whitespace and indentation).`;
	if (occurrences > 1) return `Error: old_string found ${occurrences} times in ${relPath}. It must be unique. Include more surrounding context.`;

	const updated = content.replace(oldStr, newStr);
	await fsp.writeFile(filePath, updated, 'utf-8');
	return `Successfully edited ${relPath}: replaced ${oldStr.split('\n').length} lines with ${newStr.split('\n').length} lines`;
}

function toolExecuteCommand(root: string, args: Record<string, unknown>): Promise<string> {
	const cmd = String(args.command ?? '');
	if (!cmd) return Promise.resolve('Error: command is required');
	if (!isCommandSafe(cmd)) return Promise.resolve('Error: Command blocked for safety reasons');

	const timeoutMs = Math.min(Number(args.timeout) || 30000, 120000);
	return new Promise<string>(resolveResult => {
		exec(cmd, { cwd: root, timeout: timeoutMs, maxBuffer: 1024 * 1024 * 5, env: { ...process.env, FORCE_COLOR: '0' } }, (err, stdout, stderr) => {
			if (err) {
				const e = err as NodeJS.ErrnoException & { killed?: boolean; code?: number };
				if (e.killed) { resolveResult(`Error: Command timed out after ${timeoutMs}ms`); return; }
				let output = `Command failed (exit code: ${e.code ?? 'unknown'})`;
				if (stdout) output += '\n[stdout]\n' + stdout.slice(0, 20000);
				if (stderr) output += '\n[stderr]\n' + stderr.slice(0, 20000);
				resolveResult(output);
				return;
			}
			let output = '';
			if (stdout) output += stdout;
			if (stderr) output += (output ? '\n[stderr]\n' : '[stderr]\n') + stderr;
			if (!output) output = '(no output)';
			const maxCmdOut = 400_000;
			resolveResult(output.length > maxCmdOut ? output.slice(0, maxCmdOut) + '\n...[truncated]' : output);
		});
	});
}

function toolSearchFiles(root: string, args: Record<string, unknown>): Promise<string> {
	const query = String(args.query ?? '');
	if (!query) return Promise.resolve('Error: query is required');
	const dir = resolveWithinWorkspace(root, args.directory ? String(args.directory) : '.');
	if (!dir) return Promise.resolve('Error: Path is outside workspace');

	const grepArgs = ['-RnI', '--color=never'];
	if (args.include) grepArgs.push(`--include=${String(args.include)}`);
	grepArgs.push(query, dir);

	return new Promise<string>(resolveResult => {
		execFile('grep', grepArgs, { timeout: 60000, maxBuffer: 12 * 1024 * 1024 }, (err, stdout) => {
			if (err) {
				const e = err as NodeJS.ErrnoException & { code?: number };
				if (e.code === 1) { resolveResult('No matches found.'); return; } // grep: no matches
				resolveResult(`Error: ${e.message}`);
				return;
			}
			const lines = stdout.split('\n').filter(Boolean);
			if (lines.length === 0) { resolveResult('No matches found.'); return; }
			const maxGrepLines = 1000;
			if (lines.length > maxGrepLines) {
				resolveResult(lines.slice(0, maxGrepLines).join('\n') + `\n...[${lines.length - maxGrepLines} more matches. Narrow query or directory.]`);
				return;
			}
			resolveResult(lines.join('\n'));
		});
	});
}

async function toolListDirectory(root: string, args: Record<string, unknown>): Promise<string> {
	const relPath = String(args.path ?? '.');
	const dirPath = resolveWithinWorkspace(root, relPath);
	if (!dirPath) return 'Error: Path is outside workspace';
	if (!existsSync(dirPath)) return `Error: Directory not found: ${relPath}`;

	const stat = await fsp.stat(dirPath);
	if (!stat.isDirectory()) return `Error: ${relPath} is not a directory. Use read_file.`;

	const entries = await fsp.readdir(dirPath, { withFileTypes: true });
	const formatted = entries.map(e => `${e.isDirectory() ? '📁' : '📄'} ${e.name}${e.isDirectory() ? '/' : ''}`);
	return `Directory: ${relPath} (${entries.length} items)\n${formatted.join('\n')}`;
}

async function runTool(root: string, tool: string, args: Record<string, unknown>): Promise<string> {
	try {
		switch (tool) {
			case 'read_file': return await toolReadFile(root, args);
			case 'write_file': return await toolWriteFile(root, args);
			case 'edit_file': return await toolEditFile(root, args);
			case 'execute_command': return await toolExecuteCommand(root, args);
			case 'search_files': return await toolSearchFiles(root, args);
			case 'list_directory': return await toolListDirectory(root, args);
			default: return `Error: Tool "${tool}" not found. Available: read_file, write_file, edit_file, execute_command, search_files, list_directory`;
		}
	} catch (err) {
		return `Error: ${err instanceof Error ? err.message : String(err)}`;
	}
}

// --- Connection to Division API ---

async function resolveActiveProjectId(workspaceRoot: string): Promise<string | undefined> {
	try {
		const projectsPath = join(workspaceRoot, '.division', 'projects.json');
		if (!existsSync(projectsPath)) return undefined;
		const raw = await fsp.readFile(projectsPath, 'utf-8');
		const parsed = JSON.parse(raw) as { activeProjectIds?: string[] };
		return parsed.activeProjectIds?.[0] || undefined;
	} catch {
		return undefined;
	}
}

async function fetchApiKeyForProject(projectId: string): Promise<string | undefined> {
	try {
		const res = await fetch(`${DIVISION_SUPABASE_URL}/rest/v1/rpc/get_api_key_for_project`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'apikey': DIVISION_SUPABASE_ANON_KEY,
				'Authorization': `Bearer ${DIVISION_SUPABASE_ANON_KEY}`,
			},
			body: JSON.stringify({ p_project_id: projectId }),
		});
		if (!res.ok) return undefined;
		const key = await res.json();
		return typeof key === 'string' && key ? key : undefined;
	} catch (err) {
		console.warn('[division-local-runtime] failed to fetch API key:', err);
		return undefined;
	}
}

function delay(ms: number): Promise<void> {
	return new Promise(resolveResult => setTimeout(resolveResult, ms));
}

let generation = 0;

async function handleCall(workspaceRoot: string, projectId: string, apiKey: string | undefined, call: ToolCallRequest): Promise<void> {
	let result: string | undefined;
	let error: string | undefined;
	try {
		result = await runTool(workspaceRoot, call.tool, call.args);
	} catch (err) {
		error = err instanceof Error ? err.message : String(err);
	}

	try {
		const headers: Record<string, string> = { 'Content-Type': 'application/json' };
		if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
		await fetch(`${DIVISION_API_BASE_URL}/api/local-agent/${encodeURIComponent(projectId)}/result`, {
			method: 'POST',
			headers,
			body: JSON.stringify({ id: call.id, result, error }),
		});
	} catch (err) {
		console.error('[division-local-runtime] failed to post tool result:', err);
	}
}

async function pollLoop(myGeneration: number, workspaceRoot: string, projectId: string, apiKey: string | undefined): Promise<void> {
	let backoffMs = 1000;
	while (generation === myGeneration) {
		try {
			const headers: Record<string, string> = {};
			if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
			const res = await fetch(`${DIVISION_API_BASE_URL}/api/local-agent/${encodeURIComponent(projectId)}/poll?waitMs=25000`, { headers });
			if (!res.ok) {
				console.warn(`[division-local-runtime] poll failed with status ${res.status}`);
				await delay(backoffMs);
				backoffMs = Math.min(backoffMs * 2, 30000);
				continue;
			}
			backoffMs = 1000;
			const body = await res.json() as { calls?: ToolCallRequest[] };
			for (const call of body.calls ?? []) {
				if (generation !== myGeneration) break;
				handleCall(workspaceRoot, projectId, apiKey, call).catch(err => {
					console.error('[division-local-runtime] tool call handling failed:', err);
				});
			}
		} catch (err) {
			console.warn('[division-local-runtime] poll error:', err);
			await delay(backoffMs);
			backoffMs = Math.min(backoffMs * 2, 30000);
		}
	}
}

/**
 * Fire-and-forget: connects to Division API and starts serving tool calls for the workspace's
 * active Division project, if one is configured (`.division/projects.json`). No-ops when there
 * is no open workspace or no Division project is set up for it — Division then falls back to
 * whatever it can do server-side (see the division repo's src/services/agent-tools.ts).
 */
export async function startDivisionLocalRuntime(workspaceRoot: string | undefined): Promise<void> {
	const myGeneration = ++generation;

	if (!workspaceRoot) {
		console.log('[division-local-runtime] no workspace open, skipping');
		return;
	}
	const projectId = await resolveActiveProjectId(workspaceRoot);
	if (!projectId) {
		console.log('[division-local-runtime] no Division project configured for this workspace (.division/projects.json), skipping');
		return;
	}
	if (generation !== myGeneration) return; // superseded while we were resolving the project

	const apiKey = await fetchApiKeyForProject(projectId);
	if (generation !== myGeneration) return;

	console.log(`[division-local-runtime] connected to ${DIVISION_API_BASE_URL} for project ${projectId}`);
	pollLoop(myGeneration, workspaceRoot, projectId, apiKey);
}

export function stopDivisionLocalRuntime(): void {
	generation++;
}
