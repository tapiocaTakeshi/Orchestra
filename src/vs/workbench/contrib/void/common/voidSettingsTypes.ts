
/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { defaultModelsOfProvider, defaultProviderSettings, ModelOverrides } from './modelCapabilities.js';
import { ToolApprovalType } from './toolsServiceTypes.js';
import { defaultTrelloSettings, TrelloSettings } from './trelloServiceTypes.js';
import { VoidSettingsState } from './voidSettingsService.js'


type UnionOfKeys<T> = T extends T ? keyof T : never;



export type ProviderName = keyof typeof defaultProviderSettings
export const providerNames = Object.keys(defaultProviderSettings) as ProviderName[]

export const localProviderNames = ['ollama', 'vLLM', 'lmStudio'] satisfies ProviderName[] // all local names
export const nonlocalProviderNames = providerNames.filter((name) => !(localProviderNames as string[]).includes(name)) // all non-local names

type CustomSettingName = UnionOfKeys<typeof defaultProviderSettings[ProviderName]>
type CustomProviderSettings<providerName extends ProviderName> = {
	[k in CustomSettingName]: k extends keyof typeof defaultProviderSettings[providerName] ? string : undefined
}
export const customSettingNamesOfProvider = (providerName: ProviderName) => {
	return Object.keys(defaultProviderSettings[providerName]) as CustomSettingName[]
}



export type VoidStatefulModelInfo = { // <-- STATEFUL
	modelName: string,
	type: 'default' | 'autodetected' | 'custom';
	isHidden: boolean, // whether or not the user is hiding it (switched off)
}



type CommonProviderSettings = {
	_didFillInProviderSettings: boolean | undefined, // undefined initially, computed when user types in all fields
	models: VoidStatefulModelInfo[],
}

export type SettingsAtProvider<providerName extends ProviderName> = CustomProviderSettings<providerName> & CommonProviderSettings

// part of state
export type SettingsOfProvider = {
	[providerName in ProviderName]: SettingsAtProvider<providerName>
}


export type SettingName = keyof SettingsAtProvider<ProviderName>

type DisplayInfoForProviderName = {
	title: string,
	desc?: string,
}

export const displayInfoOfProviderName = (providerName: ProviderName): DisplayInfoForProviderName => {
	if (providerName === 'divisionAPI') {
		return { title: 'Division API', desc: 'AI Orchestration — auto-assigns optimal models per task' }
	}
	else if (providerName === 'anthropic') {
		return { title: 'Anthropic', }
	}
	else if (providerName === 'openAI') {
		return { title: 'OpenAI', }
	}
	else if (providerName === 'deepseek') {
		return { title: 'DeepSeek', }
	}
	else if (providerName === 'openRouter') {
		return { title: 'OpenRouter', }
	}
	else if (providerName === 'ollama') {
		return { title: 'Ollama', }
	}
	else if (providerName === 'vLLM') {
		return { title: 'vLLM', }
	}
	else if (providerName === 'liteLLM') {
		return { title: 'LiteLLM', }
	}
	else if (providerName === 'lmStudio') {
		return { title: 'LM Studio', }
	}
	else if (providerName === 'openAICompatible') {
		return { title: 'OpenAI-Compatible', }
	}
	else if (providerName === 'gemini') {
		return { title: 'Gemini', }
	}
	else if (providerName === 'groq') {
		return { title: 'Groq', }
	}
	else if (providerName === 'xAI') {
		return { title: 'Grok (xAI)', }
	}
	else if (providerName === 'mistral') {
		return { title: 'Mistral', }
	}
	else if (providerName === 'googleVertex') {
		return { title: 'Google Vertex AI', }
	}
	else if (providerName === 'microsoftAzure') {
		return { title: 'Microsoft Azure OpenAI', }
	}
	else if (providerName === 'awsBedrock') {
		return { title: 'AWS Bedrock', }
	}
	else if (providerName === 'perplexity') {
		return { title: 'Perplexity', desc: 'Search-augmented AI — real-time web search with citations' }
	}

	throw new Error(`descOfProviderName: Unknown provider name: "${providerName}"`)
}

