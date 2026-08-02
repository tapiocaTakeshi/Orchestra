/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// disable foreign import complaints
/* eslint-disable */
import Anthropic from '@anthropic-ai/sdk';
import { Ollama } from 'ollama';
import OpenAI, { ClientOptions, AzureOpenAI } from 'openai';
import { MistralCore } from '@mistralai/mistralai/core.js';
import { fimComplete } from '@mistralai/mistralai/funcs/fimComplete.js';
import { Tool as GeminiTool, FunctionDeclaration, GoogleGenAI, ThinkingConfig, Schema, Type } from '@google/genai';
import { GoogleAuth } from 'google-auth-library'
import * as fs from 'fs';
import * as path from 'path';
/* eslint-enable */

import { AnthropicLLMChatMessage, GeminiLLMChatMessage, LLMChatMessage, LLMFIMMessage, ModelListParams, OllamaModelResponse, OnError, OnFinalMessage, OnText, RawToolCallObj, RawToolParamsObj, FileOperationItem, CommandOperationItem, DivisionAPIModelResponse } from '../../common/sendLLMMessageTypes.js';
import { ChatMode, displayInfoOfProviderName, ModelSelectionOptions, OverridesOfModel, ProviderName, RoleAssignment, SettingsOfProvider } from '../../common/voidSettingsTypes.js';
import { getSendableReasoningInfo, getModelCapabilities, getProviderCapabilities, defaultProviderSettings, getReservedOutputTokenSpace } from '../../common/modelCapabilities.js';
import { extractReasoningWrapper, extractXMLToolsWrapper } from './extractGrammar.js';
import { availableTools, InternalToolInfo } from '../../common/prompt/prompts.js';
import { generateUuid } from '../../../../../base/common/uuid.js';

const getGoogleApiKey = async () => {
	// module‑level singleton
	const auth = new GoogleAuth({ scopes: `https://www.googleapis.com/auth/cloud-platform` });
	const key = await auth.getAccessToken()
	if (!key) throw new Error(`Google API failed to generate a key.`)
	return key
}




type InternalCommonMessageParams = {
	onText: OnText;
	onFinalMessage: OnFinalMessage;
	onError: OnError;
	onFileOperation?: (operations: FileOperationItem[]) => void;
	onCommandRun?: (commands: CommandOperationItem[]) => void;
	providerName: ProviderName;
	settingsOfProvider: SettingsOfProvider;
	modelSelectionOptions: ModelSelectionOptions | undefined;
	overridesOfModel: OverridesOfModel | undefined;
	modelName: string;
	_setAborter: (aborter: () => void) => void;
	// ユーザーからの「途中割り込み」テキストを取り出すゲッター。
	// null を返せば割り込み無し。Division API orchestration が各フェーズの
	// 境目（Leader 前 / 各中間タスク前 / Coder 前 / Reviewer 前 / 再分解前）で
	// ポーリングし、テキストがあれば currentInput に追記した上で処理継続。
	takePendingInjection?: () => string | null;
}

type SendChatParams_Internal = InternalCommonMessageParams & {
	messages: LLMChatMessage[];
	separateSystemMessage: string | undefined;
	chatMode: ChatMode | null;
	mcpTools: InternalToolInfo[] | undefined;
	divisionRoleAssignments?: RoleAssignment[];
	divisionProjectId?: string;
	divisionApiKey?: string;
	divisionMaxBriefGateIterations?: number;
	divisionMaxReviewerIterations?: number;
	divisionMaxReviewIterations?: number;
	divisionFlowApprovalMode?: boolean;
	workspaceFolderPath?: string;
}
type SendFIMParams_Internal = InternalCommonMessageParams & { messages: LLMFIMMessage; separateSystemMessage: string | undefined; }
export type ListParams_Internal<ModelResponse> = ModelListParams<ModelResponse>


const invalidApiKeyMessage = (providerName: ProviderName) => `Invalid ${displayInfoOfProviderName(providerName).title} API key.`

const getApiKey = (providerName: ProviderName, providedKey: string | undefined): string | undefined => {
	if (providedKey) return providedKey;

	switch (providerName) {
		case 'anthropic': return process.env.ANTHROPIC_API_KEY;
		case 'openAI': return process.env.OPENAI_API_KEY;
		case 'gemini': return process.env.GOOGLE_API_KEY;
		default: return undefined;
	}
}

// ------------ OPENAI-COMPATIBLE (HELPERS) ------------



const parseHeadersJSON = (s: string | undefined): Record<string, string | null | undefined> | undefined => {
	if (!s) return undefined
	try {
		return JSON.parse(s)
	} catch (e) {
		throw new Error(`Error parsing OpenAI-Compatible headers: ${s} is not a valid JSON.`)
	}
}

const newOpenAICompatibleSDK = async ({ settingsOfProvider, providerName, includeInPayload }: { settingsOfProvider: SettingsOfProvider, providerName: ProviderName, includeInPayload?: { [s: string]: any } }) => {
	const commonPayloadOpts: ClientOptions = {
		dangerouslyAllowBrowser: true,
		...includeInPayload,
	}
	if (providerName === 'openAI') {
		const thisConfig = settingsOfProvider[providerName]
		return new OpenAI({ apiKey: getApiKey(providerName, thisConfig.apiKey), ...commonPayloadOpts })
	}
	else if (providerName === 'ollama') {
		const thisConfig = settingsOfProvider[providerName]
		return new OpenAI({ baseURL: `${thisConfig.endpoint}/v1`, apiKey: 'noop', ...commonPayloadOpts })
	}
	else if (providerName === 'vLLM') {
		const thisConfig = settingsOfProvider[providerName]
		return new OpenAI({ baseURL: `${thisConfig.endpoint}/v1`, apiKey: 'noop', ...commonPayloadOpts })
	}
	else if (providerName === 'liteLLM') {
		const thisConfig = settingsOfProvider[providerName]
		return new OpenAI({ baseURL: `${thisConfig.endpoint}/v1`, apiKey: 'noop', ...commonPayloadOpts })
	}
	else if (providerName === 'lmStudio') {
		const thisConfig = settingsOfProvider[providerName]
		return new OpenAI({ baseURL: `${thisConfig.endpoint}/v1`, apiKey: 'noop', ...commonPayloadOpts })
	}
	else if (providerName === 'openRouter') {
		const thisConfig = settingsOfProvider[providerName]
		return new OpenAI({
			baseURL: 'https://openrouter.ai/api/v1',
			apiKey: getApiKey(providerName, thisConfig.apiKey),
			defaultHeaders: {
				'HTTP-Referer': 'https://voideditor.com', // Optional, for including your app on openrouter.ai rankings.
				'X-Title': 'Void', // Optional. Shows in rankings on openrouter.ai.
			},
			...commonPayloadOpts,
		})
	}
	else if (providerName === 'googleVertex') {
		// https://cloud.google.com/vertex-ai/generative-ai/docs/multimodal/call-vertex-using-openai-library
		const thisConfig = settingsOfProvider[providerName]
		const baseURL = `https://${thisConfig.region}-aiplatform.googleapis.com/v1/projects/${thisConfig.project}/locations/${thisConfig.region}/endpoints/${'openapi'}`
		const apiKey = await getGoogleApiKey()
		return new OpenAI({ baseURL: baseURL, apiKey: apiKey, ...commonPayloadOpts })
	}
	else if (providerName === 'microsoftAzure') {
		// https://learn.microsoft.com/en-us/rest/api/aifoundry/model-inference/get-chat-completions/get-chat-completions?view=rest-aifoundry-model-inference-2024-05-01-preview&tabs=HTTP
		//  https://github.com/openai/openai-node?tab=readme-ov-file#microsoft-azure-openai
		const thisConfig = settingsOfProvider[providerName]
		const endpoint = `https://${thisConfig.project}.openai.azure.com/`;
		const apiVersion = thisConfig.azureApiVersion ?? '2024-04-01-preview';
		const options = { endpoint, apiKey: getApiKey(providerName, thisConfig.apiKey), apiVersion };
		return new AzureOpenAI({ ...options, ...commonPayloadOpts });
	}
	else if (providerName === 'awsBedrock') {
		const { endpoint, apiKey } = settingsOfProvider.awsBedrock
		let baseURL = endpoint || 'http://localhost:4000/v1'
		if (!baseURL.endsWith('/v1'))
			baseURL = baseURL.replace(/\/+$/, '') + '/v1'

		return new OpenAI({ baseURL, apiKey: getApiKey(providerName, apiKey), ...commonPayloadOpts })
	}


	else if (providerName === 'deepseek') {
		const thisConfig = settingsOfProvider[providerName]
		return new OpenAI({ baseURL: 'https://api.deepseek.com/v1', apiKey: getApiKey(providerName, thisConfig.apiKey), ...commonPayloadOpts })
	}
	else if (providerName === 'openAICompatible') {
		const thisConfig = settingsOfProvider[providerName]
		const headers = parseHeadersJSON(thisConfig.headersJSON)
		return new OpenAI({ baseURL: thisConfig.endpoint, apiKey: getApiKey(providerName, thisConfig.apiKey), defaultHeaders: headers, ...commonPayloadOpts })
	}
	else if (providerName === 'groq') {
		const thisConfig = settingsOfProvider[providerName]
		return new OpenAI({ baseURL: 'https://api.groq.com/openai/v1', apiKey: getApiKey(providerName, thisConfig.apiKey), ...commonPayloadOpts })
	}
	else if (providerName === 'xAI') {
		const thisConfig = settingsOfProvider[providerName]
		return new OpenAI({ baseURL: 'https://api.x.ai/v1', apiKey: getApiKey(providerName, thisConfig.apiKey), ...commonPayloadOpts })
	}
	else if (providerName === 'mistral') {
		const thisConfig = settingsOfProvider[providerName]
		return new OpenAI({ baseURL: 'https://api.mistral.ai/v1', apiKey: getApiKey(providerName, thisConfig.apiKey), ...commonPayloadOpts })
	}
	else if (providerName === 'perplexity') {
		const thisConfig = settingsOfProvider[providerName]
		return new OpenAI({ baseURL: 'https://api.perplexity.ai', apiKey: getApiKey(providerName, thisConfig.apiKey), ...commonPayloadOpts })
	}

	else throw new Error(`Void providerName was invalid: ${providerName}.`)
}


const _sendOpenAICompatibleFIM = async ({ messages: { prefix, suffix, stopTokens }, onFinalMessage, onError, settingsOfProvider, modelName: modelName_, _setAborter, providerName, overridesOfModel }: SendFIMParams_Internal) => {

	const {
		modelName,
		supportsFIM,
		additionalOpenAIPayload,
	} = getModelCapabilities(providerName, modelName_, overridesOfModel)

	if (!supportsFIM) {
		if (modelName === modelName_)
			onError({ message: `Model ${modelName} does not support FIM.`, fullError: null })
		else
			onError({ message: `Model ${modelName_} (${modelName}) does not support FIM.`, fullError: null })
		return
	}

	const openai = await newOpenAICompatibleSDK({ providerName, settingsOfProvider, includeInPayload: additionalOpenAIPayload })
	openai.completions
		.create({
			model: modelName,
			prompt: prefix,
			suffix: suffix,
			stop: stopTokens,
			max_tokens: 300,
		})
		.then(async response => {
			const fullText = response.choices[0]?.text
			onFinalMessage({ fullText, fullReasoning: '', anthropicReasoning: null });
		})
		.catch(error => {
			if (error instanceof OpenAI.APIError && error.status === 401) { onError({ message: invalidApiKeyMessage(providerName), fullError: error }); }
			else { onError({ message: error + '', fullError: error }); }
		})
}


const toOpenAICompatibleTool = (toolInfo: InternalToolInfo) => {
	const { name, description, params } = toolInfo

	const paramsWithType: { [s: string]: { description: string; type: 'string' } } = {}
	for (const key in params) { paramsWithType[key] = { ...params[key], type: 'string' } }

	return {
		type: 'function',
		function: {
			name: name,
			// strict: true, // strict mode - https://platform.openai.com/docs/guides/function-calling?api-mode=chat
			description: description,
			parameters: {
				type: 'object',
				properties: params,
				// required: Object.keys(params), // in strict mode, all params are required and additionalProperties is false
				// additionalProperties: false,
			},
		}
	} satisfies OpenAI.Chat.Completions.ChatCompletionTool
}

const openAITools = (chatMode: ChatMode | null, mcpTools: InternalToolInfo[] | undefined) => {
	const allowedTools = availableTools(chatMode, mcpTools)
	if (!allowedTools || Object.keys(allowedTools).length === 0) return null

	const openAITools: OpenAI.Chat.Completions.ChatCompletionTool[] = []
	for (const t in allowedTools ?? {}) {
		openAITools.push(toOpenAICompatibleTool(allowedTools[t]))
	}
	return openAITools
}


// convert LLM tool call to our tool format
const rawToolCallObjOfParamsStr = (name: string, toolParamsStr: string, id: string): RawToolCallObj | null => {
	let input: unknown
	try { input = JSON.parse(toolParamsStr) }
	catch (e) { return null }

	if (input === null) return null
	if (typeof input !== 'object') return null

	const rawParams: RawToolParamsObj = input
	return { id, name, rawParams, doneParams: Object.keys(rawParams), isDone: true }
}


const rawToolCallObjOfAnthropicParams = (toolBlock: Anthropic.Messages.ToolUseBlock): RawToolCallObj | null => {
	const { id, name, input } = toolBlock

	if (input === null) return null
	if (typeof input !== 'object') return null

	const rawParams: RawToolParamsObj = input
	return { id, name, rawParams, doneParams: Object.keys(rawParams), isDone: true }
}


// ------------ OPENAI-COMPATIBLE ------------


const _sendOpenAICompatibleChat = async ({ messages, onText, onFinalMessage, onError, settingsOfProvider, modelSelectionOptions, modelName: modelName_, _setAborter, providerName, chatMode, separateSystemMessage, overridesOfModel, mcpTools }: SendChatParams_Internal) => {
	const {
		modelName,
		specialToolFormat,
		reasoningCapabilities,
		additionalOpenAIPayload,
	} = getModelCapabilities(providerName, modelName_, overridesOfModel)

	const { providerReasoningIOSettings } = getProviderCapabilities(providerName)

	// reasoning
	const { canIOReasoning, openSourceThinkTags } = reasoningCapabilities || {}
	const reasoningInfo = getSendableReasoningInfo('Chat', providerName, modelName_, modelSelectionOptions, overridesOfModel) // user's modelName_ here

	const includeInPayload = {
		...providerReasoningIOSettings?.input?.includeInPayload?.(reasoningInfo),
		...additionalOpenAIPayload
	}

	// tools
	const potentialTools = openAITools(chatMode, mcpTools)
	const nativeToolsObj = potentialTools && specialToolFormat === 'openai-style' ?
		{ tools: potentialTools } as const
		: {}

	// instance
	const openai: OpenAI = await newOpenAICompatibleSDK({ providerName, settingsOfProvider, includeInPayload })
	if (providerName === 'microsoftAzure') {
		// Required to select the model
		(openai as AzureOpenAI).deploymentName = modelName;
	}
	const options: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
		model: modelName,
		messages: messages as any,
		stream: true,
		...nativeToolsObj,
		...additionalOpenAIPayload
		// max_completion_tokens: maxTokens,
	}

	// open source models - manually parse think tokens
	const { needsManualParse: needsManualReasoningParse, nameOfFieldInDelta: nameOfReasoningFieldInDelta } = providerReasoningIOSettings?.output ?? {}
	const manuallyParseReasoning = needsManualReasoningParse && canIOReasoning && openSourceThinkTags
	if (manuallyParseReasoning) {
		const { newOnText, newOnFinalMessage } = extractReasoningWrapper(onText, onFinalMessage, openSourceThinkTags)
		onText = newOnText
		onFinalMessage = newOnFinalMessage
	}

	// manually parse out tool results if XML
	if (!specialToolFormat) {
		const { newOnText, newOnFinalMessage } = extractXMLToolsWrapper(onText, onFinalMessage, chatMode, mcpTools)
		onText = newOnText
		onFinalMessage = newOnFinalMessage
	}

	let fullReasoningSoFar = ''
	let fullTextSoFar = ''

	let toolName = ''
	let toolId = ''
	let toolParamsStr = ''

	openai.chat.completions
		.create(options)
		.then(async response => {
			_setAborter(() => response.controller.abort())
			// when receive text
			for await (const chunk of response) {
				// message
				const newText = chunk.choices[0]?.delta?.content ?? ''
				fullTextSoFar += newText

				// tool call
				for (const tool of chunk.choices[0]?.delta?.tool_calls ?? []) {
					const index = tool.index
					if (index !== 0) continue

					toolName += tool.function?.name ?? ''
					toolParamsStr += tool.function?.arguments ?? '';
					toolId += tool.id ?? ''
				}


				// reasoning
				let newReasoning = ''
				if (nameOfReasoningFieldInDelta) {
					// @ts-ignore
					newReasoning = (chunk.choices[0]?.delta?.[nameOfReasoningFieldInDelta] || '') + ''
					fullReasoningSoFar += newReasoning
				}

				// call onText
				onText({
					fullText: fullTextSoFar,
					fullReasoning: fullReasoningSoFar,
					toolCall: !toolName ? undefined : { name: toolName, rawParams: {}, isDone: false, doneParams: [], id: toolId },
				})

			}
			// on final
			if (!fullTextSoFar && !fullReasoningSoFar && !toolName) {
				onError({ message: 'Void: Response from model was empty.', fullError: null })
			}
			else {
				const toolCall = rawToolCallObjOfParamsStr(toolName, toolParamsStr, toolId)
				const toolCallObj = toolCall ? { toolCall } : {}
				onFinalMessage({ fullText: fullTextSoFar, fullReasoning: fullReasoningSoFar, anthropicReasoning: null, ...toolCallObj });
			}
		})
		// when error/fail - this catches errors of both .create() and .then(for await)
		.catch(error => {
			if (error instanceof OpenAI.APIError && error.status === 401) { onError({ message: invalidApiKeyMessage(providerName), fullError: error }); }
			else { onError({ message: error + '', fullError: error }); }
		})
}



type OpenAIModel = {
	id: string;
	created: number;
	object: 'model';
	owned_by: string;
}
const _openaiCompatibleList = async ({ onSuccess: onSuccess_, onError: onError_, settingsOfProvider, providerName }: ListParams_Internal<OpenAIModel>) => {
	const onSuccess = ({ models }: { models: OpenAIModel[] }) => {
		onSuccess_({ models })
	}
	const onError = ({ error }: { error: string }) => {
		onError_({ error })
	}
	try {
		const openai = await newOpenAICompatibleSDK({ providerName, settingsOfProvider })
		openai.models.list()
			.then(async (response) => {
				const models: OpenAIModel[] = []
				models.push(...response.data)
				while (response.hasNextPage()) {
					models.push(...(await response.getNextPage()).data)
				}
				onSuccess({ models })
			})
			.catch((error) => {
				onError({ error: error + '' })
			})
	}
	catch (error) {
		onError({ error: error + '' })
	}
}

