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

import { AnthropicLLMChatMessage, GeminiLLMChatMessage, LLMChatMessage, LLMFIMMessage, ModelListParams, OllamaModelResponse, OnError, OnFinalMessage, OnText, RawToolCallObj, RawToolParamsObj, FileOperationItem, CommandOperationItem, FlowOutputEntry, FlowReviewData } from '../../common/sendLLMMessageTypes.js';
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
}

type SendChatParams_Internal = InternalCommonMessageParams & {
	messages: LLMChatMessage[];
	separateSystemMessage: string | undefined;
	chatMode: ChatMode | null;
	mcpTools: InternalToolInfo[] | undefined;
	divisionRoleAssignments?: RoleAssignment[];
	divisionProjectId?: string;
	divisionApiKey?: string;
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
	'design': 'DESIGN.md',
	'search': 'SEARCH.md',
	'file-search': 'FILE-SEARCH.md',
	'filesearch': 'FILE-SEARCH.md',
	'research': 'RESEARCH.md',
	'deep-research': 'RESEARCH.md',
	'review': 'REVIEW.md',
	'writing': 'WRITING.md',
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

const writeOrchestrationState = (workspaceFolderPath: string, state: OrchestrationState): void => {
	try {
		const divisionDir = path.join(workspaceFolderPath, '.division');
		fs.mkdirSync(divisionDir, { recursive: true });
		const p = getOrchestrationStatePath(workspaceFolderPath);
		fs.writeFileSync(p, JSON.stringify(state, null, 2), 'utf-8');
	} catch (_e) { /* ignore */ }
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
): Promise<{
	sessionId: string;
	tasks: { taskId: string; role: string; title: string; input?: string; output?: string; provider?: string; dependsOn?: string[] }[];
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
				// Ask the server to skip the Coder step — we run it ourselves on the client
				// using the user's actual workspace via /api/generate/stream. If the server
				// ignores these params it's harmless; if it honors any of them it saves time/cost.
				skipCoder: true,
				excludeRoles: ['coder', 'coding'],
				runCoder: false,
				...(chatHistory && chatHistory.length > 0 ? { chatHistory } : {}),
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
const IGNORED_DIRS = new Set([
	'node_modules', '.git', '.next', 'dist', 'build', 'out', '.cache',
	'.turbo', '.vercel', '.nuxt', 'coverage', '__pycache__', '.venv', 'venv',
	'.idea', '.vscode', '.DS_Store', 'target', '.gradle',
]);
const TEXT_EXTENSIONS = new Set([
	'.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.md', '.mdx',
	'.html', '.css', '.scss', '.sass', '.less', '.vue', '.svelte',
	'.py', '.rb', '.go', '.rs', '.java', '.kt', '.swift', '.dart',
	'.c', '.cpp', '.h', '.hpp', '.cs', '.php', '.sh', '.bash', '.zsh',
	'.yml', '.yaml', '.toml', '.xml', '.txt', '.env', '.sql', '.graphql',
]);
const MAX_SEARCH_FILES = 30;
const MAX_FILE_SIZE_BYTES = 100 * 1024; // 100KB
const MAX_TOTAL_OUTPUT_CHARS = 60000;

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
	return Array.from(new Set(tokens.filter(t => t.length >= 2 && !stopWords.has(t))));
};

const walkDirectory = (dir: string, root: string, results: string[], maxFiles: number): void => {
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
		if (entry.isDirectory()) {
			walkDirectory(full, root, results, maxFiles);
		} else if (entry.isFile()) {
			const ext = path.extname(entry.name).toLowerCase();
			if (TEXT_EXTENSIONS.has(ext) || entry.name === 'package.json' || entry.name === 'README.md') {
				results.push(full);
			}
		}
	}
};