export const subTextMdOfProviderName = (providerName: ProviderName): string => {

	if (providerName === 'divisionAPI') return 'Division API automatically assigns the optimal AI model for each task. [Learn more](https://api.division.he-ro.jp).'
	if (providerName === 'anthropic') return 'Get your [API Key here](https://console.anthropic.com/settings/keys).'
	if (providerName === 'openAI') return 'Get your [API Key here](https://platform.openai.com/api-keys).'
	if (providerName === 'deepseek') return 'Get your [API Key here](https://platform.deepseek.com/api_keys).'
	if (providerName === 'openRouter') return 'Get your [API Key here](https://openrouter.ai/settings/keys). Read about [rate limits here](https://openrouter.ai/docs/api-reference/limits).'
	if (providerName === 'gemini') return 'Get your [API Key here](https://aistudio.google.com/apikey). Read about [rate limits here](https://ai.google.dev/gemini-api/docs/rate-limits#current-rate-limits).'
	if (providerName === 'groq') return 'Get your [API Key here](https://console.groq.com/keys).'
	if (providerName === 'xAI') return 'Get your [API Key here](https://console.x.ai).'
	if (providerName === 'mistral') return 'Get your [API Key here](https://console.mistral.ai/api-keys).'
	if (providerName === 'openAICompatible') return `Use any provider that's OpenAI-compatible (use this for llama.cpp and more).`
	if (providerName === 'googleVertex') return 'You must authenticate before using Vertex with Void. Read more about endpoints [here](https://cloud.google.com/vertex-ai/generative-ai/docs/multimodal/call-vertex-using-openai-library), and regions [here](https://cloud.google.com/vertex-ai/docs/general/locations#available-regions).'
	if (providerName === 'microsoftAzure') return 'Read more about endpoints [here](https://learn.microsoft.com/en-us/rest/api/aifoundry/model-inference/get-chat-completions/get-chat-completions?view=rest-aifoundry-model-inference-2024-05-01-preview&tabs=HTTP), and get your API key [here](https://learn.microsoft.com/en-us/azure/search/search-security-api-keys?tabs=rest-use%2Cportal-find%2Cportal-query#find-existing-keys).'
	if (providerName === 'awsBedrock') return 'Connect via a LiteLLM proxy or the AWS [Bedrock-Access-Gateway](https://github.com/aws-samples/bedrock-access-gateway). LiteLLM Bedrock setup docs are [here](https://docs.litellm.ai/docs/providers/bedrock).'
	if (providerName === 'ollama') return 'Read more about custom [Endpoints here](https://github.com/ollama/ollama/blob/main/docs/faq.md#how-can-i-expose-ollama-on-my-network).'
	if (providerName === 'vLLM') return 'Read more about custom [Endpoints here](https://docs.vllm.ai/en/latest/getting_started/quickstart.html#openai-compatible-server).'
	if (providerName === 'lmStudio') return 'Read more about custom [Endpoints here](https://lmstudio.ai/docs/app/api/endpoints/openai).'
	if (providerName === 'liteLLM') return 'Read more about endpoints [here](https://docs.litellm.ai/docs/providers/openai_compatible).'
	if (providerName === 'perplexity') return 'Get your [API Key here](https://www.perplexity.ai/settings/api). Read about [models here](https://docs.perplexity.ai/guides/model-cards).'

	throw new Error(`subTextMdOfProviderName: Unknown provider name: "${providerName}"`)
}