// Division API `/api/models` のレスポンス例 (実 API)
// {
//   providers: [
//     { id: 'anthropic', name: 'Anthropic', apiType: 'anthropic', modelId: '',
//       models: [ { modelId: 'claude-opus-4-7', displayName: 'Claude Opus 4.7' }, ... ] },
//     { id: 'openai', ... },
//   ]
// }
//
// 単一モデルとしてユーザーに選ばせるため、`<providerId>/<modelId>` 形式の文字列を
// modelName として返す。 こうすると後段 (callDivisionGenerateStream) で provider と
// model を分離して `/api/generate/stream` に正しく投げられる。
//
// 後方互換として、他の構造 (data.models[], data.data[], 文字列等) も受け付ける。
//   - models[] / data[] 直下の entry は providerId 不明なので modelId だけ返す。
//   - 文字列 entry はそのまま使う。
const getDivisionAPIModelNames = (data: any): string[] => {
	const orderedNames: string[] = []
	const seen = new Set<string>()
	const push = (name: string) => {
		const trimmed = name.trim()
		if (!trimmed || seen.has(trimmed)) return
		seen.add(trimmed)
		orderedNames.push(trimmed)
	}
	push('division-orchestrator')

	const pickModelId = (model: unknown): string | null => {
		if (typeof model === 'string') return model
		if (!model || typeof model !== 'object') return null
		const m = model as { modelId?: unknown; id?: unknown; name?: unknown; model?: unknown }
		for (const v of [m.modelId, m.id, m.name, m.model]) {
			if (typeof v === 'string' && v.trim()) return v.trim()
		}
		return null
	}

	const addProviderEntry = (provider: unknown) => {
		if (!provider || typeof provider !== 'object') {
			const single = pickModelId(provider)
			if (single) push(single)
			return
		}
		const p = provider as { id?: unknown; name?: unknown; apiType?: unknown; models?: unknown }
		// providerId は id > apiType > name の優先で決定。 すべて欠けるなら "" 扱い。
		const providerId = (
			(typeof p.id === 'string' && p.id.trim()) ? p.id.trim()
				: (typeof p.apiType === 'string' && p.apiType.trim()) ? p.apiType.trim()
					: (typeof p.name === 'string' && p.name.trim()) ? p.name.trim()
						: ''
		)
		if (Array.isArray(p.models)) {
			for (const m of p.models) {
				const modelId = pickModelId(m)
				if (!modelId) continue
				push(providerId ? `${providerId}/${modelId}` : modelId)
			}
		} else {
			// 配下に models[] が無い provider entry は model として扱う後方互換
			const single = pickModelId(provider)
			if (single) push(single)
		}
	}

	if (Array.isArray(data)) data.forEach(addProviderEntry)
	if (Array.isArray(data?.providers)) data.providers.forEach(addProviderEntry)
	// providers の外側にフラットな models[] が並ぶ別レスポンスへの後方互換
	if (Array.isArray(data?.models)) {
		for (const m of data.models) {
			const modelId = pickModelId(m)
			if (modelId) push(modelId)
		}
	}
	if (Array.isArray(data?.data)) {
		for (const m of data.data) {
			const modelId = pickModelId(m)
			if (modelId) push(modelId)
		}
	}

	return orderedNames
}

