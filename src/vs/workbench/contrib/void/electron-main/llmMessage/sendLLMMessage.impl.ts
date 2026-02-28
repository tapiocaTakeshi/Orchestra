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

import { AnthropicLLMChatMessage, GeminiLLMChatMessage, LLMChatMessage, LLMFIMMessage, ModelListParams, OllamaModelResponse, OnError, OnFinalMessage, OnText, RawToolCallObj, RawToolParamsObj, FileOperationItem } from '../../common/sendLLMMessageTypes.js';
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
	providerName: ProviderName;
	settingsOfProvider: SettingsOfProvider;
	modelSelectionOptions: ModelSelectionOptions | undefined;
	overridesOfModel: OverridesOfModel | undefined;
	modelName: string;
	_setAborter: (aborter: () => void) => void;
	isLoggedIn?: boolean;
}

type SendChatParams_Internal = InternalCommonMessageParams & {
	messages: LLMChatMessage[];
	separateSystemMessage: string | undefined;
	chatMode: ChatMode | null;
	mcpTools: InternalToolInfo[] | undefined;
	divisionRoleAssignments?: RoleAssignment[];
	divisionProjectId?: string;
	workspaceFolderPath?: string;
}
type SendFIMParams_Internal = InternalCommonMessageParams & { messages: LLMFIMMessage; separateSystemMessage: string | undefined; }
export type ListParams_Internal<ModelResponse> = ModelListParams<ModelResponse> & { isLoggedIn?: boolean }


const invalidApiKeyMessage = (providerName: ProviderName) => `Invalid ${displayInfoOfProviderName(providerName).title} API key.`