type DisplayInfo = {
	title: string;
	placeholder: string;
	isPasswordField?: boolean;
}
export const displayInfoOfSettingName = (providerName: ProviderName, settingName: SettingName): DisplayInfo => {
	if (settingName === 'apiKey') {
		return {
			title: 'API Key',

			// **Please follow this convention**:
			// The word "key..." here is a placeholder for the hash. For example, sk-ant-key... means the key will look like sk-ant-abcdefg123...
			placeholder: providerName === 'anthropic' ? 'sk-ant-key...' : // sk-ant-api03-key
				providerName === 'openAI' ? 'sk-proj-key...' :
					providerName === 'deepseek' ? 'sk-key...' :
						providerName === 'openRouter' ? 'sk-or-key...' : // sk-or-v1-key
							providerName === 'gemini' ? 'AIzaSy...' :
								providerName === 'groq' ? 'gsk_key...' :
									providerName === 'openAICompatible' ? 'sk-key...' :
										providerName === 'xAI' ? 'xai-key...' :
											providerName === 'mistral' ? 'api-key...' :
												providerName === 'googleVertex' ? 'AIzaSy...' :
													providerName === 'microsoftAzure' ? 'key-...' :
														providerName === 'awsBedrock' ? 'key-...' :
															'',

			isPasswordField: true,
		}
	}
	else if (settingName === 'endpoint') {
		return {
			title: providerName === 'ollama' ? 'Endpoint' :
				providerName === 'vLLM' ? 'Endpoint' :
					providerName === 'lmStudio' ? 'Endpoint' :
						providerName === 'openAICompatible' ? 'baseURL' : // (do not include /chat/completions)
							providerName === 'googleVertex' ? 'baseURL' :
								providerName === 'microsoftAzure' ? 'baseURL' :
									providerName === 'liteLLM' ? 'baseURL' :
										providerName === 'awsBedrock' ? 'Endpoint' :
											'(never)',

			placeholder: providerName === 'divisionAPI' ? defaultProviderSettings.divisionAPI.endpoint
				: providerName === 'ollama' ? defaultProviderSettings.ollama.endpoint
					: providerName === 'vLLM' ? defaultProviderSettings.vLLM.endpoint
						: providerName === 'openAICompatible' ? 'https://my-website.com/v1'
							: providerName === 'lmStudio' ? defaultProviderSettings.lmStudio.endpoint
								: providerName === 'liteLLM' ? 'http://localhost:4000'
									: providerName === 'awsBedrock' ? 'http://localhost:4000/v1'
										: '(never)',


		}
	}
	else if (settingName === 'headersJSON') {
		return { title: 'Custom Headers', placeholder: '{ "X-Request-Id": "..." }' }
	}
	else if (settingName === 'region') {
		// vertex only
		return {
			title: 'Region',
			placeholder: providerName === 'googleVertex' ? defaultProviderSettings.googleVertex.region
				: providerName === 'awsBedrock'
					? defaultProviderSettings.awsBedrock.region
					: ''
		}
	}
	else if (settingName === 'azureApiVersion') {
		// azure only
		return {
			title: 'API Version',
			placeholder: providerName === 'microsoftAzure' ? defaultProviderSettings.microsoftAzure.azureApiVersion
				: ''
		}
	}
	else if (settingName === 'project') {
		return {
			title: providerName === 'microsoftAzure' ? 'Resource'
				: providerName === 'googleVertex' ? 'Project'
					: '',
			placeholder: providerName === 'microsoftAzure' ? 'my-resource'
				: providerName === 'googleVertex' ? 'my-project'
					: ''

		}

	}
	else if (settingName === '_didFillInProviderSettings') {
		return {
			title: '(never)',
			placeholder: '(never)',
		}
	}
	else if (settingName === 'models') {
		return {
			title: '(never)',
			placeholder: '(never)',
		}
	}

	throw new Error(`displayInfo: Unknown setting name: "${settingName}"`)
}


const defaultCustomSettings: Record<CustomSettingName, undefined> = {
	apiKey: undefined,
	endpoint: undefined,
	region: undefined, // googleVertex
	project: undefined,
	azureApiVersion: undefined,
	headersJSON: undefined,
}


const modelInfoOfDefaultModelNames = (defaultModelNames: string[], providerName?: string): { models: VoidStatefulModelInfo[] } => {
	return {
		models: defaultModelNames.map((modelName, i) => ({
			modelName,
			type: 'default',
			isHidden: providerName === 'divisionAPI' ? false : defaultModelNames.length >= 10, // Division API models always visible
		}))
	}
}