const divisionAPIList = async ({ onSuccess: onSuccess_, onError: onError_, settingsOfProvider, divisionApiKey }: ListParams_Internal<DivisionAPIModelResponse>) => {
	const endpoint = settingsOfProvider.divisionAPI.endpoint || defaultProviderSettings.divisionAPI.endpoint
	const url = `${endpoint.replace(/\/+$/, '')}/api/models`

	try {
		// 認証は (1) ユーザーが UI で設定した divisionApiKey, (2) 環境変数 DIVISION_API_KEY,
		// の順にフォールバック。チャット送信側と同じ規約。空なら無認証で叩く。
		const apiKey = (divisionApiKey || process.env.DIVISION_API_KEY || '').trim()
		const headers: Record<string, string> = { 'Accept': 'application/json' }
		if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`

		const response = await fetch(url, { headers })
		if (!response.ok) {
			let bodySnippet = ''
			try { bodySnippet = (await response.text()).slice(0, 200) } catch { /* ignore */ }
			const msg = `Division API /api/models failed: ${response.status} ${response.statusText}${bodySnippet ? ` — ${bodySnippet}` : ''}`
			console.warn('[DivisionAPI]', msg, { url, hasApiKey: !!apiKey })
			onError_({ error: msg })
			return
		}

		const data = await response.json()
		const models = getDivisionAPIModelNames(data).map(name => ({ name }))
		if (models.length === 0) {
			const msg = 'Division API /api/models response did not contain any models.'
			console.warn('[DivisionAPI]', msg, { url, data })
			onError_({ error: msg })
			return
		}

		onSuccess_({ models })
	}
	catch (error) {
		console.warn('[DivisionAPI] /api/models fetch threw:', error, { url })
		onError_({ error: error + '' })
	}
}




// ------------ ANTHROPIC (HELPERS) ------------
const toAnthropicTool = (toolInfo: InternalToolInfo) => {
	const { name, description, params } = toolInfo
	const paramsWithType: { [s: string]: { description: string; type: 'string' } } = {}
	for (const key in params) { paramsWithType[key] = { ...params[key], type: 'string' } }
	return {
		name: name,
		description: description,
		input_schema: {
			type: 'object',
			properties: paramsWithType,
			// required: Object.keys(params),
		},
	} satisfies Anthropic.Messages.Tool
}

const anthropicTools = (chatMode: ChatMode | null, mcpTools: InternalToolInfo[] | undefined) => {
	const allowedTools = availableTools(chatMode, mcpTools)
	if (!allowedTools || Object.keys(allowedTools).length === 0) return null

	const anthropicTools: Anthropic.Messages.ToolUnion[] = []
	for (const t in allowedTools ?? {}) {
		anthropicTools.push(toAnthropicTool(allowedTools[t]))
	}
	return anthropicTools
}



// ------------ ANTHROPIC ------------
const sendAnthropicChat = async ({ messages, providerName, onText, onFinalMessage, onError, settingsOfProvider, modelSelectionOptions, overridesOfModel, modelName: modelName_, _setAborter, separateSystemMessage, chatMode, mcpTools }: SendChatParams_Internal) => {
	const {
		modelName,
		specialToolFormat,
	} = getModelCapabilities(providerName, modelName_, overridesOfModel)

	const thisConfig = settingsOfProvider.anthropic
	const { providerReasoningIOSettings } = getProviderCapabilities(providerName)

	// reasoning
	const reasoningInfo = getSendableReasoningInfo('Chat', providerName, modelName_, modelSelectionOptions, overridesOfModel) // user's modelName_ here
	const includeInPayload = providerReasoningIOSettings?.input?.includeInPayload?.(reasoningInfo) || {}

	// anthropic-specific - max tokens
	const maxTokens = getReservedOutputTokenSpace(providerName, modelName_, { isReasoningEnabled: !!reasoningInfo?.isReasoningEnabled, overridesOfModel })

	// tools
	const potentialTools = anthropicTools(chatMode, mcpTools)
	const nativeToolsObj = potentialTools && specialToolFormat === 'anthropic-style' ?
		{ tools: potentialTools, tool_choice: { type: 'auto' } } as const
		: {}


	// instance
	const anthropic = new Anthropic({
		apiKey: getApiKey(providerName, thisConfig.apiKey),
		dangerouslyAllowBrowser: true
	});

	const stream = anthropic.messages.stream({
		system: separateSystemMessage ?? undefined,
		messages: messages as AnthropicLLMChatMessage[],
		model: modelName,
		max_tokens: maxTokens ?? 4_096, // anthropic requires this
		...includeInPayload,
		...nativeToolsObj,

	})

	// manually parse out tool results if XML
	if (!specialToolFormat) {
		const { newOnText, newOnFinalMessage } = extractXMLToolsWrapper(onText, onFinalMessage, chatMode, mcpTools)
		onText = newOnText
		onFinalMessage = newOnFinalMessage
	}

	// when receive text
	let fullText = ''
	let fullReasoning = ''

	let fullToolName = ''
	let fullToolParams = ''


	const runOnText = () => {
		onText({
			fullText,
			fullReasoning,
			toolCall: !fullToolName ? undefined : { name: fullToolName, rawParams: {}, isDone: false, doneParams: [], id: 'dummy' },
		})
	}
	// there are no events for tool_use, it comes in at the end
	stream.on('streamEvent', e => {
		// start block
		if (e.type === 'content_block_start') {
			if (e.content_block.type === 'text') {
				if (fullText) fullText += '\n\n' // starting a 2nd text block
				fullText += e.content_block.text
				runOnText()
			}
			else if (e.content_block.type === 'thinking') {
				if (fullReasoning) fullReasoning += '\n\n' // starting a 2nd reasoning block
				fullReasoning += e.content_block.thinking
				runOnText()
			}
			else if (e.content_block.type === 'redacted_thinking') {
				console.log('delta', e.content_block.type)
				if (fullReasoning) fullReasoning += '\n\n' // starting a 2nd reasoning block
				fullReasoning += '[redacted_thinking]'
				runOnText()
			}
			else if (e.content_block.type === 'tool_use') {
				fullToolName += e.content_block.name ?? '' // anthropic gives us the tool name in the start block
				runOnText()
			}
		}

		// delta
		else if (e.type === 'content_block_delta') {
			if (e.delta.type === 'text_delta') {
				fullText += e.delta.text
				runOnText()
			}
			else if (e.delta.type === 'thinking_delta') {
				fullReasoning += e.delta.thinking
				runOnText()
			}
			else if (e.delta.type === 'input_json_delta') { // tool use
				fullToolParams += e.delta.partial_json ?? '' // anthropic gives us the partial delta (string) here - https://docs.anthropic.com/en/api/messages-streaming
				runOnText()
			}
		}
	})

	// on done - (or when error/fail) - this is called AFTER last streamEvent
	stream.on('finalMessage', (response) => {
		const anthropicReasoning = response.content.filter(c => c.type === 'thinking' || c.type === 'redacted_thinking')
		const tools = response.content.filter(c => c.type === 'tool_use')
		// console.log('TOOLS!!!!!!', JSON.stringify(tools, null, 2))
		// console.log('TOOLS!!!!!!', JSON.stringify(response, null, 2))
		const toolCall = tools[0] && rawToolCallObjOfAnthropicParams(tools[0])
		const toolCallObj = toolCall ? { toolCall } : {}

		onFinalMessage({ fullText, fullReasoning, anthropicReasoning, ...toolCallObj })
	})
	// on error
	stream.on('error', (error) => {
		if (error instanceof Anthropic.APIError && error.status === 401) { onError({ message: invalidApiKeyMessage(providerName), fullError: error }) }
		else { onError({ message: error + '', fullError: error }) }
	})
	_setAborter(() => stream.controller.abort())
}



// ------------ MISTRAL ------------
// https://docs.mistral.ai/api/#tag/fim
const sendMistralFIM = ({ messages, onFinalMessage, onError, settingsOfProvider, overridesOfModel, modelName: modelName_, _setAborter, providerName }: SendFIMParams_Internal) => {
	const { modelName, supportsFIM } = getModelCapabilities(providerName, modelName_, overridesOfModel)
	if (!supportsFIM) {
		if (modelName === modelName_)
			onError({ message: `Model ${modelName} does not support FIM.`, fullError: null })
		else
			onError({ message: `Model ${modelName_} (${modelName}) does not support FIM.`, fullError: null })
		return
	}

	const mistral = new MistralCore({ apiKey: getApiKey(providerName, settingsOfProvider.mistral.apiKey) })
	fimComplete(mistral,
		{
			model: modelName,
			prompt: messages.prefix,
			suffix: messages.suffix,
			stream: false,
			maxTokens: 300,
			stop: messages.stopTokens,
		})
		.then(async response => {

			// unfortunately, _setAborter() does not exist
			let content = response?.ok ? response.value.choices?.[0]?.message?.content ?? '' : '';
			const fullText = typeof content === 'string' ? content
				: content.map(chunk => (chunk.type === 'text' ? chunk.text : '')).join('')

			onFinalMessage({ fullText, fullReasoning: '', anthropicReasoning: null });
		})
		.catch(error => {
			onError({ message: error + '', fullError: error });
		})
}


// ------------ OLLAMA ------------
const newOllamaSDK = ({ endpoint }: { endpoint: string }) => {
	// if endpoint is empty, normally ollama will send to 11434, but we want it to fail - the user should type it in
	if (!endpoint) throw new Error(`Ollama Endpoint was empty (please enter ${defaultProviderSettings.ollama.endpoint} in Void if you want the default url).`)
	const ollama = new Ollama({ host: endpoint })
	return ollama
}

const ollamaList = async ({ onSuccess: onSuccess_, onError: onError_, settingsOfProvider }: ListParams_Internal<OllamaModelResponse>) => {
	const onSuccess = ({ models }: { models: OllamaModelResponse[] }) => {
		onSuccess_({ models })
	}
	const onError = ({ error }: { error: string }) => {
		onError_({ error })
	}
	try {
		const thisConfig = settingsOfProvider.ollama
		const ollama = newOllamaSDK({ endpoint: thisConfig.endpoint })
		ollama.list()
			.then((response) => {
				const { models } = response
				onSuccess({ models })
			})
			.catch((error) => {
				onError({ error: error + '' })
			})
	}
	catch (error) {
		onError({ error: error + '' })
	}
}

const sendOllamaFIM = ({ messages, onFinalMessage, onError, settingsOfProvider, modelName, _setAborter }: SendFIMParams_Internal) => {
	const thisConfig = settingsOfProvider.ollama
	const ollama = newOllamaSDK({ endpoint: thisConfig.endpoint })

	let fullText = ''
	ollama.generate({
		model: modelName,
		prompt: messages.prefix,
		suffix: messages.suffix,
		options: {
			stop: messages.stopTokens,
			num_predict: 300, // max tokens
			// repeat_penalty: 1,
		},
		raw: true,
		stream: true, // stream is not necessary but lets us expose the
	})
		.then(async stream => {
			_setAborter(() => stream.abort())
			for await (const chunk of stream) {
				const newText = chunk.response
				fullText += newText
			}
			onFinalMessage({ fullText, fullReasoning: '', anthropicReasoning: null })
		})
		// when error/fail
		.catch((error) => {
			onError({ message: error + '', fullError: error })
		})
}

// ---------------- GEMINI NATIVE IMPLEMENTATION ----------------

const toGeminiFunctionDecl = (toolInfo: InternalToolInfo) => {
	const { name, description, params } = toolInfo
	return {
		name,
		description,
		parameters: {
			type: Type.OBJECT,
			properties: Object.entries(params).reduce((acc, [key, value]) => {
				acc[key] = {
					type: Type.STRING,
					description: value.description
				};
				return acc;
			}, {} as Record<string, Schema>)
		}
	} satisfies FunctionDeclaration
}

const geminiTools = (chatMode: ChatMode | null, mcpTools: InternalToolInfo[] | undefined): GeminiTool[] | null => {
	const allowedTools = availableTools(chatMode, mcpTools)
	if (!allowedTools || Object.keys(allowedTools).length === 0) return null
	const functionDecls: FunctionDeclaration[] = []
	for (const t in allowedTools ?? {}) {
		functionDecls.push(toGeminiFunctionDecl(allowedTools[t]))
	}
	const tools: GeminiTool = { functionDeclarations: functionDecls, }
	return [tools]
}



// Implementation for Gemini using Google's native API
const sendGeminiChat = async ({
	messages,
	separateSystemMessage,
	onText,
	onFinalMessage,
	onError,
	settingsOfProvider,
	overridesOfModel,
	modelName: modelName_,
	_setAborter,
	providerName,
	modelSelectionOptions,
	chatMode,
	mcpTools,
}: SendChatParams_Internal) => {

	if (providerName !== 'gemini') throw new Error(`Sending Gemini chat, but provider was ${providerName}`)

	const thisConfig = settingsOfProvider[providerName]

	const {
		modelName,
		specialToolFormat,
		// reasoningCapabilities,
	} = getModelCapabilities(providerName, modelName_, overridesOfModel)

	// const { providerReasoningIOSettings } = getProviderCapabilities(providerName)

	// reasoning
	// const { canIOReasoning, openSourceThinkTags, } = reasoningCapabilities || {}
	const reasoningInfo = getSendableReasoningInfo('Chat', providerName, modelName_, modelSelectionOptions, overridesOfModel) // user's modelName_ here
	// const includeInPayload = providerReasoningIOSettings?.input?.includeInPayload?.(reasoningInfo) || {}

	const thinkingConfig: ThinkingConfig | undefined = !reasoningInfo?.isReasoningEnabled ? undefined
		: reasoningInfo.type === 'budget_slider_value' ?
			{ thinkingBudget: reasoningInfo.reasoningBudget }
			: undefined

	// tools
	const potentialTools = geminiTools(chatMode, mcpTools)
	const toolConfig = potentialTools && specialToolFormat === 'gemini-style' ?
		potentialTools
		: undefined

	// instance
	const genAI = new GoogleGenAI({ apiKey: getApiKey(providerName, thisConfig.apiKey) || '' });


	// manually parse out tool results if XML
	if (!specialToolFormat) {
		const { newOnText, newOnFinalMessage } = extractXMLToolsWrapper(onText, onFinalMessage, chatMode, mcpTools)
		onText = newOnText
		onFinalMessage = newOnFinalMessage
	}

	// when receive text
	let fullReasoningSoFar = ''
	let fullTextSoFar = ''

	let toolName = ''
	let toolParamsStr = ''
	let toolId = ''


	genAI.models.generateContentStream({
		model: modelName,
		config: {
			systemInstruction: separateSystemMessage,
			thinkingConfig: thinkingConfig,
			tools: toolConfig,
		},
		contents: messages as GeminiLLMChatMessage[],
	})
		.then(async (stream) => {
			_setAborter(() => { stream.return(fullTextSoFar); });

			// Process the stream
			for await (const chunk of stream) {
				// message
				const newText = chunk.text ?? ''
				fullTextSoFar += newText

				// tool call
				const functionCalls = chunk.functionCalls
				if (functionCalls && functionCalls.length > 0) {
					const functionCall = functionCalls[0] // Get the first function call
					toolName = functionCall.name ?? ''
					toolParamsStr = JSON.stringify(functionCall.args ?? {})
					toolId = functionCall.id ?? ''
				}

				// (do not handle reasoning yet)

				// call onText
				onText({
					fullText: fullTextSoFar,
					fullReasoning: fullReasoningSoFar,
					toolCall: !toolName ? undefined : { name: toolName, rawParams: {}, isDone: false, doneParams: [], id: toolId },
				})
			}

			// on final
			if (!fullTextSoFar && !fullReasoningSoFar && !toolName) {
				onError({ message: 'Void: Response from model was empty.', fullError: null })
			} else {
				if (!toolId) toolId = generateUuid() // ids are empty, but other providers might expect an id
				const toolCall = rawToolCallObjOfParamsStr(toolName, toolParamsStr, toolId)
				const toolCallObj = toolCall ? { toolCall } : {}
				onFinalMessage({ fullText: fullTextSoFar, fullReasoning: fullReasoningSoFar, anthropicReasoning: null, ...toolCallObj });
			}
		})
		.catch(error => {
			const message = error?.message
			if (typeof message === 'string') {

				if (error.message?.includes('API key')) {
					onError({ message: invalidApiKeyMessage(providerName), fullError: error });
				}
				else if (error?.message?.includes('429')) {
					onError({ message: 'Rate limit reached. ' + error, fullError: error });
				}
				else
					onError({ message: error + '', fullError: error });
			}
			else {
				onError({ message: error + '', fullError: error });
			}
		})
};



// --------- DIVISION API ---------

// Flow MD file management: save each flow's result as a structured MD document
const FLOW_ROLE_TO_FILENAME: Record<string, string> = {
	'leader': 'LEADER.md',
	'coder': 'CODER.md',
	'coding': 'CODER.md',
	'design': 'DESIGNER.md',
	'designer': 'DESIGNER.md',
	'search': 'SEARCH.md',
	'searcher': 'SEARCH.md',
	'file-search': 'FILE-SEARCH.md',
	'filesearch': 'FILE-SEARCH.md',
	'file_search': 'FILE-SEARCH.md',
	'file-searcher': 'FILE-SEARCH.md',
	'filesearcher': 'FILE-SEARCH.md',
	'research': 'RESEARCH.md',
	'researcher': 'RESEARCH.md',
	'deep-research': 'RESEARCH.md',
	'deep-researcher': 'RESEARCH.md',
	'review': 'REVIEW.md',
	'reviewer': 'REVIEW.md',
	'writing': 'WRITING.md',
	'writer': 'WRITING.md',
	'planning': 'PLANNING.md',
	'planner': 'PLANNING.md',
	'ideaman': 'IDEAMAN.md',
	'image': 'IMAGE.md',
};

const saveFlowResultAsMd = (
	workspaceFolderPath: string,
	role: string,
	_title: string,
	content: string,
	_sessionId: string,
	append: boolean = false,
): string | null => {
	const filename = FLOW_ROLE_TO_FILENAME[role.toLowerCase()];
	if (!filename || !workspaceFolderPath) return null;

	const divisionDir = path.join(workspaceFolderPath, '.division');
	const filePath = path.join(divisionDir, filename);

	try {
		fs.mkdirSync(divisionDir, { recursive: true });
		if (append && fs.existsSync(filePath)) {
			const existing = fs.readFileSync(filePath, 'utf-8');
			fs.writeFileSync(filePath, existing + '\n\n---\n\n' + content, 'utf-8');
		} else {
			fs.writeFileSync(filePath, content, 'utf-8');
		}
		return filePath;
	} catch (_e) {
		return null;
	}
};

// role に対応する .division/*.md の出力先情報。ファイルを生成しない role
// (leader 自身など、FLOW_ROLE_TO_FILENAME に無い role) の場合は null。
const buildMdFileInfo = (workspaceFolderPath: string, role: string): { mdFileName: string; mdFilePath: string } | null => {
	const filename = FLOW_ROLE_TO_FILENAME[role.toLowerCase()];
	if (!filename) return null;
	return { mdFileName: filename, mdFilePath: path.join(workspaceFolderPath, '.division', filename) };
};

// 承認モード ("各 MD ファイルで承認を得るモード") 用の一時停止状態。
// フローが一時停止するたびに `.division/.orchestration-state.json` に
// 書き出し、ユーザーが承認 (approveOrchestration IPC) すると `approved: true`
// になった状態で次回の sendDivisionAPIChat 呼び出しから読み直され、
// 続き (nextIndex / reviewer) から再開する。
type OrchestrationTaskLike = {
	taskId: string;
	role: string;
	title: string;
	input?: string;
	output?: string;
	provider?: string;
	dependsOn?: string[];
	description?: string;
	reason?: string;
	mode?: string;
};
type OrchestrationTaskOutput = {
	role: string;
	title: string;
	output: string;
	mdFileName?: string;
	mdFilePath?: string;
};
type OrchestrationState = {
	approved: boolean;
	workspaceFolderPath: string;
	sessionId: string;
	currentInput: string;
	tasks: OrchestrationTaskLike[];
	taskOutputs: OrchestrationTaskOutput[];
	nextIndex: number;
	totalSteps: number;
	reviewerDone: boolean;
	editedOutputs?: Array<{ mdFileName: string; mdContent: string }>;
};

const orchestrationStatePath = (workspaceFolderPath: string): string =>
	path.join(workspaceFolderPath, '.division', '.orchestration-state.json');

const readOrchestrationState = (workspaceFolderPath: string): OrchestrationState | null => {
	try {
		const p = orchestrationStatePath(workspaceFolderPath);
		if (!fs.existsSync(p)) return null;
		return JSON.parse(fs.readFileSync(p, 'utf-8')) as OrchestrationState;
	} catch (_e) {
		return null;
	}
};

const writeOrchestrationState = (workspaceFolderPath: string, state: OrchestrationState): void => {
	try {
		const dir = path.join(workspaceFolderPath, '.division');
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(orchestrationStatePath(workspaceFolderPath), JSON.stringify(state, null, 2), 'utf-8');
	} catch (_e) { /* ignore */ }
};

// フロー完了 (Reviewer 完了 or 却下) 時に一時停止状態を掃除する。
const clearOrchestrationState = (workspaceFolderPath: string): void => {
	try {
		const p = orchestrationStatePath(workspaceFolderPath);
		if (fs.existsSync(p)) fs.unlinkSync(p);
	} catch (_e) { /* ignore */ }
};



// Auto file create/edit: extract code blocks from AI output
// For NEW files: creates them via fs (directories need creation)
// For EDIT operations (SEARCH/REPLACE): returns FileOperationItem for renderer to apply via editCodeService
// For commands (bash/terminal): returns CommandOperationItem for renderer to execute
// SEARCH/REPLACE 区切り行を全バリアントに対応した正規表現で検出する。
//
// 検出対象 (1 行で1ペア):
//   開始: <<<SEARCH | <<<<<<< SEARCH | <<<<<<< ORIGINAL  (山括弧 3 個以上)
//   区切: === | ======= | =====... (= が 3 個以上)
//   終端: >>>REPLACE | >>>>>>> REPLACE | >>>>>>> UPDATED (山括弧 3 個以上)
//
// 行末に余白があってもよい。 ラベル後に余白や追加文字があっても良い (`<<<<<<< SEARCH foo.ts` 等)
// にゆるやかに対応するため、ラベルだけマッチさせ後ろは行末まで許容する。
const SEARCH_REPLACE_PAIR_RE = /^[ \t]*<{3,}[ \t]*(?:SEARCH|ORIGINAL)\b[^\n]*\n([\s\S]*?)^[ \t]*={3,}[ \t]*\n([\s\S]*?)^[ \t]*>{3,}[ \t]*(?:REPLACE|UPDATED)\b[^\n]*$/gm;

// SEARCH/REPLACE マーカーが少なくとも 1 ペア含まれているかの軽量判定。
const hasSearchReplaceBlocks = (code: string): boolean => {
	SEARCH_REPLACE_PAIR_RE.lastIndex = 0;
	const found = SEARCH_REPLACE_PAIR_RE.test(code);
	SEARCH_REPLACE_PAIR_RE.lastIndex = 0;
	return found;
};

// 任意の SEARCH/REPLACE バリアントを editCodeService が期待する標準フォーマット
// (<<<<<<< ORIGINAL / ======= / >>>>>>> UPDATED) に正規化する。
// 連続した複数ペアもまとめて処理する。
const normalizeSearchReplaceToEditorFormat = (code: string): string => {
	SEARCH_REPLACE_PAIR_RE.lastIndex = 0;
	return code.replace(SEARCH_REPLACE_PAIR_RE, (_match, orig: string, repl: string) => {
		// 末尾の余分な改行は trimEnd で 1 つに整える
		const origTrimmed = orig.replace(/\n+$/, '');
		const replTrimmed = repl.replace(/\n+$/, '');
		return `<<<<<<< ORIGINAL\n${origTrimmed}\n=======\n${replTrimmed}\n>>>>>>> UPDATED`;
	});
};

const saveCodeBlocksFromOutput = (output: string, _sessionId: string, workspaceFolderPath?: string): { savedFiles: { filePath: string; language: string; action: 'created' | 'updated' }[]; fileOperations: FileOperationItem[]; commands: CommandOperationItem[] } => {
	const savedFiles: { filePath: string; language: string; action: 'created' | 'updated' }[] = [];
	const fileOperations: FileOperationItem[] = [];
	const commands: CommandOperationItem[] = [];

	// Match code blocks with file path annotations:
	// ```language:path/to/file.ext  OR  ```language // path/to/file.ext
	const codeBlockRegex = /```(\w+)(?::([^\n]+)|\s*\/\/\s*([^\n]+))?\n([\s\S]*?)```/g;
	let match;

	// Use workspace folder path if available, fallback to cwd
	const workspaceRoot = workspaceFolderPath || process.cwd();

	while ((match = codeBlockRegex.exec(output)) !== null) {
		const language = match[1];
		const rawFilePath = (match[2] || match[3] || '').trim();
		const code = match[4];

		if (!code) continue;

		// Handle terminal commands
		if (['bash', 'sh', 'shell', 'terminal', 'cmd'].includes(language.toLowerCase()) && !rawFilePath) {
			const cleanCommand = code.trim();
			if (cleanCommand) {
				commands.push({ command: cleanCommand });
			}
			continue;
		}

		if (!rawFilePath) continue;

		try {
			// Resolve path: if absolute, use as-is; if relative, resolve from workspace root
			const fullPath = path.isAbsolute(rawFilePath)
				? rawFilePath
				: path.join(workspaceRoot, rawFilePath);

			// Security: ensure path is under workspace root
			if (!fullPath.startsWith(workspaceRoot)) {
				continue;
			}

			// SEARCH/REPLACE バリアントを検出 (Division 独自 / Aider 標準 / Void 標準 全部)
			if (hasSearchReplaceBlocks(code) && fs.existsSync(fullPath)) {
				// EDIT MODE: send search/replace blocks to renderer for editor-integrated editing
				// 全バリアント (`<<<SEARCH/===/>>>REPLACE`, `<<<<<<< SEARCH/=======/>>>>>>> REPLACE`,
				// `<<<<<<< ORIGINAL/=======/>>>>>>> UPDATED`) を editor 標準形式に正規化する。
				const editorFormattedBlocks = normalizeSearchReplaceToEditorFormat(code);

				fileOperations.push({
					filePath: fullPath,
					language,
					action: 'edit',
					searchReplaceBlocks: editorFormattedBlocks,
				});
				savedFiles.push({ filePath: fullPath, language, action: 'updated' });
			} else {
				// CREATE/OVERWRITE MODE: we do NOT write the file via fs here anymore.
				// Instead, the renderer will apply the content via editCodeService.instantlyRewriteFile
				// so the change is tracked as a diffZone (shows up in the "変更されたファイル" bar,
				// and respects the autoAcceptLLMChanges setting).
				const existed = fs.existsSync(fullPath);

				fileOperations.push({
					filePath: fullPath,
					language,
					action: 'create',
					content: code,
				});
				savedFiles.push({ filePath: fullPath, language, action: existed ? 'updated' : 'created' });
			}
		} catch (_e) { /* ignore write errors */ }
	}

	// =============================================================================
	// 第 2 パス: フェンスで囲まれていない (= ```lang:path で wrap されていない) SEARCH/REPLACE
	// ブロックを救済する。 モデルが命令を守らず、生 SEARCH/REPLACE をテキスト中に出した
	// 場合でもコード変更を反映できるようにする。 直前 6 行以内に「ファイルパスらしき行」
	// が出現していればそのファイルへの edit と判定する。
	//
	// 対応するファイルパス書式:
	//   - `### path/to/foo.ts` (markdown 見出し)
	//   - `**path/to/foo.ts**` (bold)
	//   - `path/to/foo.ts:` (行末コロン)
	//   - `「path/to/foo.ts」` / 「`path/to/foo.ts`」 等 (バッククォート)
	//   - 単純に `path/to/foo.ts` 単体
	//
	// 既に第 1 パスで処理した範囲とのバッティングを避けるため、フェンス内に含まれる
	// SEARCH/REPLACE はここではスキップする (フェンス範囲を別途記憶しておく)。
	// =============================================================================
	{
		// フェンスで囲まれた範囲 [start, end) のリストを作る
		const fenceRanges: { start: number; end: number }[] = [];
		const fenceRe = /```[\s\S]*?```/g;
		let fm: RegExpExecArray | null;
		while ((fm = fenceRe.exec(output)) !== null) {
			fenceRanges.push({ start: fm.index, end: fm.index + fm[0].length });
		}
		const insideFence = (idx: number) => fenceRanges.some(r => idx >= r.start && idx < r.end);

		// ファイルパス推定用の正規表現。 拡張子付きの相対 / 絶対パスらしきものを抽出する。
		// 1 文字以上のディレクトリ + ファイル名 + ピリオド + 拡張子 (英数 1-6 文字) の連続。
		const FILE_PATH_LIKE = /(?:[\w@.\-]+\/)*[\w@.\-]+\.[A-Za-z0-9]{1,8}/;
		const extractFilePath = (line: string): string | null => {
			const trimmed = line.trim();
			if (!trimmed) return null;
			// `### foo.ts` / `**foo.ts**` / `\`foo.ts\`` / `foo.ts:` / `「foo.ts」` 等
			const cleaned = trimmed
				.replace(/^#{1,6}\s+/, '')
				.replace(/^[*_]{1,3}|[*_]{1,3}$/g, '')
				.replace(/^[`「『"']|[`」』"':]\s*$/g, '')
				.trim();
			const m = cleaned.match(FILE_PATH_LIKE);
			if (!m) return null;
			// 行が「ファイルパスっぽい何か」だけで構成されているか、ごく短いコンテキストかを軽く判定。
			// 長い文章中にたまたま foo.ts が出てきたケースを誤検出しないため、抽出した文字列の長さが
			// 行 cleaned 全体の半分以上を占める場合のみ採用する。
			if (m[0].length * 2 < cleaned.length) return null;
			return m[0];
		};

		// 既に第 1 パスで採用した filePath 集合 (重複登録防止)
		const alreadyHandled = new Set<string>(fileOperations.filter(o => o.action === 'edit').map(o => o.filePath));

		// 全文走査して SEARCH/REPLACE ペアを検出
		SEARCH_REPLACE_PAIR_RE.lastIndex = 0;
		let pm: RegExpExecArray | null;
		while ((pm = SEARCH_REPLACE_PAIR_RE.exec(output)) !== null) {
			const matchStart = pm.index;
			if (insideFence(matchStart)) continue;

			// 直前 6 行を遡ってファイルパスを探す
			const prefix = output.slice(0, matchStart);
			const linesBefore = prefix.split('\n');
			let foundPath: string | null = null;
			for (let i = linesBefore.length - 1; i >= 0 && i > linesBefore.length - 1 - 6; i--) {
				foundPath = extractFilePath(linesBefore[i]);
				if (foundPath) break;
			}
			if (!foundPath) continue;

			try {
				const fullPath = path.isAbsolute(foundPath)
					? foundPath
					: path.join(workspaceRoot, foundPath);
				if (!fullPath.startsWith(workspaceRoot)) continue;
				if (!fs.existsSync(fullPath)) continue;
				if (alreadyHandled.has(fullPath)) continue;

				// マッチしたペア部分だけを正規化して送る (周辺の散文は不要)
				const pairText = pm[0];
				const editorFormattedBlocks = normalizeSearchReplaceToEditorFormat(pairText);
				const ext = path.extname(fullPath).slice(1).toLowerCase() || 'plaintext';

				fileOperations.push({
					filePath: fullPath,
					language: ext,
					action: 'edit',
					searchReplaceBlocks: editorFormattedBlocks,
				});
				savedFiles.push({ filePath: fullPath, language: ext, action: 'updated' });
				alreadyHandled.add(fullPath);
			} catch (_e) { /* skip on any path / fs issue */ }
		}
		SEARCH_REPLACE_PAIR_RE.lastIndex = 0;
	}

	return { savedFiles, fileOperations, commands };
};




const callDivisionGenerateStream = async (
	endpointBase: string,
	divisionModelName: string,
	input: string,
	signal: AbortSignal,
	onChunk: (text: string) => void,
	mode?: string,
	divisionApiKey?: string,
	sessionId?: string,
	workspacePath?: string,
): Promise<{ output: string; error?: string; provider?: string; durationMs?: number }> => {
	try {
		const apiKey = divisionApiKey || process.env.DIVISION_API_KEY || '';
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
		};
		if (apiKey) {
			headers['Authorization'] = `Bearer ${apiKey}`;
		}
		// `divisionModelName` は refreshModelService 経由で `<providerId>/<modelId>` 形式
		// (例: "anthropic/claude-opus-4-7") で渡ってくる。
		// Division API の `/api/generate/stream` は `provider` フィールドに **modelId**
		// (例: "claude-opus-4-7") をそのまま渡す仕様 (provider 名 "anthropic" を渡すと
		// 「Provider not found」で 404 になる)。 そのため "/" を含む場合は後ろ半分の
		// modelId のみを provider として送り、追加で `model` 互換フィールドにも同値を
		// 流し込む (将来 API 側で model フィールドをサポートしても整合性を保つため)。
		// "/" を含まない場合 (例: "division-orchestrator", 後方互換でモデル名のみ) は
		// そのまま単一値を provider として送る。
		let bodyProvider = divisionModelName
		let bodyModel: string | undefined = undefined
		const slashIdx = divisionModelName.indexOf('/')
		if (slashIdx > 0 && slashIdx < divisionModelName.length - 1) {
			bodyModel = divisionModelName.slice(slashIdx + 1)
			bodyProvider = bodyModel
		}

		const response = await fetch(`${endpointBase}/api/generate/stream`, {
			method: 'POST',
			headers,
			body: JSON.stringify({
				input,
				provider: bodyProvider,
				...(bodyModel ? { model: bodyModel } : {}),
				...(mode ? { mode } : {}),
				...(sessionId ? { sessionId } : {}),
				// Division APIがローカル実行時に file-searcher / coder でユーザーの
				// ワークスペースを走査するために必要。リモートAPI側は無視される。
				...(workspacePath ? { workspacePath } : {}),
			}),
			signal,
		});

		if (!response.ok) {
			const errorText = await response.text();
			return { output: '', error: `HTTP ${response.status}: ${errorText.substring(0, 300)}` };
		}

		const reader = response.body!.getReader();
		const decoder = new TextDecoder();
		let sseBuffer = '';
		let currentEvent = '';
		let fullOutput = '';
		let provider = '';
		let durationMs = 0;

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			sseBuffer += decoder.decode(value, { stream: true });
			const lines = sseBuffer.split('\n');
			sseBuffer = lines.pop() || '';

			for (const line of lines) {
				if (line.startsWith('event: ')) {
					currentEvent = line.slice(7).trim();
				} else if (line.startsWith('data: ')) {
					const rawData = line.slice(6);
					if (rawData) {
						try {
							const data = JSON.parse(rawData);
							switch (currentEvent) {
								case 'chunk':
								case 'text':
									if (data.text) {
										fullOutput += data.text;
										onChunk(data.text);
									}
									break;
								case 'done':
								case 'finish':
									if (data.output) fullOutput = data.output;
									if (data.provider) provider = data.provider;
									if (data.durationMs) durationMs = data.durationMs;
									break;
								case 'error':
									return { output: fullOutput, error: data.error || 'Stream error', provider, durationMs };
								default:
									if (data.text) {
										fullOutput += data.text;
										onChunk(data.text);
									}
									break;
							}
						} catch (_e) { /* skip malformed JSON */ }
					}
					currentEvent = '';
				} else if (line.trim() === '') {
					currentEvent = '';
				}
			}
		}

		return { output: fullOutput, provider, durationMs };
	} catch (e: any) {
		if (e?.name === 'AbortError') {
			return { output: '', error: 'Aborted' };
		}
		return { output: '', error: e?.message || String(e) };
	}
};

const callDivisionTaskCreate = async (
	endpointBase: string,
	projectId: string,
	input: string,
	signal: AbortSignal,
	divisionApiKey?: string,
	chatHistory?: { role: 'user' | 'assistant'; content: string }[],
	workspacePath?: string,
): Promise<{
	sessionId: string;
	tasks: { taskId: string; role: string; title: string; input?: string; output?: string; provider?: string; dependsOn?: string[]; description?: string; reason?: string; mode?: string }[];
	finalRole: string;
	error?: string;
}> => {
	try {
		const apiKey = divisionApiKey || process.env.DIVISION_API_KEY || '';
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
		};
		if (apiKey) {
			headers['Authorization'] = `Bearer ${apiKey}`;
		}
		const response = await fetch(`${endpointBase}/api/tasks/create`, {
			method: 'POST',
			headers,
			body: JSON.stringify({
				projectId,
				input,
				...(chatHistory && chatHistory.length > 0 ? { chatHistory } : {}),
				...(workspacePath ? { workspacePath } : {}),
			}),
			signal,
		});

		if (!response.ok) {
			const errorText = await response.text();
			return { sessionId: '', tasks: [], finalRole: '', error: `HTTP ${response.status}: ${errorText.substring(0, 300)}` };
		}

		const data = await response.json();
		return {
			sessionId: data.sessionId || '',
			tasks: data.tasks || [],
			finalRole: data.finalRole || 'coder',
			error: data.error,
		};
	} catch (e: any) {
		return { sessionId: '', tasks: [], finalRole: '', error: e?.message || String(e) };
	}
};

