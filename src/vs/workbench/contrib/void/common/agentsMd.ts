/*--------------------------------------------------------------------------------------
 *  Copyright 2026 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

/**
 * AGENTS.md project instructions (the convention used by OpenAI Codex and other coding agents).
 *
 * - In each workspace folder, AGENTS.override.md wins over AGENTS.md (a local, usually untracked
 *   override); only one of the two is used per folder.
 * - All AGENTS.md text together is capped at AGENTS_MD_MAX_BYTES (32 KiB, Codex's default).
 * - Files in subdirectories are not inlined; the agent is told to look for them when it works there.
 */

export const AGENTS_MD_FILENAMES = ['AGENTS.override.md', 'AGENTS.md'] as const
export const AGENTS_MD_MAX_BYTES = 32 * 1024

export type ProjectInstructionDoc = {
	/** Workspace folder name (shown when there is more than one folder). */
	folderName: string
	/** File name inside the folder, e.g. "AGENTS.md". */
	fileName: string
	text: string
	truncated: boolean
}

/** Cut text to at most maxBytes of UTF-8 without splitting a character. */
export const truncateUtf8 = (text: string, maxBytes: number): { text: string, truncated: boolean } => {
	const bytes = new TextEncoder().encode(text)
	if (bytes.length <= maxBytes) return { text, truncated: false }
	let end = Math.max(0, maxBytes)
	// Step back over continuation bytes (10xxxxxx) so the cut lands on a character boundary.
	while (end > 0 && (bytes[end] & 0xc0) === 0x80) end--
	return { text: new TextDecoder().decode(bytes.subarray(0, end)), truncated: true }
}

/**
 * Apply the shared byte budget to the docs (in workspace-folder order) and drop empty ones.
 * `candidates` holds, per folder, the first existing file of AGENTS_MD_FILENAMES.
 */
export const budgetProjectInstructionDocs = (candidates: { folderName: string, fileName: string, text: string }[], maxBytes = AGENTS_MD_MAX_BYTES): ProjectInstructionDoc[] => {
	const docs: ProjectInstructionDoc[] = []
	let remaining = maxBytes
	for (const c of candidates) {
		const trimmed = c.text.trim()
		if (!trimmed) continue
		if (remaining <= 0) break
		const { text, truncated } = truncateUtf8(trimmed, remaining)
		remaining -= new TextEncoder().encode(text).length
		docs.push({ folderName: c.folderName, fileName: c.fileName, text, truncated })
	}
	return docs
}

/** System-message section for the docs ('' when there are none). */
export const formatProjectInstructionDocs = (docs: ProjectInstructionDoc[], opts: { multipleFolders: boolean }): string => {
	if (docs.length === 0) return ''
	const parts = [
		`PROJECT INSTRUCTIONS (AGENTS.md):`,
		`The repository contains AGENTS.md files: instructions from its maintainers for coding agents.`,
		`- An AGENTS.md applies to the whole directory tree rooted at the folder that contains it.`,
		`- For every file you change, follow every AGENTS.md whose scope includes that file. A more deeply nested AGENTS.md wins over a shallower one when they conflict; before editing files in a subdirectory, check it and its parents for an AGENTS.md.`,
		`- Direct instructions from the user in this conversation win over AGENTS.md.`,
		`- If an AGENTS.md lists checks to run (tests, lint, type-check), run them after your changes when you can.`,
	]
	for (const d of docs) {
		parts.push('', `--- ${opts.multipleFolders ? `${d.folderName}/` : ''}${d.fileName} ---`, d.text)
		if (d.truncated) parts.push(`(...cut off at ${AGENTS_MD_MAX_BYTES} bytes; read the file for the rest.)`)
	}
	return parts.join('\n')
}
