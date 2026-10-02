/*--------------------------------------------------------------------------------------
 *  Division Model Catalog
 *  Division プロジェクトのロール割り当てで選べるモデル一覧。
 *
 *  ロールのモデルは Division API がそのまま実行するので、選択肢は Division API
 *  `/api/models` が返す最新の一覧を使う。 refreshModelService が起動時に取得して
 *  `settingsOfProvider.divisionAPI.models` に `<providerId>/<modelId>` 形式で保存して
 *  いるので、それを Orchestra のプロバイダ名ごとに振り分けて返す。
 *--------------------------------------------------------------------------------------*/

import { defaultModelsOfProvider } from './modelCapabilities.js';
import { ProviderName, SettingsOfProvider } from './voidSettingsTypes.js';

// Division API の provider.id → Orchestra の ProviderName
const PROVIDER_NAME_OF_DIVISION_PROVIDER_ID: Record<string, ProviderName> = {
	anthropic: 'anthropic',
	openai: 'openAI',
	google: 'gemini',
	gemini: 'gemini',
	xai: 'xAI',
	deepseek: 'deepseek',
	perplexity: 'perplexity',
};

/** Division API から取得済みのモデルを、Orchestra のプロバイダごとに分けて返す (API の並び順を保持) */
export const divisionModelNamesByProvider = (settingsOfProvider: SettingsOfProvider): Partial<Record<ProviderName, string[]>> => {
	const result: Partial<Record<ProviderName, string[]>> = {};
	for (const { modelName } of settingsOfProvider.divisionAPI?.models ?? []) {
		const idx = modelName.indexOf('/');
		if (idx <= 0 || idx === modelName.length - 1) continue; // division-orchestrator など providerId の無い行
		const providerName = PROVIDER_NAME_OF_DIVISION_PROVIDER_ID[modelName.slice(0, idx).toLowerCase()];
		if (!providerName) continue;
		const modelId = modelName.slice(idx + 1);
		const models = result[providerName] ?? (result[providerName] = []);
		if (!models.includes(modelId)) models.push(modelId);
	}
	return result;
};

/**
 * ロール割り当てのモデル選択肢。 Division API の一覧があればそれを使い、
 * まだ取得できていない (オフラインの初回起動など) / Division が扱わないプロバイダでは
 * これまで通りプロバイダ設定のモデル一覧 → 組み込みの既定一覧にフォールバックする。
 */
export const roleModelOptionsOfProvider = (settingsOfProvider: SettingsOfProvider, providerName: ProviderName): string[] => {
	const fromDivision = divisionModelNamesByProvider(settingsOfProvider)[providerName];
	if (fromDivision && fromDivision.length > 0) return fromDivision;
	const fromProvider = settingsOfProvider[providerName]?.models ?? [];
	if (fromProvider.length > 0) return fromProvider.map(m => m.modelName);
	return [...(defaultModelsOfProvider[providerName] ?? [])];
};
