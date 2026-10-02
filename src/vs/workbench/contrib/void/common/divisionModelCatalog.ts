/*--------------------------------------------------------------------------------------
 *  Division Model Catalog
 *  Division プロジェクトのロール割り当てで選べるプロバイダとモデルの一覧。
 *
 *  ロールのプロバイダ / モデルは Division API がそのまま実行するので、選べるのは Division API
 *  `/api/models` が返すもの = Supabase の Provider / Model テーブルで isEnabled = true の
 *  ものだけにする。 refreshModelService が常に取得して、モデルは
 *  `settingsOfProvider.divisionAPI.models` に `<providerId>/<modelId>` 形式で、プロバイダの
 *  並び順と表示名は `globalSettings.divisionProviders` に保存している。
 *--------------------------------------------------------------------------------------*/

import { displayInfoOfProviderName, DivisionProviderInfo, ProviderName, RoleProvider, SettingsOfProvider } from './voidSettingsTypes.js';

// Division のプロバイダ ID → Orchestra の ProviderName。 ここに無いプロバイダ (例: typesafe) は
// ロール割り当てに Division のプロバイダ ID のまま保存する。
const PROVIDER_NAME_OF_DIVISION_PROVIDER_ID: Record<string, ProviderName> = {
	anthropic: 'anthropic',
	openai: 'openAI',
	google: 'gemini',
	xai: 'xAI',
	deepseek: 'deepseek',
	perplexity: 'perplexity',
};

/** ロール割り当ての provider に保存する値 */
const roleProviderOfDivisionProviderId = (id: string): RoleProvider =>
	PROVIDER_NAME_OF_DIVISION_PROVIDER_ID[id.toLowerCase()] ?? id;

export type RoleProviderOption = {
	value: RoleProvider; // RoleAssignment.provider に保存する値
	divisionProviderId: string; // Supabase の Provider.id
	displayName: string; // Division API が返す表示名
	models: string[]; // 有効なモデル (Division API の並び順)
};

/** Division API から取得済みのモデルを、Division のプロバイダ ID ごとに分けて返す (API の並び順を保持) */
const modelIdsOfDivisionProvider = (settingsOfProvider: SettingsOfProvider): Map<string, string[]> => {
	const result = new Map<string, string[]>();
	for (const { modelName } of settingsOfProvider.divisionAPI?.models ?? []) {
		const idx = modelName.indexOf('/');
		if (idx <= 0 || idx === modelName.length - 1) continue; // division-orchestrator など providerId の無い行
		const providerId = modelName.slice(0, idx);
		const modelId = modelName.slice(idx + 1);
		const models = result.get(providerId) ?? [];
		if (!models.includes(modelId)) models.push(modelId);
		result.set(providerId, models);
	}
	return result;
};

/** ロール割り当てで選べるプロバイダ = 有効なモデルを 1 つ以上持つ Division のプロバイダ (Division API の並び順) */
export const roleProviderOptions = (settingsOfProvider: SettingsOfProvider, divisionProviders: DivisionProviderInfo[] | undefined): RoleProviderOption[] => {
	const modelsOfProvider = modelIdsOfDivisionProvider(settingsOfProvider);
	const displayNameOfId = new Map((divisionProviders ?? []).map(p => [p.id, p.displayName] as const));
	// プロバイダ一覧を取得前のデータでも、モデルの providerId からは選べるようにする
	const ids = [...(divisionProviders ?? []).map(p => p.id), ...modelsOfProvider.keys()];
	return [...new Set(ids)]
		.filter(id => (modelsOfProvider.get(id)?.length ?? 0) > 0)
		.map(id => ({
			value: roleProviderOfDivisionProviderId(id),
			divisionProviderId: id,
			displayName: displayNameOfId.get(id) || id,
			models: modelsOfProvider.get(id)!,
		}));
};

/** ロール割り当てで選べるモデル (無効・未取得のプロバイダでは空) */
export const roleModelOptionsOfProvider = (settingsOfProvider: SettingsOfProvider, divisionProviders: DivisionProviderInfo[] | undefined, provider: RoleProvider): string[] =>
	roleProviderOptions(settingsOfProvider, divisionProviders).find(o => o.value === provider)?.models ?? [];

/** ロール割り当ての provider に対応する Division (Supabase) のプロバイダ ID。 Division に無ければ null */
export const divisionProviderIdOfRoleProvider = (provider: RoleProvider, divisionProviders: DivisionProviderInfo[] | undefined): string | null => {
	const lower = provider.toLowerCase();
	const match = (divisionProviders ?? []).find(p => p.id.toLowerCase() === lower || roleProviderOfDivisionProviderId(p.id) === provider);
	return match?.id ?? null;
};

/** ロール割り当ての provider の表示名 (Division の表示名 → Orchestra の表示名 → 保存値そのまま) */
export const displayNameOfRoleProvider = (provider: RoleProvider, divisionProviders: DivisionProviderInfo[] | undefined): string => {
	const id = divisionProviderIdOfRoleProvider(provider, divisionProviders);
	const fromDivision = (divisionProviders ?? []).find(p => p.id === id)?.displayName;
	if (fromDivision) return fromDivision;
	try { return displayInfoOfProviderName(provider as ProviderName).title; } catch { return provider; }
};