// used when waiting and for a type reference
export const defaultSettingsOfProvider: SettingsOfProvider = {
	anthropic: {
		...defaultCustomSettings,
		...defaultProviderSettings.anthropic,
		...modelInfoOfDefaultModelNames(defaultModelsOfProvider.anthropic),
		_didFillInProviderSettings: undefined,
	},
	openAI: {
		...defaultCustomSettings,
		...defaultProviderSettings.openAI,
		...modelInfoOfDefaultModelNames(defaultModelsOfProvider.openAI),
		_didFillInProviderSettings: undefined,
	},
	deepseek: {
		...defaultCustomSettings,
		...defaultProviderSettings.deepseek,
		...modelInfoOfDefaultModelNames(defaultModelsOfProvider.deepseek),
		_didFillInProviderSettings: undefined,
	},
	gemini: {
		...defaultCustomSettings,
		...defaultProviderSettings.gemini,
		...modelInfoOfDefaultModelNames(defaultModelsOfProvider.gemini),
		_didFillInProviderSettings: undefined,
	},
	xAI: {
		...defaultCustomSettings,
		...defaultProviderSettings.xAI,
		...modelInfoOfDefaultModelNames(defaultModelsOfProvider.xAI),
		_didFillInProviderSettings: undefined,
	},
	mistral: {
		...defaultCustomSettings,
		...defaultProviderSettings.mistral,
		...modelInfoOfDefaultModelNames(defaultModelsOfProvider.mistral),
		_didFillInProviderSettings: undefined,
	},
	liteLLM: {
		...defaultCustomSettings,
		...defaultProviderSettings.liteLLM,
		...modelInfoOfDefaultModelNames(defaultModelsOfProvider.liteLLM),
		_didFillInProviderSettings: undefined,
	},
	lmStudio: {
		...defaultCustomSettings,
		...defaultProviderSettings.lmStudio,
		...modelInfoOfDefaultModelNames(defaultModelsOfProvider.lmStudio),
		_didFillInProviderSettings: undefined,
	},
	groq: { // aggregator (serves models from multiple providers)
		...defaultCustomSettings,
		...defaultProviderSettings.groq,
		...modelInfoOfDefaultModelNames(defaultModelsOfProvider.groq),
		_didFillInProviderSettings: undefined,
	},
	openRouter: { // aggregator (serves models from multiple providers)
		...defaultCustomSettings,
		...defaultProviderSettings.openRouter,
		...modelInfoOfDefaultModelNames(defaultModelsOfProvider.openRouter),
		_didFillInProviderSettings: undefined,
	},
	openAICompatible: { // aggregator (serves models from multiple providers)
		...defaultCustomSettings,
		...defaultProviderSettings.openAICompatible,
		...modelInfoOfDefaultModelNames(defaultModelsOfProvider.openAICompatible),
		_didFillInProviderSettings: undefined,
	},
	ollama: { // aggregator (serves models from multiple providers)
		...defaultCustomSettings,
		...defaultProviderSettings.ollama,
		...modelInfoOfDefaultModelNames(defaultModelsOfProvider.ollama),
		_didFillInProviderSettings: undefined,
	},
	vLLM: { // aggregator (serves models from multiple providers)
		...defaultCustomSettings,
		...defaultProviderSettings.vLLM,
		...modelInfoOfDefaultModelNames(defaultModelsOfProvider.vLLM),
		_didFillInProviderSettings: undefined,
	},
	googleVertex: { // aggregator (serves models from multiple providers)
		...defaultCustomSettings,
		...defaultProviderSettings.googleVertex,
		...modelInfoOfDefaultModelNames(defaultModelsOfProvider.googleVertex),
		_didFillInProviderSettings: undefined,
	},
	microsoftAzure: { // aggregator (serves models from multiple providers)
		...defaultCustomSettings,
		...defaultProviderSettings.microsoftAzure,
		...modelInfoOfDefaultModelNames(defaultModelsOfProvider.microsoftAzure),
		_didFillInProviderSettings: undefined,
	},
	awsBedrock: { // aggregator (serves models from multiple providers)
		...defaultCustomSettings,
		...defaultProviderSettings.awsBedrock,
		...modelInfoOfDefaultModelNames(defaultModelsOfProvider.awsBedrock),
		_didFillInProviderSettings: undefined,
	},
	divisionAPI: { // Division API - AI orchestration
		...defaultCustomSettings,
		...defaultProviderSettings.divisionAPI,
		...modelInfoOfDefaultModelNames(defaultModelsOfProvider.divisionAPI, 'divisionAPI'),
		_didFillInProviderSettings: true, // pre-configured, no setup needed
	},
	perplexity: {
		...defaultCustomSettings,
		...defaultProviderSettings.perplexity,
		...modelInfoOfDefaultModelNames(defaultModelsOfProvider.perplexity),
		_didFillInProviderSettings: undefined,
	},
}


export type ModelSelection = { providerName: ProviderName, modelName: string }

export const modelSelectionsEqual = (m1: ModelSelection, m2: ModelSelection) => {
	return m1.modelName === m2.modelName && m1.providerName === m2.providerName
}

// this is a state
export const featureNames = ['Chat', 'Ctrl+K', 'Autocomplete', 'Apply', 'SCM', 'ErrorFix'] as const
export type ModelSelectionOfFeature = Record<(typeof featureNames)[number], ModelSelection | null>
export type FeatureName = keyof ModelSelectionOfFeature

