/*--------------------------------------------------------------------------------------
 *  Persistent app-production artifacts for Orchestra / Division.
 *  paper.md, specification.md and design/*.html are project assets, not disposable
 *  output from an individual orchestration round.
 *--------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'node:crypto';
import { extractSearchReplaceBlocks } from '../../common/helpers/extractCodeFromResult.js';
import { DESIGN_DIR, splitDesignPages } from '../../common/designPages.js';

const PERSISTENT_MARKDOWN = new Set(['paper.md', 'specification.md']);

/** Use only known artifact paths, never a path supplied by an AI response. */
export function isPersistentMarkdownFile(filename: string): boolean {
	return PERSISTENT_MARKDOWN.has(filename);
}

export function readArtifact(workspaceRoot: string, name: 'paper.md' | 'specification.md', limit = 48_000): string {
	try {
		const content = fs.readFileSync(path.join(workspaceRoot, '.division', name), 'utf-8');
		if (content.length <= limit) return content;
		const head = Math.min(8_000, Math.floor(limit / 3));
		return content.slice(0, head) + '\n\n[…中間の古い履歴は省略。原本は保存されています…]\n\n' + content.slice(-(limit - head));
	} catch {
		return '';
	}
}

/**
 * Back up the previous version before every change. History lives outside design/
 * so the visual editor never treats a backup as a live design page.
 */
function backupExisting(divisionRoot: string, target: string): void {
	if (!fs.existsSync(target)) return;
	const rel = path.relative(divisionRoot, target);
	if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Artifact path escaped .division');
	const historyDir = path.join(divisionRoot, '.history', rel);
	fs.mkdirSync(historyDir, { recursive: true });
	const filename = new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID() + '.bak';
	fs.copyFileSync(target, path.join(historyDir, filename), fs.constants.COPYFILE_EXCL);
}

/** Atomic UTF-8 write plus lossless snapshot. Empty content can never erase a file. */
export function writeArtifactWithHistory(divisionRoot: string, filename: string, content: string): string {
	if (!content.trim()) throw new Error('Refusing to replace an artifact with empty content');
	const target = path.join(divisionRoot, filename);
	const rel = path.relative(divisionRoot, target);
	if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Artifact path escaped .division');
	fs.mkdirSync(path.dirname(target), { recursive: true });
	const old = fs.existsSync(target) ? fs.readFileSync(target, 'utf-8') : null;
	if (old === content) return target;
	if (old !== null) backupExisting(divisionRoot, target);
	const temp = target + '.orchestra-' + randomUUID() + '.tmp';
	try {
		fs.writeFileSync(temp, content, { encoding: 'utf-8', flag: 'wx' });
		fs.renameSync(temp, target);
	} finally {
		if (fs.existsSync(temp)) fs.unlinkSync(temp);
	}
	return target;
}

/**
 * Existing Markdown is updated only by exact SEARCH/REPLACE, or by adding a dated
 * amendment. A failed patch is rejected rather than destroying existing sections.
 * First creation accepts a full Markdown document.
 */
export function savePersistentMarkdown(divisionRoot: string, filename: string, output: string): string {
	if (!isPersistentMarkdownFile(filename)) throw new Error('Unexpected persistent Markdown name');
	const trimmed = output.trim();
	if (!trimmed) throw new Error('Empty artifact update');
	const target = path.join(divisionRoot, filename);
	const existing = fs.existsSync(target) ? fs.readFileSync(target, 'utf-8') : '';
	if (!existing.trim()) {
		if (extractSearchReplaceBlocks(trimmed).length) throw new Error('Cannot patch a document before its initial creation');
		return writeArtifactWithHistory(divisionRoot, filename, trimmed + '\n');
	}
	if (existing.trim() === trimmed) return target;

	const patches = extractSearchReplaceBlocks(trimmed);
	if (patches.length) {
		if (patches.some(p => p.state !== 'done' || !p.orig.trim())) throw new Error('Incomplete artifact patch');
		let next = existing;
		for (const patch of patches) {
			const first = next.indexOf(patch.orig);
			if (first < 0 || next.indexOf(patch.orig, first + 1) >= 0) {
				throw new Error('Artifact patch did not uniquely match the current document');
			}
			next = next.slice(0, first) + patch.final + next.slice(first + patch.orig.length);
		}
		return next === existing ? target : writeArtifactWithHistory(divisionRoot, filename, next);
	}
	// Models may still return Markdown rather than a structured diff. In that case
	// keep the original intact and append an amendment; never silently replace it.
	const stamp = new Date().toISOString();
	const amended = existing.trimEnd() + '\n\n---\n\n## 更新 ' + stamp + '\n\n' + trimmed + '\n';
	return writeArtifactWithHistory(divisionRoot, filename, amended);
}

/** Update only the pages emitted in this round. Untouched pages are never deleted. */
export function savePersistentDesignPages(divisionRoot: string, output: string): string[] {
	const pages = splitDesignPages(output);
	const written: string[] = [];
	for (const page of pages) {
		if (!/<(?:!doctype\s+html|html|body)\b/i.test(page.html)) continue;
		written.push(writeArtifactWithHistory(divisionRoot, path.join(DESIGN_DIR, page.name), page.html));
	}
	return written;
}