const getApiKey = (providerName: ProviderName, providedKey: string | undefined, isLoggedIn: boolean | undefined): string | undefined => {
	if (providedKey) return providedKey;
	if (!isLoggedIn) return undefined;

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

const newOpenAICompatibleSDK = async ({ settingsOfProvider, providerName, includeInPayload, isLoggedIn }: { settingsOfProvider: SettingsOfProvider, providerName: ProviderName, includeInPayload?: { [s: string]: any }, isLoggedIn: boolean | undefined }) => {
	const commonPayloadOpts: ClientOptions = {
		dangerouslyAllowBrowser: true,
		...includeInPayload,
	}
	if (providerName === 'openAI') {
		const thisConfig = settingsOfProvider[providerName]
		return new OpenAI({ apiKey: getApiKey(providerName, thisConfig.apiKey, isLoggedIn), ...commonPayloadOpts })
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
			apiKey: getApiKey(providerName, thisConfig.apiKey, isLoggedIn),
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
		const options = { endpoint, apiKey: getApiKey(providerName, thisConfig.apiKey, isLoggedIn), apiVersion };
		return new AzureOpenAI({ ...options, ...commonPayloadOpts });
	}
	else if (providerName === 'awsBedrock') {
		const { endpoint, apiKey } = settingsOfProvider.awsBedrock
		let baseURL = endpoint || 'http://localhost:4000/v1'
		if (!baseURL.endsWith('/v1'))
			baseURL = baseURL.replace(/\/+$/, '') + '/v1'

		return new OpenAI({ baseURL, apiKey: getApiKey(providerName, apiKey, isLoggedIn), ...commonPayloadOpts })
	}


	else if (providerName === 'deepseek') {
		const thisConfig = settingsOfProvider[providerName]
		return new OpenAI({ baseURL: 'https://api.deepseek.com/v1', apiKey: getApiKey(providerName, thisConfig.apiKey, isLoggedIn), ...commonPayloadOpts })
	}
	else if (providerName === 'openAICompatible') {
		const thisConfig = settingsOfProvider[providerName]
		const headers = parseHeadersJSON(thisConfig.headersJSON)
		return new OpenAI({ baseURL: thisConfig.endpoint, apiKey: getApiKey(providerName, thisConfig.apiKey, isLoggedIn), defaultHeaders: headers, ...commonPayloadOpts })
	}
	else if (providerName === 'groq') {
		const thisConfig = settingsOfProvider[providerName]
		return new OpenAI({ baseURL: 'https://api.groq.com/openai/v1', apiKey: getApiKey(providerName, thisConfig.apiKey, isLoggedIn), ...commonPayloadOpts })
	}
	else if (providerName === 'xAI') {
		const thisConfig = settingsOfProvider[providerName]
		return new OpenAI({ baseURL: 'https://api.x.ai/v1', apiKey: getApiKey(providerName, thisConfig.apiKey, isLoggedIn), ...commonPayloadOpts })
	}
	else if (providerName === 'mistral') {
		const thisConfig = settingsOfProvider[providerName]
		return new OpenAI({ baseURL: 'https://api.mistral.ai/v1', apiKey: getApiKey(providerName, thisConfig.apiKey, isLoggedIn), ...commonPayloadOpts })
	}
	else if (providerName === 'perplexity') {
		const thisConfig = settingsOfProvider[providerName]
		return new OpenAI({ baseURL: 'https://api.perplexity.ai', apiKey: getApiKey(providerName, thisConfig.apiKey, isLoggedIn), ...commonPayloadOpts })
	}

	else throw new Error(`Void providerName was invalid: ${providerName}.`)
}


const _sendOpenAICompatibleFIM = async ({ messages: { prefix, suffix, stopTokens }, onFinalMessage, onError, settingsOfProvider, modelName: modelName_, _setAborter, providerName, overridesOfModel, isLoggedIn }: SendFIMParams_Internal) => {

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

	const openai = await newOpenAICompatibleSDK({ providerName, settingsOfProvider, includeInPayload: additionalOpenAIPayload, isLoggedIn })
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


const _sendOpenAICompatibleChat = async ({ messages, onText, onFinalMessage, onError, settingsOfProvider, modelSelectionOptions, modelName: modelName_, _setAborter, providerName, chatMode, separateSystemMessage, overridesOfModel, mcpTools, isLoggedIn }: SendChatParams_Internal) => {
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
	const openai: OpenAI = await newOpenAICompatibleSDK({ providerName, settingsOfProvider, includeInPayload, isLoggedIn })
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
const _openaiCompatibleList = async ({ onSuccess: onSuccess_, onError: onError_, settingsOfProvider, providerName, isLoggedIn }: ListParams_Internal<OpenAIModel>) => {
	const onSuccess = ({ models }: { models: OpenAIModel[] }) => {
		onSuccess_({ models })
	}
	const onError = ({ error }: { error: string }) => {
		onError_({ error })
	}
	try {
		const openai = await newOpenAICompatibleSDK({ providerName, settingsOfProvider, isLoggedIn })
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
const sendAnthropicChat = async ({ messages, providerName, onText, onFinalMessage, onError, settingsOfProvider, modelSelectionOptions, overridesOfModel, modelName: modelName_, _setAborter, separateSystemMessage, chatMode, mcpTools, isLoggedIn }: SendChatParams_Internal) => {
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
		apiKey: getApiKey(providerName, thisConfig.apiKey, isLoggedIn),
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
const sendMistralFIM = ({ messages, onFinalMessage, onError, settingsOfProvider, overridesOfModel, modelName: modelName_, _setAborter, providerName, isLoggedIn }: SendFIMParams_Internal) => {
	const { modelName, supportsFIM } = getModelCapabilities(providerName, modelName_, overridesOfModel)
	if (!supportsFIM) {
		if (modelName === modelName_)
			onError({ message: `Model ${modelName} does not support FIM.`, fullError: null })
		else
			onError({ message: `Model ${modelName_} (${modelName}) does not support FIM.`, fullError: null })
		return
	}

	const mistral = new MistralCore({ apiKey: getApiKey(providerName, settingsOfProvider.mistral.apiKey, isLoggedIn) })
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
	isLoggedIn,
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
	const genAI = new GoogleGenAI({ apiKey: getApiKey(providerName, thisConfig.apiKey, isLoggedIn) || '' });


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

// Auto file create/edit: extract code blocks from AI output
// For NEW files: creates them via fs (directories need creation)
// For EDIT operations (SEARCH/REPLACE): returns FileOperationItem for renderer to apply via editCodeService
const saveCodeBlocksFromOutput = (output: string, _sessionId: string, workspaceFolderPath?: string): { savedFiles: { filePath: string; language: string; action: 'created' | 'updated' }[]; fileOperations: FileOperationItem[] } => {
	const savedFiles: { filePath: string; language: string; action: 'created' | 'updated' }[] = [];
	const fileOperations: FileOperationItem[] = [];

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

		if (!rawFilePath || !code) continue;

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
				// CREATE/OVERWRITE MODE: write full file content via fs
				const existed = fs.existsSync(fullPath);
				fs.mkdirSync(path.dirname(fullPath), { recursive: true });
				fs.writeFileSync(fullPath, code, 'utf-8');

				// Also notify the renderer to open the new/overwritten file in the editor
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

	return { savedFiles, fileOperations };
};




const callDivisionGenerate = async (
	endpointBase: string,
	divisionModelName: string,
	input: string,
	signal: AbortSignal,
	mode?: string
): Promise<{ output: string; error?: string; provider?: string; durationMs?: number }> => {
	try {
		const apiKey = process.env.DIVISION_API_KEY || '';
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
		};
		if (apiKey) {
			headers['Authorization'] = `Bearer ${apiKey}`;
		}
		const response = await fetch(`${endpointBase}/api/generate`, {
			method: 'POST',
			headers,
			body: JSON.stringify({
				input,
				provider: divisionModelName,
				model: divisionModelName,
				...(mode ? { mode } : {})
			}),
			signal,
		});

		const responseText = await response.text();
		if (!responseText) {
			return { output: '', error: 'Empty response body' };
		}

		const data = JSON.parse(responseText);
		if (data.status === 'error') {
			return { output: '', error: data.error || 'Unknown error', provider: data.provider, durationMs: data.durationMs };
		}
		return { output: data.output || '', provider: data.provider, durationMs: data.durationMs };
	} catch (e: any) {
		return { output: '', error: e?.message || String(e) };
	}
};

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

// Division Tasks API response types
interface DivisionTaskResponse {
	id: string;
	projectId: string;
	sessionId: string;
	role: string;
	title: string;
	description: string;
	reason: string;
	dependsOn: string[];
	orderIndex: number;
	status: string;
	output: string | null;
}

interface DivisionTasksCreateResponse {
	sessionId: string;
	projectId: string;
	input: string;
	leader: { provider: string; model: string };
	taskCount: number;
	tasks: DivisionTaskResponse[];
}

// Helper: make authenticated Division API requests
const divisionFetch = async (
	endpointBase: string,
	path: string,
	options: RequestInit = {}
): Promise<Response> => {
	const apiKey = process.env.DIVISION_API_KEY || '';
	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
		...(options.headers as Record<string, string> || {}),
	};
	if (apiKey) {
		headers['Authorization'] = `Bearer ${apiKey}`;
	}
	return fetch(`${endpointBase}${path}`, { ...options, headers });
};

const sendDivisionAPIChat = async (params: SendChatParams_Internal): Promise<void> => {
	const {
		messages,
		onText,
		onFinalMessage,
		onError,
		onFileOperation,
		_setAborter,
		separateSystemMessage,
		divisionProjectId: divisionProjectIdParam,
		workspaceFolderPath,
		modelName: selectedModel,
		chatMode,
	} = params

	try {
		const endpointBase = 'https://division-git-preview-he-ros-projects.vercel.app';
		const projectId = divisionProjectIdParam || 'demo-project-001';
		const prompt = buildPromptFromMessages(messages, separateSystemMessage);

		const controller = new AbortController()
		_setAborter(() => { controller.abort() })

		let fullText = '';
		const appendText = (text: string) => {
			fullText += text;
			onText({ fullText, fullReasoning: '' });
		};

		// =============================================
		// DIRECT MODEL MODE: If user selected a specific model (not orchestrator),
		// skip orchestration and call /api/generate directly with that model
		// =============================================
		if (selectedModel && selectedModel !== 'division-orchestrator') {
			appendText(`## 🤖 Direct Model: \`${selectedModel}\`\n`);
			appendText(`⏳ Division API \`/api/generate\` に直接リクエスト送信中...\n\n`);

			const result = await callDivisionGenerate(endpointBase, selectedModel, prompt, controller.signal, chatMode === 'agent' ? 'function_calling' : chatMode === 'gather' ? 'search' : 'chat');

			if (result.error) {
				appendText(`❌ **Error:** ${result.error}\n`);
			} else {
				const durationInfo = result.durationMs ? ` *(${result.durationMs}ms)*` : '';
				appendText(`✅ **Generated** ${durationInfo}\n\n`);
				let sanitizedOutput = result.output;
				const codeBlockOpens = (sanitizedOutput.match(/```/g) || []).length;
				if (codeBlockOpens % 2 !== 0) {
					sanitizedOutput += '\n```\n';
				}
				appendText(`${sanitizedOutput}\n\n`);

				// AUTO FILE OPERATIONS: Extract code blocks, create/edit files
				if (workspaceFolderPath) {
					const { savedFiles, fileOperations } = saveCodeBlocksFromOutput(result.output, `direct-${selectedModel}`, workspaceFolderPath);
					if (savedFiles.length > 0) {
						appendText(`---\n\n## 📁 File Operations\n\n`);
						for (const sf of savedFiles) {
							const label = sf.action === 'created' ? 'Created' : 'Edited';
							const basename = path.basename(sf.filePath);
							appendText(`📄 **${basename}** — ${label}\n`);
							appendText(`\`${sf.filePath}\`\n\n`);
						}
						// Send file operations to renderer for editor-integrated editing
						if (fileOperations.length > 0 && onFileOperation) {
							onFileOperation(fileOperations);
						}
					}
				}
			}

			onFinalMessage({ fullText, fullReasoning: '', anthropicReasoning: null });
			return;
		}

		// =============================================
		// ORCHESTRATION MODE: division-orchestrator selected
		// PHASE 1: Task Generation via /api/tasks/create
		// Leader AI automatically breaks down the request into tasks
		// =============================================
		appendText(`## 📋 Phase 1: Task Generation\n`);
		appendText(`**Division API** \`/api/tasks/create\` にリクエスト送信中...\n\n`);



		// Extract chat history and current input
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

		const chatHistory = messages.slice(0, -1)
			.filter(msg => msg.role !== 'system' && msg.role !== 'developer')
			.map(msg => ({
				role: (msg.role === 'model' ? 'assistant' : msg.role) as 'user' | 'assistant',
				content: extractContent(msg)
			}));
		const lastMsg = messages[messages.length - 1];
		let currentInput = lastMsg ? extractContent(lastMsg) : prompt;

		// Fallback: if extractContent returned empty, use the full prompt
		if (!currentInput || currentInput.trim() === '') {
			console.warn('[DivisionAPI] extractContent returned empty, falling back to buildPromptFromMessages. lastMsg:', JSON.stringify(lastMsg).substring(0, 200));
			currentInput = prompt;
		}

		const chatHistoryLength = chatHistory.length
		const messagesCount = messages.length

		let divisionMode = 'chat';
		if (chatMode === 'agent') {
			divisionMode = 'function_calling';
		} else if (chatMode === 'gather') {
			divisionMode = 'search';
		}

		// Debug: log the actual request body
		console.log('[DivisionAPI] /api/tasks/create request:', JSON.stringify({
			projectId,
			mode: divisionMode,
			inputLength: currentInput.length,
			inputPreview: currentInput.substring(0, 100),
			chatHistoryLength,
			messagesCount,
		}));

		const createResponse = await divisionFetch(endpointBase, '/api/tasks/create', {
			method: 'POST',
			body: JSON.stringify({ projectId, mode: divisionMode, input: currentInput, chatHistory, model: selectedModel !== 'division-orchestrator' ? selectedModel : undefined }),
			signal: controller.signal,
		});

		const createText = await createResponse.text();

		// Log HTTP status for debugging
		if (!createResponse.ok) {
			console.error(`[DivisionAPI] /api/tasks/create returned HTTP ${createResponse.status}: ${createText.substring(0, 500)}`);
			appendText(`❌ **Error:** HTTP ${createResponse.status} from /api/tasks/create\n`);
			appendText(`\`\`\`\n${createText.substring(0, 300)}\n\`\`\`\n\n`);
		}

		if (!createText) {
			appendText(`❌ **Error:** Empty response from /api/tasks/create\n`);
			onFinalMessage({ fullText, fullReasoning: '', anthropicReasoning: null });
			return;
		}

		const createData: DivisionTasksCreateResponse = JSON.parse(createText);

		if ((createData as any).error) {
			appendText(`❌ **Error:** ${(createData as any).error}\n\n`);
			// Fallback: single agent via /api/generate
			appendText(`---\n\n## 💬 Fallback: Single Agent Response\n`);
			appendText(`⏳ /api/generate で直接質問中...\n\n`);
			const fallbackModel = selectedModel !== 'division-orchestrator' ? selectedModel : 'gpt-5.2';
			const fallbackResult = await callDivisionGenerate(endpointBase, fallbackModel, prompt, controller.signal, divisionMode);
			if (fallbackResult.error) {
				appendText(`❌ **Error:** ${fallbackResult.error}\n`);
			} else {
				appendText(fallbackResult.output + '\n');
			}
			onFinalMessage({ fullText, fullReasoning: '', anthropicReasoning: null });
			return;
		}

		const { sessionId, leader, tasks } = createData;

		let leaderModelName = leader.model;
		if (leaderModelName === 'gpt-4o' || leaderModelName === 'gpt-4o-2024-05-13' || leaderModelName === 'gpt-4o-2024-08-06') leaderModelName = 'gpt-5.2';
		else if (leaderModelName === 'gemini-2.5-flash' || leaderModelName === 'gemini-1.5-flash') leaderModelName = 'gemini-3-flash';
		else if (leaderModelName === 'claude-3-5-sonnet-20241022') leaderModelName = 'claude-sonnet-4.5';

		appendText(`✅ **Leader:** \`${leaderModelName}\`\n`);
		appendText(`📎 **Session:** \`${sessionId}\`\n`);
		appendText(`📦 **タスク数:** ${tasks.length}\n\n`);

		// =============================================
		// PHASE 2: Task Classification (display tasks from API)
		// =============================================
		appendText(`---\n\n## 🗂️ Phase 2: Task Classification\n\n`);
		appendText(`| # | Role | Title | Description |\n`);
		appendText(`|---|------|-------|-------------|\n`);
		for (let i = 0; i < tasks.length; i++) {
			const t = tasks[i];
			appendText(`| ${i + 1} | ${t.role} | ${t.title} | ${t.description} |\n`);
		}
		appendText(`\n`);

		// =============================================
		// PHASE 3: Task Execution via /api/generate + PATCH status
		// =============================================
		appendText(`---\n\n## 🚀 Phase 3: Task Execution\n\n`);

		for (let i = 0; i < tasks.length; i++) {
			const task = tasks[i];

			appendText(`### ${i + 1}. ${task.role} — ${task.title}\n`);
			appendText(`**Description:** ${task.description}\n`);
			if (task.reason) {
				appendText(`**Reason:** ${task.reason}\n`);
			}
			appendText(`\n⏳ Division API で実行中...\n\n`);

			// Map role to a model name for /api/generate
			const modelForRole = task.role === 'coding' || task.role === 'coder'
				? 'claude-sonnet-4.5'
				: task.role === 'search' || task.role === 'research'
					? 'sonar-pro'
					: task.role === 'planning' || task.role === 'planner'
						? 'gemini-3-flash'
						: task.role === 'design'
							? 'gemini-3-flash'
							: task.role === 'writing'
								? 'gpt-5.2'
								: 'gpt-5.2';

			const taskPrompt = `You are a ${task.role} specialist. Complete the following task based on the original user request.

IMPORTANT FILE OUTPUT RULES:

## For NEW files — use code blocks with file path:
\`\`\`language:relative/path/to/filename.ext
full file content here
\`\`\`

## For EDITING existing files — use SEARCH/REPLACE blocks:
\`\`\`language:relative/path/to/existing-file.ext
<<<SEARCH
exact lines to find in the file
===
replacement lines
>>>REPLACE
\`\`\`

You can include multiple SEARCH/REPLACE blocks in one code block for the same file.

## Rules:
- Use paths relative to the project root
- For NEW files, provide the COMPLETE file content
- For EDITING existing files, use SEARCH/REPLACE with enough context lines to uniquely identify the location
- The SEARCH section must match the existing file EXACTLY (including whitespace)
- If the edit is too large (more than 60% of the file), provide the complete file instead

Example of editing an existing file:
\`\`\`typescript:src/utils/auth.ts
<<<SEARCH
export function authenticate(token: string): boolean {
  return false;
}
===
export function authenticate(token: string): boolean {
  return verifyToken(token);
}
>>>REPLACE
\`\`\`

Example of creating a new file:
\`\`\`typescript:src/utils/newHelper.ts
import { hash } from 'crypto';

export function hashPassword(pw: string): string {
  return hash('sha256', pw);
}
\`\`\`

Original user request:
${prompt}

Your specific task:
${task.title}

Detailed instructions:
${task.description}

Provide a thorough and complete response. Output all code files with their paths.`;

			let subTaskMode = 'chat';
			if (task.role === 'coding' || task.role === 'coder') {
				subTaskMode = 'function_calling';
			} else if (task.role === 'search' || task.role === 'research') {
				subTaskMode = 'search';
			}

			const result = await callDivisionGenerate(endpointBase, modelForRole, taskPrompt, controller.signal, subTaskMode);

			if (result.error) {
				appendText(`❌ **Error:** ${result.error}\n\n`);
				// PATCH task status to "failed"
				try {
					await divisionFetch(endpointBase, `/api/tasks/${task.id}`, {
						method: 'PATCH',
						body: JSON.stringify({ status: 'failed', output: result.error }),
						signal: controller.signal,
					});
				} catch (_patchErr) { /* ignore patch errors */ }
			} else {
				const durationInfo = result.durationMs ? ` *(${result.durationMs}ms)*` : '';
				appendText(`✅ **Generated** ${durationInfo}\n\n`);
				// Ensure all code blocks in output are properly closed
				let sanitizedOutput = result.output;
				const codeBlockOpens = (sanitizedOutput.match(/```/g) || []).length;
				if (codeBlockOpens % 2 !== 0) {
					// Odd number of ``` means an unclosed code block — close it
					sanitizedOutput += '\n```\n';
				}
				appendText(`${sanitizedOutput}\n\n`);

				// AUTO FILE OPERATIONS: Extract code blocks, create/edit files
				const { savedFiles, fileOperations } = saveCodeBlocksFromOutput(result.output, sessionId, workspaceFolderPath);
				if (savedFiles.length > 0) {
					appendText(`\n`);
					for (const sf of savedFiles) {
						const label = sf.action === 'created' ? 'Created' : 'Edited';
						const basename = path.basename(sf.filePath);
						appendText(`📄 **${basename}** — ${label}\n`);
						appendText(`\`${sf.filePath}\`\n\n`);
					}

					// Send file operations to renderer for editor-integrated editing
					if (fileOperations.length > 0 && onFileOperation) {
						onFileOperation(fileOperations);
					}
				}

				// PATCH task status to "completed"
				try {
					await divisionFetch(endpointBase, `/api/tasks/${task.id}`, {
						method: 'PATCH',
						body: JSON.stringify({ status: 'completed', output: result.output }),
						signal: controller.signal,
					});
				} catch (_patchErr) { /* ignore patch errors */ }
			}
		}

		// Final separator
		appendText(`---\n\n✅ **全${tasks.length}タスク完了** (Session: \`${sessionId}\`)\n`);

		onFinalMessage({ fullText, fullReasoning: '', anthropicReasoning: null });

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
		list: null,
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
