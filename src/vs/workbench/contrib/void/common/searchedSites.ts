/*--------------------------------------------------------------------------------------
 *  Copyright 2026 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// The web pages a model searched or cited, collected from every response shape Orchestra sees:
//
// - Division API: the `citations: string[]` of a task's / generation's `done` event
// - Perplexity / xAI (OpenAI SDK): top-level `citations`, Perplexity `search_results: [{ url }]`
// - OpenAI-compatible Chat Completions: `choices[].message|delta.annotations[].url_citation.url`
// - Anthropic (`web_search` / `web_fetch` server tools): `content[]` blocks of type
//   `web_search_tool_result` / `web_fetch_tool_result`, and text-block `citations[]`
// - Gemini (`google_search` grounding): `candidates[].groundingMetadata.groundingChunks[].web.uri`

const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const arr = (v: unknown): unknown[] => Array.isArray(v) ? v : [];

export const extractSearchedSites = (data: unknown): string[] => {
	if (!isObj(data)) { return []; }
	const urls: string[] = [];
	const add = (u: unknown) => { if (typeof u === 'string' && /^https?:\/\//i.test(u)) { urls.push(u); } };
	const addUrlOf = (o: unknown) => { if (isObj(o)) { add(o.url); } };
	const addAnnotation = (a: unknown) => {
		if (!isObj(a) || a.type !== 'url_citation') { return; }
		add(a.url);
		addUrlOf(a.url_citation);
	};
	const addAnthropicBlock = (block: unknown) => {
		if (!isObj(block)) { return; }
		if (block.type === 'web_search_tool_result') { arr(block.content).forEach(addUrlOf); }
		if (block.type === 'web_fetch_tool_result') { addUrlOf(block.content); }
		if (block.type === 'text') { arr(block.citations).forEach(addUrlOf); }
	};

	for (const c of arr(data.citations)) { if (typeof c === 'string') { add(c); } else { addUrlOf(c); } }
	arr(data.search_results).forEach(addUrlOf);

	for (const choice of arr(data.choices)) {
		if (!isObj(choice)) { continue; }
		for (const m of [choice.message, choice.delta]) { if (isObj(m)) { arr(m.annotations).forEach(addAnnotation); } }
	}

	arr(data.content).forEach(addAnthropicBlock);

	for (const cand of arr(data.candidates)) {
		if (!isObj(cand) || !isObj(cand.groundingMetadata)) { continue; }
		for (const chunk of arr(cand.groundingMetadata.groundingChunks)) {
			if (isObj(chunk) && isObj(chunk.web)) { add(chunk.web.uri); }
		}
	}

	return [...new Set(urls)];
};

/** Merge newly found URLs into an accumulated list, keeping order and dropping duplicates. */
export const mergeSearchedSites = (prev: string[], next: string[]): string[] =>
	next.length ? [...new Set([...prev, ...next])] : prev;

/** Log every searched web page, one per line. */
export const logSearchedSites = (label: string, urls: string[]): void => {
	if (!urls.length) { return; }
	console.log(`[${label}] Searched sites: ${urls.length} sources`);
	urls.forEach((url, i) => console.log(`[${label}]   [${i + 1}] ${url}`));
};

/** The chat progress-log block listing the searched sites (empty when there are none). */
export const searchedSitesMarkdown = (urls: string[], who?: string): string => {
	if (!urls.length) { return ''; }
	const head = `> 🔎 ${who ? `${who} が` : ''}検索したサイト（${urls.length}件）`;
	return [head, ...urls.map((u, i) => `> ${i + 1}. ${u}`)].join('\n') + '\n\n';
};

/**
 * Built-in web search is on by default for direct Anthropic / Gemini chats.
 * Set `DIVISION_WEB_SEARCH=off` (same switch as the Division API) to turn it off.
 */
export const isDefaultWebSearchEnabled = (env: Record<string, string | undefined>): boolean => {
	const v = env.DIVISION_WEB_SEARCH?.trim().toLowerCase();
	return !(v && ['0', 'false', 'off', 'no'].includes(v));
};

/** A 400 that likely means this model/account cannot use the built-in search tool. */
export const isWebSearchRejectedError = (error: unknown): boolean => {
	if (!isObj(error) && !(error instanceof Error)) { return false; }
	const e = error as { status?: unknown; message?: unknown };
	const message = typeof e.message === 'string' ? e.message : String(error);
	const is400 = e.status === 400 || /\b400\b/.test(message);
	return is400 && /web_search|google_search|search|tool/i.test(message);
};
