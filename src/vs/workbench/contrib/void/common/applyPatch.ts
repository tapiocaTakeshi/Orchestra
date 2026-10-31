/*--------------------------------------------------------------------------------------
 *  Copyright 2026 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

/**
 * apply_patch: multi-file edits in OpenAI Codex's patch format (a port of codex-rs/apply-patch).
 * The same module lives in Division (src/services/cloud-agent/apply-patch.ts); keep them in sync.
 * Pure logic: parsing, matching and computing new file contents. The callers do the file I/O.
 *
 *   *** Begin Patch
 *   *** Add File: path/new.ts          every following line starts with "+"
 *   +export const a = 1
 *   *** Update File: path/old.ts
 *   *** Move to: path/renamed.ts       optional
 *   @@ class Foo                       optional: a line to find first (narrows where the next lines are)
 *    context line                      " " = unchanged, "-" = removed, "+" = added
 *   -old line
 *   +new line
 *   *** End of File                    optional: the chunk is at the end of the file
 *   *** Delete File: path/gone.ts
 *   *** End Patch
 *
 * Lines are matched exactly first, then ignoring trailing whitespace, then ignoring surrounding
 * whitespace, then with typographic punctuation normalised (Codex's seek_sequence).
 */

export const BEGIN_PATCH_MARKER = '*** Begin Patch'
export const END_PATCH_MARKER = '*** End Patch'
const ADD_FILE_MARKER = '*** Add File: '
const DELETE_FILE_MARKER = '*** Delete File: '
const UPDATE_FILE_MARKER = '*** Update File: '
const MOVE_TO_MARKER = '*** Move to: '
const EOF_MARKER = '*** End of File'
const CHANGE_CONTEXT_MARKER = '@@ '
const EMPTY_CHANGE_CONTEXT_MARKER = '@@'

export class PatchError extends Error { }

export type PatchChunk = {
	/** "@@ <line>": a line to find before the chunk's lines. */
	changeContext: string | null
	oldLines: string[]
	newLines: string[]
	/** [index in oldLines, index in newLines] of each context (" ") line. */
	contextLineIndices: [number, number][]
	isEndOfFile: boolean
}

export type PatchHunk =
	| { type: 'add', path: string, contents: string }
	| { type: 'delete', path: string }
	| { type: 'update', path: string, movePath: string | null, chunks: PatchChunk[] }

const newChunk = (changeContext: string | null = null): PatchChunk => ({ changeContext, oldLines: [], newLines: [], contextLineIndices: [], isEndOfFile: false })
const isEmptyChunk = (c: PatchChunk) => c.oldLines.length === 0 && c.newLines.length === 0

