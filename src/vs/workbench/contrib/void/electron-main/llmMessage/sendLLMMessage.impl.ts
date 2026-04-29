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

import { AnthropicLLMChatMessage, GeminiLLMChatMessage, LLMChatMessage, LLMFIMMessage, ModelListParams, OllamaModelResponse, OnError, OnFinalMessage, OnText, RawToolCallObj, RawToolParamsObj, FileOperationItem, CommandOperationItem, FlowOutputEntry, DivisionAPIModelResponse } from '../../common/sendLLMMessageTypes.js';
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

const getDivisionAPIModelNames = (data: any): string[] => {
	const modelNames = new Set<string>(['division-orchestrator'])
	const addName = (value: unknown) => {
		if (typeof value === 'string' && value.trim()) {
			modelNames.add(value.trim())
		}
	}
	const addModel = (model: unknown) => {
		if (typeof model === 'string') {
			addName(model)
		}
		else if (model && typeof model === 'object') {
			const m = model as { name?: unknown; id?: unknown; model?: unknown }
			addName(m.name)
			addName(m.id)
			addName(m.model)
		}
	}

	if (Array.isArray(data)) {
		data.forEach(addModel)
	}
	if (Array.isArray(data?.providers)) {
		data.providers.forEach(addModel)
	}
	if (Array.isArray(data?.models)) {
		data.models.forEach(addModel)
	}
	if (Array.isArray(data?.data)) {
		data.data.forEach(addModel)
	}

	return [...modelNames]
}