const searchWorkspaceFiles = (
	workspaceFolderPath: string,
	query: string,
): { matches: { relativePath: string; content: string }[]; summary: string } => {
	const allFiles: string[] = [];
	walkDirectory(workspaceFolderPath, workspaceFolderPath, allFiles, 5000);

	const keywords = extractKeywordsFromQuery(query);
	const scored: { file: string; score: number }[] = [];

	for (const file of allFiles) {
		const relative = path.relative(workspaceFolderPath, file).toLowerCase();
		let score = 0;
		for (const kw of keywords) {
			if (relative.includes(kw)) {
				score += relative.endsWith('/' + kw) || relative === kw ? 10 : 3;
			}
			const base = path.basename(relative);
			if (base.includes(kw)) score += 2;
		}
		if (score > 0) scored.push({ file, score });
	}

	// If no path-based matches, fall back to content search on a limited set
	const pickedFiles: string[] = [];
	if (scored.length > 0) {
		scored.sort((a, b) => b.score - a.score);
		pickedFiles.push(...scored.slice(0, MAX_SEARCH_FILES).map(s => s.file));
	} else {
		// Fallback: scan file contents for keywords (limited number of files)
		const contentScored: { file: string; score: number }[] = [];
		const candidatesForContent = allFiles.slice(0, 500);
		for (const file of candidatesForContent) {
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
		pickedFiles.push(...contentScored.slice(0, MAX_SEARCH_FILES).map(s => s.file));
	}

	const matches: { relativePath: string; content: string }[] = [];
	let totalChars = 0;
	for (const file of pickedFiles) {
		try {
			const stat = fs.statSync(file);
			if (stat.size > MAX_FILE_SIZE_BYTES) continue;
			const content = fs.readFileSync(file, 'utf-8');
			const relativePath = path.relative(workspaceFolderPath, file);
			if (totalChars + content.length > MAX_TOTAL_OUTPUT_CHARS) {
				const remaining = MAX_TOTAL_OUTPUT_CHARS - totalChars;
				if (remaining > 200) {
					matches.push({ relativePath, content: content.slice(0, remaining) + '\n... (truncated)' });
					totalChars = MAX_TOTAL_OUTPUT_CHARS;
				}
				break;
			}
			matches.push({ relativePath, content });
			totalChars += content.length;
		} catch (_e) { /* skip */ }
	}

	const summary = matches.length === 0
		? `ワークスペース内にキーワード「${keywords.join(', ')}」に一致するファイルが見つかりませんでした。`
		: `${matches.length} 件のファイルが見つかりました（キーワード: ${keywords.join(', ')}）。`;

	return { matches, summary };
};

const buildFileSearchOutput = (workspaceFolderPath: string, query: string): string => {
	const { matches, summary } = searchWorkspaceFiles(workspaceFolderPath, query);
	const lines: string[] = [summary, ''];
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
	} = params

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
				mode, divisionApiKey,
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
						if (commands.length > 0 && onCommandRun) {
							onCommandRun(commands);
						}
					}
				}
			}

			onFinalMessage({ fullText, fullReasoning: '', anthropicReasoning: null });
			return;
		}

		// =============================================
		// ORCHESTRATION MODE: /api/tasks/create + /api/tasks/execute
		//
		// Two-phase orchestration with a single consolidated flow_review:
		//
		// Phase A (first invocation):
		//   1. Call /api/tasks/create for task decomposition (Leader AI + Wave agents)
		//   2. Execute all intermediate flows (design, search, planning, research, ...)
		//      — save each output as .division/*.md
		//   3. Emit ONE flow_review with all intermediate outputs, persist
		//      orchestration state to .division/.orchestration-state.json, and return.
		//
		// Phase B (second invocation, after user approval):
		//   4. Detect the approved state file, apply user-edited MD, then run the
		//      final flow (synthesis/coder/writer) via /api/tasks/execute with the
		//      edited context
		//   5. Run the review step via /api/tasks/execute, clear state, and return.
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

		const chatHistory = messages.slice(0, -1)
			.filter(msg => msg.role !== 'system' && msg.role !== 'developer')
			.map(msg => ({
				role: (msg.role === 'model' ? 'assistant' : msg.role) as 'user' | 'assistant',
				content: extractContent(msg)
			}));

		const codeOutputInstructions = buildCodeOutputInstructions();

		// Shared helper: run the final (synthesis + review) flow given intermediate outputs.
		const runFinalFlow = async (
			finalRoleArg: string,
			sessionIdArg: string,
			flowOutputs: FlowOutputEntry[],
		): Promise<void> => {
			const synthesisInput = flowOutputs
				.filter(o => o.mdContent && o.mdContent.trim())
				.map(o => `## ${o.role}\n${o.mdContent}`)
				.join('\n\n');

			const coderMandate = [
				`## あなたのタスク（必ず実行してください）`,
				``,
				`あなたは ${finalRoleArg} です。**説明や提案だけで終わらせず、必ず以下のいずれかを行ってください**:`,
				``,
				`1. **新しいファイルを作成する** — 必要なファイルを ` + '```lang:path/to/file```' + ` 形式で出力`,
				`2. **既存ファイルを変更する** — SEARCH/REPLACE形式で差分を出力`,
				`3. **コマンドを実行する** — 依存パッケージのインストール、ファイル移動、ビルドなど必要なコマンドを ` + '```bash```' + ` 形式で出力`,
				``,
				`コード変更とコマンド実行は併用可能です。例えば「新しいライブラリを使うコードを作成 + npm install で依存追加」のように、ユーザーの要求を完遂するまで全ての操作を出力してください。`,
				``,
				`「~~したらどうですか」「~~を検討してください」のような提案だけの回答は禁止です。実際にコードを書き、コマンドを発行してください。`,
			].join('\n');

			const synthesisPrompt = synthesisInput
				? [
					coderMandate,
					``,
					`## ユーザーの要求`,
					currentInput,
					``,
					`## 承認済みエージェント出力（ユーザー編集反映済み）`,
					synthesisInput,
					``,
					codeOutputInstructions,
				].join('\n')
				: [
					coderMandate,
					``,
					`## ユーザーの要求`,
					currentInput,
					``,
					codeOutputInstructions,
				].join('\n');

			appendText(`---\n\n**合成ステップ** (${finalRoleArg}) 開始...\n\n`);

			const synthesisResult = await callDivisionTaskExecute(
				endpointBase, projectId, finalRoleArg, synthesisPrompt, controller.signal,
				(chunk) => appendText(chunk),
				divisionApiKey, sessionIdArg,
			);

			if (synthesisResult.error) {
				appendText(`\n❌ **Synthesis Error:** ${synthesisResult.error}\n`);
				onFinalMessage({ fullText, fullReasoning: '', anthropicReasoning: null });
				return;
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
				if (commands.length > 0 && onCommandRun) onCommandRun(commands);

				if (FLOW_ROLE_TO_FILENAME[finalRoleArg.toLowerCase()]) {
					saveFlowResultAsMd(workspaceFolderPath, finalRoleArg, '', synthesisOutput, sessionIdArg);
				}
			}

			// Review step
			appendText(`\n---\n\n**レビューステップ** (reviewer) 開始...\n\n`);

			const reviewPrompt = [
				`以下の成果物をレビューしてください。品質、正確性、改善点を評価してください。`,
				``,
				`## ユーザーの要求`,
				currentInput,
				``,
				`## 成果物`,
				synthesisOutput,
			].join('\n');

			const reviewResult = await callDivisionTaskExecute(
				endpointBase, projectId, 'review', reviewPrompt, controller.signal,
				(chunk) => appendText(chunk),
				divisionApiKey, sessionIdArg,
			);

			if (reviewResult.error) {
				appendText(`\n❌ **Review Error:** ${reviewResult.error}\n`);
			} else if (reviewResult.output && workspaceFolderPath && FLOW_ROLE_TO_FILENAME['review']) {
				saveFlowResultAsMd(workspaceFolderPath, 'review', '', reviewResult.output, sessionIdArg);
			}

			if (workspaceFolderPath) clearOrchestrationState(workspaceFolderPath);
			onFinalMessage({ fullText, fullReasoning: '', anthropicReasoning: null });
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
		// Step 1: Create tasks via /api/tasks/create
		console.log('[DivisionAPI] /api/tasks/create request:', JSON.stringify({
			projectId,
			inputLength: currentInput.length,
			inputPreview: currentInput.substring(0, 100),
			chatHistoryLength: chatHistory.length,
		}));

		appendText(`**Leader AI** がタスクを分析中...\n\n`);

		const taskResult = await callDivisionTaskCreate(
			endpointBase, projectId, currentInput, controller.signal,
			divisionApiKey, chatHistory.length > 0 ? chatHistory : undefined,
		);

		if (taskResult.error) {
			appendText(`❌ **Task Create Error:** ${taskResult.error}\n\n`);

			// Fallback: single model via /api/generate/stream
			appendText(`フォールバック: 単一モデルで生成中...\n\n`);
			const fallbackResult = await callDivisionGenerateStream(
				endpointBase, 'gpt-5.2', prompt, controller.signal,
				(chunk) => appendText(chunk),
				'chat', divisionApiKey,
			);
			if (fallbackResult.error) {
				appendText(`\n❌ **Fallback Error:** ${fallbackResult.error}\n`);
			}
			onFinalMessage({ fullText, fullReasoning: '', anthropicReasoning: null });
			return;
		}

		const { sessionId, tasks: rawTasks, finalRole } = taskResult;

		// Filter out server-side Coder/Coding tasks.
		// The server sandbox cannot access the user's real workspace, so its Coder output
		// is useless (and often wastes up to 20 tool iterations). We run the Coder step
		// locally via /api/generate/stream below, which applies edits to actual files.
		const tasks = rawTasks.filter(t => {
			const role = (t.role || '').toLowerCase();
			return role !== 'coder' && role !== 'coding';
		});
		const droppedCoderCount = rawTasks.length - tasks.length;
		if (droppedCoderCount > 0) {
			console.log(`[DivisionAPI] Skipped ${droppedCoderCount} server-side Coder task(s) — running Coder locally instead.`);
		}

		// Display task decomposition results
		if (tasks.length > 0) {
			for (let i = 0; i < tasks.length; i++) {
				const t = tasks[i];
				appendText(`${i + 1}. **${t.role}** — ${t.title}\n`);
			}
			appendText(`\n`);
		}
		if (finalRole) {
			appendText(`合成ロール: **${finalRole}**\n\n`);
		}

		// Local file-search: replace remote file-search task outputs with actual workspace contents
		if (workspaceFolderPath) {
			for (const task of tasks) {
				const role = (task.role || '').toLowerCase();
				if (role === 'file-search' || role === 'filesearch' || role === 'file_search') {
					const query = task.input || task.title || currentInput;
					appendText(`📂 **file-search** がワークスペースのファイルを読み込み中...\n\n`);
					try {
						const localOutput = buildFileSearchOutput(workspaceFolderPath, query);
						task.output = localOutput;
						appendText(`📂 file-search 完了（ローカルファイル読み込み）\n\n`);
					} catch (e: any) {
						appendText(`⚠️ file-search エラー: ${e?.message || String(e)}\n\n`);
					}
				}
			}
		}

		// Display task outputs (from tasks/create response) and save as MD
		const flowOutputs: FlowOutputEntry[] = [];
		for (const task of tasks) {
			if (!task.output) continue;
			let sanitized = task.output;
			const opens = (sanitized.match(/```/g) || []).length;
			if (opens % 2 !== 0) sanitized += '\n```\n';
			appendText(`## ${task.role}\n\n${sanitized}\n\n`);

			if (workspaceFolderPath && sanitized.trim() && FLOW_ROLE_TO_FILENAME[task.role.toLowerCase()]) {
				const savedPath = saveFlowResultAsMd(workspaceFolderPath, task.role, task.title || '', sanitized, sessionId);
				const mdFileName = FLOW_ROLE_TO_FILENAME[task.role.toLowerCase()];
				if (mdFileName) {
					flowOutputs.push({
						role: task.role,
						mdFileName,
						mdFilePath: savedPath || path.join(workspaceFolderPath, '.division', mdFileName),
						mdContent: sanitized,
					});
				}
			}
		}

		// If there are no intermediate outputs at all, skip flow_review and go straight to synthesis.
		if (flowOutputs.length === 0) {
			await runFinalFlow(finalRole, sessionId, []);
			return;
		}

		// Persist orchestration state so Phase B (resume) can pick it up after user approval.
		if (workspaceFolderPath) {
			writeOrchestrationState(workspaceFolderPath, {
				approved: false,
				sessionId,
				finalRole,
				currentInput,
				allFlowOutputs: flowOutputs,
				createdAt: Date.now(),
			});
		}

		// Emit a single consolidated flow_review request and pause for user approval.
		appendText(`\n---\n\n**承認待ち** — 全中間フロー (${flowOutputs.length} 件) が完了しました。内容を確認・編集して承認してください。\n\n`);

		const primary = flowOutputs[0];
		const flowReview: FlowReviewData = {
			flowRole: 'all',
			mdFileName: primary.mdFileName,
			mdFilePath: primary.mdFilePath,
			mdContent: primary.mdContent,
			sessionId,
			completedTaskIndex: flowOutputs.length,
			totalTasks: flowOutputs.length + 1, // +1 for the pending final flow
			allFlowOutputs: flowOutputs,
		};

		onFinalMessage({ fullText, fullReasoning: '', anthropicReasoning: null, flowReview });

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