export const displayInfoOfFeatureName = (featureName: FeatureName) => {
	// editor:
	if (featureName === 'Autocomplete')
		return 'Autocomplete'
	else if (featureName === 'Ctrl+K')
		return 'クイックエディット'
	else if (featureName === 'ErrorFix')
		return 'エラー修正'
	// sidebar:
	else if (featureName === 'Chat')
		return 'チャット'
	else if (featureName === 'Apply')
		return '適用する'
	// source control:
	else if (featureName === 'SCM')
		return 'コミットメッセージ作成'
	else
		throw new Error(`Feature Name ${featureName} not allowed`)
}


// the models of these can be refreshed (in theory all can, but not all should)
export const refreshableProviderNames = [...localProviderNames, 'divisionAPI'] as const satisfies readonly ProviderName[]
export type RefreshableProviderName = typeof refreshableProviderNames[number]

// models that come with download buttons
export const hasDownloadButtonsOnModelsProviderNames = ['ollama'] as const satisfies ProviderName[]





// use this in isFeatuerNameDissbled
export const isProviderNameDisabled = (providerName: ProviderName, settingsState: VoidSettingsState) => {

	const settingsAtProvider = settingsState.settingsOfProvider[providerName]
	const isAutodetected = (refreshableProviderNames as readonly string[]).includes(providerName)

	const isDisabled = settingsAtProvider.models.length === 0
	if (isDisabled) {
		return isAutodetected ? 'providerNotAutoDetected' : (!settingsAtProvider._didFillInProviderSettings ? 'notFilledIn' : 'addModel')
	}
	return false
}

export const isFeatureNameDisabled = (featureName: FeatureName, settingsState: VoidSettingsState) => {
	// if has a selected provider, check if it's enabled
	const selectedProvider = settingsState.modelSelectionOfFeature[featureName]

	if (selectedProvider) {
		const { providerName } = selectedProvider
		return isProviderNameDisabled(providerName, settingsState)
	}

	// if there are any models they can turn on, tell them that
	const canTurnOnAModel = !!providerNames.find(providerName => settingsState.settingsOfProvider[providerName].models.filter(m => m.isHidden).length !== 0)
	if (canTurnOnAModel) return 'needToEnableModel'

	// if there are any providers filled in, then they just need to add a model
	const anyFilledIn = !!providerNames.find(providerName => settingsState.settingsOfProvider[providerName]._didFillInProviderSettings)
	if (anyFilledIn) return 'addModel'

	return 'addProvider'
}







export type ChatMode = 'agent' | 'gather' | 'normal'


// Context tag types for chat context injection
export type ContextTagGroup = 'design' | 'feature' | 'language' | 'framework';

export type ContextTag = {
	group: ContextTagGroup;
	id: string;
	title: string;
	description: string;
};

export const contextTagGroups: Record<ContextTagGroup, { title: string; icon: string }> = {
	design: { title: 'Design', icon: 'palette' },
	feature: { title: 'Feature', icon: 'blocks' },
	language: { title: 'Language', icon: 'code' },
	framework: { title: 'Framework', icon: 'package' },
};