/** Strip a heredoc wrapper (<<'EOF' ... EOF) and surrounding code fences the model may add. */
const unwrapPatch = (text: string): string[] => {
	let lines = text.trim().split('\n').map(l => l.endsWith('\r') ? l.slice(0, -1) : l)
	if (lines.length >= 2 && /^```/.test(lines[0].trim()) && lines[lines.length - 1].trim() === '```') { lines = lines.slice(1, -1) }
	if (lines.length >= 4 && ['<<EOF', `<<'EOF'`, '<<"EOF"'].includes(lines[0].trim()) && lines[lines.length - 1].trim().endsWith('EOF')) { lines = lines.slice(1, -1) }
	if (lines[0]?.trim() === 'apply_patch' && lines[1]?.trim() === BEGIN_PATCH_MARKER) { lines = lines.slice(1) }
	return lines
}

/** Parse a patch. Throws PatchError with a message meant for the model. */
export const parsePatch = (text: string): PatchHunk[] => {
	const lines = unwrapPatch(text)
	if (lines[0]?.trim() !== BEGIN_PATCH_MARKER) { throw new PatchError(`The first line of the patch must be '${BEGIN_PATCH_MARKER}'`) }

	const hunks: PatchHunk[] = []
	// An object so TypeScript does not narrow it (the header() closure changes it).
	const st: { mode: 'started' | 'add' | 'delete' | 'update' | 'ended' } = { mode: 'started' }
	let updateHeaderLine = 0
	const fail = (lineNo: number, message: string): never => { throw new PatchError(`Invalid patch at line ${lineNo}: ${message}`) }
	const headerHelp = `Valid hunk headers: '*** Add File: {path}', '*** Delete File: {path}', '*** Update File: {path}'`

	const ensureUpdateNotEmpty = (lineNo: number, line: string) => {
		const last = hunks[hunks.length - 1]
		if (st.mode !== 'update' || last?.type !== 'update') { return }
		if (last.chunks.length === 0) { fail(updateHeaderLine, `Update file hunk for path '${last.path}' is empty`) }
		if (isEmptyChunk(last.chunks[last.chunks.length - 1])) {
			fail(lineNo, line === END_PATCH_MARKER ? 'Update hunk does not contain any lines' : `Unexpected line '${line}'. Every line should start with ' ' (context line), '+' (added line), or '-' (removed line)`)
		}
	}

	/** A file header or the end marker; true when the line was one. */
	const header = (lineNo: number, trimmed: string): boolean => {
		if (trimmed === END_PATCH_MARKER) { ensureUpdateNotEmpty(lineNo, trimmed); st.mode = 'ended'; return true }
		const path = (marker: string) => {
			const p = trimmed.slice(marker.length).trim()
			if (!p) { fail(lineNo, `Missing path after '${marker.trim()}'`) }
			return p
		}
		if (trimmed.startsWith(ADD_FILE_MARKER)) { ensureUpdateNotEmpty(lineNo, trimmed); hunks.push({ type: 'add', path: path(ADD_FILE_MARKER), contents: '' }); st.mode = 'add'; return true }
		if (trimmed.startsWith(DELETE_FILE_MARKER)) { ensureUpdateNotEmpty(lineNo, trimmed); hunks.push({ type: 'delete', path: path(DELETE_FILE_MARKER) }); st.mode = 'delete'; return true }
		if (trimmed.startsWith(UPDATE_FILE_MARKER)) { ensureUpdateNotEmpty(lineNo, trimmed); hunks.push({ type: 'update', path: path(UPDATE_FILE_MARKER), movePath: null, chunks: [] }); st.mode = 'update'; updateHeaderLine = lineNo; return true }
		return false
	}

	for (let i = 1; i < lines.length; i++) {
		const lineNo = i + 1
		const line = lines[i]
		const trimmed = line.trim()
		if (st.mode === 'ended') {
			if (trimmed) { fail(lineNo, `Unexpected text after '${END_PATCH_MARKER}'`) }
			continue
		}
		if (st.mode === 'started' || st.mode === 'delete') {
			if (header(lineNo, trimmed)) { continue }
			if (!trimmed) { continue }
			fail(lineNo, `'${trimmed}' is not a valid hunk header. ${headerHelp}`)
		}
		if (st.mode === 'add') {
			if (header(lineNo, trimmed)) { continue }
			const last = hunks[hunks.length - 1]
			if (line.startsWith('+') && last.type === 'add') { last.contents += line.slice(1) + '\n'; continue }
			fail(lineNo, `Lines of an added file must start with '+'. Got '${trimmed}'. ${headerHelp}`)
		}
		// update
		const updateLine = line.trimEnd()
		if (header(lineNo, updateLine)) { continue }
		const hunk = hunks[hunks.length - 1]
		if (hunk.type !== 'update') { continue }
		const chunks = hunk.chunks
		const lastChunk = chunks[chunks.length - 1]
		if (lastChunk?.isEndOfFile) {
			if (!updateLine) { continue }
			if (updateLine !== EMPTY_CHANGE_CONTEXT_MARKER && !updateLine.startsWith(CHANGE_CONTEXT_MARKER)) {
				fail(lineNo, `Expected a '@@' line after '${EOF_MARKER}', got '${line}'`)
			}
		}
		if (chunks.length === 0 && hunk.movePath === null && updateLine.startsWith(MOVE_TO_MARKER)) {
			hunk.movePath = updateLine.slice(MOVE_TO_MARKER.length).trim()
			continue
		}
		if ((updateLine === EMPTY_CHANGE_CONTEXT_MARKER || updateLine.startsWith(CHANGE_CONTEXT_MARKER)) && lastChunk && isEmptyChunk(lastChunk)) {
			fail(lineNo, `Unexpected line '${line}'. Every line should start with ' ' (context line), '+' (added line), or '-' (removed line)`)
		}
		if (updateLine === EMPTY_CHANGE_CONTEXT_MARKER) { chunks.push(newChunk()); continue }
		if (updateLine.startsWith(CHANGE_CONTEXT_MARKER)) { chunks.push(newChunk(updateLine.slice(CHANGE_CONTEXT_MARKER.length))); continue }
		if (updateLine === EOF_MARKER) {
			if (!lastChunk || isEmptyChunk(lastChunk)) { fail(lineNo, 'Update hunk does not contain any lines') }
			lastChunk.isEndOfFile = true
			continue
		}
		const target = () => {
			if (chunks.length === 0) { chunks.push(newChunk()) }
			return chunks[chunks.length - 1]
		}
		const pushContext = (text: string) => {
			const c = target()
			c.contextLineIndices.push([c.oldLines.length, c.newLines.length])
			c.oldLines.push(text)
			c.newLines.push(text)
		}
		if (line === '') { pushContext(''); continue }
		if (line.startsWith(' ')) { pushContext(line.slice(1)); continue }
		if (line.startsWith('+')) { target().newLines.push(line.slice(1)); continue }
		if (line.startsWith('-')) { target().oldLines.push(line.slice(1)); continue }
		fail(lineNo, `Unexpected line '${line}' in the update of '${hunk.path}'. Every line should start with ' ' (context line), '+' (added line), or '-' (removed line)`)
	}
	if (st.mode !== 'ended') { throw new PatchError(`The last line of the patch must be '${END_PATCH_MARKER}'`) }
	if (hunks.length === 0) { throw new PatchError('The patch contains no file operations.') }
	return hunks
}

// ---------------------------------------------------------------------------
// Matching and applying
// ---------------------------------------------------------------------------

const normalisePunctuation = (s: string) => s.trim()
	.replace(/[‐-―−]/g, '-')
	.replace(/[‘-‛]/g, `'`)
	.replace(/[“-‟]/g, '"')
	.replace(/[  -   　]/g, ' ')

const MATCHERS: ((a: string, b: string) => boolean)[] = [
	(a, b) => a === b,
	(a, b) => a.trimEnd() === b.trimEnd(),
	(a, b) => a.trim() === b.trim(),
	(a, b) => normalisePunctuation(a) === normalisePunctuation(b),
]

/** Codex's seek_sequence: index of `pattern` in `lines` at or after `start`, or -1. */
export const seekSequence = (lines: string[], pattern: string[], start: number, eof: boolean): number => {
	if (pattern.length === 0) { return start }
	if (pattern.length > lines.length) { return -1 }
	const searchStart = eof ? Math.max(lines.length - pattern.length, start) : start
	for (const same of MATCHERS) {
		for (let i = searchStart; i <= lines.length - pattern.length; i++) {
			let ok = true
			for (let j = 0; j < pattern.length; j++) {
				if (!same(lines[i + j], pattern[j])) { ok = false; break }
			}
			if (ok) { return i }
		}
	}
	return -1
}

type Replacement = [start: number, oldLen: number, newLines: string[]]

const computeReplacements = (originalLines: string[], path: string, chunks: PatchChunk[]): Replacement[] => {
	const replacements: Replacement[] = []
	let lineIndex = 0
	for (const chunk of chunks) {
		if (chunk.changeContext !== null) {
			const idx = seekSequence(originalLines, [chunk.changeContext], lineIndex, false)
			if (idx < 0) { throw new PatchError(`Failed to find context '${chunk.changeContext}' in ${path}`) }
			lineIndex = idx + 1
		}
		if (chunk.oldLines.length === 0) {
			replacements.push([originalLines.length, 0, chunk.newLines.slice()])
			continue
		}
		let pattern = chunk.oldLines
		let newSlice = chunk.newLines
		let found = seekSequence(originalLines, pattern, lineIndex, chunk.isEndOfFile)
		// A trailing empty line in the chunk often stands for the file's final newline.
		if (found < 0 && pattern[pattern.length - 1] === '') {
			pattern = pattern.slice(0, -1)
			if (newSlice[newSlice.length - 1] === '') { newSlice = newSlice.slice(0, -1) }
			found = seekSequence(originalLines, pattern, lineIndex, chunk.isEndOfFile)
		}
		if (found < 0) { throw new PatchError(`Failed to find expected lines in ${path}:\n${chunk.oldLines.join('\n')}`) }

		// Keep context lines as they are in the file (they may differ in whitespace from the patch).
		let oldStart = 0
		let newStart = 0
		for (const [oldContext, newContext] of chunk.contextLineIndices) {
			if (oldContext >= pattern.length || newContext >= newSlice.length) { break }
			if (oldStart !== oldContext || newStart !== newContext) {
				replacements.push([found + oldStart, oldContext - oldStart, newSlice.slice(newStart, newContext)])
			}
			oldStart = oldContext + 1
			newStart = newContext + 1
		}
		if (oldStart !== pattern.length || newStart !== newSlice.length) {
			replacements.push([found + oldStart, pattern.length - oldStart, newSlice.slice(newStart)])
		}
		lineIndex = found + pattern.length
	}
	replacements.sort((a, b) => a[0] - b[0])
	for (let i = 1; i < replacements.length; i++) {
		const [prevStart, prevLen] = replacements[i - 1]
		if (replacements[i][0] < prevStart + prevLen) { throw new PatchError(`Chunks of the update to ${path} overlap.`) }
	}
	return replacements
}

/** New contents of a file after the chunks; keeps the file's line ending style and ends with a newline. */
export const applyChunks = (original: string, path: string, chunks: PatchChunk[]): string => {
	const eol = /\r\n/.test(original) ? '\r\n' : '\n'
	const lines = original.split(/\r\n|\n|\r/)
	if (lines.length > 0 && lines[lines.length - 1] === '') { lines.pop() } // trailing newline
	const replacements = computeReplacements(lines, path, chunks)
	const out: string[] = []
	let src = 0
	for (const [start, oldLen, newLines] of replacements) {
		while (src < start) { out.push(lines[src++]) }
		src += oldLen
		out.push(...newLines)
	}
	while (src < lines.length) { out.push(lines[src++]) }
	return out.length ? out.join(eol) + eol : ''
}

export type PatchFileChange = {
	kind: 'add' | 'update' | 'delete'
	path: string
	/** For a moved file, the old path. */
	fromPath: string | null
	/** Contents after the patch (null when deleted). */
	newContents: string | null
	added: number
	removed: number
}

/** Count added / removed lines between two texts (multiset difference of lines; cheap and good enough for a summary). */
export const lineDelta = (before: string, after: string): { added: number, removed: number } => {
	const split = (s: string) => s ? s.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n') : []
	const counts = new Map<string, number>()
	for (const l of split(before)) { counts.set(l, (counts.get(l) ?? 0) + 1) }
	let added = 0
	for (const l of split(after)) {
		const n = counts.get(l) ?? 0
		if (n > 0) { counts.set(l, n - 1) } else { added++ }
	}
	let removed = 0
	for (const n of counts.values()) { removed += n }
	return { added, removed }
}

/**
 * Work out every file's new contents before anything is written, so a patch that does not apply
 * changes nothing. `read` returns null for a missing file. Paths are as written in the patch;
 * `key` maps them to a canonical form (e.g. an absolute path) so two spellings of one file agree.
 */
export const planPatch = async (
	hunks: PatchHunk[],
	read: (path: string) => Promise<string | null>,
	key: (path: string) => string = p => p,
): Promise<PatchFileChange[]> => {
	// Current view of each touched file (null = does not exist), so later hunks see earlier ones.
	const state = new Map<string, string | null>()
	const original = new Map<string, string | null>()
	const current = async (path: string) => {
		const k = key(path)
		if (!state.has(k)) {
			const text = await read(path)
			state.set(k, text)
			original.set(k, text)
		}
		return state.get(k) ?? null
	}
	const order: string[] = []
	const pathOf = new Map<string, string>()
	const touch = (path: string) => {
		const k = key(path)
		if (!pathOf.has(k)) { order.push(k) }
		pathOf.set(k, path)
	}
	const movedFrom = new Map<string, string>()

	for (const h of hunks) {
		if (h.type === 'add') {
			await current(h.path)
			state.set(key(h.path), h.contents)
			touch(h.path)
		}
		else if (h.type === 'delete') {
			if (await current(h.path) === null) { throw new PatchError(`Cannot delete ${h.path}: the file does not exist.`) }
			state.set(key(h.path), null)
			touch(h.path)
		}
		else {
			const before = await current(h.path)
			if (before === null) { throw new PatchError(`Cannot update ${h.path}: the file does not exist. Use '*** Add File: ${h.path}' to create it.`) }
			const after = applyChunks(before, h.path, h.chunks)
			if (h.movePath && key(h.movePath) !== key(h.path)) {
				await current(h.movePath)
				state.set(key(h.path), null)
				state.set(key(h.movePath), after)
				touch(h.path)
				touch(h.movePath)
				movedFrom.set(key(h.movePath), h.path)
			}
			else {
				state.set(key(h.path), after)
				touch(h.path)
			}
		}
	}

	const changes: PatchFileChange[] = []
	for (const k of order) {
		const before = original.get(k) ?? null
		const after = state.get(k) ?? null
		const path = pathOf.get(k)!
		if (before === null && after === null) { continue }
		const fromPath = movedFrom.get(k) ?? null
		// A moved file is reported once, at its new path, with the diff against where it came from.
		if (after === null && [...movedFrom.values()].some(p => key(p) === k) && !hunks.some(h => h.type === 'delete' && key(h.path) === k)) { continue }
		const base = fromPath !== null && before === null ? original.get(key(fromPath)) ?? '' : before ?? ''
		const kind = after === null ? 'delete' : before === null && fromPath === null ? 'add' : 'update'
		const { added, removed } = lineDelta(after === null ? before ?? '' : base, after ?? '')
		changes.push(kind === 'delete'
			? { kind, path, fromPath: null, newContents: null, added: 0, removed: lineDelta(before ?? '', '').removed }
			: { kind, path, fromPath, newContents: after, added, removed })
	}
	return changes
}

/** Paths a moved file was moved away from (they must be deleted after the new file is written). */
export const movedAwayPaths = (changes: PatchFileChange[]) => changes.filter(c => c.fromPath !== null).map(c => c.fromPath!)

/** Codex-style result for the model: "Success. Updated the following files:\nA x\nM y\nD z". */
export const formatPatchResult = (changes: PatchFileChange[]): string => {
	const letter = { add: 'A', update: 'M', delete: 'D' } as const
	return `Success. Updated the following files:\n${changes.map(c => `${letter[c.kind]} ${c.path}${c.fromPath ? ` (moved from ${c.fromPath})` : ''}`).join('\n')}`
}

/** Text the model is told about the format (tool description). */
export const APPLY_PATCH_FORMAT_HELP = `The patch format is a stripped-down, file-oriented diff:
*** Begin Patch
[one or more file sections]
*** End Patch

Each file section starts with one of these headers:
*** Add File: <path> - create a new file. Every following line is a + line (the initial contents).
*** Delete File: <path> - remove an existing file. Nothing follows.
*** Update File: <path> - patch an existing file in place (optionally followed by "*** Move to: <new path>" to rename it).

In an Update section, each change is introduced by "@@" (optionally "@@ <a line near the change, e.g. a function or class header>") followed by the lines around the change: " " (space) = unchanged context, "-" = removed, "+" = added. Show about 3 lines of unchanged context above and below each change so it is found uniquely. Use "*** End of File" after a change at the very end of the file.

Example:
*** Begin Patch
*** Add File: hello.txt
+Hello world
*** Update File: src/app.py
*** Move to: src/main.py
@@ def greet():
-    print("Hi")
+    print("Hello, world!")
*** Delete File: obsolete.txt
*** End Patch

Rules: always include a header with the action (Add/Delete/Update); prefix every line of a new file with "+"; paths are relative to the workspace root (absolute paths inside the workspace also work); the patch is all-or-nothing (if any part does not apply, nothing is changed). You do not need to re-read files after a successful patch.`