// POST /api/tasks/execute — execute a single role's task.
// Supports SSE streaming when the server sends `Content-Type: text/event-stream`.
// Falls back to parsing a JSON response body (`{ output }` or `{ task: { output } }`) otherwise.
const callDivisionTaskExecute = async (
	endpointBase: string,
	projectId: string,
	roleSlug: string,
	input: string,
	signal: AbortSignal,
	onChunk: (text: string) => void,
	divisionApiKey?: string,
	sessionId?: string,
	chatHistory?: { role: 'user' | 'assistant'; content: string }[],
	workspacePath?: string,
): Promise<{ output: string; error?: string; provider?: string; durationMs?: number }> => {
	try {
		const apiKey = divisionApiKey || process.env.DIVISION_API_KEY || '';
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
			'Accept': 'text/event-stream, application/json',
		};
		if (apiKey) {
			headers['Authorization'] = `Bearer ${apiKey}`;
		}
		const response = await fetch(`${endpointBase}/api/tasks/execute`, {
			method: 'POST',
			headers,
			body: JSON.stringify({
				projectId,
				roleSlug,
				input,
				stream: true,
				...(sessionId ? { sessionId } : {}),
				...(chatHistory && chatHistory.length > 0 ? { chatHistory } : {}),
				...(workspacePath ? { workspacePath } : {}),
			}),
			signal,
		});

		if (!response.ok) {
			const errorText = await response.text();
			return { output: '', error: `HTTP ${response.status}: ${errorText.substring(0, 300)}` };
		}

		const contentType = (response.headers.get('content-type') || '').toLowerCase();

		// Non-SSE JSON response: extract output directly
		if (!contentType.includes('text/event-stream')) {
			const data = await response.json().catch(() => null) as any;
			const out = (data && (data.output || data?.task?.output || data?.result)) || '';
			if (out) onChunk(out);
			return {
				output: out,
				provider: data?.provider || '',
				durationMs: data?.durationMs || 0,
				error: data?.error,
			};
		}

		// SSE streaming response: mirror callDivisionGenerateStream parsing
		const reader = response.body!.getReader();
		const decoder = new TextDecoder();
		let sseBuffer = '';
		let currentEvent = '';
		let fullOutput = '';
		let provider = '';
		let durationMs = 0;

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			sseBuffer += decoder.decode(value, { stream: true });
			const lines = sseBuffer.split('\n');
			sseBuffer = lines.pop() || '';

			for (const line of lines) {
				if (line.startsWith('event: ')) {
					currentEvent = line.slice(7).trim();
				} else if (line.startsWith('data: ')) {
					const rawData = line.slice(6);
					if (rawData) {
						try {
							const data = JSON.parse(rawData);
							switch (currentEvent) {
								case 'chunk':
								case 'text':
									if (data.text) {
										fullOutput += data.text;
										onChunk(data.text);
									}
									break;
								case 'done':
								case 'finish':
									if (data.output) fullOutput = data.output;
									if (data.provider) provider = data.provider;
									if (data.durationMs) durationMs = data.durationMs;
									break;
								case 'error':
									return { output: fullOutput, error: data.error || 'Stream error', provider, durationMs };
								default:
									if (data.text) {
										fullOutput += data.text;
										onChunk(data.text);
									}
									break;
							}
						} catch (_e) { /* skip malformed JSON */ }
					}
					currentEvent = '';
				} else if (line.trim() === '') {
					currentEvent = '';
				}
			}
		}

		return { output: fullOutput, provider, durationMs };
	} catch (e: any) {
		if (e?.name === 'AbortError') {
			return { output: '', error: 'Aborted' };
		}
		return { output: '', error: e?.message || String(e) };
	}
};

// Local file search: scan the workspace and return matching files with their contents.
// Used to enrich the file-search task output with actual file contents from the user's workspace.
//
// `.division` は Orchestra が Division API の中間成果物 (*.md / DESIGNER.md) を
// 書き出す作業フォルダなので、file-searcher が本体プロジェクトのファイルではなく
// 自分が書いた中間 MD を読み込んでしまうのを防ぐため常に除外する。
const IGNORED_DIRS = new Set([
	'node_modules', '.git', '.next', 'dist', 'build', 'out', '.cache',
	'.turbo', '.vercel', '.nuxt', 'coverage', '__pycache__', '.venv', 'venv',
	'.idea', '.vscode', '.DS_Store', 'target', '.gradle', '.division',
]);
const TEXT_EXTENSIONS = new Set([
	'.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.md', '.mdx',
	'.html', '.css', '.scss', '.sass', '.less', '.vue', '.svelte',
	'.py', '.rb', '.go', '.rs', '.java', '.kt', '.swift', '.dart',
	'.c', '.cpp', '.h', '.hpp', '.cs', '.php', '.sh', '.bash', '.zsh',
	'.yml', '.yaml', '.toml', '.xml', '.txt', '.env', '.sql', '.graphql',
]);
// file-search はワークスペース全体の事前読み込みを担う。後続エージェント
// （search / research / design / planner / coder ...）に「とにかく全部見せる」
// ことが価値なので、ファイル数とトータル文字数の予算を大きく確保する。
// 走査範囲は `.divisionignore` と IGNORED_DIRS / TEXT_EXTENSIONS で絞り、
// ノイズ的なバイナリ・ビルド成果物は除外する。
const MAX_SEARCH_FILES = 400;
const MAX_FILE_SIZE_BYTES = 100 * 1024; // 100KB
const MAX_TOTAL_OUTPUT_CHARS = 180000;

// .divisionignore 読込み & マッチャ
//
// gitignore ライクな簡易セマンティクスで file-searcher の走査対象から特定ファイル/
// ディレクトリを除外する。サポートする記法:
//   - `#` 始まりはコメント、空行は無視
//   - `dir/`         → そのディレクトリ以下すべて除外
//   - `*.md`         → basename の glob マッチ（任意の階層）
//   - `path/to/x`    → ワークスペースルートからの相対パスに完全一致 or プレフィックス一致
//   - `name`         → basename が `name` のファイル/ディレクトリを任意の階層で除外
type DivisionIgnoreMatcher = (relativePath: string, isDirectory: boolean) => boolean;

const globToRegExp = (pattern: string): RegExp => {
	let re = '';
	for (let i = 0; i < pattern.length; i++) {
		const c = pattern[i];
		if (c === '*') {
			if (pattern[i + 1] === '*') { re += '.*'; i++; } else { re += '[^/]*'; }
		} else if (c === '?') {
			re += '[^/]';
		} else if (/[.+^${}()|[\]\\]/.test(c)) {
			re += '\\' + c;
		} else {
			re += c;
		}
	}
	return new RegExp('^' + re + '$');
};