const divisionAPIList = async ({ onSuccess: onSuccess_, onError: onError_, settingsOfProvider }: ListParams_Internal<DivisionAPIModelResponse>) => {
	try {
		const endpoint = settingsOfProvider.divisionAPI.endpoint || defaultProviderSettings.divisionAPI.endpoint
		const response = await fetch(`${endpoint.replace(/\/+$/, '')}/api/models`)
		if (!response.ok) {
			onError_({ error: `Division API model list failed: ${response.status} ${response.statusText}` })
			return
		}

		const data = await response.json()
		const models = getDivisionAPIModelNames(data).map(name => ({ name }))
		if (models.length === 0) {
			onError_({ error: 'Division API model list response did not contain any models.' })
			return
		}

		onSuccess_({ models })
	}
	catch (error) {
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
	'design': 'DESIGNER.html',
	'designer': 'DESIGNER.html',
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

type OrchestrationState = {
	approved: boolean;
	sessionId?: string;
	finalRole?: string;
	currentInput?: string;
	allFlowOutputs?: FlowOutputEntry[];
	editedOutputs?: Array<{ mdFileName: string; mdContent: string }>;
	// Timestamp so we can clean up stale state files
	createdAt?: number;
};

const getOrchestrationStatePath = (workspaceFolderPath: string): string => {
	return path.join(workspaceFolderPath, '.division', '.orchestration-state.json');
};

const readOrchestrationState = (workspaceFolderPath: string): OrchestrationState | null => {
	try {
		const p = getOrchestrationStatePath(workspaceFolderPath);
		if (!fs.existsSync(p)) return null;
		const raw = fs.readFileSync(p, 'utf-8');
		return JSON.parse(raw) as OrchestrationState;
	} catch (_e) {
		return null;
	}
};

const clearOrchestrationState = (workspaceFolderPath: string): void => {
	try {
		const p = getOrchestrationStatePath(workspaceFolderPath);
		if (fs.existsSync(p)) fs.unlinkSync(p);
	} catch (_e) { /* ignore */ }
};

// Apply user-edited MD contents to the actual .division/*.md files so the final
// flow picks up the edits.
const applyEditedMdFiles = (
	workspaceFolderPath: string,
	editedOutputs: Array<{ mdFileName: string; mdContent: string }>,
): void => {
	const divisionDir = path.join(workspaceFolderPath, '.division');
	try { fs.mkdirSync(divisionDir, { recursive: true }); } catch (_e) { /* ignore */ }
	for (const out of editedOutputs) {
		if (!out || !out.mdFileName) continue;
		const filePath = path.join(divisionDir, out.mdFileName);
		try {
			fs.writeFileSync(filePath, out.mdContent ?? '', 'utf-8');
		} catch (_e) { /* ignore */ }
	}
};

// Load the (possibly user-edited) MD files from .division/ so they can be used
// as context for the final synthesis flow.
const loadFlowMdFiles = (
	workspaceFolderPath: string,
	entries: FlowOutputEntry[],
): FlowOutputEntry[] => {
	const result: FlowOutputEntry[] = [];
	for (const e of entries) {
		const filePath = path.join(workspaceFolderPath, '.division', e.mdFileName);
		let mdContent = e.mdContent;
		try {
			if (fs.existsSync(filePath)) {
				mdContent = fs.readFileSync(filePath, 'utf-8');
			}
		} catch (_e) { /* ignore */ }
		result.push({ ...e, mdContent });
	}
	return result;
};



// Auto file create/edit: extract code blocks from AI output
// For NEW files: creates them via fs (directories need creation)
// For EDIT operations (SEARCH/REPLACE): returns FileOperationItem for renderer to apply via editCodeService
// For commands (bash/terminal): returns CommandOperationItem for renderer to execute
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

			// Check if code contains SEARCH/REPLACE blocks
			const searchReplaceRegex = /<<<SEARCH\n([\s\S]*?)\n===\n([\s\S]*?)\n>>>REPLACE/g;
			const hasSearchReplace = searchReplaceRegex.test(code);
			searchReplaceRegex.lastIndex = 0; // reset after test

			if (hasSearchReplace && fs.existsSync(fullPath)) {
				// EDIT MODE: send search/replace blocks to renderer for editor-integrated editing
				// Convert from Division API format (<<<SEARCH/===/>>>REPLACE) to
				// editor format (<<<<<<< ORIGINAL/=======/>>>>>>> UPDATED)
				let editorFormattedBlocks = code;
				editorFormattedBlocks = editorFormattedBlocks.replace(/<<<SEARCH\n/g, '<<<<<<< ORIGINAL\n');
				editorFormattedBlocks = editorFormattedBlocks.replace(/\n===\n/g, '\n=======\n');
				editorFormattedBlocks = editorFormattedBlocks.replace(/\n>>>REPLACE/g, '\n>>>>>>> UPDATED');

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
		const response = await fetch(`${endpointBase}/api/generate/stream`, {
			method: 'POST',
			headers,
			body: JSON.stringify({
				input,
				provider: divisionModelName,
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
// `.division` は Orchestra が Division API の中間成果物 (*.md / DESIGNER.html) を
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

// Division API orchestration の各ループ最大試行回数のデフォルト値。
// 実際の値はユーザー設定から sendChat 呼び出し時に渡される。
// ユーザーは AbortController 経由でいつでも中断できる。
const DEFAULT_MAX_REVIEW_ITERATIONS = 10;

// レビュアー出力が「合格」かどうかを判定する。
// 日本語/英語の典型的な合否表現と、明示的な不合格マーカーの両方を見る。
const judgeReviewPass = (reviewOutput: string): boolean => {
	if (!reviewOutput || !reviewOutput.trim()) return false;
	const lower = reviewOutput.toLowerCase();

	// 明示的な不合格マーカーがあれば即 fail
	const failMarkers = [
		'不合格', '要修正', '修正が必要', 'NG', '却下',
		'fail', 'failed', 'rejected', 'not approved', 'needs fix', 'needs revision',
		'requires change', 'must fix', 'must change',
	];
	for (const m of failMarkers) {
		if (reviewOutput.includes(m) || lower.includes(m.toLowerCase())) return false;
	}

	// 合格マーカー
	const passMarkers = [
		'合格', '承認', '問題ありません', '問題なし', '完了', 'OK です', 'OKです',
		'approved', 'pass', 'passed', 'lgtm', 'looks good', 'all good', 'no issues',
		'no problems', 'ready to merge', 'ready to ship',
	];
	for (const m of passMarkers) {
		if (reviewOutput.includes(m) || lower.includes(m.toLowerCase())) return true;
	}

	// どちらのマーカーも無い場合は、保守的に「不合格」とみなす
	// （Reviewer が合格判定を明示していない = 改善点だけ列挙している可能性が高い）
	return false;
};

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

const buildFileSearchOutput = (workspaceFolderPath: string, query: string): string => {
	const { matches, summary, tree } = searchWorkspaceFiles(workspaceFolderPath, query);
	const lines: string[] = [
		`## ワークスペース: \`${workspaceFolderPath}\``,
		'',
		summary,
		'',
		`### ディレクトリツリー（関連ファイルの追加読取が必要ならパスを明示してください）`,
		'',
		tree,
		'',
	];
	for (const m of matches) {
		const ext = path.extname(m.relativePath).slice(1) || 'text';
		lines.push(`### \`${m.relativePath}\``);
		lines.push('```' + ext);
		lines.push(m.content);
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
		divisionMaxBriefGateIterations,
		divisionMaxReviewerIterations,
		divisionMaxReviewIterations,
		workspaceFolderPath,
		modelName: selectedModel,
		chatMode,
		settingsOfProvider,
		takePendingInjection,
	} = params

	const normalizeIterationCap = (raw: number | undefined): number => {
		if (typeof raw !== 'number' || !Number.isFinite(raw)) return DEFAULT_MAX_REVIEW_ITERATIONS;
		if (raw < 1) return 1;
		return Math.floor(raw);
	};
	const legacyMaxReviewIterations = normalizeIterationCap(divisionMaxReviewIterations);
	const maxBriefGateIterations = divisionMaxBriefGateIterations === undefined
		? legacyMaxReviewIterations
		: normalizeIterationCap(divisionMaxBriefGateIterations);
	const maxReviewerIterations = divisionMaxReviewerIterations === undefined
		? legacyMaxReviewIterations
		: normalizeIterationCap(divisionMaxReviewerIterations);

	try {
		const endpointBase = settingsOfProvider.divisionAPI.endpoint || 'https://api.division.he-ro.jp';
		const projectId = divisionProjectIdParam || '';
		const prompt = buildPromptFromMessages(messages, separateSystemMessage);

		const controller = new AbortController()
		_setAborter(() => { controller.abort() })

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
		// ORCHESTRATION MODE: /api/tasks/create + /api/tasks/execute
		//
		// Diagrammed orchestration flow:
		//
		// User → Leader → (Ideaman, Search, Research)
		//      → (Designer, Image, Planner) → Leader(Todos)
		//      → File Search → Coder/Writer → Reviewer
		//      → OK: result / Not OK: File Search loop
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

		// Size caps to avoid "request entity too large" (HTTP 500) from the Division API.
		// The server has an aggressive body-size limit, so we must cap *both* the
		// intermediate flow outputs (.md files) and the raw chatHistory entries
		// coming from the sidebar (the user may have pasted long logs as prompts).
		const MAX_CHARS_PER_CONTEXT = 8_000;        // per flow output / per chatHistory entry
		const MAX_TOTAL_CONTEXT_CHARS = 150_000;    // across all context entries combined
		const MAX_CHARS_PER_HISTORY_MSG = 8_000;    // per raw chat message
		const MAX_TOTAL_HISTORY_CHARS = 20_000;     // raw chatHistory total budget
		const truncateForContext = (s: string, max: number): string => {
			if (!s) return '';
			if (s.length <= max) return s;
			const head = s.slice(0, Math.floor(max * 0.8));
			const tail = s.slice(-Math.floor(max * 0.15));
			return `${head}\n\n... [中略 ${s.length - head.length - tail.length} 文字省略] ...\n\n${tail}`;
		};

		// Build the raw chatHistory but also cap it. Long pasted build logs in
		// prior user prompts were causing synthesis POSTs to exceed the limit
		// even before we added any intermediate context.
		const rawChatHistory = messages.slice(0, -1)
			.filter(msg => msg.role !== 'system' && msg.role !== 'developer')
			.map(msg => ({
				role: (msg.role === 'model' ? 'assistant' : msg.role) as 'user' | 'assistant',
				content: extractContent(msg)
			}));
		const chatHistory: { role: 'user' | 'assistant'; content: string }[] = [];
		{
			// Keep the most recent messages first (they're most relevant) and drop
			// older ones once the total budget is exhausted.
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

		// ワークスペースの言語・フレームワークを 1 度だけ検出し、以降すべての AI 呼び出し
		// （Leader / 中間タスク / Coder / Reviewer）で同じ assistant turn として添付する。
		// これで downstream AI は「このプロジェクトは Flutter なのか Next.js なのか」を
		// 確実に把握できる。
		const stackContextMarkdown = workspaceFolderPath
			? buildStackContextMarkdown(workspaceFolderPath)
			: '';
		const stackContextTurn: { role: 'user' | 'assistant'; content: string } | null =
			stackContextMarkdown ? { role: 'assistant', content: stackContextMarkdown } : null;
		if (stackContextTurn) {
			console.log('[DivisionAPI] Detected workspace stack context:\n' + stackContextMarkdown);
		}

		// Helper: prepend stack context (if any) to a chatHistory array.
		const withStackContext = (
			history: { role: 'user' | 'assistant'; content: string }[],
		): { role: 'user' | 'assistant'; content: string }[] =>
			stackContextTurn ? [stackContextTurn, ...history] : history;

		// ---------- ユーザー割り込み（interject）のドレイン ----------
		// orchestration 中に UI 側で「ちょっと待って、これも考慮して」と
		// 追加メッセージが来たとき、次の注入ポイント（Leader / 各中間タスク /
		// Coder / Reviewer / 再分解）の直前でここを呼び出し、currentInput と
		// chatHistory に取り込む。以降の AI リクエストは拡張された currentInput を
		// 見るので、「途中参加」が自然に反映される。
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
			// chat history にも user turn として追記。これで Leader/Coder/Reviewer は
			// 「ユーザーが会話を続けた」のと同じ形で新情報を受け取れる。
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

		// Helper to recognize file-searcher variants (reused by runIntermediateCycle and elsewhere)
		const isFileSearchRole = (r: string): boolean => {
			const role = (r || '').toLowerCase();
			return role === 'file-search' || role === 'filesearch' || role === 'file_search'
				|| role === 'file-searcher' || role === 'filesearcher';
		};

		const normalizeFlowRole = (r: string): string => (r || '').toLowerCase().replace(/[_\s-]+/g, '');
		// Wave 1 (pre-wave): file-search のみ。ワークスペース全件読み込みを
		// **必ず最初に単独で実行**してから後続ウェーブにコンテキストを渡す。
		const isPreWaveRole = (r: string): boolean => isFileSearchRole(r || '');
		// Wave 2: 情報収集系（filesearch を除く ideaman / search / research）
		const isFirstWaveRole = (r: string): boolean => {
			const role = normalizeFlowRole(r);
			return role === 'ideaman' || role === 'idea' || role === 'search' || role === 'searcher'
				|| role === 'research' || role === 'researcher' || role === 'deepresearch' || role === 'deepresearcher';
		};
		// Wave 3: 設計・画像・計画
		const isSecondWaveRole = (r: string): boolean => {
			const role = normalizeFlowRole(r);
			return role === 'design' || role === 'designer' || role === 'image' || role === 'planner' || role === 'planning';
		};
		// 内部 rank は安定ソート用の番号で、UI 表示の wave 番号とは別物。
		// rank 0 = wave1 (filesearch), rank 1 = wave2 (info gathering),
		// rank 2 = wave3 (design/image/plan), rank 3 = wave4+ (others)。
		const flowStageRank = (task: DivisionTask): number => {
			if (isPreWaveRole(task.role)) return 0;
			if (isFirstWaveRole(task.role)) return 1;
			if (isSecondWaveRole(task.role)) return 2;
			return 3;
		};
		// pre-wave 内に複数 file-search が来てもユーザー入力順を保つので
		// intra ランクは現状不要だが、interface の互換のため残す。
		const intraStageRank = (_task: DivisionTask): number => 0;
		const orderedTaskStages = (tasks: DivisionTask[]): DivisionTask[] =>
			tasks
				.map((task, index) => ({ task, index }))
				.sort((a, b) => {
					const rankDiff = flowStageRank(a.task) - flowStageRank(b.task);
					if (rankDiff !== 0) return rankDiff;
					const intraDiff = intraStageRank(a.task) - intraStageRank(b.task);
					if (intraDiff !== 0) return intraDiff;
					return a.index - b.index;
				})
				.map(({ task }) => task);

		// Shared helper: decompose user input via Leader AI and execute all intermediate
		// (non-Coder/Reviewer) tasks, returning the collected flow outputs.
		//
		// Phase A の初回実行と、レビュー失敗後の再試行の両方から呼ぶ。
		// 再試行時 (isRetry=true) はフロー承認用ポーズを行わず、呼び出し側が
		// そのまま synthesis+review を走らせる。
		const runIntermediateCycle = async (
			cycleInput: string,
			cycleLabel: string,
		): Promise<{
			flowOutputs: FlowOutputEntry[];
			sessionId: string;
			finalRole: string;
			aborted: boolean;
		}> => {
			// Leader 呼び出し前の割り込み取り込み（cycleInput にも merge する）
			if (drainInjections()) {
				cycleInput = [
					cycleInput,
					'',
					'---',
					'',
					'## ユーザーからの追加リクエスト（途中送信）',
					// drainInjections がすでに currentInput に追記済みなので、その末尾を再利用
					currentInput.split('## ユーザーからの追加リクエスト（途中送信）').pop()?.trim() || '',
				].join('\n');
			}
			console.log(`[DivisionAPI] /api/tasks/create request (${cycleLabel}):`, JSON.stringify({
				projectId,
				inputLength: cycleInput.length,
				inputPreview: cycleInput.substring(0, 100),
				chatHistoryLength: chatHistory.length,
			}));

			appendText(`**Leader AI** がタスクを分析中 (${cycleLabel})...\n\n`);

			// Leader にも技術スタックを伝えることで、スタックに合ったタスク分解を誘導する。
			const leaderChatHistory = withStackContext(chatHistory);
			const taskResult = await callDivisionTaskCreate(
				endpointBase, projectId, cycleInput, controller.signal,
				divisionApiKey, leaderChatHistory.length > 0 ? leaderChatHistory : undefined,
				workspaceFolderPath,
			);

			if (taskResult.error) {
				appendText(`❌ **Task Create Error:** ${taskResult.error}\n\n`);
				return { flowOutputs: [], sessionId: '', finalRole: '', aborted: true };
			}

			const { sessionId: cycleSessionId, tasks: rawTasks, finalRole: cycleFinalRole } = taskResult;

			// --- DEBUG: Leader が返した raw タスクを必ずログ出力する（filesearch 注入問題の調査用）
			console.log(`[DivisionAPI][debug] Leader raw tasks (count=${rawTasks.length}):`,
				rawTasks.map(t => ({ role: t.role, title: t.title, taskId: t.taskId })));
			console.log(`[DivisionAPI][debug] workspaceFolderPath = ${workspaceFolderPath || '(empty)'}`);

			// Filter out server-side Coder/Reviewer tasks (these run locally).
			// File Search はワークスペース全体の事前読み込み担当として、search / research と
			// 同じファースト・ウェーブで動かす（runFinalFlow 直前ではなく、情報収集と同時に実行）。
			const EXCLUDED_SERVER_ROLES = new Set(['coder', 'coding', 'review', 'reviewer']);
			const serverTasks = rawTasks.filter(t => !EXCLUDED_SERVER_ROLES.has((t.role || '').toLowerCase()));

			// Leader が file-search タスクを生成しなかった場合でも、ファースト・ウェーブで
			// 必ずワークスペース全件読み込みを行うため、合成タスクを自動挿入する。
			// 先頭に挿入することで、後続の Search / Research / Ideaman が
			// 「実際のコードベース内容」を assistant 履歴経由で参照できる。
			//
			// NOTE: workspaceFolderPath が空でも、ワークスペース未指定スキップメッセージを
			// task.output に入れて中間 markdown 化はする（ただし読み込みはしない）。
			// 「filesearch が wave1 に出てこない」というユーザー報告を防ぐため、
			// workspaceFolderPath の有無に関わらず必ず先頭に注入する。
			const hasFileSearch = serverTasks.some(t => isFileSearchRole(t.role || ''));
			if (!hasFileSearch) {
				serverTasks.unshift({
					taskId: 'auto-filesearch',
					role: 'filesearch',
					title: 'ワークスペース全件読み込み',
					description: 'すべてのフォルダ・ファイルを走査し、後続エージェントにコンテキストとして共有する',
				});
				console.log(`[DivisionAPI] Auto-injected filesearch task at index 0 (Leader did not produce one).`);
			} else {
				const fsTask = serverTasks.find(t => isFileSearchRole(t.role || ''));
				console.log(`[DivisionAPI] Leader already produced a file-search task (role="${fsTask?.role}"), skipping auto-inject.`);
			}

			const tasks = orderedTaskStages(serverTasks);
			const droppedCount = rawTasks.filter(t => EXCLUDED_SERVER_ROLES.has((t.role || '').toLowerCase())).length;
			if (droppedCount > 0) {
				console.log(`[DivisionAPI] Skipped ${droppedCount} server-side Coder/Reviewer task(s) — they run locally.`);
			}

			console.log(`[DivisionAPI][debug] Final ordered task list (count=${tasks.length}):`,
				tasks.map((t, idx) => ({
					idx,
					role: t.role,
					stage: isPreWaveRole(t.role)
						? 'wave1'
						: isFirstWaveRole(t.role)
							? 'wave2'
							: isSecondWaveRole(t.role)
								? 'wave3'
								: 'wave4+',
					title: t.title,
				})));

			// Display task decomposition (wave 番号 + filesearch を強調)
			if (tasks.length > 0) {
				for (let i = 0; i < tasks.length; i++) {
					const t = tasks[i];
					const wave = isPreWaveRole(t.role)
						? 'wave1'
						: isFirstWaveRole(t.role)
							? 'wave2'
							: isSecondWaveRole(t.role)
								? 'wave3'
								: 'wave4+';
					const displayRole = isFileSearchRole(t.role || '') ? 'filesearch' : t.role;
					const marker = isFileSearchRole(t.role || '') ? '📂 ' : '';
					appendText(`${i + 1}. [${wave}] ${marker}**${displayRole}** — ${t.title}\n`);
				}
				appendText(`\n`);
			}
			if (cycleFinalRole) {
				appendText(`合成ロール: **${cycleFinalRole}**\n\n`);
			}

			// Context history built from prior task outputs (for downstream tasks)
			const buildPriorContextHistory = (): { role: 'user' | 'assistant'; content: string }[] => {
				const entries: { role: 'user' | 'assistant'; content: string }[] = [];
				let total = 0;
				for (const t of tasks) {
					if (!t.output || !t.output.trim()) continue;
					const truncated = truncateForContext(t.output.trim(), MAX_CHARS_PER_CONTEXT);
					if (total + truncated.length > MAX_TOTAL_CONTEXT_CHARS) {
						entries.push({
							role: 'assistant',
							content: `[${t.role}] 以降の先行出力は合計上限を超過したため省略されました。`,
						});
						break;
					}
					entries.push({
						role: 'assistant',
						content: `## 先行タスクの出力: ${t.role} — ${t.title || ''}\n\n${truncated}`,
					});
					total += truncated.length;
				}
				return entries;
			};

			for (let i = 0; i < tasks.length; i++) {
				// 各中間タスク実行前にも割り込みをチェック。次タスク以降の taskInput は
				// cycleInput / currentInput を使って組み立てるので、drain により自動伝播する。
				drainInjections();
				const task = tasks[i];
				const role = (task.role || '').toLowerCase();

				if (isFileSearchRole(role)) {
					// ファースト・ウェーブで動かすため、先行 Markdown は通常空。
					// ランキング用のキーワード抽出はユーザーの元入力を主軸にし、
					// Leader が付けたタスク詳細・先行出力（あれば）も補助で連結する。
					const priorMarkdown = buildPriorContextHistory()
						.map(entry => entry.content)
						.join('\n\n');
					const query = [
						cycleInput,
						task.input || task.title || '',
						priorMarkdown ? `\n\n## 先行 Markdown コンテキスト\n${priorMarkdown}` : '',
					].filter(Boolean).join('\n');
					appendText(`### ${i + 1}. file-search — ${task.title || ''}\n\nすべてのフォルダ・ファイルを走査して読み込み中...\n\n`);
					try {
						const rawOutput = workspaceFolderPath
							? buildFileSearchOutput(workspaceFolderPath, query)
							: '(ワークスペース未指定のため file-search をスキップ)';
						const capped = truncateForContext(rawOutput, MAX_CHARS_PER_CONTEXT);
						task.output = capped;
						const sizeMsg = rawOutput.length > capped.length
							? `（${rawOutput.length.toLocaleString()} → ${capped.length.toLocaleString()} 文字に要約）`
							: `（${capped.length.toLocaleString()} 文字）`;
						appendText(`📂 file-search 完了 ${sizeMsg}\n\n`);
					} catch (e: any) {
						appendText(`⚠️ file-search エラー: ${e?.message || String(e)}\n\n`);
						task.output = `(file-search failed: ${e?.message || String(e)})`;
					}
					continue;
				}

				if (task.output && task.output.trim()) {
					appendText(`### ${i + 1}. ${task.role} — ${task.title || ''}\n\n(サーバー実行済み)\n\n`);
					continue;
				}

				const isDesignerRole = role === 'design' || role === 'designer';
				const taskInstruction = isDesignerRole
					? [
						`直前の assistant メッセージに先行タスクの出力が添付されています（ある場合）。それを踏まえ、ユーザーの要求を視覚化した **1 枚の自己完結型 HTML ファイル** を生成してください。`,
						``,
						`### 出力要件`,
						`- 必ず ` + '```html' + ` ... ` + '```' + ` のコードブロック 1 つだけで返してください。説明文やプレーンテキストは書かないでください。`,
						`- ` + '`<!DOCTYPE html>`' + ` から始まる完全な HTML ドキュメント（head / body / style / script すべて含むインライン構成）にしてください。外部 CSS / JS / 画像 URL は使わないでください。`,
						`- スタイルは ` + '`<style>`' + ` タグ内のインライン CSS（必要なら簡素なアニメーションも可）で記述してください。`,
						`- 実装コードではなく**デザインモック**です。レイアウト・配色・タイポグラフィ・主要コンポーネントの見た目がブラウザで確認できることが目的です。`,
						`- モダンで洗練されたビジュアル、適切な余白、視覚的階層、アクセシブルなコントラストを意識してください。`,
					].join('\n')
					: `直前の assistant メッセージに先行タスクの出力が添付されています（ある場合）。それを参考に、あなたの担当タスクを遂行してください。出力は Markdown 形式で、後続エージェントが直接利用できるよう具体的・網羅的にまとめてください。`;

				// 割り込みがあると currentInput が cycleInput より長くなっているので、
				// 常に currentInput を優先して渡す（最新のユーザー意図を反映するため）。
				const effectiveCycleInput = currentInput.length > cycleInput.length ? currentInput : cycleInput;
				const taskInput = [
					`## ユーザーの元のリクエスト`,
					effectiveCycleInput,
					``,
					`## あなたの担当タスク`,
					`- ロール: ${task.role}`,
					`- タイトル: ${task.title || ''}`,
					task.description ? `- 説明: ${task.description}` : '',
					task.reason ? `- 目的: ${task.reason}` : '',
					``,
					`## 指示`,
					taskInstruction,
				].filter(Boolean).join('\n');

				const taskChatHistory = withStackContext([...chatHistory, ...buildPriorContextHistory()]);

				appendText(`### ${i + 1}. ${task.role} — ${task.title || ''}\n\n`);

				const execResult = await callDivisionTaskExecute(
					endpointBase, projectId, task.role, taskInput, controller.signal,
					(chunk) => appendText(chunk),
					divisionApiKey, cycleSessionId,
					taskChatHistory,
					workspaceFolderPath,
				);

				if (execResult.error) {
					appendText(`\n\n⚠️ ${task.role} 実行エラー: ${execResult.error}\n\n`);
					task.output = `(execution failed: ${execResult.error})`;
					continue;
				}

				task.output = execResult.output || '';
				const fences = (task.output.match(/```/g) || []).length;
				if (fences % 2 !== 0) appendText(`\n\`\`\`\n`);
				appendText(`\n\n`);
			}

			// The diagram returns all wave Markdown to Leader, then Leader emits Todos
			// for File Search. Store this as LEADER.md so downstream File Search and
			// Coder/Writer receive the final task list, not just raw wave outputs.
			if (tasks.some(task => task.output && task.output.trim())) {
				drainInjections();
				appendText(`### ${tasks.length + 1}. leader — Todos 作成\n\n`);
				const effectiveCycleInput = currentInput.length > cycleInput.length ? currentInput : cycleInput;
				const leaderTodoPrompt = [
					`## ユーザーの要求`,
					effectiveCycleInput,
					``,
					`## あなたの役割`,
					`あなたは Leader です。直前の assistant メッセージ群に、Ideaman / Search / Research / Designer / Image / Planner などの Markdown 出力が添付されています。`,
					`それらを統合し、次の File Search と Coder/Writer が迷わず動ける Todo リストを作ってください。`,
					``,
					`## 出力要件`,
					`- Markdown で出力してください。`,
					`- 最終成果物がコード実装なら、調査すべき既存ファイル・編集対象・実装順・検証方法を Todo として具体化してください。`,
					`- 最終成果物が文章なら、参照すべき情報・構成・執筆順・レビュー観点を Todo として具体化してください。`,
					`- 後続の File Search に渡す検索観点を必ず含めてください。`,
					`- 最後に「最終ロール: ${cycleFinalRole || 'coder'}」を明記してください。`,
				].join('\n');

				const leaderTodoResult = await callDivisionTaskExecute(
					endpointBase, projectId, 'leader', leaderTodoPrompt, controller.signal,
					(chunk) => appendText(chunk),
					divisionApiKey, cycleSessionId,
					withStackContext([...chatHistory, ...buildPriorContextHistory()]),
					workspaceFolderPath,
				);

				if (leaderTodoResult.error) {
					appendText(`\n\n⚠️ leader Todos 作成エラー: ${leaderTodoResult.error}\n\n`);
					tasks.push({
						taskId: 'leader-todos',
						role: 'leader',
						title: 'File Search / Coder Todos',
						output: `(leader todo generation failed: ${leaderTodoResult.error})`,
					});
				}
				else {
					const output = leaderTodoResult.output || '';
					tasks.push({
						taskId: 'leader-todos',
						role: 'leader',
						title: 'File Search / Coder Todos',
						output,
					});
					const fences = (output.match(/```/g) || []).length;
					if (fences % 2 !== 0) appendText(`\n\`\`\`\n`);
					appendText(`\n\n`);
				}
			}

			// Build flowOutputs & persist MDs
			const flowOutputs: FlowOutputEntry[] = [];
			for (const task of tasks) {
				if (!task.output) continue;
				const roleKey = task.role.toLowerCase();
				const isDesigner = roleKey === 'design' || roleKey === 'designer';

				let sanitized = task.output;
				const opens = (sanitized.match(/```/g) || []).length;
				if (opens % 2 !== 0) sanitized += '\n```\n';

				let contentToSave = sanitized;
				if (isDesigner) {
					const htmlMatch = sanitized.match(/```(?:html)?\s*\n([\s\S]*?)```/i);
					if (htmlMatch && htmlMatch[1]) {
						contentToSave = htmlMatch[1].trim() + '\n';
					} else {
						contentToSave = sanitized.replace(/```[a-zA-Z0-9]*\s*\n?/g, '').replace(/```/g, '').trim() + '\n';
					}
				}

				if (workspaceFolderPath && sanitized.trim() && FLOW_ROLE_TO_FILENAME[roleKey]) {
					const savedPath = saveFlowResultAsMd(workspaceFolderPath, task.role, task.title || '', contentToSave, cycleSessionId);
					const mdFileName = FLOW_ROLE_TO_FILENAME[roleKey];
					if (mdFileName) {
						flowOutputs.push({
							role: task.role,
							mdFileName,
							mdFilePath: savedPath || path.join(workspaceFolderPath, '.division', mdFileName),
							mdContent: isDesigner ? contentToSave : sanitized,
						});
					}
				}
			}

			return { flowOutputs, sessionId: cycleSessionId, finalRole: cycleFinalRole, aborted: false };
		};

		// Shared helper: run the final File Search + synthesis + review flow given
		// intermediate outputs. On review failure, feed the review feedback back to
		// File Search first, then Coder/Writer, until approval or max iterations.
		// （Leader による再分解は行わず、File Search → Coder/Writer → Reviewer のループ）
		const runFinalFlow = async (
			initialFinalRole: string,
			initialSessionId: string,
			initialFlowOutputs: FlowOutputEntry[],
		): Promise<void> => {
			let finalRoleArg = initialFinalRole;
			let sessionIdArg = initialSessionId;
			let flowOutputs = initialFlowOutputs;
			let iteration = 0;
			let briefGateAttempts = 0;
			let reviewerAttempts = 0;
			let lastReviewFeedback = '';
			let lastBriefGateFeedback = '';
			let retrySource: 'brief_gate' | 'reviewer' | null = null;

			const runFileSearchBeforeCoder = async (reason: string, feedback: string = '', regenerateTodos: boolean = false): Promise<void> => {
				if (!workspaceFolderPath) return;

				// Reviewer Not OK で Todo を再生成するとき、image / planner / designer / ideaman /
				// search / research などの中間 MD はユーザーが手動編集している可能性があるため、
				// 必ずディスク (.division/*.md) から読み込み直してから File Search のクエリと
				// Leader Todo 再生成プロンプトに反映する。
				if (regenerateTodos) {
					const reloadable = flowOutputs.filter(o => !isFileSearchRole(o.role) && !!o.mdFileName);
					const others = flowOutputs.filter(o => isFileSearchRole(o.role) || !o.mdFileName);
					const reloaded = loadFlowMdFiles(workspaceFolderPath, reloadable);
					const reloadedTargets = reloaded
						.map(o => o.mdFileName)
						.filter((v, i, a) => v && a.indexOf(v) === i)
						.join(', ');
					if (reloadedTargets) {
						appendText(`\n📥 中間 Markdown を再読込 (${reloadedTargets})\n`);
					}
					flowOutputs = [...reloaded, ...others];
				}

				const priorMarkdown = flowOutputs
					.filter(o => !isFileSearchRole(o.role))
					.map(o => `## ${o.role} の出力 (${o.mdFileName})\n\n${o.mdContent}`)
					.join('\n\n');
				const query = [
					`## ユーザーの要求`,
					currentInput,
					priorMarkdown ? `\n\n## 先行 Markdown コンテキスト\n${priorMarkdown}` : '',
					feedback.trim() ? `\n\n## 再調査要求\n${feedback}` : '',
				].join('\n');

				appendText(`\n---\n\n**File Search** (${reason}) 開始...\n\n`);
				try {
					const rawOutput = buildFileSearchOutput(workspaceFolderPath, query);
					const capped = truncateForContext(rawOutput, MAX_CHARS_PER_CONTEXT);
					const mdPath = saveFlowResultAsMd(workspaceFolderPath, 'file-search', reason, capped, sessionIdArg || 'file-search');
					const fileSearchOutput: FlowOutputEntry = {
						role: 'file-search',
						mdFileName: FLOW_ROLE_TO_FILENAME['file-search'],
						mdFilePath: mdPath || path.join(workspaceFolderPath, '.division', FLOW_ROLE_TO_FILENAME['file-search']),
						mdContent: capped,
					};
					const existingIdx = flowOutputs.findIndex(o => isFileSearchRole(o.role));
					if (existingIdx >= 0) {
						flowOutputs = [
							...flowOutputs.slice(0, existingIdx),
							fileSearchOutput,
							...flowOutputs.slice(existingIdx + 1),
						];
					} else {
						flowOutputs = [...flowOutputs, fileSearchOutput];
					}
					const sizeMsg = rawOutput.length > capped.length
						? `（${rawOutput.length.toLocaleString()} → ${capped.length.toLocaleString()} 文字に要約）`
						: `（${capped.length.toLocaleString()} 文字）`;
					appendText(`📂 File Search 完了 ${sizeMsg}\n\n`);
				} catch (e: any) {
					appendText(`⚠️ File Search エラー: ${e?.message || String(e)}\n\n`);
				}

				if (!regenerateTodos) return;

				appendText(`\n---\n\n**Leader** (Todos 再生成) 開始...\n\n`);
				const todoContext = flowOutputs
					.map(o => `## ${o.role} の出力 (${o.mdFileName})\n\n${truncateForContext(o.mdContent, MAX_CHARS_PER_CONTEXT)}`)
					.join('\n\n');
				const todoPrompt = [
					`## ユーザーの要求`,
					currentInput,
					``,
					`## Reviewer Not OK による再調査結果`,
					feedback || '(レビュー指摘なし)',
					``,
					`## 現在の Markdown / File Search コンテキスト`,
					todoContext,
					``,
					`## 指示`,
					`Reviewer の不合格理由を踏まえて、File Search と Coder/Writer に渡す Todo を再生成してください。`,
					`出力は Markdown の Todo リストにし、調査対象・編集対象・実装順・検証観点を具体化してください。`,
				].join('\n');

				const todoResult = await callDivisionTaskExecute(
					endpointBase, projectId, 'leader', todoPrompt, controller.signal,
					(chunk) => appendText(chunk),
					divisionApiKey, sessionIdArg,
					withStackContext(chatHistory),
					workspaceFolderPath,
				);

				const todoOutput = todoResult.error
					? `(leader todo regeneration failed: ${todoResult.error})`
					: (todoResult.output || '');
				if (todoResult.error) appendText(`\n⚠️ Leader Todo 再生成エラー: ${todoResult.error}\n\n`);

				const mdPath = saveFlowResultAsMd(workspaceFolderPath, 'leader', 'Reviewer feedback todos', todoOutput, sessionIdArg || 'leader');
				const leaderOutput: FlowOutputEntry = {
					role: 'leader',
					mdFileName: FLOW_ROLE_TO_FILENAME['leader'],
					mdFilePath: mdPath || path.join(workspaceFolderPath, '.division', FLOW_ROLE_TO_FILENAME['leader']),
					mdContent: todoOutput,
				};
				const existingIdx = flowOutputs.findIndex(o => (o.role || '').toLowerCase() === 'leader');
				if (existingIdx >= 0) {
					flowOutputs = [
						...flowOutputs.slice(0, existingIdx),
						leaderOutput,
						...flowOutputs.slice(existingIdx + 1),
					];
				} else {
					flowOutputs = [...flowOutputs, leaderOutput];
				}
			};

			const runLeaderProgressCheck = async (reason: string, feedback: string): Promise<void> => {
				if (!workspaceFolderPath) return;

				appendText(`\n---\n\n**Leader** (進捗確認: ${reason}) 開始...\n\n`);
				const progressContext = flowOutputs
					.map(o => `## ${o.role} の出力 (${o.mdFileName})\n\n${truncateForContext(o.mdContent, MAX_CHARS_PER_CONTEXT)}`)
					.join('\n\n');
				const progressPrompt = [
					`## ユーザーの要求`,
					currentInput,
					``,
					`## Brief Gate からの再調査要求`,
					feedback || '(再調査要求なし)',
					``,
					`## File Search 後の現在コンテキスト`,
					progressContext,
					``,
					`## 指示`,
					`これは Brief Gate ループ中の進捗確認です。Todo は再生成しないでください。`,
					`再調査結果が Brief Gate の懸念に対して十分か、Coder/Writer が次に反映すべき不足点が何かを短く整理してください。`,
					`出力は Markdown で、以下を含めてください:`,
					`- 進捗サマリー`,
					`- まだ不足している情報`,
					`- Coder/Writer への反映指示`,
				].join('\n');

				const progressResult = await callDivisionTaskExecute(
					endpointBase, projectId, 'leader', progressPrompt, controller.signal,
					(chunk) => appendText(chunk),
					divisionApiKey, sessionIdArg,
					withStackContext(chatHistory),
					workspaceFolderPath,
				);

				const progressOutput = progressResult.error
					? `(leader progress check failed: ${progressResult.error})`
					: (progressResult.output || '');
				if (progressResult.error) appendText(`\n⚠️ Leader 進捗確認エラー: ${progressResult.error}\n\n`);

				const mdPath = saveFlowResultAsMd(workspaceFolderPath, 'leader', 'Brief Gate progress check', progressOutput, sessionIdArg || 'leader', true);
				const progressEntry: FlowOutputEntry = {
					role: 'leader-progress',
					mdFileName: FLOW_ROLE_TO_FILENAME['leader'],
					mdFilePath: mdPath || path.join(workspaceFolderPath, '.division', FLOW_ROLE_TO_FILENAME['leader']),
					mdContent: progressOutput,
				};
				flowOutputs = [
					...flowOutputs.filter(o => o.role !== 'leader-progress'),
					progressEntry,
				];
			};

			// Loop:
			// Coder/Writer → Brief Gate(Leader) → Reviewer.
			// Brief Gate Not OK: Reviewer をスキップし、File Search 再調査（Todos 再生成なし）→ Leader 進捗確認へ戻る。
			// Reviewer Not OK: File Search 再調査（Todos 再生成あり）へ戻る。
			while (true) {
				// Coder（synthesis）実行前の割り込み取り込み
				drainInjections();
				if (iteration > 0) {
					const feedback = retrySource === 'reviewer' ? lastReviewFeedback : lastBriefGateFeedback;
					const regenerateTodos = retrySource === 'reviewer';
					await runFileSearchBeforeCoder(
						retrySource === 'reviewer'
							? `Reviewer Not OK 反映 ${iteration + 1} 回目（Todos 再生成あり）`
							: `Brief Gate Not OK 反映 ${iteration + 1} 回目（Todos 再生成なし）`,
						feedback,
						regenerateTodos,
					);
					if (retrySource === 'brief_gate') {
						await runLeaderProgressCheck(`Brief Gate ループ ${iteration + 1} 回目`, feedback);
					}
				} else {
					// 新フロー: ファースト・ウェーブの File Search は「ワークスペース全体の事前読み込み」、
					// ここで走る 2 回目の File Search は「Leader Todos に絞った狙い撃ち再走査」を担当する。
					// Leader が確定させた Todo / 計画が手元にある状態で Coder/Writer 前にもう一度
					// 走らせることで、Coder/Writer が実装直前に最新かつ目的特化のファイル文脈を得られる。
					await runFileSearchBeforeCoder('Leader Todos に基づく Coder/Writer 直前の再走査');
				}
				// Build synthesis context from current flowOutputs
				const synthesisContextHistory: { role: 'user' | 'assistant'; content: string }[] = [];
				let totalContextChars = 0;
				for (const o of flowOutputs) {
					if (!o.mdContent || !o.mdContent.trim()) continue;
					const truncated = truncateForContext(o.mdContent, MAX_CHARS_PER_CONTEXT);
					if (totalContextChars + truncated.length > MAX_TOTAL_CONTEXT_CHARS) {
						synthesisContextHistory.push({
							role: 'assistant',
							content: `[${o.role}] 以降のコンテキストは合計上限 (${MAX_TOTAL_CONTEXT_CHARS} 文字) を超過したため省略されました。`,
						});
						break;
					}
					synthesisContextHistory.push({
						role: 'assistant',
						content: `## ${o.role} の出力 (${o.mdFileName})\n\n${truncated}`,
					});
					totalContextChars += truncated.length;
				}

				// On retries, add the prior review feedback as an additional assistant turn so
				// the Coder knows exactly what was rejected in the previous attempt.
				if (iteration > 0 && lastReviewFeedback.trim()) {
					synthesisContextHistory.push({
						role: 'assistant',
						content: `## 前回レビューでの指摘（必ず反映してください）\n\n${truncateForContext(lastReviewFeedback, MAX_CHARS_PER_CONTEXT)}`,
					});
				}
				if (iteration > 0 && lastBriefGateFeedback.trim()) {
					synthesisContextHistory.push({
						role: 'assistant',
						content: `## 前回 Brief Gate での再調査要求（必ず反映してください）\n\n${truncateForContext(lastBriefGateFeedback, MAX_CHARS_PER_CONTEXT)}`,
					});
				}

				const combinedChatHistory = withStackContext([...chatHistory, ...synthesisContextHistory]);

				// Extract existing file paths from file-search output so Coder doesn't recreate them.
				const existingFilePaths: string[] = [];
				for (const o of flowOutputs) {
					if (!isFileSearchRole(o.role)) continue;
					const lines = (o.mdContent || '').split('\n');
					for (const line of lines) {
						const m = line.match(/^###\s+`([^`]+)`\s*$/);
						if (m && m[1]) existingFilePaths.push(m[1]);
					}
				}
				const existingFilesBlock = existingFilePaths.length > 0
					? [
						``,
						`### ワークスペースに既に存在するファイル（必ず新規作成ではなく編集すること）`,
						...existingFilePaths.map(p => `- \`${p}\``),
						``,
						`上記ファイルはワークスペース内に既に存在します。ユーザー要求の実現に関連するものは、**必ず SEARCH/REPLACE 形式で差分編集** してください。新規作成ブロック（` + '```lang:path/to/file```' + `）で同じパスを上書きすると既存コードの意図が失われるため禁止です。既存ファイルを置き換えるほど大幅な刷新が必要な場合のみ、その旨を一言添えた上で ` + '```lang:path/to/file```' + ` を使ってください。`,
					].join('\n')
					: '';

				const retryNote = iteration > 0
					? `\n> ⚠️ **${iteration + 1} 回目の試行です。** 直前の assistant コンテキストに前回レビューの指摘が含まれているので、それを必ず反映してください。同じ不具合を繰り返すと再度不合格になります。\n`
					: '';

				const coderMandate = [
					`## あなたのタスク（必ず実行してください）`,
					retryNote,
					`あなたは ${finalRoleArg} です。**説明や提案だけで終わらせず、必ず以下のいずれかを行ってください**:`,
					``,
					`1. **既存ファイルを編集する（最優先）** — 直前の assistant コンテキストに含まれる既存ファイルの内容を踏まえ、SEARCH/REPLACE 形式で差分のみを出力`,
					`2. **新しいファイルを作成する（対応する既存ファイルが無い場合のみ）** — ` + '```lang:path/to/file```' + ` 形式で出力`,
					`3. **セットアップコマンドを発行する** — 依存パッケージのインストール（npm install 等）、ファイル移動、ビルドなど、ファイル編集後に必要なコマンドを ` + '```bash```' + ` 形式で出力`,
					``,
					`コード変更とコマンド実行は併用可能です。ユーザーの要求を完遂するまで全ての操作を出力してください。`,
					``,
					`### 絶対禁止事項`,
					``,
					`- **既存ファイルをゼロから書き直してはいけません**。コンテキストに含まれる既存ファイルは、必要な差分だけを SEARCH/REPLACE で編集してください。既存の import / 構造 / 命名 / スタイルは維持すること。`,
					`- **同じパスを ` + '```lang:path/to/file```' + ` で上書きしてはいけません**（既存ファイルを全文リセットするのと同じです）。どうしても全面刷新が必要な場合は、その理由を明記してから上書きしてください。`,
					`- 探索系シェルコマンド（` + '`find`' + `, ` + '`ls`' + `, ` + '`cat`' + `, ` + '`grep`' + `, ` + '`head`' + `, ` + '`tail`' + ` など）を出力してはいけません。ワークスペースのファイル一覧や内容は既に **直前の assistant メッセージ（コンテキスト）** に揃っています。`,
					`- 「まずプロジェクト構造を確認させてください」のような**前置き探索**を書かないでください。あなたは対話的 shell ではなくワンショット生成です。探索コマンドを出しても実行結果は返ってきません。`,
					`- 「~~したらどうですか」「~~を検討してください」のような提案だけの回答は禁止です。実際にコードを書き、コマンドを発行してください。`,
					`- 回答の最初から最後まで、コードブロック（SEARCH-REPLACE / ` + '```lang:path/to/file```' + ` / ` + '```bash```' + `）を必ず1つ以上含めてください。含まれていない回答は不合格です。`,
					existingFilesBlock,
				].filter(Boolean).join('\n');

				const synthesisPrompt = [
					coderMandate,
					``,
					`## ユーザーの要求`,
					currentInput,
					``,
					synthesisContextHistory.length > 0
						? `## コンテキスト参照\n直前の assistant メッセージとして添付された中間エージェントの出力（ideaman / file-searcher / designer / planner など）を参照し、ユーザーの要求を満たすコードを生成してください。**既存ファイルの内容は file-searcher の出力に含まれているため、それをベースに差分編集してください。**`
						: '',
					``,
					codeOutputInstructions,
				].filter(Boolean).join('\n');

				const iterLabel = iteration === 0 ? '' : ` (${iteration + 1} 回目)`;
				appendText(`---\n\n**合成ステップ** (${finalRoleArg})${iterLabel} 開始...\n\n`);

				const synthesisResult = await callDivisionTaskExecute(
					endpointBase, projectId, finalRoleArg, synthesisPrompt, controller.signal,
					(chunk) => appendText(chunk),
					divisionApiKey, sessionIdArg,
					combinedChatHistory,
					workspaceFolderPath,
				);

				if (synthesisResult.error) {
					appendText(`\n❌ **Synthesis Error:** ${synthesisResult.error}\n`);
					break;
				}

				const synthesisOutput = synthesisResult.output;

				if (synthesisOutput && workspaceFolderPath) {
					const { savedFiles, fileOperations, commands } = saveCodeBlocksFromOutput(synthesisOutput, sessionIdArg || 'synthesis', workspaceFolderPath);
					if (savedFiles.length > 0) {
						appendText(`\n`);
						for (const sf of savedFiles) {
							appendText(`${path.basename(sf.filePath)} — \`${sf.filePath}\`\n`);
						}
						appendText(`\n`);
						if (fileOperations.length > 0 && onFileOperation) onFileOperation(fileOperations);
					}
					queueCommandRuns(commands);

					if (FLOW_ROLE_TO_FILENAME[finalRoleArg.toLowerCase()]) {
						saveFlowResultAsMd(workspaceFolderPath, finalRoleArg, '', synthesisOutput, sessionIdArg);
					}
				}

				// Brief Gate: Coder/Writer の成果物がレビュー可能な brief を満たしているかを Leader が判定する。
				// Not OK の場合は Reviewer をスキップし、再調査要求を出して File Search に戻る。
				drainInjections();

				briefGateAttempts++;
				const briefGateAttemptLabel = briefGateAttempts === 1 ? '' : ` (${briefGateAttempts} 回目)`;
				appendText(`\n---\n\n**Brief Gate** (leader)${briefGateAttemptLabel} 開始...\n\n`);
				const gateContextHistory: { role: 'user' | 'assistant'; content: string }[] = [];
				if (synthesisOutput && synthesisOutput.trim()) {
					gateContextHistory.push({
						role: 'assistant',
						content: `## ${finalRoleArg} が生成した成果物\n\n${truncateForContext(synthesisOutput, MAX_CHARS_PER_CONTEXT)}`,
					});
				}
				if (flowOutputs.length > 0) {
					gateContextHistory.push({
						role: 'assistant',
						content: flowOutputs
							.map(o => `## ${o.role} の出力 (${o.mdFileName})\n\n${truncateForContext(o.mdContent, MAX_CHARS_PER_CONTEXT)}`)
							.join('\n\n'),
					});
				}

				const briefGatePrompt = [
					`以下の Coder/Writer 成果物が、ユーザー要求と Leader Todo / File Search の要点を満たしており、Reviewer に渡す準備ができているかを判定してください。`,
					``,
					`## ユーザーの要求`,
					currentInput,
					``,
					`## 指示`,
					`直前の assistant メッセージに ${finalRoleArg} の成果物と Markdown コンテキストが添付されています。`,
					`Reviewer に回す前の brief gate として、要件漏れ・調査不足・実装不足・明らかな方向違いがないかを確認してください。`,
					``,
					`### 出力形式（厳守）`,
					`1 行目に必ず以下のどちらかのマーカーを出力してください:`,
					`- **OK** の場合: ` + '`判定: 合格`',
					`- **Not OK** の場合: ` + '`判定: 不合格`',
					``,
					`不合格の場合は、Reviewer はスキップされます。File Search に渡す「再調査要求」を具体的に書いてください。Todo は再生成しません。`,
				].join('\n');

				const briefGateResult = await callDivisionTaskExecute(
					endpointBase, projectId, 'leader', briefGatePrompt, controller.signal,
					(chunk) => appendText(chunk),
					divisionApiKey, sessionIdArg,
					withStackContext(gateContextHistory),
					workspaceFolderPath,
				);

				if (briefGateResult.error) {
					appendText(`\n❌ **Brief Gate Error:** ${briefGateResult.error}\n`);
					break;
				}

				const briefGateOutput = briefGateResult.output || '';
				lastBriefGateFeedback = briefGateOutput;
				if (briefGateOutput && workspaceFolderPath && FLOW_ROLE_TO_FILENAME['leader']) {
					saveFlowResultAsMd(workspaceFolderPath, 'leader', 'Brief Gate', briefGateOutput, sessionIdArg, true);
				}

				const briefGatePassed = judgeReviewPass(briefGateOutput);
				if (!briefGatePassed) {
					if (briefGateAttempts >= maxBriefGateIterations) {
						appendText(`\n\n⚠️ **Brief Gate 最大試行回数 (${maxBriefGateIterations}) に到達** — Brief Gate 合格に至らなかったためここで終了します。最新の再調査要求は LEADER.md を参照してください。\n`);
						break;
					}

					iteration++;
					retrySource = 'brief_gate';
					drainInjections();
					appendText(`\n\n🔄 **Brief Gate 不合格** — Reviewer をスキップし、File Search 再調査（Todos 再生成なし）に戻ります（${iteration + 1} 回目）...\n\n`);
					continue;
				}

				// Reviewer 実行前の割り込み取り込み
				drainInjections();

				// Review step
				reviewerAttempts++;
				const reviewerAttemptLabel = reviewerAttempts === 1 ? '' : ` (${reviewerAttempts} 回目)`;
				appendText(`\n---\n\n**レビューステップ** (reviewer)${reviewerAttemptLabel} 開始...\n\n`);

				const reviewContextHistory: { role: 'user' | 'assistant'; content: string }[] = [...gateContextHistory];
				if (briefGateOutput.trim()) {
					reviewContextHistory.push({
						role: 'assistant',
						content: `## Brief Gate 判定\n\n${truncateForContext(briefGateOutput, MAX_CHARS_PER_CONTEXT)}`,
					});
				}

				const reviewPrompt = [
					`以下の成果物をレビューしてください。品質・正確性・ユーザー要求の充足度を評価してください。`,
					``,
					`## ユーザーの要求`,
					currentInput,
					``,
					`## 指示`,
					`直前の assistant メッセージに ${finalRoleArg} の成果物が添付されています。評価結果を Markdown で返してください。`,
					``,
					`### 出力形式（厳守）`,
					`1 行目に必ず以下のどちらかのマーカーを出力してください:`,
					`- **合格** の場合: ` + '`判定: 合格`',
					`- **不合格** の場合: ` + '`判定: 不合格`',
					``,
					`その下に、理由・具体的な改善点（不合格時は修正指示）を箇条書きで書いてください。改善点が無く完全に問題ない場合のみ合格にしてください。`,
				].join('\n');

				const reviewResult = await callDivisionTaskExecute(
					endpointBase, projectId, 'review', reviewPrompt, controller.signal,
					(chunk) => appendText(chunk),
					divisionApiKey, sessionIdArg,
					withStackContext(reviewContextHistory),
					workspaceFolderPath,
				);

				if (reviewResult.error) {
					appendText(`\n❌ **Review Error:** ${reviewResult.error}\n`);
					break;
				}

				const reviewOutput = reviewResult.output || '';
				lastReviewFeedback = reviewOutput;
				if (reviewOutput && workspaceFolderPath && FLOW_ROLE_TO_FILENAME['review']) {
					saveFlowResultAsMd(workspaceFolderPath, 'review', '', reviewOutput, sessionIdArg);
				}

				const passed = judgeReviewPass(reviewOutput);
				if (passed) {
					appendText(`\n\n✅ **レビュー合格** (${reviewerAttempts} 回目で合格) — 完了しました。\n`);
					break;
				}

				if (reviewerAttempts >= maxReviewerIterations) {
					appendText(`\n\n⚠️ **Reviewer 最大試行回数 (${maxReviewerIterations}) に到達** — レビュー合格に至らなかったためここで終了します。最新のレビュー指摘は REVIEW.md を参照してください。\n`);
					break;
				}

				// Failed → Reviewer 指摘では Todo も再生成してから File Search / Coder に戻る
				iteration++;
				retrySource = 'reviewer';
				// 次 Coder iteration 前の割り込み取り込み
				drainInjections();
				appendText(`\n\n🔄 **レビュー不合格** — File Search 再調査（Todos 再生成あり）に戻り、Coder/Writer を再実行します（${iteration + 1} 回目）...\n\n`);
				// finalRoleArg / sessionIdArg / flowOutputs はそのまま流用。
				// lastReviewFeedback は次ループ冒頭で synthesisContextHistory に積まれ、Leader Todo も再生成される。
			}

			if (workspaceFolderPath) clearOrchestrationState(workspaceFolderPath);
			onFinalMessage({ fullText, fullReasoning: '', anthropicReasoning: null });
			flushCommandRunsAfterFinalMessage();
		};

		// ---------- Phase B: resume after flow_review approval ----------
		if (workspaceFolderPath) {
			const resumeState = readOrchestrationState(workspaceFolderPath);
			if (resumeState && resumeState.approved && resumeState.finalRole) {
				appendText(`✅ **全フロー承認完了** — 最終フロー (${resumeState.finalRole}) を実行します。\n\n`);

				if (resumeState.editedOutputs && resumeState.editedOutputs.length > 0) {
					applyEditedMdFiles(workspaceFolderPath, resumeState.editedOutputs);
					appendText(`編集済みフロー出力 (${resumeState.editedOutputs.length} 件) を反映しました。\n\n`);
				}

				const baseOutputs = resumeState.allFlowOutputs ?? [];
				const refreshedOutputs = loadFlowMdFiles(workspaceFolderPath, baseOutputs);

				await runFinalFlow(
					resumeState.finalRole,
					resumeState.sessionId || '',
					refreshedOutputs,
				);
				return;
			}
		}

		// ---------- Phase A: initial invocation ----------
		// Delegate decompose + intermediate task execution to the shared helper
		// (runIntermediateCycle). Review-failure retries reuse the same helper inside
		// runFinalFlow, so the Phase A path here is simple.
		const initialCycle = await runIntermediateCycle(currentInput, 'initial');
		if (initialCycle.aborted) {
			// Fallback: single model via /api/generate/stream
			appendText(`フォールバック: 単一モデルで生成中...\n\n`);
			const fallbackResult = await callDivisionGenerateStream(
				endpointBase, 'gpt-5.2', prompt, controller.signal,
				(chunk) => appendText(chunk),
				'chat', divisionApiKey, undefined, workspaceFolderPath,
			);
			if (fallbackResult.error) {
				appendText(`\n❌ **Fallback Error:** ${fallbackResult.error}\n`);
			}
			onFinalMessage({ fullText, fullReasoning: '', anthropicReasoning: null });
			return;
		}

		const { sessionId, finalRole, flowOutputs } = initialCycle;

		await runFinalFlow(finalRole, sessionId, flowOutputs);
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
