/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { displayInfoOfProviderName, FeatureName, featureNames, isFeatureNameDisabled, ModelSelection, modelSelectionsEqual, ProviderName, providerNames, SettingsOfProvider } from '../../../../../../../workbench/contrib/void/common/voidSettingsTypes.js'
import { useSettingsState, useRefreshModelState, useAccessor, useDivisionProjectConfig, useDivisionProjects } from '../util/services.js'
import { _VoidSelectBox, VoidCustomDropdownBox } from '../util/inputs.js'
import { SelectBox } from '../../../../../../../base/browser/ui/selectBox/selectBox.js'
import { IconWarning } from '../sidebar-tsx/SidebarChat.js'
import { VOID_OPEN_SETTINGS_ACTION_ID, VOID_TOGGLE_SETTINGS_ACTION_ID } from '../../../voidSettingsPane.js'
import { modelFilterOfFeatureName, ModelOption } from '../../../../../../../workbench/contrib/void/common/voidSettingsService.js'
import { WarningBox } from './WarningBox.js'
import ErrorBoundary from '../sidebar-tsx/ErrorBoundary.js'

const DIVISION_PROJECT_SELECTION: ModelSelection = { providerName: 'divisionAPI', modelName: 'division-orchestrator' }
const isDivisionProjectOption = (selection: ModelSelection) =>
	selection.providerName === 'divisionAPI' && selection.modelName === 'division-orchestrator'

const optionsEqual = (m1: ModelOption[], m2: ModelOption[]) => {
	if (m1.length !== m2.length) return false
	for (let i = 0; i < m1.length; i++) {
		if (!modelSelectionsEqual(m1[i].selection, m2[i].selection)) return false
	}
	return true
}

const ModelSelectBox = ({ options, featureName, className }: { options: ModelOption[], featureName: FeatureName, className: string }) => {
	const accessor = useAccessor()
	const voidSettingsService = accessor.get('IVoidSettingsService')
	const divisionProjectConfig = useDivisionProjectConfig()
	const divisionProjects = useDivisionProjects()

	const selection = voidSettingsService.state.modelSelectionOfFeature[featureName]
	const selectedOption = selection ? options.find(v => modelSelectionsEqual(v.selection, selection)) ?? options[0] : options[0]

	const onChangeOption = useCallback((newOption: ModelOption) => {
		voidSettingsService.setModelSelectionOfFeature(featureName, newOption.selection)
	}, [voidSettingsService, featureName])

	// Division API のモデル名は `<providerId>/<modelId>` 形式で保存されているので、
	// 表示用にモデル ID 部分だけ取り出す。 "/" を含まない値 (例: "division-orchestrator"
	// や他プロバイダのモデル) はそのまま返す。
	const splitDivisionModelName = (modelName: string): { providerId: string | null; modelId: string } => {
		const idx = modelName.indexOf('/')
		if (idx > 0 && idx < modelName.length - 1) {
			return { providerId: modelName.slice(0, idx), modelId: modelName.slice(idx + 1) }
		}
		return { providerId: null, modelId: modelName }
	}

	const getDisplayName = useCallback((option: ModelOption) => {
		if (isDivisionProjectOption(option.selection) && divisionProjectConfig) {
			return `Division Project`
		}
		if (option.selection.providerName === 'divisionAPI') {
			return splitDivisionModelName(option.selection.modelName).modelId
		}
		return option.selection.modelName
	}, [divisionProjectConfig])

	const getDropdownDetail = useCallback((option: ModelOption) => {
		if (isDivisionProjectOption(option.selection) && divisionProjectConfig) {
			const suffix = divisionProjects.length > 1 ? ` (${divisionProjects.length})` : ''
			return divisionProjectConfig.name + suffix
		}
		// Division API のモデル行ではホスティング先プロバイダを副表示する
		if (option.selection.providerName === 'divisionAPI') {
			const { providerId } = splitDivisionModelName(option.selection.modelName)
			return providerId ?? ''
		}
		// プロバイダ名は group header で表示するので、行内では詳細を出さない
		return ''
	}, [divisionProjectConfig, divisionProjects])

	const getGroupName = useCallback((option: ModelOption) => {
		// Division Project はグループ化しない（トップ固定の特別項目）
		if (isDivisionProjectOption(option.selection)) return undefined
		// Division API 経由のモデルは `<providerId>/...` の providerId でグルーピング
		if (option.selection.providerName === 'divisionAPI') {
			const { providerId } = splitDivisionModelName(option.selection.modelName)
			if (providerId) return `Division · ${providerId}`
			return 'Division'
		}
		try {
			return displayInfoOfProviderName(option.selection.providerName).title
		} catch {
			return option.selection.providerName
		}
	}, [])

	return <VoidCustomDropdownBox
		options={options}
		selectedOption={selectedOption}
		onChangeOption={onChangeOption}
		getOptionDisplayName={getDisplayName}
		getOptionDropdownName={getDisplayName}
		getOptionDropdownDetail={getDropdownDetail}
		getOptionGroupName={getGroupName}
		getOptionsEqual={(a, b) => optionsEqual([a], [b])}
		className={className}
		matchInputWidth={false}
	/>
}


