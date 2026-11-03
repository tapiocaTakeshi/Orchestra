/*--------------------------------------------------------------------------------------
 *  Copyright 2026 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { extractSearchedSites, isDefaultWebSearchEnabled, isWebSearchRejectedError, mergeSearchedSites, searchedSitesMarkdown } from '../../common/searchedSites.js';

suite('Searched sites', () => {

	test('Division API done event and Perplexity citations / search_results', () => {
		assert.deepStrictEqual(extractSearchedSites({ type: 'done', citations: ['https://d.example/1'] }), ['https://d.example/1']);
		assert.deepStrictEqual(
			extractSearchedSites({ citations: ['https://p.example/1'], search_results: [{ url: 'https://p.example/1' }, { url: 'https://p.example/2' }] }),
			['https://p.example/1', 'https://p.example/2'],
		);
		assert.deepStrictEqual(extractSearchedSites({ text: 'chunk' }), []);
	});

	test('OpenAI-compatible url_citation annotations', () => {
		const chunk = { choices: [{ delta: { annotations: [{ type: 'url_citation', url_citation: { url: 'https://o.example/1' } }] } }] };
		assert.deepStrictEqual(extractSearchedSites(chunk), ['https://o.example/1']);
	});

	test('Anthropic web search results and text citations', () => {
		const message = {
			content: [
				{ type: 'server_tool_use', name: 'web_search', input: { query: 'q' } },
				{ type: 'web_search_tool_result', content: [{ type: 'web_search_result', url: 'https://a.example/1' }] },
				{ type: 'text', text: 'x', citations: [{ type: 'web_search_result_location', url: 'https://a.example/2' }] },
			],
		};
		assert.deepStrictEqual(extractSearchedSites(message), ['https://a.example/1', 'https://a.example/2']);
	});

	test('Gemini grounding chunks', () => {
		const chunk = { candidates: [{ groundingMetadata: { groundingChunks: [{ web: { uri: 'https://g.example/1', title: 'g' } }] } }] };
		assert.deepStrictEqual(extractSearchedSites(chunk), ['https://g.example/1']);
	});

	test('merge keeps order without duplicates, markdown lists every site', () => {
		assert.deepStrictEqual(mergeSearchedSites(['https://a/1'], ['https://a/1', 'https://a/2']), ['https://a/1', 'https://a/2']);
		assert.strictEqual(searchedSitesMarkdown([]), '');
		assert.strictEqual(
			searchedSitesMarkdown(['https://a/1', 'https://a/2'], 'searcher'),
			'> 🔎 searcher が検索したサイト（2件）\n> 1. https://a/1\n> 2. https://a/2\n\n',
		);
	});

	test('web search switch and rejection detection', () => {
		assert.strictEqual(isDefaultWebSearchEnabled({}), true);
		assert.strictEqual(isDefaultWebSearchEnabled({ DIVISION_WEB_SEARCH: 'off' }), false);
		assert.strictEqual(isWebSearchRejectedError({ status: 400, message: 'web_search is not enabled for this organization' }), true);
		assert.strictEqual(isWebSearchRejectedError(new Error('[400 Bad Request] Tool use with function calling is unsupported')), true);
		assert.strictEqual(isWebSearchRejectedError({ status: 401, message: 'invalid x-api-key' }), false);
		assert.strictEqual(isWebSearchRejectedError({ status: 400, message: 'messages: field required' }), false);
	});
});
