/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FeatureName, featureNames, isFeatureNameDisabled, ModelSelection, modelSelectionsEqual, ProviderName, providerNames, SettingsOfProvider } from '../../../../../../../workbench/contrib/void/common/voidSettingsTypes.js'
import { useSettingsState, useRefreshModelState, useAccessor, useDivisionProjectConfig } from '../util/services.js'
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

	const selection = voidSettingsService.state.modelSelectionOfFeature[featureName]
	const selectedOption = selection ? options.find(v => modelSelectionsEqual(v.selection, selection)) ?? options[0] : options[0]

	const onChangeOption = useCallback((newOption: ModelOption) => {
		voidSettingsService.setModelSelectionOfFeature(featureName, newOption.selection)
	}, [voidSettingsService, featureName])

	const getDisplayName = useCallback((option: ModelOption) => {
		if (isDivisionProjectOption(option.selection) && divisionProjectConfig) {
			return `Division Project`
		}
		return option.selection.modelName
	}, [divisionProjectConfig])

	const getDropdownDetail = useCallback((option: ModelOption) => {
		if (isDivisionProjectOption(option.selection) && divisionProjectConfig) {
			return divisionProjectConfig.name
		}
		return option.selection.providerName
	}, [divisionProjectConfig])

	return <VoidCustomDropdownBox
		options={options}
		selectedOption={selectedOption}
		onChangeOption={onChangeOption}
		getOptionDisplayName={getDisplayName}
		getOptionDropdownName={getDisplayName}
		getOptionDropdownDetail={getDropdownDetail}
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
		if (divisionProjectConfig && featureName === 'Chat') {
			const hasDivisionOption = newOptions.some(o => isDivisionProjectOption(o.selection))
			if (!hasDivisionOption) {
				const divisionOption: ModelOption = {
					name: `Division Project`,
					selection: DIVISION_PROJECT_SELECTION,
				}
				newOptions = [divisionOption, ...newOptions]
			} else {
				// Move existing Division option to top
				const divIdx = newOptions.findIndex(o => isDivisionProjectOption(o.selection))
				if (divIdx > 0) {
					const [divOption] = newOptions.splice(divIdx, 1)
					newOptions = [divOption, ...newOptions]
				}
			}
		}

		if (!optionsEqual(oldOptions, newOptions)) {
			setMemoizedOptions(newOptions)
		}
		oldOptionsRef.current = newOptions
	}, [settingsState._modelOptions, filter, divisionProjectConfig, featureName])

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