const MemoizedModelDropdown = ({ featureName, className }: { featureName: FeatureName, className: string }) => {
	const settingsState = useSettingsState()
	const divisionProjectConfig = useDivisionProjectConfig()
	const oldOptionsRef = useRef<ModelOption[]>([])
	const [memoizedOptions, setMemoizedOptions] = useState(oldOptionsRef.current)

	const { filter, emptyMessage } = modelFilterOfFeatureName[featureName]

	useEffect(() => {
		const oldOptions = oldOptionsRef.current
		let newOptions = settingsState._modelOptions.filter((o) => filter(o.selection, { chatMode: settingsState.globalSettings.chatMode, overridesOfModel: settingsState.overridesOfModel }))

		// Inject Division Project option at the top if project config exists and not already in list
		let divisionOption: ModelOption | null = null
		if (divisionProjectConfig && featureName === 'Chat') {
			// 既存の division-orchestrator 行は全て取り除き、先頭に 1 行だけ挿入する。
			// 同一 selection が複数残っていると React key が衝突する。
			const extracted = newOptions.filter(o => isDivisionProjectOption(o.selection))
			newOptions = newOptions.filter(o => !isDivisionProjectOption(o.selection))
			divisionOption = extracted[0] ?? {
				name: `Division Project`,
				selection: DIVISION_PROJECT_SELECTION,
			}
		} else {
			// Ensure no stray Division option leaks into non-Chat feature dropdowns
			newOptions = newOptions.filter(o => !isDivisionProjectOption(o.selection))
		}

		// プロバイダごとに隣接させて並べ替え（グループヘッダ表示のため）
		// 同プロバイダ内は元の順序を安定保持する。
		const providerOrder = new Map<ProviderName, number>()
		for (let i = 0; i < newOptions.length; i++) {
			const p = newOptions[i].selection.providerName
			if (!providerOrder.has(p)) providerOrder.set(p, providerOrder.size)
		}
		newOptions.sort((a, b) => {
			const ao = providerOrder.get(a.selection.providerName) ?? 0
			const bo = providerOrder.get(b.selection.providerName) ?? 0
			return ao - bo
		})

		// Division Project があれば必ず先頭に据える
		if (divisionOption) newOptions = [divisionOption, ...newOptions]

		if (!optionsEqual(oldOptions, newOptions)) {
			setMemoizedOptions(newOptions)
		}
		oldOptionsRef.current = newOptions
	}, [settingsState._modelOptions, settingsState.globalSettings.chatMode, settingsState.overridesOfModel, filter, divisionProjectConfig, featureName])

	if (memoizedOptions.length === 0) { // Pretty sure this will never be reached unless filter is enabled
		return <WarningBox text={emptyMessage?.message || 'No models available'} />
	}

	return <ModelSelectBox featureName={featureName} options={memoizedOptions} className={className} />

}

export const ModelDropdown = ({ featureName, className }: { featureName: FeatureName, className: string }) => {
	const settingsState = useSettingsState()

	const accessor = useAccessor()
	const commandService = accessor.get('ICommandService')

	const openSettings = () => { commandService.executeCommand(VOID_OPEN_SETTINGS_ACTION_ID); };


	const { emptyMessage } = modelFilterOfFeatureName[featureName]

	const isDisabled = isFeatureNameDisabled(featureName, settingsState)
	if (isDisabled)
		return <WarningBox onClick={openSettings} text={
			emptyMessage && emptyMessage.priority === 'always' ? emptyMessage.message :
				isDisabled === 'needToEnableModel' ? 'Enable a model'
					: isDisabled === 'addModel' ? 'Add a model'
						: (isDisabled === 'addProvider' || isDisabled === 'notFilledIn' || isDisabled === 'providerNotAutoDetected') ? 'Provider required'
							: 'Provider required'
		} />

	return <ErrorBoundary>
		<MemoizedModelDropdown featureName={featureName} className={className} />
	</ErrorBoundary>
}