export const contextTags: ContextTag[] = [
	// Design group
	{ group: 'design', id: 'minimal', title: 'Minimal', description: 'シンプルで余白を活かしたデザイン' },
	{ group: 'design', id: 'modern', title: 'Modern', description: 'モダンでトレンドに沿ったデザイン' },
	{ group: 'design', id: 'flat', title: 'Flat', description: 'フラットデザイン' },
	{ group: 'design', id: 'glassmorphism', title: 'Glassmorphism', description: 'ガラス風の透過エフェクト' },
	{ group: 'design', id: 'neumorphism', title: 'Neumorphism', description: 'ソフトな凹凸のニューモーフィズム' },
	{ group: 'design', id: 'animation', title: 'Animation', description: 'アニメーション・モーション効果' },
	{ group: 'design', id: 'dark-theme', title: 'Dark Theme', description: 'ダークテーマベースのデザイン' },
	{ group: 'design', id: 'responsive', title: 'Responsive', description: 'レスポンシブ対応デザイン' },
	{ group: 'design', id: '3d', title: '3D', description: '3Dグラフィックス・立体表現' },
	{ group: 'design', id: 'accessibility', title: 'Accessibility', description: 'アクセシビリティ重視のデザイン' },
	// Feature group
	{ group: 'feature', id: 'login', title: 'Login', description: 'ログイン・認証機能' },
	{ group: 'feature', id: 'ai-chat', title: 'AI Chat', description: 'AIチャット・対話機能' },
	{ group: 'feature', id: 'search', title: 'Search', description: '検索機能' },
	{ group: 'feature', id: 'notification', title: 'Notification', description: '通知・アラート機能' },
	{ group: 'feature', id: 'payment', title: 'Payment', description: '決済・課金機能' },
	{ group: 'feature', id: 'dashboard', title: 'Dashboard', description: 'ダッシュボード・管理画面' },
	{ group: 'feature', id: 'file-upload', title: 'File Upload', description: 'ファイルアップロード機能' },
	{ group: 'feature', id: 'realtime', title: 'Realtime', description: 'リアルタイム通信・WebSocket' },
	{ group: 'feature', id: 'crud', title: 'CRUD', description: 'データの作成・読取・更新・削除' },
	{ group: 'feature', id: 'i18n', title: 'i18n', description: '多言語対応・国際化' },
	// Language group — 主要なプログラミング言語
	{ group: 'language', id: 'typescript', title: 'TypeScript', description: '型付き JavaScript' },
	{ group: 'language', id: 'javascript', title: 'JavaScript', description: 'ECMAScript 標準' },
	{ group: 'language', id: 'python', title: 'Python', description: 'スクリプト/データサイエンス' },
	{ group: 'language', id: 'dart', title: 'Dart', description: 'Flutter / Web 向け言語' },
	{ group: 'language', id: 'go', title: 'Go', description: 'シンプル・高速・並行性' },
	{ group: 'language', id: 'rust', title: 'Rust', description: 'メモリ安全・高性能' },
	{ group: 'language', id: 'java', title: 'Java', description: 'JVM 系・エンタープライズ' },
	{ group: 'language', id: 'kotlin', title: 'Kotlin', description: 'Android / JVM 向けモダン言語' },
	{ group: 'language', id: 'swift', title: 'Swift', description: 'iOS/macOS ネイティブ' },
	{ group: 'language', id: 'csharp', title: 'C#', description: '.NET エコシステム' },
	{ group: 'language', id: 'cpp', title: 'C++', description: 'ハイパフォーマンスシステムズ' },
	{ group: 'language', id: 'ruby', title: 'Ruby', description: 'Rails / DSL に強い' },
	{ group: 'language', id: 'php', title: 'PHP', description: 'Web バックエンド' },
	{ group: 'language', id: 'sql', title: 'SQL', description: 'リレーショナル DB クエリ' },
	{ group: 'language', id: 'html-css', title: 'HTML / CSS', description: 'Web マークアップとスタイル' },
	// Framework group — フロント/バック/モバイルの主要フレームワーク
	{ group: 'framework', id: 'react', title: 'React', description: 'UI ライブラリ' },
	{ group: 'framework', id: 'nextjs', title: 'Next.js', description: 'React フルスタックフレームワーク' },
	{ group: 'framework', id: 'vue', title: 'Vue.js', description: 'プログレッシブ JS フレームワーク' },
	{ group: 'framework', id: 'nuxt', title: 'Nuxt', description: 'Vue ベースのフルスタック' },
	{ group: 'framework', id: 'svelte', title: 'Svelte / SvelteKit', description: 'コンパイル型 UI' },
	{ group: 'framework', id: 'angular', title: 'Angular', description: 'TypeScript ベース大規模 SPA' },
	{ group: 'framework', id: 'astro', title: 'Astro', description: 'コンテンツ駆動の MPA' },
	{ group: 'framework', id: 'remix', title: 'Remix', description: 'React フルスタック' },
	{ group: 'framework', id: 'flutter', title: 'Flutter', description: 'クロスプラットフォーム UI (Dart)' },
	{ group: 'framework', id: 'react-native', title: 'React Native', description: 'クロスプラットフォームモバイル' },
	{ group: 'framework', id: 'tailwind', title: 'Tailwind CSS', description: 'ユーティリティ CSS' },
	{ group: 'framework', id: 'nodejs', title: 'Node.js', description: 'JavaScript ランタイム' },
	{ group: 'framework', id: 'express', title: 'Express', description: 'Node.js Web フレームワーク' },
	{ group: 'framework', id: 'nestjs', title: 'NestJS', description: 'TypeScript エンタープライズバックエンド' },
	{ group: 'framework', id: 'fastapi', title: 'FastAPI', description: 'Python 高速 Web フレームワーク' },
	{ group: 'framework', id: 'django', title: 'Django', description: 'Python フルスタック Web' },
	{ group: 'framework', id: 'flask', title: 'Flask', description: 'Python マイクロフレームワーク' },
	{ group: 'framework', id: 'spring', title: 'Spring Boot', description: 'Java エンタープライズ' },
	{ group: 'framework', id: 'rails', title: 'Ruby on Rails', description: 'Ruby フルスタック Web' },
	{ group: 'framework', id: 'laravel', title: 'Laravel', description: 'PHP フルスタック Web' },
	{ group: 'framework', id: 'gin', title: 'Gin', description: 'Go HTTP フレームワーク' },
	{ group: 'framework', id: 'actix', title: 'Actix Web', description: 'Rust 高速 Web フレームワーク' },
	{ group: 'framework', id: 'supabase', title: 'Supabase', description: 'OSS Firebase 代替 BaaS' },
	{ group: 'framework', id: 'firebase', title: 'Firebase', description: 'Google BaaS' },
	{ group: 'framework', id: 'prisma', title: 'Prisma', description: 'TypeScript ORM' },
];