const loadDivisionIgnore = (workspaceFolderPath: string): DivisionIgnoreMatcher => {
	const ignoreFilePath = path.join(workspaceFolderPath, '.divisionignore');
	let lines: string[] = [];
	try {
		if (fs.existsSync(ignoreFilePath)) {
			lines = fs.readFileSync(ignoreFilePath, 'utf-8').split(/\r?\n/);
		}
	} catch (_e) { /* no ignore file */ }

	const dirPrefixes: string[] = [];          // `dir/` → ignore everything under it
	const exactRelativePaths: string[] = [];   // `path/to/x` with a slash
	const basenameExact = new Set<string>();   // `name` (no slash, no glob)
	const basenameGlobs: RegExp[] = [];        // `*.md` etc (no slash, has glob char)

	for (const raw of lines) {
		const line = raw.trim();
		if (!line || line.startsWith('#')) continue;
		if (line.endsWith('/')) {
			dirPrefixes.push(line.slice(0, -1).replace(/^\.\//, ''));
		} else if (line.includes('/')) {
			exactRelativePaths.push(line.replace(/^\.\//, ''));
		} else if (/[*?\[]/.test(line)) {
			basenameGlobs.push(globToRegExp(line));
		} else {
			basenameExact.add(line);
		}
	}

	if (dirPrefixes.length === 0 && exactRelativePaths.length === 0 && basenameExact.size === 0 && basenameGlobs.length === 0) {
		return () => false;
	}

	return (relativePath: string, isDirectory: boolean): boolean => {
		const normalized = relativePath.replace(/\\/g, '/');
		const basename = normalized.split('/').pop() || '';
		if (basenameExact.has(basename)) return true;
		for (const re of basenameGlobs) { if (re.test(basename)) return true; }
		for (const prefix of dirPrefixes) {
			if (normalized === prefix) return true;
			if (normalized.startsWith(prefix + '/')) return true;
		}
		for (const exact of exactRelativePaths) {
			if (normalized === exact) return true;
			if (isDirectory && normalized.startsWith(exact + '/')) return true;
		}
		return false;
	};
};

// 日本語 → 英語の簡易シノニムマップ。
// ユーザーが日本語で「ダッシュボード」と書いたときに、ファイル名に現れる
// `dashboard.tsx` 等にヒットさせるために使う。網羅性より再現率重視で足していく。
const JP_EN_SYNONYMS: Record<string, string[]> = {
	'ダッシュボード': ['dashboard'],
	'ログイン': ['login', 'signin', 'auth'],
	'ログアウト': ['logout', 'signout'],
	'サインアップ': ['signup', 'register'],
	'認証': ['auth', 'authentication'],
	'画面': ['page', 'screen', 'view'],
	'ページ': ['page'],
	'ホーム': ['home', 'index'],
	'設定': ['settings', 'config', 'preferences'],
	'ユーザー': ['user'],
	'プロフィール': ['profile'],
	'ボタン': ['button', 'btn'],
	'カード': ['card'],
	'モーダル': ['modal', 'dialog'],
	'リスト': ['list'],
	'テーブル': ['table'],
	'フォーム': ['form'],
	'入力': ['input'],
	'検索': ['search'],
	'ナビゲーション': ['nav', 'navigation', 'navbar'],
	'ヘッダー': ['header'],
	'フッター': ['footer'],
	'サイドバー': ['sidebar'],
	'ルーター': ['router', 'route'],
	'ルーティング': ['router', 'routing', 'route'],
	'状態': ['state', 'store'],
	'ストア': ['store'],
	'スタイル': ['style', 'styles', 'css'],
	'テーマ': ['theme'],
	'エラー': ['error'],
	'通知': ['notification', 'toast'],
	'決済': ['payment', 'checkout', 'stripe'],
	'支払': ['payment', 'checkout'],
	'課金': ['billing', 'payment', 'stripe', 'subscription'],
	'サブスク': ['subscription', 'stripe'],
	'サブスクリプション': ['subscription', 'stripe'],
	'チャット': ['chat', 'message'],
	'メッセージ': ['message', 'chat'],
	'エージェント': ['agent'],
	'レビュー': ['review', 'reviewer'],
	'リーダー': ['leader'],
	'コーダー': ['coder'],
	'プランナー': ['planner'],
	'デザイナー': ['designer', 'design'],
	'アイデア': ['idea', 'ideaman'],
	'プロジェクト': ['project'],
	'ワークスペース': ['workspace'],
	'タスク': ['task'],
	'プロバイダ': ['provider'],
	'プロバイダー': ['provider'],
	'モデル': ['model'],
	'ロール': ['role'],
	'フロー': ['flow'],
	'アセット': ['asset', 'assets'],
	'画像': ['image', 'img'],
	'アイコン': ['icon'],
};

const extractKeywordsFromQuery = (query: string): string[] => {
	const lowered = query.toLowerCase();
	const tokens = lowered.match(/[a-z0-9_\-./]+|[\u3040-\u30ff\u4e00-\u9fff]+/g) || [];
	const stopWords = new Set([
		'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with',
		'is', 'are', 'was', 'were', 'be', 'been', 'this', 'that', 'these',
		'find', 'search', 'look', 'show', 'list', 'file', 'files', 'about',
		'を', 'は', 'が', 'の', 'に', 'で', 'と', 'から', 'まで', 'して', 'する',
		'ファイル', '検索', '探して', '読み込んで', '読んで', '一覧',
	]);
	const base = tokens.filter(t => t.length >= 2 && !stopWords.has(t));
	const expanded = new Set<string>(base);
	// 日本語トークンに対応する英単語を追加（ファイル名が英語になりやすいため）
	for (const t of base) {
		const syns = JP_EN_SYNONYMS[t];
		if (syns) {
			for (const s of syns) expanded.add(s);
		}
		// 全角カタカナ/ひらがな単体を小文字英字に写像するのは困難なので、
		// マップに無い日本語語はそのまま残す（content-search 側でヒットする可能性）
	}
	return Array.from(expanded);
};

const walkDirectory = (
	dir: string,
	root: string,
	results: string[],
	maxFiles: number,
	ignoreMatcher?: DivisionIgnoreMatcher,
): void => {
	if (results.length >= maxFiles) return;
	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch (_e) {
		return;
	}
	for (const entry of entries) {
		if (results.length >= maxFiles) return;
		if (entry.name.startsWith('.') && entry.name !== '.env' && entry.name !== '.gitignore') {
			if (IGNORED_DIRS.has(entry.name)) continue;
		}
		if (IGNORED_DIRS.has(entry.name)) continue;
		const full = path.join(dir, entry.name);
		const relative = path.relative(root, full).replace(/\\/g, '/');
		if (ignoreMatcher && ignoreMatcher(relative, entry.isDirectory())) continue;
		if (entry.isDirectory()) {
			walkDirectory(full, root, results, maxFiles, ignoreMatcher);
		} else if (entry.isFile()) {
			const ext = path.extname(entry.name).toLowerCase();
			if (TEXT_EXTENSIONS.has(ext) || entry.name === 'package.json' || entry.name === 'README.md') {
				results.push(full);
			}
		}
	}
};

// プロジェクトのベースライン文脈として、キーワードヒットの有無に関わらず
// 常に AI に渡したい「マニフェスト/エントリ」候補。
// 存在するものだけを拾い、上から順に優先して入れる。
const BASELINE_FILE_CANDIDATES: string[] = [
	// JavaScript / TypeScript
	'package.json', 'tsconfig.json', 'next.config.js', 'next.config.mjs', 'next.config.ts',
	'vite.config.ts', 'vite.config.js', 'tailwind.config.ts', 'tailwind.config.js',
	'nuxt.config.ts', 'svelte.config.js', 'astro.config.mjs',
	// Flutter / Dart
	'pubspec.yaml', 'analysis_options.yaml',
	// Python
	'pyproject.toml', 'requirements.txt', 'setup.py', 'poetry.lock',
	// Rust / Go
	'Cargo.toml', 'go.mod',
	// JVM
	'build.gradle', 'build.gradle.kts', 'pom.xml', 'settings.gradle',
	// PHP / Ruby
	'composer.json', 'Gemfile',
	// Meta
	'README.md', 'README', 'AGENTS.md',
	'.env.example', '.env.local.example',
	// Entry points (best-effort; may or may not exist)
	'src/main.ts', 'src/main.tsx', 'src/index.ts', 'src/index.tsx', 'src/App.tsx',
	'src/main.dart', 'lib/main.dart',
	'app/page.tsx', 'app/layout.tsx', 'pages/index.tsx',
	'main.py', 'app.py',
];

// ディレクトリツリー（上位 maxEntries 件）を整形して返す。
// 「すべてのフォルダやファイルを後続エージェントに見せる」のが file-search の責務なので、
// 既定値はかなり大きめにし、本当に巨大なワークスペースのときだけ省略する。
const buildDirectoryTree = (files: string[], workspaceFolderPath: string, maxEntries = 2000): string => {
	const sorted = files
		.map(f => path.relative(workspaceFolderPath, f).replace(/\\/g, '/'))
		.sort();
	const picked = sorted.slice(0, maxEntries);
	const truncated = sorted.length > picked.length
		? `\n... 他 ${sorted.length - picked.length} ファイル（省略）`
		: '';
	return picked.map(p => `- ${p}`).join('\n') + truncated;
};

const searchWorkspaceFiles = (
	workspaceFolderPath: string,
	query: string,
): { matches: { relativePath: string; content: string }[]; summary: string; tree: string } => {
	const allFiles: string[] = [];
	const ignoreMatcher = loadDivisionIgnore(workspaceFolderPath);
	walkDirectory(workspaceFolderPath, workspaceFolderPath, allFiles, 5000, ignoreMatcher);

	const keywords = extractKeywordsFromQuery(query);

	// 1) Baseline: 主要マニフェスト / エントリーポイントを最優先で含める
	const baselineFiles: string[] = [];
	const seen = new Set<string>();
	for (const candidate of BASELINE_FILE_CANDIDATES) {
		const full = path.join(workspaceFolderPath, candidate);
		try {
			const stat = fs.statSync(full);
			if (stat.isFile() && stat.size <= MAX_FILE_SIZE_BYTES) {
				if (!seen.has(full)) {
					baselineFiles.push(full);
					seen.add(full);
				}
			}
		} catch (_e) { /* not present */ }
	}

	// 2) Keyword score: パスとファイル名にキーワードが含まれるものを高優先度に
	const scored: { file: string; score: number }[] = [];
	for (const file of allFiles) {
		if (seen.has(file)) continue;
		const relative = path.relative(workspaceFolderPath, file).toLowerCase();
		let score = 0;
		for (const kw of keywords) {
			if (relative.includes(kw)) {
				score += relative.endsWith('/' + kw) || relative === kw ? 10 : 3;
			}
			const base = path.basename(relative);
			if (base.includes(kw)) score += 2;
		}
		// 浅いパス（ルート直下に近いほど）に小さなボーナスを付与し、重要なエントリ
		// （src/index.ts, app/page.tsx など）が後段の「全件取り込み」でも先頭側に来やすくする。
		const depth = relative.split('/').length;
		score += Math.max(0, 5 - depth);
		scored.push({ file, score });
	}
	scored.sort((a, b) => {
		if (b.score !== a.score) return b.score - a.score;
		// 同点なら相対パスのアルファベット順で安定化（再現性確保）
		return path.relative(workspaceFolderPath, a.file).localeCompare(path.relative(workspaceFolderPath, b.file));
	});

	// 3) Keyword content-fallback: パスにキーワードが無くても本文にヒットしたファイルを救済
	const keywordHitFiles: string[] = [];
	if (keywords.length > 0) {
		const contentScored: { file: string; score: number }[] = [];
		const candidatesForContent = allFiles.slice(0, 500);
		for (const file of candidatesForContent) {
			if (seen.has(file)) continue;
			try {
				const stat = fs.statSync(file);
				if (stat.size > MAX_FILE_SIZE_BYTES) continue;
				const content = fs.readFileSync(file, 'utf-8').toLowerCase();
				let score = 0;
				for (const kw of keywords) {
					const matches = content.split(kw).length - 1;
					if (matches > 0) score += matches;
				}
				if (score > 0) contentScored.push({ file, score });
			} catch (_e) { /* skip */ }
		}
		contentScored.sort((a, b) => b.score - a.score);
		for (const s of contentScored) keywordHitFiles.push(s.file);
	}

	// 4) Final ordering: baseline → score 上位 → 残り全件（パス順）
	//    ユーザー要求「すべてのフォルダやファイルを読み込んで」に応えるため、
	//    キーワード未一致のファイルも予算に余裕がある限り取り込む。
	const orderedFiles: string[] = [];
	const enqueue = (f: string) => {
		if (seen.has(f)) return;
		orderedFiles.push(f);
		seen.add(f);
	};
	for (const f of baselineFiles) enqueue(f);
	for (const s of scored) enqueue(s.file);
	for (const f of keywordHitFiles) enqueue(f);

	const matches: { relativePath: string; content: string }[] = [];
	let totalChars = 0;
	let truncatedDueToBudget = 0;
	for (const file of orderedFiles) {
		if (matches.length >= MAX_SEARCH_FILES) break;
		try {
			const stat = fs.statSync(file);
			if (stat.size > MAX_FILE_SIZE_BYTES) {
				truncatedDueToBudget++;
				continue;
			}
			const content = fs.readFileSync(file, 'utf-8');
			const relativePath = path.relative(workspaceFolderPath, file);
			if (totalChars + content.length > MAX_TOTAL_OUTPUT_CHARS) {
				const remaining = MAX_TOTAL_OUTPUT_CHARS - totalChars;
				if (remaining > 200) {
					matches.push({ relativePath, content: content.slice(0, remaining) + '\n... (truncated)' });
					totalChars = MAX_TOTAL_OUTPUT_CHARS;
				}
				truncatedDueToBudget++;
				break;
			}
			matches.push({ relativePath, content });
			totalChars += content.length;
		} catch (_e) { /* skip */ }
	}

	const tree = buildDirectoryTree(allFiles, workspaceFolderPath);

	const kwLabel = keywords.length > 0 ? keywords.join(', ') : '(全件モード)';
	const includedRatio = allFiles.length > 0
		? Math.round((matches.length / allFiles.length) * 100)
		: 0;
	const summary = matches.length === 0
		? `ワークスペースを走査しましたがテキスト系ファイルが見つかりませんでした。`
			+ `以下のディレクトリツリーを参考に、編集対象ファイルを判断してください。`
		: `${matches.length} / ${allFiles.length} 件 (${includedRatio}%) のファイルを本文込みで読み込みました`
			+ `（キーワード: ${kwLabel}、合計 ${totalChars.toLocaleString()} 文字）。`
			+ ` 主要マニフェスト・エントリポイントを最優先で取り込み、残り予算で全フォルダを順次走査しています。`;

	console.log(`[FileSearch] workspace=${workspaceFolderPath} scanned=${allFiles.length} `
		+ `keywords=[${keywords.join(',')}] baseline=${baselineFiles.length} `
		+ `included=${matches.length} chars=${totalChars} skipped=${truncatedDueToBudget}`);

	return { matches, summary, tree };
};

// 反復ファイルサーチ用：直前のマッチからクエリを拡張して再検索する。
// 派生キーワードはマッチしたファイル名・パス・ディレクトリ部品から抽出。
const deriveNextSearchQuery = (
	prevQuery: string,
	matches: { relativePath: string; content: string }[],
	usedKeywords: Set<string>,
): string => {
	const candidates = new Set<string>();
	const STOPWORDS = new Set([
		'src', 'lib', 'app', 'pages', 'page', 'components', 'component', 'utils',
		'util', 'public', 'index', 'main', 'test', 'tests', 'common', 'core',
		'types', 'type', 'config', 'configs', 'helpers', 'helper', 'styles',
		'style', 'json', 'tsx', 'ts', 'js', 'jsx', 'css', 'scss', 'html',
		'md', 'mdx', 'yaml', 'yml', 'toml', 'lock', 'dist', 'build', 'out',
		'node_modules', 'vendor', 'tmp', 'temp', 'mock', 'mocks', 'fixture',
		'fixtures', 'spec', 'specs', 'd', 'min',
	]);
	for (const m of matches.slice(0, 12)) {
		const parts = m.relativePath.split(/[/\\.\-_]/);
		for (const raw of parts) {
			const p = raw.toLowerCase();
			if (p.length < 4) continue;
			if (STOPWORDS.has(p)) continue;
			if (/^\d+$/.test(p)) continue;
			if (usedKeywords.has(p)) continue;
			candidates.add(p);
		}
	}
	const additions = Array.from(candidates).slice(0, 8);
	for (const a of additions) usedKeywords.add(a);
	if (additions.length === 0) return prevQuery;
	return [prevQuery, ...additions].join(' ');
};

// Wave 1（pre-wave）の File Search を「マージしながらループ」実行する。
// 各反復で前回の結果からクエリを派生させ、新規発見ファイルを蓄積する。
// 新規発見が無くなったら早期終了、最大 maxIterations 回で停止。
const buildFileSearchOutputLooped = (
	workspaceFolderPath: string,
	initialQuery: string,
	options?: {
		maxIterations?: number;
		onIterationProgress?: (text: string) => void;
	},
): string => {
	const maxIterations = Math.max(1, options?.maxIterations ?? 3);
	const onProgress = options?.onIterationProgress;

	const aggregatedMatches = new Map<string, string>();
	const summaryByIter: string[] = [];
	const usedKeywords = new Set<string>(extractKeywordsFromQuery(initialQuery));
	let tree = '';
	let currentQuery = initialQuery;
	let iterationsRun = 0;

	for (let iter = 1; iter <= maxIterations; iter++) {
		iterationsRun = iter;
		const previewQuery = currentQuery.length > 80
			? currentQuery.slice(0, 80) + '…'
			: currentQuery;
		onProgress?.(`🔁 反復 ${iter}/${maxIterations}: クエリ「${previewQuery}」で走査中…\n`);

		const { matches, summary, tree: iterTree } = searchWorkspaceFiles(workspaceFolderPath, currentQuery);
		if (iter === 1) tree = iterTree;

		let newCount = 0;
		for (const m of matches) {
			if (!aggregatedMatches.has(m.relativePath)) {
				aggregatedMatches.set(m.relativePath, m.content);
				newCount++;
			}
		}
		summaryByIter.push(`反復 ${iter}: ${summary}（うち新規 ${newCount} 件、累積 ${aggregatedMatches.size} 件）`);
		onProgress?.(`   → 新規 ${newCount} 件 / 累積 ${aggregatedMatches.size} 件\n`);

		// 新規発見が 0（初回以外）なら、これ以上掘っても伸びないので終了
		if (iter > 1 && newCount === 0) {
			onProgress?.(`   新規ファイルが見つからなかったため反復終了。\n`);
			break;
		}

		// クエリ拡張： 直前マッチからキーワードを派生
		const nextQuery = deriveNextSearchQuery(currentQuery, matches, usedKeywords);
		if (nextQuery === currentQuery) {
			onProgress?.(`   クエリ拡張に有効な新キーワードが無かったため反復終了。\n`);
			break;
		}
		currentQuery = nextQuery;
	}

	const lines: string[] = [
		`## ワークスペース: \`${workspaceFolderPath}\``,
		'',
		`### 反復ファイルサーチ サマリ（${iterationsRun} 回 / 最大 ${maxIterations}）`,
		'',
		...summaryByIter.map(s => `- ${s}`),
		`- 最終累積: **${aggregatedMatches.size} 件** のファイルを統合読み込み`,
		'',
		`### ディレクトリツリー（関連ファイルの追加読取が必要ならパスを明示してください）`,
		'',
		tree,
		'',
	];
	for (const [relativePath, content] of aggregatedMatches) {
		const ext = path.extname(relativePath).slice(1) || 'text';
		lines.push(`### \`${relativePath}\``);
		lines.push('```' + ext);
		lines.push(content);
		lines.push('```');
		lines.push('');
	}
	return lines.join('\n');
};

// ---- ワークスペースの使用言語 / フレームワーク検出 ----
//
// 各種マニフェストファイル（package.json, pubspec.yaml, Cargo.toml, 等）と
// ファイル拡張子の分布から、プロジェクトで使われている言語とフレームワークを
// 推定する。結果は Markdown 文字列で返し、Leader / 各中間タスク / Coder の
// コンテキストに assistant turn として添付する。
//
// これにより、例えば Flutter プロジェクトに対して React コードを生成したり、
// Next.js プロジェクトに Django コードを混ぜ込むといった事故を防ぐ。

type StackInfo = {
	languages: string[];  // 例: ['TypeScript', 'Dart']
	frameworks: string[]; // 例: ['Next.js', 'Tailwind CSS', 'Flutter']
	packageManagers: string[]; // 例: ['npm', 'pub']
	runtime: string[]; // 例: ['Node.js 20', 'Python 3.11']
	notes: string[]; // 補足（検出根拠など）
};

const safeReadText = (p: string, maxBytes = 256 * 1024): string | null => {
	try {
		const stat = fs.statSync(p);
		if (!stat.isFile() || stat.size > maxBytes) return null;
		return fs.readFileSync(p, 'utf-8');
	} catch {
		return null;
	}
};

const tryParseJson = (s: string | null): any | null => {
	if (!s) return null;
	try { return JSON.parse(s); } catch { return null; }
};

// package.json の deps/devDeps から React / Next / Vue / Nuxt / Svelte / Vite などを判定
const detectJsFrameworks = (pkg: any, info: StackInfo): void => {
	if (!pkg || typeof pkg !== 'object') return;
	const deps: Record<string, string> = {
		...(pkg.dependencies || {}),
		...(pkg.devDependencies || {}),
		...(pkg.peerDependencies || {}),
	};
	const has = (name: string) => Object.prototype.hasOwnProperty.call(deps, name);
	const ver = (name: string) => (deps[name] || '').replace(/^[\^~=><\s]+/, '') || '';

	const fw: string[] = [];
	// Meta-frameworks (check before base frameworks so we report the most specific one)
	if (has('next')) fw.push(`Next.js${ver('next') ? ' ' + ver('next') : ''}`);
	if (has('nuxt')) fw.push(`Nuxt${ver('nuxt') ? ' ' + ver('nuxt') : ''}`);
	if (has('@remix-run/react') || has('@remix-run/node')) fw.push('Remix');
	if (has('gatsby')) fw.push('Gatsby');
	if (has('astro')) fw.push('Astro');
	if (has('@sveltejs/kit')) fw.push('SvelteKit');
	if (has('solid-start')) fw.push('SolidStart');
	// UI frameworks
	if (has('react') && !fw.some(f => /next|remix|gatsby/i.test(f))) fw.push(`React${ver('react') ? ' ' + ver('react') : ''}`);
	if (has('vue') && !fw.some(f => /nuxt/i.test(f))) fw.push(`Vue${ver('vue') ? ' ' + ver('vue') : ''}`);
	if (has('svelte') && !fw.some(f => /sveltekit/i.test(f))) fw.push('Svelte');
	if (has('solid-js')) fw.push('SolidJS');
	if (has('@angular/core')) fw.push(`Angular${ver('@angular/core') ? ' ' + ver('@angular/core') : ''}`);
	// Build tools
	if (has('vite')) fw.push('Vite');
	if (has('webpack')) fw.push('webpack');
	if (has('turbo')) fw.push('Turborepo');
	// Styling
	if (has('tailwindcss')) fw.push('Tailwind CSS');
	if (has('styled-components')) fw.push('styled-components');
	if (has('@emotion/react')) fw.push('Emotion');
	if (has('@mui/material')) fw.push('Material-UI (MUI)');
	if (has('@chakra-ui/react')) fw.push('Chakra UI');
	if (has('@shadcn/ui') || has('shadcn-ui')) fw.push('shadcn/ui');
	// State
	if (has('redux') || has('@reduxjs/toolkit')) fw.push('Redux');
	if (has('zustand')) fw.push('Zustand');
	if (has('jotai')) fw.push('Jotai');
	if (has('recoil')) fw.push('Recoil');
	// Backend
	if (has('express')) fw.push('Express');
	if (has('fastify')) fw.push('Fastify');
	if (has('koa')) fw.push('Koa');
	if (has('@nestjs/core')) fw.push('NestJS');
	if (has('hono')) fw.push('Hono');
	// DB/ORM
	if (has('prisma') || has('@prisma/client')) fw.push('Prisma');
	if (has('drizzle-orm')) fw.push('Drizzle ORM');
	if (has('mongoose')) fw.push('Mongoose');
	if (has('typeorm')) fw.push('TypeORM');
	// Supabase / Firebase
	if (has('@supabase/supabase-js')) fw.push('Supabase');
	if (has('firebase')) fw.push('Firebase');
	// Test
	if (has('jest')) fw.push('Jest');
	if (has('vitest')) fw.push('Vitest');
	if (has('@playwright/test')) fw.push('Playwright');
	if (has('cypress')) fw.push('Cypress');

	info.frameworks.push(...fw);

	// Runtime declaration
	if (pkg.engines?.node) info.runtime.push(`Node.js ${pkg.engines.node}`);
	if (pkg.packageManager) info.packageManagers.push(String(pkg.packageManager).split('@')[0]);
};

const detectPythonFrameworks = (info: StackInfo, reqs: string, pyprojectText: string | null): void => {
	const all = (reqs + '\n' + (pyprojectText || '')).toLowerCase();
	const fw: string[] = [];
	if (/\bdjango\b/.test(all)) fw.push('Django');
	if (/\bflask\b/.test(all)) fw.push('Flask');
	if (/\bfastapi\b/.test(all)) fw.push('FastAPI');
	if (/\bstreamlit\b/.test(all)) fw.push('Streamlit');
	if (/\bgradio\b/.test(all)) fw.push('Gradio');
	if (/\bpandas\b/.test(all)) fw.push('pandas');
	if (/\bnumpy\b/.test(all)) fw.push('NumPy');
	if (/\btorch\b|pytorch/.test(all)) fw.push('PyTorch');
	if (/tensorflow/.test(all)) fw.push('TensorFlow');
	if (/\bsqlalchemy\b/.test(all)) fw.push('SQLAlchemy');
	if (/\bpydantic\b/.test(all)) fw.push('Pydantic');
	info.frameworks.push(...fw);
};

const detectRustFrameworks = (info: StackInfo, cargoText: string): void => {
	const low = cargoText.toLowerCase();
	const fw: string[] = [];
	if (/\baxum\b/.test(low)) fw.push('Axum');
	if (/actix-web/.test(low)) fw.push('Actix Web');
	if (/\brocket\b/.test(low)) fw.push('Rocket');
	if (/\btauri\b/.test(low)) fw.push('Tauri');
	if (/\btokio\b/.test(low)) fw.push('Tokio');
	if (/\bserde\b/.test(low)) fw.push('serde');
	if (/\bdiesel\b/.test(low)) fw.push('Diesel');
	info.frameworks.push(...fw);
};

const detectGoFrameworks = (info: StackInfo, goModText: string): void => {
	const low = goModText.toLowerCase();
	const fw: string[] = [];
	if (/gin-gonic\/gin/.test(low)) fw.push('Gin');
	if (/gofiber\/fiber/.test(low)) fw.push('Fiber');
	if (/labstack\/echo/.test(low)) fw.push('Echo');
	if (/grpc/.test(low)) fw.push('gRPC');
	info.frameworks.push(...fw);
};

const detectDartFlutter = (info: StackInfo, pubspecText: string): void => {
	// pubspec.yaml is YAML; a shallow regex parse is enough here
	const hasFlutter = /^\s*flutter\s*:/m.test(pubspecText) || /sdk:\s*flutter/.test(pubspecText);
	if (hasFlutter) {
		info.frameworks.push('Flutter');
		if (!info.languages.includes('Dart')) info.languages.push('Dart');
	}
	const fw: string[] = [];
	if (/riverpod/.test(pubspecText)) fw.push('Riverpod');
	if (/\bbloc\b|flutter_bloc/.test(pubspecText)) fw.push('BLoC');
	if (/\bprovider\b/.test(pubspecText)) fw.push('Provider');
	if (/go_router/.test(pubspecText)) fw.push('go_router');
	if (/firebase_core/.test(pubspecText)) fw.push('Firebase (Flutter)');
	info.frameworks.push(...fw);
};

const detectJvmFrameworks = (info: StackInfo, gradleText: string | null, pomText: string | null): void => {
	const all = ((gradleText || '') + '\n' + (pomText || '')).toLowerCase();
	const fw: string[] = [];
	if (/spring-boot|springframework\.boot/.test(all)) fw.push('Spring Boot');
	if (/androidx\.compose|jetpack\s*compose/.test(all)) fw.push('Jetpack Compose');
	if (/kotlinx\.coroutines/.test(all)) fw.push('Kotlin Coroutines');
	if (/ktor/.test(all)) fw.push('Ktor');
	info.frameworks.push(...fw);
	if (/kotlin/.test(all) && !info.languages.includes('Kotlin')) info.languages.push('Kotlin');
	if (/\bjava\b/.test(all) && !info.languages.includes('Java')) info.languages.push('Java');
};

const detectPhpFrameworks = (info: StackInfo, composerJson: any): void => {
	if (!composerJson || typeof composerJson !== 'object') return;
	const reqs = { ...(composerJson.require || {}), ...(composerJson['require-dev'] || {}) };
	const has = (n: string) => Object.prototype.hasOwnProperty.call(reqs, n);
	const fw: string[] = [];
	if (has('laravel/framework')) fw.push('Laravel');
	if (has('symfony/framework-bundle')) fw.push('Symfony');
	if (has('cakephp/cakephp')) fw.push('CakePHP');
	if (has('slim/slim')) fw.push('Slim');
	info.frameworks.push(...fw);
};

// 拡張子の分布（上位ディレクトリのみ）から言語を推定する副次シグナル
const detectLanguagesFromExtensions = (workspacePath: string, info: StackInfo): void => {
	const extMap: Record<string, string> = {
		ts: 'TypeScript', tsx: 'TypeScript',
		js: 'JavaScript', jsx: 'JavaScript', mjs: 'JavaScript', cjs: 'JavaScript',
		py: 'Python',
		rb: 'Ruby',
		go: 'Go',
		rs: 'Rust',
		java: 'Java',
		kt: 'Kotlin', kts: 'Kotlin',
		swift: 'Swift',
		dart: 'Dart',
		php: 'PHP',
		cs: 'C#',
		cpp: 'C++', cc: 'C++', cxx: 'C++', hpp: 'C++',
		c: 'C', h: 'C/C++ Header',
		sh: 'Shell', bash: 'Shell', zsh: 'Shell',
		sql: 'SQL',
		html: 'HTML', css: 'CSS', scss: 'SCSS',
		vue: 'Vue SFC', svelte: 'Svelte',
	};
	const counts: Record<string, number> = {};
	try {
		const entries = fs.readdirSync(workspacePath, { withFileTypes: true });
		const roots: string[] = [workspacePath];
		for (const e of entries) {
			if (!e.isDirectory() || IGNORED_DIRS.has(e.name) || e.name.startsWith('.')) continue;
			roots.push(path.join(workspacePath, e.name));
		}
		const walk = (dir: string, depth: number) => {
			if (depth > 2) return;
			let items: fs.Dirent[];
			try { items = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
			for (const it of items) {
				if (it.name.startsWith('.')) continue;
				if (it.isDirectory()) {
					if (IGNORED_DIRS.has(it.name)) continue;
					walk(path.join(dir, it.name), depth + 1);
				} else if (it.isFile()) {
					const ext = path.extname(it.name).slice(1).toLowerCase();
					const lang = extMap[ext];
					if (lang) counts[lang] = (counts[lang] || 0) + 1;
				}
			}
		};
		for (const r of roots) walk(r, 0);
	} catch {
		/* ignore */
	}
	// Top 5 languages by file count
	const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
	for (const [lang] of sorted) {
		if (!info.languages.includes(lang)) info.languages.push(lang);
	}
};

const detectWorkspaceStack = (workspacePath: string): StackInfo => {
	const info: StackInfo = { languages: [], frameworks: [], packageManagers: [], runtime: [], notes: [] };

	// --- Node.js / JS / TS ecosystem ---
	const pkgJson = tryParseJson(safeReadText(path.join(workspacePath, 'package.json')));
	if (pkgJson) {
		info.notes.push('package.json を検出');
		// Language inference from presence of tsconfig.json / *.ts files
		if (safeReadText(path.join(workspacePath, 'tsconfig.json')) !== null) {
			info.languages.push('TypeScript');
		} else {
			info.languages.push('JavaScript');
		}
		detectJsFrameworks(pkgJson, info);
		if (safeReadText(path.join(workspacePath, 'pnpm-lock.yaml'))) info.packageManagers.push('pnpm');
		if (safeReadText(path.join(workspacePath, 'yarn.lock'))) info.packageManagers.push('yarn');
		if (safeReadText(path.join(workspacePath, 'package-lock.json'))) info.packageManagers.push('npm');
		if (safeReadText(path.join(workspacePath, 'bun.lockb'))) info.packageManagers.push('bun');
	}

	// --- Python ---
	const reqs = safeReadText(path.join(workspacePath, 'requirements.txt')) || '';
	const pyproject = safeReadText(path.join(workspacePath, 'pyproject.toml'));
	const pipfile = safeReadText(path.join(workspacePath, 'Pipfile'));
	if (reqs || pyproject || pipfile) {
		if (!info.languages.includes('Python')) info.languages.push('Python');
		info.notes.push(
			reqs ? 'requirements.txt を検出'
				: pyproject ? 'pyproject.toml を検出'
					: 'Pipfile を検出',
		);
		detectPythonFrameworks(info, reqs, pyproject || pipfile);
		if (pyproject && /poetry/.test(pyproject)) info.packageManagers.push('Poetry');
		if (reqs) info.packageManagers.push('pip');
	}

	// --- Rust ---
	const cargo = safeReadText(path.join(workspacePath, 'Cargo.toml'));
	if (cargo) {
		if (!info.languages.includes('Rust')) info.languages.push('Rust');
		info.notes.push('Cargo.toml を検出');
		detectRustFrameworks(info, cargo);
		info.packageManagers.push('cargo');
	}

	// --- Go ---
	const goMod = safeReadText(path.join(workspacePath, 'go.mod'));
	if (goMod) {
		if (!info.languages.includes('Go')) info.languages.push('Go');
		info.notes.push('go.mod を検出');
		detectGoFrameworks(info, goMod);
		info.packageManagers.push('go modules');
		const verMatch = goMod.match(/^go\s+([\d.]+)/m);
		if (verMatch) info.runtime.push(`Go ${verMatch[1]}`);
	}

	// --- Dart / Flutter ---
	const pubspec = safeReadText(path.join(workspacePath, 'pubspec.yaml'));
	if (pubspec) {
		if (!info.languages.includes('Dart')) info.languages.push('Dart');
		info.notes.push('pubspec.yaml を検出');
		detectDartFlutter(info, pubspec);
		info.packageManagers.push('pub');
	}

	// --- Ruby ---
	const gemfile = safeReadText(path.join(workspacePath, 'Gemfile'));
	if (gemfile) {
		if (!info.languages.includes('Ruby')) info.languages.push('Ruby');
		info.notes.push('Gemfile を検出');
		if (/rails/.test(gemfile)) info.frameworks.push('Ruby on Rails');
		if (/sinatra/.test(gemfile)) info.frameworks.push('Sinatra');
		info.packageManagers.push('bundler');
	}

	// --- JVM (Gradle / Maven) ---
	const gradle = safeReadText(path.join(workspacePath, 'build.gradle'))
		|| safeReadText(path.join(workspacePath, 'build.gradle.kts'));
	const pom = safeReadText(path.join(workspacePath, 'pom.xml'));
	if (gradle || pom) {
		info.notes.push(gradle ? 'Gradle ビルドを検出' : 'Maven (pom.xml) を検出');
		detectJvmFrameworks(info, gradle, pom);
		if (gradle) info.packageManagers.push('Gradle');
		if (pom) info.packageManagers.push('Maven');
	}

	// --- Swift ---
	if (safeReadText(path.join(workspacePath, 'Package.swift'))) {
		if (!info.languages.includes('Swift')) info.languages.push('Swift');
		info.notes.push('Package.swift を検出');
		info.packageManagers.push('SwiftPM');
	}

	// --- PHP ---
	const composer = tryParseJson(safeReadText(path.join(workspacePath, 'composer.json')));
	if (composer) {
		if (!info.languages.includes('PHP')) info.languages.push('PHP');
		info.notes.push('composer.json を検出');
		detectPhpFrameworks(info, composer);
		info.packageManagers.push('Composer');
	}

	// --- C# / .NET ---
	try {
		const entries = fs.readdirSync(workspacePath);
		if (entries.some(n => /\.(csproj|sln|fsproj)$/.test(n))) {
			if (!info.languages.includes('C#')) info.languages.push('C#');
			info.notes.push('.csproj / .sln を検出');
			info.packageManagers.push('NuGet (dotnet)');
		}
	} catch { /* ignore */ }

	// Secondary signal: extension distribution
	detectLanguagesFromExtensions(workspacePath, info);

	// Deduplicate
	info.languages = Array.from(new Set(info.languages));
	info.frameworks = Array.from(new Set(info.frameworks));
	info.packageManagers = Array.from(new Set(info.packageManagers));
	info.runtime = Array.from(new Set(info.runtime));

	return info;
};

// Build the Markdown block that gets injected as an `assistant` turn into task
// contexts so downstream AIs know which stack they're generating code for.
const buildStackContextMarkdown = (workspacePath: string): string => {
	const info = detectWorkspaceStack(workspacePath);
	if (info.languages.length === 0 && info.frameworks.length === 0) {
		return ''; // Nothing detected (empty workspace?) — skip injection entirely
	}
	const lines: string[] = [];
	lines.push('## ワークスペースの技術スタック (自動検出)');
	lines.push('');
	lines.push('あなたが生成するコード・提案・設計は **必ず以下のスタックに合わせてください**。既存の言語・フレームワークを無視して別のスタック (例: Flutter プロジェクトに React) を提案することは禁止です。');
	lines.push('');
	if (info.languages.length > 0) {
		lines.push(`- **言語**: ${info.languages.join(', ')}`);
	}
	if (info.frameworks.length > 0) {
		lines.push(`- **フレームワーク / 主要ライブラリ**: ${info.frameworks.join(', ')}`);
	}
	if (info.packageManagers.length > 0) {
		lines.push(`- **パッケージマネージャ**: ${info.packageManagers.join(', ')}`);
	}
	if (info.runtime.length > 0) {
		lines.push(`- **ランタイム**: ${info.runtime.join(', ')}`);
	}
	if (info.notes.length > 0) {
		lines.push(`- **検出根拠**: ${info.notes.join(' / ')}`);
	}
	lines.push('');
	lines.push('コード出力時は既存のファイル構造・命名規則・インポートパス・スタイル規約に従い、上記スタックのイディオムに沿った実装を行ってください。必要なパッケージインストールコマンドも、このスタックのパッケージマネージャで出力してください。');
	return lines.join('\n');
};

// Code output instructions appended to prompts when we want the AI to apply code changes.
// The renderer's editCodeService will pick up SEARCH/REPLACE blocks and apply them as a diff.
const buildCodeOutputInstructions = (): string => [
	`## 出力ルール（必ず守ってください）`,
	``,
	`コードを出力する際は、必ず以下のいずれかの形式を使用してください。形式を守らないとファイルに反映されません。`,
	``,
	`### 新規ファイル作成 / ファイル全体上書き`,
	`コードブロックの言語の後にコロン（:）でファイルパスを指定してください（ワークスペースルートからの相対パス）。`,
	``,
	`例:`,
	'```ts:src/components/Button.tsx',
	`export const Button = () => <button>Click</button>;`,
	'```',
	``,
	`### 既存ファイルの部分編集（推奨）`,
	`既存ファイルの一部を変更する場合は、SEARCH/REPLACE形式を使用してください。差分が自動でエディタに反映されます。`,
	``,
	`例:`,
	'```ts:src/utils/api.ts',
	`<<<SEARCH`,
	`const BASE_URL = 'https://old.example.com';`,
	`===`,
	`const BASE_URL = 'https://new.example.com';`,
	`>>>REPLACE`,
	'```',
	``,
	`### ターミナルコマンド（自動実行されます）`,
	`実行が必要なコマンドは bash ブロック（ファイルパス指定なし）で出力してください。ユーザーの環境で自動実行されます。`,
	``,
	`使用例:`,
	`- 依存パッケージのインストール: \`npm install react\`, \`pip install requests\` など`,
	`- ファイル/ディレクトリ操作: \`mkdir -p src/components\`, \`mv old.ts new.ts\` など`,
	`- ビルド・テスト・実行: \`npm run build\`, \`npm test\`, \`python script.py\` など`,
	`- Git操作: \`git init\`, \`git add .\` など`,
	``,
	'```bash',
	`npm install react react-dom`,
	'```',
	``,
	'```bash',
	`mkdir -p src/components && touch src/components/Button.tsx`,
	'```',
	``,
	`複数のコマンドが必要な場合は、bash ブロックを複数出力するか、\`&&\` で連結してください。`,
	``,
	`### 重要な注意点`,
	`- ファイルパスは必ず指定してください（パスがないコードブロックはコマンドとして実行されるか、無視されます）`,
	`- SEARCH部分は既存ファイルの内容と完全に一致する必要があります（インデント・空白も含めて）`,
	`- 既存ファイルを編集する場合は、ファイル全体ではなく SEARCH/REPLACE で必要な箇所だけ変更してください`,
	`- 必要であれば、コード変更とコマンド実行を組み合わせて出力してください`,
	``,
	`### 禁止されるコマンド（出力しないでください）`,
	`あなたは対話的シェルではなくワンショット生成です。以下のような**探索系コマンド**を出力しても実行結果は返ってきません。ワークスペース情報は別エージェント（file-searcher 等）が既に収集済みで、プロンプト内に含まれています。`,
	``,
	`- \`find ...\` / \`ls ...\` / \`tree ...\`（ファイル一覧調査）`,
	`- \`cat ...\` / \`head ...\` / \`tail ...\` / \`less ...\`（ファイル内容閲覧）`,
	`- \`grep ...\` / \`rg ...\` / \`ack ...\`（コード検索）`,
	`- \`pwd\` / \`which ...\` / \`echo ...\`（環境確認）`,
	``,
	`これらを出力するのは禁止です。代わりに、プロンプトに含まれる情報と常識的な推測だけで**実ファイルの作成/編集**を直接出力してください。情報が足りない場合は、最もあり得る構成を仮定して実装を進め、ユーザーが後でパスや内容を調整できるようにしてください。`,
].join('\n');

// Extract prompt from LLM messages
const buildPromptFromMessages = (messages: any[], separateSystemMessage?: string): string => {
	let prompt = '';
	if (separateSystemMessage) {
		prompt += `[System] ${separateSystemMessage}\n\n`;
	}
	for (const msg of messages) {
		const role = msg.role || 'user';
		if ('content' in msg) {
			if (typeof msg.content === 'string') {
				prompt += `[${role}] ${msg.content}\n`;
			} else if (Array.isArray(msg.content)) {
				for (const part of msg.content) {
					if (typeof part === 'string') {
						prompt += `[${role}] ${part}\n`;
					} else if (part && typeof part === 'object' && 'text' in part) {
						prompt += `[${role}] ${(part as { text: string }).text}\n`;
					}
				}
			}
		} else if ('parts' in msg) {
			for (const part of msg.parts) {
				if ('text' in part) {
					prompt += `[${role}] ${part.text}\n`;
				}
			}
		}
	}
	return prompt.trim();
};



const sendDivisionAPIChat = async (params: SendChatParams_Internal): Promise<void> => {
	const {
		messages,
		onText,
		onFinalMessage,
		onError,
		onFileOperation,
		onCommandRun,
		_setAborter,
		separateSystemMessage,
		divisionProjectId: divisionProjectIdParam,
		divisionApiKey,
		workspaceFolderPath,
		modelName: selectedModel,
		chatMode,
		settingsOfProvider,
		takePendingInjection,
		divisionFlowApprovalMode,
	} = params

	// 旧フローには Brief Gate / Reviewer のリトライループ + 最大試行回数があったが、
	// シンプル化版では Reviewer は 1 回しか走らせないため、これらの設定は使わない。
	// 互換のため params 側のキー (divisionMax*) は受け入れるが、ここでは無視する。

	try {
		const endpointBase = settingsOfProvider.divisionAPI.endpoint || 'https://division.higuchiyuya-riddle.workers.dev';
		const projectId = divisionProjectIdParam || '';
		const prompt = buildPromptFromMessages(messages, separateSystemMessage);

		const controller = new AbortController()

		// サーバ側の `/api/tasks/stop` を呼ぶための、現在有効な sessionId 集合。
		// 各サイクルの /api/tasks/create 成功時に追加し、停止/最終化のたびに
		// 中身は維持する（停止後に再度送らないよう、stopServerSessions が clear する）。
		const activeServerSessionIds = new Set<string>();
		const stopServerSessions = async () => {
			const ids = Array.from(activeServerSessionIds);
			activeServerSessionIds.clear();
			if (ids.length === 0) return;
			const headers: Record<string, string> = { 'Content-Type': 'application/json' };
			const apiKey = divisionApiKey || process.env.DIVISION_API_KEY || '';
			if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
			await Promise.all(ids.map(sessionId =>
				fetch(`${settingsOfProvider.divisionAPI.endpoint || 'https://division.higuchiyuya-riddle.workers.dev'}/api/tasks/stop`, {
					method: 'POST',
					headers,
					body: JSON.stringify({ projectId: divisionProjectIdParam || '', sessionId }),
				}).catch(err => {
					console.warn('[DivisionAPI] /api/tasks/stop failed:', err?.message || err);
					return null;
				})
			));
		};

		_setAborter(() => {
			// サーバ側へ停止指示を投げる（fire-and-forget; 完了を待つ必要はない）
			void stopServerSessions();
			// ローカルの fetch ストリームも即座に中断
			controller.abort();
		});

		let fullText = '';
		const appendText = (text: string) => {
			fullText += text;
			onText({ fullText, fullReasoning: '' });
		};
		const pendingCommandRuns: CommandOperationItem[] = [];
		const queueCommandRuns = (commands: CommandOperationItem[]) => {
			if (commands.length === 0) return;
			pendingCommandRuns.push(...commands);
		};
		const flushCommandRunsAfterFinalMessage = () => {
			if (!onCommandRun || pendingCommandRuns.length === 0) return;
			const commands = pendingCommandRuns.splice(0);
			setTimeout(() => onCommandRun(commands), 0);
		};

		// =============================================
		// DIRECT MODEL MODE: If user selected a specific model (not orchestrator),
		// skip orchestration and call /api/generate/stream with that model
		// =============================================
		if (selectedModel && selectedModel !== 'division-orchestrator') {

			const mode = chatMode === 'agent' ? 'function_calling' : chatMode === 'gather' ? 'search' : 'chat';

			// In agent mode, append code output instructions so the model produces
			// file-targeted code blocks / SEARCH-REPLACE diffs that we can auto-apply.
			const directPrompt = chatMode === 'agent'
				? `${prompt}\n\n${buildCodeOutputInstructions()}`
				: prompt;

			const result = await callDivisionGenerateStream(
				endpointBase, selectedModel, directPrompt, controller.signal,
				(chunk) => appendText(chunk),
				mode, divisionApiKey, undefined, workspaceFolderPath,
			);

			if (result.error) {
				appendText(`\nError: ${result.error}\n`);
			} else {
				const output = result.output;
				const codeBlockOpens = (output.match(/```/g) || []).length;
				if (codeBlockOpens % 2 !== 0) {
					appendText('\n```\n');
				}
				appendText('\n\n');

				if (workspaceFolderPath) {
					const { savedFiles, fileOperations, commands } = saveCodeBlocksFromOutput(output, `direct-${selectedModel}`, workspaceFolderPath);
					if (savedFiles.length > 0) {
						for (const sf of savedFiles) {
							const basename = path.basename(sf.filePath);
							appendText(`${basename} — \`${sf.filePath}\`\n`);
						}
						appendText(`\n`);
						if (fileOperations.length > 0 && onFileOperation) {
							onFileOperation(fileOperations);
						}
					}
					queueCommandRuns(commands);
				}
			}

			onFinalMessage({ fullText, fullReasoning: '', anthropicReasoning: null });
			flushCommandRunsAfterFinalMessage();
			return;
		}

		// =============================================
		// ORCHESTRATION MODE (シンプル化版)
		//
		//   1. Leader がユーザー入力をタスクに分解 (/api/tasks/create)
		//   2. 各タスクを Leader の生成順に 1 回だけ実行 (/api/tasks/execute)
		//   3. 最後に Reviewer が成果物全体をレビュー (1 回のみ、リトライなし)
		//   4. Reviewer の出力は HTML コメントの delimiter で挟んで assistant
		//      メッセージ末尾に埋め込み、次のユーザー送信時にレンダラ側が
		//      自動的に context として userMessage に prepend する。
		// =============================================

		const extractContent = (msg: LLMChatMessage): string => {
			if ('content' in msg) {
				if (typeof msg.content === 'string') return msg.content;
				if (Array.isArray(msg.content)) {
					return msg.content.map(part => {
						if (typeof part === 'string') return part;
						if (part && typeof part === 'object' && 'text' in part && (part as any).type === 'text') return (part as { text: string }).text;
						return '';
					}).join('');
				}
			} else if ('parts' in msg) {
				return (msg as any).parts.map((part: any) => part.text || '').join('');
			}
			return '';
		};

		const lastMsg = messages[messages.length - 1];
		let currentInput = lastMsg ? extractContent(lastMsg) : prompt;
		if (!currentInput || currentInput.trim() === '') {
			currentInput = prompt;
		}

		// Size caps to avoid HTTP 500 from oversized request bodies
		const MAX_CHARS_PER_CONTEXT = 8_000;
		const MAX_TOTAL_CONTEXT_CHARS = 150_000;
		const MAX_CHARS_PER_HISTORY_MSG = 8_000;
		const MAX_TOTAL_HISTORY_CHARS = 20_000;
		const truncateForContext = (s: string, max: number): string => {
			if (!s) return '';
			if (s.length <= max) return s;
			const head = s.slice(0, Math.floor(max * 0.8));
			const tail = s.slice(-Math.floor(max * 0.15));
			return `${head}\n\n... [中略 ${s.length - head.length - tail.length} 文字省略] ...\n\n${tail}`;
		};

		const rawChatHistory = messages.slice(0, -1)
			.filter(msg => msg.role !== 'system' && msg.role !== 'developer')
			.map(msg => ({
				role: (msg.role === 'model' ? 'assistant' : msg.role) as 'user' | 'assistant',
				content: extractContent(msg)
			}));
		const chatHistory: { role: 'user' | 'assistant'; content: string }[] = [];
		{
			let totalHistoryChars = 0;
			const reversed = [...rawChatHistory].reverse();
			const keptReversed: { role: 'user' | 'assistant'; content: string }[] = [];
			for (const msg of reversed) {
				if (!msg.content || !msg.content.trim()) continue;
				const truncated = truncateForContext(msg.content, MAX_CHARS_PER_HISTORY_MSG);
				if (totalHistoryChars + truncated.length > MAX_TOTAL_HISTORY_CHARS) break;
				keptReversed.push({ role: msg.role, content: truncated });
				totalHistoryChars += truncated.length;
			}
			chatHistory.push(...keptReversed.reverse());
		}

		const codeOutputInstructions = buildCodeOutputInstructions();

		const stackContextMarkdown = workspaceFolderPath
			? buildStackContextMarkdown(workspaceFolderPath)
			: '';
		const stackContextTurn: { role: 'user' | 'assistant'; content: string } | null =
			stackContextMarkdown ? { role: 'assistant', content: stackContextMarkdown } : null;
		if (stackContextTurn) {
			console.log('[DivisionAPI] Detected workspace stack context:\n' + stackContextMarkdown);
		}

		const withStackContext = (
			history: { role: 'user' | 'assistant'; content: string }[],
		): { role: 'user' | 'assistant'; content: string }[] =>
			stackContextTurn ? [stackContextTurn, ...history] : history;

		// orchestration 中の途中追加メッセージ (UI 側 interject) を取り込むユーティリティ。
		const drainInjections = (): boolean => {
			if (!takePendingInjection) return false;
			const injected = takePendingInjection();
			if (!injected || !injected.trim()) return false;
			const banner = `\n\n> 💬 **ユーザー割り込み受信** — 次のステップから反映します\n> ${injected.split('\n').join('\n> ')}\n\n`;
			appendText(banner);
			currentInput = [
				currentInput,
				'',
				'---',
				'',
				'## ユーザーからの追加リクエスト（途中送信）',
				injected,
			].join('\n');
			chatHistory.push({ role: 'user', content: injected });
			return true;
		};

		type DivisionTask = {
			taskId: string;
			role: string;
			title: string;
			input?: string;
			output?: string;
			provider?: string;
			dependsOn?: string[];
			description?: string;
			reason?: string;
			mode?: string;
		};

		const isFileSearchRole = (r: string): boolean => {
			const role = (r || '').toLowerCase();
			return role === 'file-search' || role === 'filesearch' || role === 'file_search'
				|| role === 'file-searcher' || role === 'filesearcher';
		};
		const isCoderLikeRole = (r: string): boolean => {
			const role = (r || '').toLowerCase();
			return role === 'coder' || role === 'coding' || role === 'code'
				|| role === 'writer' || role === 'writing';
		};
		const isImageRole = (r: string): boolean => {
			const role = (r || '').toLowerCase();
			return role === 'image' || role === 'imager' || role === 'image-generator' || role === 'imagegen';
		};

		// Leader が dependsOn で示した依存関係を尊重して実行順を確定する
		// （トポロジカルソート）。循環や不明な依存先は無視し、元の生成順で
		// タイブレークすることで Leader の意図した並びを崩さないようにする。
		const topoSortTasks = (list: DivisionTask[]): DivisionTask[] => {
			const byId = new Map(list.map(t => [t.taskId, t]));
			const originalIndex = new Map(list.map((t, i) => [t.taskId, i]));
			const indegree = new Map<string, number>();
			const adj = new Map<string, string[]>();
			for (const t of list) {
				indegree.set(t.taskId, 0);
				adj.set(t.taskId, []);
			}
			for (const t of list) {
				for (const dep of t.dependsOn || []) {
					if (dep === t.taskId || !byId.has(dep)) continue;
					adj.get(dep)!.push(t.taskId);
					indegree.set(t.taskId, (indegree.get(t.taskId) || 0) + 1);
				}
			}
			const queue: string[] = list.filter(t => (indegree.get(t.taskId) || 0) === 0).map(t => t.taskId);
			const sortedIds: string[] = [];
			const seen = new Set<string>();
			while (queue.length > 0) {
				queue.sort((a, b) => originalIndex.get(a)! - originalIndex.get(b)!);
				const id = queue.shift()!;
				if (seen.has(id)) continue;
				seen.add(id);
				sortedIds.push(id);
				for (const next of adj.get(id) || []) {
					indegree.set(next, (indegree.get(next) || 0) - 1);
					if ((indegree.get(next) || 0) === 0) queue.push(next);
				}
			}
			// 循環依存や未解決分はトポロジカルソートに乗らないので、元の順序で末尾に足す。
			for (const t of list) {
				if (!seen.has(t.taskId)) sortedIds.push(t.taskId);
			}
			return sortedIds.map(id => byId.get(id)!).filter(Boolean);
		};

		// =============================================
		// Phase 1: Leader がタスクを分解する（承認モードで一時停止していた場合は
		// その続きから再開する）
		// =============================================
		const resumeState = workspaceFolderPath ? readOrchestrationState(workspaceFolderPath) : null;
		// approved: true は「ユーザーが承認ボタンを押した直後」にのみ立つ
		// (approveOrchestration IPC 経由)。それ以外 (未承認 / 却下後の残骸) は無視して
		// 通常どおり Leader からやり直す。
		const isResuming = !!(resumeState && resumeState.approved && resumeState.workspaceFolderPath === workspaceFolderPath);

		let sessionId: string;
		let tasks: DivisionTask[];
		let totalSteps: number;
		let taskOutputs: OrchestrationTaskOutput[];
		let resumeFromIndex = 0;

		if (isResuming && resumeState) {
			sessionId = resumeState.sessionId;
			if (sessionId) activeServerSessionIds.add(sessionId);
			currentInput = resumeState.currentInput;
			tasks = resumeState.tasks as DivisionTask[];
			totalSteps = resumeState.totalSteps;
			resumeFromIndex = resumeState.nextIndex;

			// 承認時にユーザーが内容を編集していれば、その内容を正として
			// taskOutputs と .md ファイルの両方に反映する。
			taskOutputs = resumeState.taskOutputs.map(o => {
				const edited = resumeState.editedOutputs?.find(e => e.mdFileName === o.mdFileName);
				if (!edited) return o;
				if (workspaceFolderPath && o.mdFileName) {
					try {
						fs.writeFileSync(path.join(workspaceFolderPath, '.division', o.mdFileName), edited.mdContent, 'utf-8');
					} catch (_e) { /* ignore */ }
				}
				return { ...o, output: edited.mdContent };
			});

			if (resumeState.reviewerDone) {
				appendText(`## ✅ 承認完了\n\nレビュー結果が承認されました。フローを完了します。\n\n`);
				// 次のユーザー送信時に chatThreadService がこの delimiter を検出して
				// レビュー指摘を自動添付するため、承認確定メッセージにも再度埋め込む。
				const reviewEntry = taskOutputs.find(o => o.role === 'review');
				if (reviewEntry?.output) {
					appendText(`\n<!-- DIVISION_REVIEWER_BEGIN -->\n${reviewEntry.output}\n<!-- DIVISION_REVIEWER_END -->\n`);
				}
			} else {
				appendText(`## 📋 FLOW（承認により再開）\n\n前回承認されたステップの続きから実行します（${resumeFromIndex + 1}/${totalSteps} ステップ目）。\n\n`);
			}
		} else {
			appendText(`**Leader AI** がタスクを分析中...\n\n`);
			const leaderHistory = withStackContext(chatHistory);
			const leaderResult = await callDivisionTaskCreate(
				endpointBase, projectId, currentInput, controller.signal,
				divisionApiKey, leaderHistory.length > 0 ? leaderHistory : undefined,
				workspaceFolderPath,
			);

			if (leaderResult.error) {
				appendText(`❌ **Task Create Error:** ${leaderResult.error}\n\n`);
				onFinalMessage({ fullText, fullReasoning: '', anthropicReasoning: null });
				flushCommandRunsAfterFinalMessage();
				return;
			}

			sessionId = leaderResult.sessionId || '';
			if (sessionId) activeServerSessionIds.add(sessionId);

			// Reviewer はサーバ側ではなく最後にローカルで一括実行する。
			const EXCLUDED_ROLES = new Set(['review', 'reviewer']);
			tasks = (leaderResult.tasks as DivisionTask[])
				.filter(t => !EXCLUDED_ROLES.has((t.role || '').toLowerCase()));

			// Coder/Writer が file-search の出力を確実に参照できるよう、Leader が
			// filesearch タスクを生成しなかった場合は先頭に自動挿入する。
			if (workspaceFolderPath && !tasks.some(t => isFileSearchRole(t.role))) {
				tasks.unshift({
					taskId: 'auto-filesearch',
					role: 'filesearch',
					title: 'ワークスペース全体の事前読み込み',
					description: 'すべてのフォルダ・ファイルを走査し、後続エージェントに共有する',
				});
			}

			if (tasks.length === 0) {
				appendText(`Leader が実行可能なタスクを返しませんでした。終了します。\n`);
				if (sessionId) activeServerSessionIds.delete(sessionId);
				onFinalMessage({ fullText, fullReasoning: '', anthropicReasoning: null });
				flushCommandRunsAfterFinalMessage();
				return;
			}

			// Leader が示した dependsOn 順に並べ替えてから、以降のフェーズは
			// 常にこの並び (= tasks の配列順) を「唯一の実行順」として扱う。
			const sortedTasks = topoSortTasks(tasks);
			tasks.length = 0;
			tasks.push(...sortedTasks);

			// Reviewer は Phase 3 でローカル実行される最終ステップなので、
			// フロー表示上もステップ番号に含める。
			totalSteps = tasks.length + 1;
			taskOutputs = [];

			appendText(`## 📋 FLOW\n\nLeader が以下の ${totalSteps} ステップのフローを作成しました。以降、各ロールの AI はこの順番通りに実行されます。\n\n`);
			for (let i = 0; i < tasks.length; i++) {
				const t = tasks[i];
				const depsPart = t.dependsOn && t.dependsOn.length > 0 ? ` _(依存: ${t.dependsOn.join(', ')})_` : '';
				appendText(`${i + 1}. **${t.role}** — ${t.title || ''}${depsPart}\n`);
			}
			appendText(`${totalSteps}. **reviewer** — 最終レビュー\n`);
			if (divisionFlowApprovalMode) {
				appendText(`\n> 🔒 **承認モード有効** — 各ステップの MD ファイルが完成するたびに一時停止し、あなたの承認を待ちます。\n`);
			}
		}
		appendText(`\n`);

		// =============================================
		// Phase 2: 各タスクを Leader の生成順に 1 回だけ実行
		// =============================================

		// 承認モード時、1 ステップの .md が完成するたびにここを通って一時停止する。
		// 呼び出し側は true が返ったら即座に return し、ユーザーの承認を待つ。
		const maybePauseForApproval = (
			flowRole: string,
			output: string,
			mdInfo: { mdFileName: string; mdFilePath: string },
			completedIndex: number,
			reviewerDone: boolean,
		): boolean => {
			if (!divisionFlowApprovalMode || !workspaceFolderPath) return false;
			writeOrchestrationState(workspaceFolderPath, {
				approved: false,
				workspaceFolderPath,
				sessionId,
				currentInput,
				tasks,
				taskOutputs,
				nextIndex: completedIndex,
				totalSteps,
				reviewerDone,
			});
			onFinalMessage({
				fullText,
				fullReasoning: '',
				anthropicReasoning: null,
				flowReview: {
					flowRole,
					mdFileName: mdInfo.mdFileName,
					mdFilePath: mdInfo.mdFilePath,
					mdContent: output,
					sessionId,
					completedTaskIndex: completedIndex,
					totalTasks: totalSteps,
					allFlowOutputs: taskOutputs
						.filter((o): o is OrchestrationTaskOutput & { mdFileName: string; mdFilePath: string } => !!o.mdFileName && !!o.mdFilePath)
						.map(o => ({ role: o.role, mdFileName: o.mdFileName, mdFilePath: o.mdFilePath, mdContent: o.output })),
				},
			});
			flushCommandRunsAfterFinalMessage();
			return true;
		};

		const buildPriorContextHistory = (): { role: 'user' | 'assistant'; content: string }[] => {
			const entries: { role: 'user' | 'assistant'; content: string }[] = [];
			let total = 0;
			for (const o of taskOutputs) {
				if (!o.output || !o.output.trim()) continue;
				const truncated = truncateForContext(o.output.trim(), MAX_CHARS_PER_CONTEXT);
				if (total + truncated.length > MAX_TOTAL_CONTEXT_CHARS) {
					entries.push({
						role: 'assistant',
						content: `[${o.role}] 以降の先行出力は合計上限を超過したため省略されました。`,
					});
					break;
				}
				entries.push({
					role: 'assistant',
					content: `## 先行タスクの出力: ${o.role} — ${o.title || ''}\n\n${truncated}`,
				});
				total += truncated.length;
			}
			return entries;
		};

		for (let i = resumeFromIndex; i < tasks.length; i++) {
			drainInjections();
			const task = tasks[i];
			const role = (task.role || '').toLowerCase();
			appendText(`\n---\n\n### ${i + 1}. ${task.role} — ${task.title || ''}\n\n`);

			// File Search はローカル実装でワークスペース全件走査
			if (isFileSearchRole(role)) {
				if (!workspaceFolderPath) {
					const skipMsg = '(ワークスペース未指定のため file-search をスキップ)';
					appendText(`${skipMsg}\n\n`);
					taskOutputs.push({ role: 'filesearch', title: task.title || '', output: skipMsg });
					continue;
				}
				const query = [
					currentInput,
					task.input || task.title || '',
				].filter(Boolean).join('\n');
				try {
					const rawOutput = buildFileSearchOutputLooped(workspaceFolderPath, query, {
						maxIterations: 3,
						onIterationProgress: (text) => appendText(text),
					});
					const capped = truncateForContext(rawOutput, MAX_CHARS_PER_CONTEXT);
					const mdInfo = buildMdFileInfo(workspaceFolderPath, 'file-search');
					if (mdInfo) {
						saveFlowResultAsMd(workspaceFolderPath, 'file-search', task.title || '', capped, sessionId || 'file-search');
					}
					taskOutputs.push({ role: 'filesearch', title: task.title || '', output: capped, mdFileName: mdInfo?.mdFileName, mdFilePath: mdInfo?.mdFilePath });
					const sizeMsg = rawOutput.length > capped.length
						? `（${rawOutput.length.toLocaleString()} → ${capped.length.toLocaleString()} 文字に要約）`
						: `（${capped.length.toLocaleString()} 文字）`;
					appendText(`📂 file-search 完了 ${sizeMsg}\n\n`);
					if (mdInfo && maybePauseForApproval('filesearch', capped, mdInfo, i + 1, false)) return;
				} catch (e: any) {
					const errMsg = `(file-search failed: ${e?.message || String(e)})`;
					appendText(`⚠️ file-search エラー: ${e?.message || String(e)}\n\n`);
					taskOutputs.push({ role: 'filesearch', title: task.title || '', output: errMsg });
				}
				continue;
			}

			// Image generation: 画像生成ロールの特別処理
			if (isImageRole(role)) {
				if (!workspaceFolderPath) {
					const skipMsg = '(ワークスペース未指定のため image generation をスキップ)';
					appendText(`${skipMsg}\n\n`);
					taskOutputs.push({ role: 'image', title: task.title || '', output: skipMsg });
					continue;
				}

				const imagePrompt = [
					currentInput,
					task.input || task.title || '',
					task.description || '',
				].filter(Boolean).join('\n');

				try {
					appendText(`🖼️ 画像生成中...\n`);

					// Try to call Division API for image generation
					const execResult = await callDivisionTaskExecute(
						endpointBase, projectId, task.role,
						`ユーザーリクエスト: ${imagePrompt}\n\n画像またはビジュアルコンテンツを生成してください。`,
						controller.signal,
						(chunk) => appendText(chunk),
						divisionApiKey, sessionId,
						withStackContext([...chatHistory, ...buildPriorContextHistory()]),
						workspaceFolderPath,
					);

					if (execResult.error) {
						const errMsg = `(image generation failed: ${execResult.error})`;
						appendText(`⚠️ 画像生成エラー: ${execResult.error}\n\n`);
						taskOutputs.push({ role: 'image', title: task.title || '', output: errMsg });
					} else {
						const output = execResult.output || '';
						appendText(`\n\n`);
						const mdInfo = buildMdFileInfo(workspaceFolderPath, 'image');
						if (mdInfo) {
							saveFlowResultAsMd(workspaceFolderPath, 'image', task.title || '', output, sessionId || 'image');
						}
						taskOutputs.push({ role: 'image', title: task.title || '', output, mdFileName: mdInfo?.mdFileName, mdFilePath: mdInfo?.mdFilePath });
						appendText(`🖼️ 画像生成完了\n\n`);
						if (mdInfo && maybePauseForApproval('image', output, mdInfo, i + 1, false)) return;
					}
				} catch (e: any) {
					const errMsg = `(image generation failed: ${e?.message || String(e)})`;
					appendText(`⚠️ 画像生成エラー: ${e?.message || String(e)}\n\n`);
					taskOutputs.push({ role: 'image', title: task.title || '', output: errMsg });
				}
				continue;
			}

			// Server-side で既に output がついているケース
			if (task.output && task.output.trim()) {
				appendText(`(サーバー実行済み)\n\n${task.output}\n\n`);
				taskOutputs.push({ role: task.role, title: task.title || '', output: task.output });
				continue;
			}

			const isDesigner = role === 'design' || role === 'designer';
			const taskInstruction = isDesigner
				? [
					`直前の assistant メッセージに先行タスクの出力が添付されています（ある場合）。それを踏まえ、ユーザー要求を視覚化した **Markdown 形式のデザインドキュメント** を作成してください。`,
					``,
					`### 出力要件`,
					`- 出力は Markdown のみ（HTML コードブロックは使わないでください）。`,
					`- 見出し・箇条書き・表を使い、画面構成 / レイアウト / 配色・タイポグラフィ / コンポーネント一覧を具体的に記述してください。`,
					`- ワイヤーフレームが必要な場合は ASCII アートまたは Mermaid 記法で表現してください。`,
					`- 実装コードではなく、後続の coder エージェントがそのまま実装に使える**デザイン仕様書**が目的です。`,
				].join('\n')
				: `直前の assistant メッセージに先行タスクの出力が添付されています（ある場合）。それを参考に、あなたの担当タスクを遂行してください。出力は Markdown 形式で、後続エージェントが直接利用できるよう具体的・網羅的にまとめてください。`;

			// Coder/Writer 系には実装指示と existing files を添付
			let extraCoderBlock = '';
			if (isCoderLikeRole(role)) {
				const existingFilePaths: string[] = [];
				for (const o of taskOutputs) {
					if (!isFileSearchRole(o.role)) continue;
					const lines = (o.output || '').split('\n');
					for (const line of lines) {
						const m = line.match(/^###\s+`([^`]+)`\s*$/);
						if (m && m[1]) existingFilePaths.push(m[1]);
					}
				}
				const existingBlock = existingFilePaths.length > 0
					? [
						``,
						`### ワークスペースに既に存在するファイル（必ず編集すること）`,
						...existingFilePaths.map(p => `- \`${p}\``),
						``,
						`上記ファイルは既に存在します。SEARCH/REPLACE 形式で**差分編集**してください。新規作成ブロックで同じパスを上書きしないでください。`,
					].join('\n')
					: '';
				extraCoderBlock = [
					``,
					`### 出力フォーマット (必須)`,
					`- 既存ファイルの編集: SEARCH/REPLACE ブロック`,
					`- 新規ファイル: ` + '```lang:path/to/file```' + ` ブロック`,
					`- セットアップコマンド: ` + '```bash```' + ` ブロック`,
					`- 探索系コマンド (find / ls / cat / grep / head / tail) は禁止。コンテキストは既に揃っています。`,
					existingBlock,
					``,
					codeOutputInstructions,
				].join('\n');
			}

			const taskInput = [
				`## ユーザーの元のリクエスト`,
				currentInput,
				``,
				`## あなたの担当タスク`,
				`- ロール: ${task.role}`,
				`- タイトル: ${task.title || ''}`,
				task.description ? `- 説明: ${task.description}` : '',
				task.reason ? `- 目的: ${task.reason}` : '',
				``,
				`## 指示`,
				taskInstruction,
				extraCoderBlock,
			].filter(Boolean).join('\n');

			const taskHistory = withStackContext([...chatHistory, ...buildPriorContextHistory()]);

			const execResult = await callDivisionTaskExecute(
				endpointBase, projectId, task.role, taskInput, controller.signal,
				(chunk) => appendText(chunk),
				divisionApiKey, sessionId,
				taskHistory,
				workspaceFolderPath,
			);

			if (execResult.error) {
				const errMsg = `(execution failed: ${execResult.error})`;
				appendText(`\n\n⚠️ ${task.role} 実行エラー: ${execResult.error}\n\n`);
				taskOutputs.push({ role: task.role, title: task.title || '', output: errMsg });
				continue;
			}

			const output = execResult.output || '';
			const fences = (output.match(/```/g) || []).length;
			if (fences % 2 !== 0) appendText(`\n\`\`\`\n`);
			appendText(`\n\n`);

			// Coder 系: コードブロックを実ファイルに書き出す
			if (output && workspaceFolderPath && isCoderLikeRole(role)) {
				const { savedFiles, fileOperations, commands } = saveCodeBlocksFromOutput(output, sessionId || 'task', workspaceFolderPath);
				if (savedFiles.length > 0) {
					appendText(`\n`);
					for (const sf of savedFiles) {
						appendText(`${path.basename(sf.filePath)} — \`${sf.filePath}\`\n`);
					}
					appendText(`\n`);
					if (fileOperations.length > 0 && onFileOperation) onFileOperation(fileOperations);
				}
				queueCommandRuns(commands);
			}

			// 既知のロールは .division/*.md にも保存
			const mdInfo = (output && workspaceFolderPath) ? buildMdFileInfo(workspaceFolderPath, role) : null;
			if (mdInfo && workspaceFolderPath) {
				saveFlowResultAsMd(workspaceFolderPath, task.role, task.title || '', output, sessionId || 'task');
			}
			taskOutputs.push({ role: task.role, title: task.title || '', output, mdFileName: mdInfo?.mdFileName, mdFilePath: mdInfo?.mdFilePath });

			if (mdInfo && maybePauseForApproval(task.role, output, mdInfo, i + 1, false)) return;
		}

		// =============================================
		// Phase 3: Reviewer 最終レビュー (1 回のみ、リトライなし)
		// =============================================

		// 承認モードでレビュー結果も承認済みなら、レビューを再実行せずそのまま完了させる。
		if (isResuming && resumeState?.reviewerDone) {
			if (sessionId) activeServerSessionIds.delete(sessionId);
			if (workspaceFolderPath) clearOrchestrationState(workspaceFolderPath);
			onFinalMessage({ fullText, fullReasoning: '', anthropicReasoning: null });
			flushCommandRunsAfterFinalMessage();
			return;
		}

		drainInjections();
		appendText(`\n---\n\n### ${totalSteps}. reviewer — 最終レビュー\n\n`);

		const reviewContextHistory: { role: 'user' | 'assistant'; content: string }[] = [];
		{
			let total = 0;
			for (const o of taskOutputs) {
				if (!o.output || !o.output.trim()) continue;
				const truncated = truncateForContext(o.output.trim(), MAX_CHARS_PER_CONTEXT);
				if (total + truncated.length > MAX_TOTAL_CONTEXT_CHARS) {
					reviewContextHistory.push({
						role: 'assistant',
						content: `[${o.role}] 以降は合計上限を超過したため省略。`,
					});
					break;
				}
				reviewContextHistory.push({
					role: 'assistant',
					content: `## ${o.role} — ${o.title || ''}\n\n${truncated}`,
				});
				total += truncated.length;
			}
		}

		const reviewPrompt = [
			`## ユーザーの要求`,
			currentInput,
			``,
			`## 指示`,
			`直前の assistant メッセージとして、Leader が分解した各タスクの出力 (${taskOutputs.length} 件) が添付されています。`,
			`それら全体を最終レビューし、評価結果と改善提案を Markdown で返してください。`,
			``,
			`### 出力要件`,
			`- 1 行目に必ず ` + '`判定: 合格`' + ` または ` + '`判定: 不合格`' + ` を明記。`,
			`- 続けて、観点別の所見・具体的な改善指示を箇条書きで。`,
			``,
			`このレビュー結果は **次のユーザーメッセージに自動的に context として添付** されます。`,
			`次の AI がそのまま改善ステップに着手できるよう、修正対象ファイル / 関数 / 実装手順を具体的に書いてください。`,
		].join('\n');

		// Reviewer 出力をレンダラ側で抽出するための delimiter。
		// HTML コメントなので markdown レンダラ上は不可視。
		const REVIEWER_BEGIN = '<!-- DIVISION_REVIEWER_BEGIN -->';
		const REVIEWER_END = '<!-- DIVISION_REVIEWER_END -->';

		appendText(`\n${REVIEWER_BEGIN}\n`);

		const reviewResult = await callDivisionTaskExecute(
			endpointBase, projectId, 'review', reviewPrompt, controller.signal,
			(chunk) => appendText(chunk),
			divisionApiKey, sessionId,
			withStackContext(reviewContextHistory),
			workspaceFolderPath,
		);

		appendText(`\n${REVIEWER_END}\n`);

		let reviewMdInfo: { mdFileName: string; mdFilePath: string } | null = null;
		if (reviewResult.error) {
			appendText(`\n⚠️ Reviewer エラー: ${reviewResult.error}\n`);
		} else if (reviewResult.output && workspaceFolderPath) {
			reviewMdInfo = buildMdFileInfo(workspaceFolderPath, 'review');
			if (reviewMdInfo) {
				saveFlowResultAsMd(workspaceFolderPath, 'review', '', reviewResult.output, sessionId || 'review');
			}
		}

		if (reviewMdInfo && reviewResult.output) {
			// 承認モードで再開後に確定メッセージを組み立て直せるよう、
			// レビュー内容も taskOutputs に残しておく。
			taskOutputs.push({ role: 'review', title: '', output: reviewResult.output, mdFileName: reviewMdInfo.mdFileName, mdFilePath: reviewMdInfo.mdFilePath });
			if (maybePauseForApproval('review', reviewResult.output, reviewMdInfo, totalSteps, true)) {
				return;
			}
		}

		if (sessionId) activeServerSessionIds.delete(sessionId);
		if (workspaceFolderPath) clearOrchestrationState(workspaceFolderPath);
		onFinalMessage({ fullText, fullReasoning: '', anthropicReasoning: null });
		flushCommandRunsAfterFinalMessage();
		return;

	} catch (error: any) {
		if (error?.name === 'AbortError') {
			onFinalMessage({ fullText: '', fullReasoning: '', anthropicReasoning: null })
			return
		}
		onError({ message: error?.message || 'Division API request failed', fullError: error instanceof Error ? error : null })
	}
};


type CallFnOfProvider = {
	[providerName in ProviderName]: {
		sendChat: (params: SendChatParams_Internal) => Promise<void>;
		sendFIM: ((params: SendFIMParams_Internal) => void) | null;
		list: ((params: ListParams_Internal<any>) => void) | null;
	}
}

export const sendLLMMessageToProviderImplementation = {
	divisionAPI: {
		sendChat: sendDivisionAPIChat,
		sendFIM: null,
		list: divisionAPIList,
	},
	anthropic: {
		sendChat: sendAnthropicChat,
		sendFIM: null,
		list: null,
	},
	openAI: {
		sendChat: (params) => _sendOpenAICompatibleChat(params),
		sendFIM: null,
		list: null,
	},
	xAI: {
		sendChat: (params) => _sendOpenAICompatibleChat(params),
		sendFIM: null,
		list: null,
	},
	gemini: {
		sendChat: (params) => sendGeminiChat(params),
		sendFIM: null,
		list: null,
	},
	mistral: {
		sendChat: (params) => _sendOpenAICompatibleChat(params),
		sendFIM: (params) => sendMistralFIM(params),
		list: null,
	},
	ollama: {
		sendChat: (params) => _sendOpenAICompatibleChat(params),
		sendFIM: sendOllamaFIM,
		list: ollamaList,
	},
	openAICompatible: {
		sendChat: (params) => _sendOpenAICompatibleChat(params), // using openai's SDK is not ideal (your implementation might not do tools, reasoning, FIM etc correctly), talk to us for a custom integration
		sendFIM: (params) => _sendOpenAICompatibleFIM(params),
		list: null,
	},
	openRouter: {
		sendChat: (params) => _sendOpenAICompatibleChat(params),
		sendFIM: (params) => _sendOpenAICompatibleFIM(params),
		list: null,
	},
	vLLM: {
		sendChat: (params) => _sendOpenAICompatibleChat(params),
		sendFIM: (params) => _sendOpenAICompatibleFIM(params),
		list: (params) => _openaiCompatibleList(params),
	},
	deepseek: {
		sendChat: (params) => _sendOpenAICompatibleChat(params),
		sendFIM: null,
		list: null,
	},
	groq: {
		sendChat: (params) => _sendOpenAICompatibleChat(params),
		sendFIM: null,
		list: null,
	},

	lmStudio: {
		// lmStudio has no suffix parameter in /completions, so sendFIM might not work
		sendChat: (params) => _sendOpenAICompatibleChat(params),
		sendFIM: (params) => _sendOpenAICompatibleFIM(params),
		list: (params) => _openaiCompatibleList(params),
	},
	liteLLM: {
		sendChat: (params) => _sendOpenAICompatibleChat(params),
		sendFIM: (params) => _sendOpenAICompatibleFIM(params),
		list: null,
	},
	googleVertex: {
		sendChat: (params) => _sendOpenAICompatibleChat(params),
		sendFIM: null,
		list: null,
	},
	microsoftAzure: {
		sendChat: (params) => _sendOpenAICompatibleChat(params),
		sendFIM: null,
		list: null,
	},
	awsBedrock: {
		sendChat: (params) => _sendOpenAICompatibleChat(params),
		sendFIM: null,
		list: null,
	},
	perplexity: {
		sendChat: (params) => _sendOpenAICompatibleChat(params),
		sendFIM: null,
		list: null,
	},

} satisfies CallFnOfProvider




/*
FIM info (this may be useful in the future with vLLM, but in most cases the only way to use FIM is if the provider explicitly supports it):

qwen2.5-coder https://ollama.com/library/qwen2.5-coder/blobs/e94a8ecb9327
<|fim_prefix|>{{ .Prompt }}<|fim_suffix|>{{ .Suffix }}<|fim_middle|>

codestral https://ollama.com/library/codestral/blobs/51707752a87c
[SUFFIX]{{ .Suffix }}[PREFIX] {{ .Prompt }}

deepseek-coder-v2 https://ollama.com/library/deepseek-coder-v2/blobs/22091531faf0
<｜fim▁begin｜>{{ .Prompt }}<｜fim▁hole｜>{{ .Suffix }}<｜fim▁end｜>

starcoder2 https://ollama.com/library/starcoder2/blobs/3b190e68fefe
<file_sep>
<fim_prefix>
{{ .Prompt }}<fim_suffix>{{ .Suffix }}<fim_middle>
<|end_of_text|>

codegemma https://ollama.com/library/codegemma:2b/blobs/48d9a8140749
<|fim_prefix|>{{ .Prompt }}<|fim_suffix|>{{ .Suffix }}<|fim_middle|>

*/