export const contextTagsOfGroup = (group: ContextTagGroup): ContextTag[] =>
	contextTags.filter(t => t.group === group);

// Division API role assignment types
export type AgentRole = 'leader' | 'coder' | 'planner' | 'search' | 'research' | 'design' | 'writing' | 'ideaman' | 'filesearch' | 'image' | 'review';

export type RoleAssignment = {
	role: AgentRole;
	provider: ProviderName;
	model: string;
};

// AI コミットメッセージ生成の出力言語設定。
// - 'auto'      : LLM の判断に任せる (リポジトリの既存コミットに引っ張られる)
// - 'japanese'  : 日本語で出力させる
// - 'english'   : 英語で出力させる
export type CommitMessageLanguage = 'auto' | 'japanese' | 'english';
export const commitMessageLanguages: CommitMessageLanguage[] = ['auto', 'japanese', 'english'];
export const displayInfoOfCommitMessageLanguage = (lang: CommitMessageLanguage): string => {
	if (lang === 'japanese') return '日本語';
	if (lang === 'english') return 'English';
	return '自動 (LLM に任せる)';
}

// Orchestra 独自 UI (設定パネル・サイドバーチャットなど) の表示言語設定。
export type UILanguage = 'en' | 'ja';
export const uiLanguages: UILanguage[] = ['en', 'ja'];
export const displayInfoOfUILanguage = (lang: UILanguage): string => {
	if (lang === 'ja') return '日本語';
	return 'English';
}

export type GlobalSettings = {
	autoRefreshModels: boolean;
	aiInstructions: string;
	enableAutocomplete: boolean;
	syncApplyToChat: boolean;
	syncSCMToChat: boolean;
	syncErrorFixToChat: boolean;
	enableFastApply: boolean;
	chatMode: ChatMode;
	// AI 生成コミットメッセージの出力言語
	commitMessageLanguage: CommitMessageLanguage;
	autoApprove: { [approvalType in ToolApprovalType]?: boolean };
	showInlineSuggestions: boolean;
	includeToolLintErrors: boolean;
	isOnboardingComplete: boolean;
	disableSystemMessage: boolean;
	autoAcceptLLMChanges: boolean;
	roleAssignments: RoleAssignment[];
	divisionProjectId: string;
	divisionApiKey: string;
	// Supabase 認証セッション（Division API のキーを引くために使用）
	divisionUserId: string;
	divisionUserEmail: string;
	divisionAccessToken: string;
	divisionRefreshToken: string;
	isLoggedIn: boolean;
	// Brief Gate Not OK → File Search → Leader 進捗確認 → Coder/Writer ループの最大試行回数。
	// 1 以上の整数。0 / 負数は 1 に丸められる。
	maxBriefGateIterations: number;
	// Reviewer Not OK → File Search → Leader(Todos) → Coder/Writer ループの最大試行回数。
	// 1 以上の整数。0 / 負数は 1 に丸められる。
	maxReviewerIterations: number;
	// Legacy setting kept for persisted settings migration/fallback.
	maxReviewIterations?: number;
	// true の場合、Division API オーケストレーションは各ロールが .md ファイルを
	// 生成するたびに一時停止し、ユーザーが承認 (または編集して承認 / 却下) するまで
	// 次のステップに進まない。
	divisionFlowApprovalMode: boolean;
	// Orchestra 独自 UI (設定パネル・サイドバーチャットなど) の表示言語。
	uiLanguage: UILanguage;
	// Trello 連携 (TODO リストのカードを自動でプロンプト実行する) の設定。
	trello: TrelloSettings;
}

// Default role assignments for Division API
// Ordered to match the Orchestra flow:
// User → Leader → filesearch (wave1/pre) → (ideaman, search, research) (wave2)
//   → (design, image, planner) (wave3) → (coder or writing) → review → User
//
// filesearch はワークスペース全件事前読み込みを担う wave1 として
// **wave2 の情報収集系より前に単独実行** する。Coder 直前にも Leader Todos
// に基づいた再走査の fallback があるが、通常はここで取得済みの FILE-SEARCH.md
// を後続エージェントが使い回す。
export const defaultRoleAssignments: RoleAssignment[] = [
	{ role: 'leader', provider: 'openAI', model: 'gpt-5.2' },
	{ role: 'filesearch', provider: 'openAI', model: 'gpt-5.2-instant' },
	{ role: 'ideaman', provider: 'openAI', model: 'gpt-5.2' },
	{ role: 'search', provider: 'openAI', model: 'gpt-5.2-instant' },
	{ role: 'research', provider: 'perplexity', model: 'sonar-pro' },
	{ role: 'design', provider: 'gemini', model: 'gemini-3-flash' },
	{ role: 'image', provider: 'gemini', model: 'gemini-3-flash' },
	{ role: 'planner', provider: 'gemini', model: 'gemini-3-pro' },
	{ role: 'coder', provider: 'anthropic', model: 'claude-opus-4-6' },
	{ role: 'writing', provider: 'openAI', model: 'gpt-5.2' },
	{ role: 'review', provider: 'anthropic', model: 'claude-opus-4-6' },
];

export const defaultGlobalSettings: GlobalSettings = {
	autoRefreshModels: true,
	aiInstructions: '',
	enableAutocomplete: false,
	syncApplyToChat: true,
	syncSCMToChat: true,
	syncErrorFixToChat: true,
	enableFastApply: true,
	chatMode: 'agent',
	commitMessageLanguage: 'auto',
	autoApprove: {},
	showInlineSuggestions: true,
	includeToolLintErrors: true,
	isOnboardingComplete: false,
	disableSystemMessage: false,
	autoAcceptLLMChanges: false,
	roleAssignments: defaultRoleAssignments,
	divisionProjectId: '',
	divisionApiKey: '',
	divisionUserId: '',
	divisionUserEmail: '',
	divisionAccessToken: '',
	divisionRefreshToken: '',
	isLoggedIn: false,
	maxBriefGateIterations: 10,
	maxReviewerIterations: 10,
	maxReviewIterations: 10,
	divisionFlowApprovalMode: false,
	uiLanguage: 'en',
	trello: defaultTrelloSettings,
}

export type GlobalSettingName = keyof GlobalSettings
export const globalSettingNames = Object.keys(defaultGlobalSettings) as GlobalSettingName[]












export type ModelSelectionOptions = {
	reasoningEnabled?: boolean;
	reasoningBudget?: number;
	reasoningEffort?: string;
}

export type OptionsOfModelSelection = {
	[featureName in FeatureName]: Partial<{
		[providerName in ProviderName]: {
			[modelName: string]: ModelSelectionOptions | undefined
		}
	}>
}





export type OverridesOfModel = {
	[providerName in ProviderName]: {
		[modelName: string]: Partial<ModelOverrides> | undefined
	}
}


const overridesOfModel = {} as OverridesOfModel
for (const providerName of providerNames) { overridesOfModel[providerName] = {} }
export const defaultOverridesOfModel = overridesOfModel



export interface MCPUserStateOfName {
	[serverName: string]: MCPUserState | undefined;
}

export interface MCPUserState {
	isOn: boolean;
}

export interface SkillUserStateOfName {
	[skillName: string]: SkillUserState | undefined;
}

export interface SkillUserState {
	isOn: boolean;
}
