/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { ButtonHTMLAttributes, FormEvent, FormHTMLAttributes, Fragment, KeyboardEvent, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import './sidebar-chat-modern.css'
// `.void-sidebar-modern` をサイドバーのルート要素に付与すると、
// sidebar-chat-modern.css の Modern+Minimal スタイルが有効化されます。
import './sidebar-chat-redesign.css';


import { useAccessor, useChatThreadsState, useChatThreadsStreamState, useSettingsState, useActiveURI, useCommandBarState, useFullChatThreadsStreamState, useDivisionProjects, useDivisionProjectConfig, useIsDark, useOrchestraUpdateState } from '../util/services.js';
import { useTranslation } from '../util/i18n.js';
import { FloatingPortal } from '@floating-ui/react';
import { DivisionProjectConfig } from '../../../divisionProjectService.js';
import { ScrollType } from '../../../../../../../editor/common/editorCommon.js';

import { ChatMarkdownRender, ChatMessageLocation, getApplyBoxId } from '../markdown/ChatMarkdownRender.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { IDisposable } from '../../../../../../../base/common/lifecycle.js';
import { ErrorDisplay } from './ErrorDisplay.js';
import { BlockCode, TextAreaFns, VoidCustomDropdownBox, VoidInputBox2, VoidSlider, VoidSwitch, VoidDiffEditor } from '../util/inputs.js';
import { ModelDropdown, } from '../void-settings-tsx/ModelDropdown.js';
import { PastThreadsList } from './SidebarThreadSelector.js';
import { VOID_CTRL_L_ACTION_ID } from '../../../actionIDs.js';
import { VOID_OPEN_SETTINGS_ACTION_ID } from '../../../voidSettingsPane.js';
// import { VOID_OPEN_ROLE_OUTPUT_ACTION_ID } from '../../../roleOutputPane.js';
import { AgentRole, ChatMode, displayInfoOfProviderName, contextTags, contextTagGroups, FeatureName, isFeatureNameDisabled, RoleAssignment } from '../../../../../../../workbench/contrib/void/common/voidSettingsTypes.js';
import { ICommandService } from '../../../../../../../platform/commands/common/commands.js';
import { WarningBox } from '../void-settings-tsx/WarningBox.js';
import { getModelCapabilities, getIsReasoningEnabledState } from '../../../../common/modelCapabilities.js';
import { AlertTriangle, File, Ban, Check, ChevronDown, ChevronRight, Dot, FileIcon, Pencil, Undo, Undo2, X, Flag, Copy as CopyIcon, Info, CirclePlus, Ellipsis, CircleEllipsis, Folder, ALargeSmall, TypeOutline, Text, Image as ImageIcon, Paperclip, Palette, Blocks, SendHorizontal, Code, Package, RotateCcw, Loader2, ListPlus, Sun, Moon, Flame, ClipboardCheck, CornerUpLeft, Download as DownloadIcon, ExternalLink as ExternalLinkIcon } from 'lucide-react';
import { ChatMessage, CheckpointEntry, StagingSelectionItem, ToolMessage } from '../../../../common/chatThreadServiceTypes.js';
import { approvalTypeOfBuiltinToolName, BuiltinToolCallParams, BuiltinToolName, ToolName, LintErrorItem, ToolApprovalType, toolApprovalTypes } from '../../../../common/toolsServiceTypes.js';
import { CopyButton, EditToolAcceptRejectButtonsHTML, IconShell1, JumpToFileButton, JumpToTerminalButton, StatusIndicator, StatusIndicatorForApplyButton, useApplyStreamState, useEditToolStreamState } from '../markdown/ApplyBlockHoverButtons.js';
import type { IsRunningType } from '../../../chatThreadService.js';
import { acceptAllBg, acceptBorder, buttonFontSize, buttonTextColor, rejectAllBg, rejectBg, rejectBorder } from '../../../../common/helpers/colors.js';
import { builtinToolNames, isABuiltinToolName, MAX_FILE_CHARS_PAGE, MAX_TERMINAL_INACTIVE_TIME } from '../../../../common/prompt/prompts.js';
import { RawToolCallObj } from '../../../../common/sendLLMMessageTypes.js';
import ErrorBoundary from './ErrorBoundary.js';
import { ToolApprovalTypeSwitch } from '../void-settings-tsx/Settings.js';

import { persistentTerminalNameOfId } from '../../../terminalToolService.js';
import { removeMCPToolNamePrefix } from '../../../../common/mcpServiceTypes.js';
import { LoginScreen } from '../void-login-tsx/LoginScreen.js';
import { StorageScope, StorageTarget } from '../../../../../../../platform/storage/common/storage.js';



// Inject shared keyframes for the refined design (pulse used by FlowIndicator / ReasoningWrapper)
if (typeof document !== 'undefined' && !document.getElementById('void-sidebar-chat-keyframes')) {
	const style = document.createElement('style')
	style.id = 'void-sidebar-chat-keyframes'
	style.textContent = `
@keyframes pulse {
	0%, 100% { opacity: 1; transform: scale(1); }
	50% { opacity: 0.55; transform: scale(0.85); }
}
@keyframes voidDotBounce {
	0%, 80%, 100% { transform: translateY(0); opacity: 0.35; }
	40% { transform: translateY(-3px); opacity: 1; }
}
@keyframes voidBubbleIn {
	from { opacity: 0; transform: translateY(6px) scale(0.985); }
	to { opacity: 1; transform: translateY(0) scale(1); }
}
.void-typing-dots {
	display: inline-flex;
	align-items: center;
	gap: 3px;
}
.void-typing-dots > span {
	display: inline-block;
	width: 5px;
	height: 5px;
	border-radius: 9999px;
	background: currentColor;
	animation: voidDotBounce 1.2s ease-in-out infinite;
}
.void-typing-dots > span:nth-child(2) { animation-delay: 0.16s; }
.void-typing-dots > span:nth-child(3) { animation-delay: 0.32s; }
.void-bubble-in { animation: voidBubbleIn 220ms cubic-bezier(0.16, 1, 0.3, 1) both; }
.void-pulse-dot { animation: pulse 1.4s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
	.void-typing-dots > span { animation: none; opacity: 0.7; }
	.void-bubble-in { animation: none; }
	.void-pulse-dot { animation: none; }
}
`
	document.head.appendChild(style)
}

export const IconX = ({ size, className = '', ...props }: { size: number, className?: string } & React.SVGProps<SVGSVGElement>) => {
	return (
		<svg
			xmlns='http://www.w3.org/2000/svg'
			width={size}
			height={size}
			viewBox='0 0 24 24'
			fill='none'
			stroke='currentColor'
			className={className}
			{...props}
		>
			<path
				strokeLinecap='round'
				strokeLinejoin='round'
				d='M6 18 18 6M6 6l12 12'
			/>
		</svg>
	);
};

const IconArrowUp = ({ size, className = '' }: { size: number, className?: string }) => {
	return (
		<svg
			width={size}
			height={size}
			className={className}
			viewBox="0 0 20 20"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
		>
			<path
				fill="black"
				fillRule="evenodd"
				clipRule="evenodd"
				d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z"
			></path>
		</svg>
	);
};


const IconSquare = ({ size, className = '' }: { size: number, className?: string }) => {
	return (
		<svg
			className={className}
			stroke="black"
			fill="black"
			strokeWidth="0"
			viewBox="0 0 24 24"
			width={size}
			height={size}
			xmlns="http://www.w3.org/2000/svg"
		>
			<rect x="2" y="2" width="20" height="20" rx="4" ry="4" />
		</svg>
	);
};


export const IconWarning = ({ size, className = '' }: { size: number, className?: string }) => {
	return (
		<svg
			className={className}
			stroke="currentColor"
			fill="currentColor"
			strokeWidth="0"
			viewBox="0 0 16 16"
			width={size}
			height={size}
			xmlns="http://www.w3.org/2000/svg"
		>
			<path
				fillRule="evenodd"
				clipRule="evenodd"
				d="M7.56 1h.88l6.54 12.26-.44.74H1.44L1 13.26 7.56 1zM8 2.28L2.28 13H13.7L8 2.28zM8.625 12v-1h-1.25v1h1.25zm-1.25-2V6h1.25v4h-1.25z"
			/>
		</svg>
	);
};


// Smooth three-dot "typing" indicator. Replaces the old text-based `.`/`..`/`...`
// loop, which shifted layout width on every tick. Pure CSS animation (see the
// `voidDotBounce` keyframes injected above), so no timers / re-renders.
export const IconLoading = ({ className = '' }: { className?: string }) => {
	return (
		<span
			className={`void-typing-dots ${className}`}
			role='status'
			aria-label='読み込み中'
		>
			<span />
			<span />
			<span />
		</span>
	);
}



// SLIDER ONLY:
const ReasoningOptionSlider = ({ featureName }: { featureName: FeatureName }) => {
	const accessor = useAccessor()

	const voidSettingsService = accessor.get('IVoidSettingsService')
	const voidSettingsState = useSettingsState()

	const modelSelection = voidSettingsState.modelSelectionOfFeature[featureName]
	const overridesOfModel = voidSettingsState.overridesOfModel

	if (!modelSelection) return null

	const { modelName, providerName } = modelSelection
	const { reasoningCapabilities } = getModelCapabilities(providerName, modelName, overridesOfModel)
	const { canTurnOffReasoning, reasoningSlider: reasoningBudgetSlider } = reasoningCapabilities || {}

	const modelSelectionOptions = voidSettingsState.optionsOfModelSelection[featureName][providerName]?.[modelName]
	const isReasoningEnabled = getIsReasoningEnabledState(featureName, providerName, modelName, modelSelectionOptions, overridesOfModel)

	if (canTurnOffReasoning && !reasoningBudgetSlider) { // if it's just a on/off toggle without a power slider
		return <div className='flex items-center gap-x-2'>
			<span className='text-void-fg-3 text-xs pointer-events-none inline-block w-10 pr-1'>思考中</span>
			<VoidSwitch
				size='xxs'
				value={isReasoningEnabled}
				onChange={(newVal) => {
					const isOff = canTurnOffReasoning && !newVal
					voidSettingsService.setOptionsOfModelSelection(featureName, modelSelection.providerName, modelSelection.modelName, { reasoningEnabled: !isOff })
				}}
			/>
		</div>
	}

	if (reasoningBudgetSlider?.type === 'budget_slider') { // if it's a slider
		const { min: min_, max, default: defaultVal } = reasoningBudgetSlider

		const nSteps = 8 // only used in calculating stepSize, stepSize is what actually matters
		const stepSize = Math.round((max - min_) / nSteps)

		const valueIfOff = min_ - stepSize
		const min = canTurnOffReasoning ? valueIfOff : min_
		const value = isReasoningEnabled ? voidSettingsState.optionsOfModelSelection[featureName][modelSelection.providerName]?.[modelSelection.modelName]?.reasoningBudget ?? defaultVal
			: valueIfOff

		return <div className='flex items-center gap-x-2'>
			<span className='text-void-fg-3 text-xs pointer-events-none inline-block w-10 pr-1'>思考中</span>
			<VoidSlider
				width={50}
				size='xs'
				min={min}
				max={max}
				step={stepSize}
				value={value}
				onChange={(newVal) => {
					const isOff = canTurnOffReasoning && newVal === valueIfOff
					voidSettingsService.setOptionsOfModelSelection(featureName, modelSelection.providerName, modelSelection.modelName, { reasoningEnabled: !isOff, reasoningBudget: newVal })
				}}
			/>
			<span className='text-void-fg-3 text-xs pointer-events-none'>{isReasoningEnabled ? `${value} トークン` : '思考機能が無効'}</span>
		</div>
	}

	if (reasoningBudgetSlider?.type === 'effort_slider') {

		const { values, default: defaultVal } = reasoningBudgetSlider

		const min = canTurnOffReasoning ? -1 : 0
		const max = values.length - 1

		const currentEffort = voidSettingsState.optionsOfModelSelection[featureName][modelSelection.providerName]?.[modelSelection.modelName]?.reasoningEffort ?? defaultVal
		const valueIfOff = -1
		const value = isReasoningEnabled && currentEffort ? values.indexOf(currentEffort) : valueIfOff

		const currentEffortCapitalized = currentEffort.charAt(0).toUpperCase() + currentEffort.slice(1, Infinity)

		return <div className='flex items-center gap-x-2'>
			<span className='text-void-fg-3 text-xs pointer-events-none inline-block w-10 pr-1'>思考中</span>
			<VoidSlider
				width={30}
				size='xs'
				min={min}
				max={max}
				step={1}
				value={value}
				onChange={(newVal) => {
					const isOff = canTurnOffReasoning && newVal === valueIfOff
					voidSettingsService.setOptionsOfModelSelection(featureName, modelSelection.providerName, modelSelection.modelName, { reasoningEnabled: !isOff, reasoningEffort: values[newVal] ?? undefined })
				}}
			/>
			<span className='text-void-fg-3 text-xs pointer-events-none'>{isReasoningEnabled ? `${currentEffortCapitalized}` : '思考機能が無効です'}</span>
		</div>
	}

	return null
}



const nameOfChatMode = {
	'normal': 'チャット',
	'gather': 'ギャザー',
	'agent': 'エージェント',
}

const detailOfChatMode = {
	'normal': '通常のチャット',
	'gather': 'ファイルを読み取りますが、編集は行いません',
	'agent': 'ファイルを編集し、ツールを使用します',
}


const ChatModeDropdown = ({ className }: { className: string }) => {
	const accessor = useAccessor()

	const voidSettingsService = accessor.get('IVoidSettingsService')
	const settingsState = useSettingsState()

	const options: ChatMode[] = useMemo(() => ['normal', 'gather', 'agent'], [])

	const onChangeOption = useCallback((newVal: ChatMode) => {
		voidSettingsService.setGlobalSetting('chatMode', newVal)
	}, [voidSettingsService])

	return <VoidCustomDropdownBox
		className={className}
		options={options}
		selectedOption={settingsState.globalSettings.chatMode}
		onChangeOption={onChangeOption}
		getOptionDisplayName={(val) => nameOfChatMode[val]}
		getOptionDropdownName={(val) => nameOfChatMode[val]}
		getOptionDropdownDetail={(val) => detailOfChatMode[val]}
		getOptionsEqual={(a, b) => a === b}
	/>

}

const DivisionProjectDropdown = ({ className }: { className: string }) => {
	const accessor = useAccessor()
	const projects = useDivisionProjects()
	const activeConfig = useDivisionProjectConfig()
	const settingsState = useSettingsState()

	const divisionProjectService = accessor.get('IDivisionProjectService')

	const onChangeOption = useCallback((newConfig: DivisionProjectConfig) => {
		divisionProjectService.setActiveProject(newConfig.projectId)
	}, [divisionProjectService])

	// Only show when Division API is selected
	const modelSelection = settingsState.modelSelectionOfFeature['Chat']
	const isDivision = modelSelection?.providerName === 'divisionAPI'

	if (!isDivision || projects.length === 0) return null
	const selectedProject = activeConfig ?? projects[0]

	return (
		<VoidCustomDropdownBox
			className={className}
			options={projects || []}
			selectedOption={selectedProject}
			onChangeOption={onChangeOption}
			getOptionDisplayName={(p) => p.name || p.projectId || 'Unnamed'}
			getOptionDropdownName={(p) => p.name || p.projectId || 'Unnamed'}
			getOptionDropdownDetail={(p) => p.projectId !== p.name ? p.projectId : ''}
			getOptionsEqual={(a, b) => a.projectId === b.projectId}
		/>
	)
}





interface VoidChatAreaProps {
	// Required
	children: React.ReactNode; // This will be the input component

	// Form controls
	onSubmit: () => void;
	onAbort: () => void;
	/**
	 * Optional. When provided AND `isStreaming` is true, the submit-side button
	 * morphs into a "Queue" button that calls this instead of `onSubmit`.
	 * Used by the chat composer to enqueue follow-up prompts while a stream
	 * is still in flight (Cursor 風).
	 */
	onQueue?: () => void;
	isStreaming: boolean;
	isDisabled?: boolean;
	divRef?: React.RefObject<HTMLDivElement | null>;

	// UI customization
	className?: string;
	showModelDropdown?: boolean;
	showSelections?: boolean;
	showProspectiveSelections?: boolean;
	loadingIcon?: React.ReactNode;

	selections?: StagingSelectionItem[]
	setSelections?: (s: StagingSelectionItem[]) => void
	// selections?: any[];
	// onSelectionsChange?: (selections: any[]) => void;

	onClickAnywhere?: () => void;
	// Optional close button
	onClose?: () => void;

	// Optional revert button — shown in the bottom-right action area
	// (next to the submit/abort button). Used when editing a past chat
	// message so the user can revert the conversation + code state from
	// the same place they would normally hit "送信".
	onClickRevert?: () => void;

	featureName: FeatureName;
}

export const VoidChatArea: React.FC<VoidChatAreaProps> = ({
	children,
	onSubmit,
	onAbort,
	onQueue,
	onClose,
	onClickAnywhere,
	divRef,
	isStreaming = false,
	isDisabled = false,
	className = '',
	showModelDropdown = true,
	showSelections = false,
	showProspectiveSelections = false,
	selections,
	setSelections,
	featureName,
	loadingIcon,
	onClickRevert,
}) => {
	const accessor = useAccessor()
	const chatThreadService = accessor.get('IChatThreadService')
	const fileInputRef = useRef<HTMLInputElement>(null)
	const [isDragOver, setIsDragOver] = useState(false)

	const handleFiles = useCallback((files: FileList | null) => {
		if (!files) return
		for (let i = 0; i < files.length; i++) {
			const file = files[i]
			if (file.type.startsWith('image/')) {
				// Handle image files as Image selections (base64)
				const reader = new FileReader()
				reader.onload = () => {
					const dataUrl = reader.result as string
					const base64Data = dataUrl.split(',')[1]
					if (!base64Data) return
					const newSelection: StagingSelectionItem = {
						type: 'Image',
						uri: URI.file(file.name),
						base64Data,
						mimeType: file.type,
						fileName: file.name,
						language: undefined,
						state: undefined,
					}
					chatThreadService.addNewStagingSelection(newSelection)
				}
				reader.readAsDataURL(file)
			} else {
				// Handle non-image files as File context selections
				// Use Electron's getPathForFile for native file path resolution
				const nativePath = (typeof (globalThis as any).vscode?.webUtils?.getPathForFile === 'function')
					? (globalThis as any).vscode.webUtils.getPathForFile(file) as string | undefined
					: undefined
				if (nativePath) {
					const fileUri = URI.file(nativePath)
					chatThreadService.addNewStagingSelection({
						type: 'File',
						uri: fileUri,
						language: 'plaintext',
						state: { wasAddedAsCurrentFile: false },
					})
				}
			}
		}
	}, [chatThreadService])

	// Handle URIs extracted from VS Code's internal drag data formats
	const handleDroppedURIs = useCallback((uris: URI[]) => {
		for (const uri of uris) {
			if (!uri) continue
			// Check if it looks like a directory (ends with /)
			const fsPath = uri.fsPath
			if (fsPath.endsWith('/') || fsPath.endsWith('\\')) {
				chatThreadService.addNewStagingSelection({
					type: 'Folder',
					uri,
				})
			} else {
				chatThreadService.addNewStagingSelection({
					type: 'File',
					uri,
					language: 'plaintext',
					state: { wasAddedAsCurrentFile: false },
				})
			}
		}
	}, [chatThreadService])

	const onDragOver = useCallback((e: React.DragEvent) => {
		e.preventDefault()
		e.stopPropagation()
		console.log('[DnD] onDragOver fired, types:', Array.from(e.dataTransfer?.types || []))
		setIsDragOver(true)
	}, [])

	const onDragLeave = useCallback((e: React.DragEvent) => {
		e.preventDefault()
		e.stopPropagation()
		setIsDragOver(false)
	}, [])

	const onDrop = useCallback((e: React.DragEvent) => {
		e.preventDefault()
		e.stopPropagation()
		setIsDragOver(false)

		const dt = e.dataTransfer
		console.log('[DnD] onDrop fired')
		console.log('[DnD] types:', Array.from(dt.types || []))
		console.log('[DnD] files count:', dt.files?.length)
		for (const type of Array.from(dt.types || [])) {
			try {
				const data = dt.getData(type)
				console.log(`[DnD] data for '${type}':`, data?.substring(0, 200))
			} catch (e) {
				console.log(`[DnD] error reading '${type}':`, e)
			}
		}
		if (dt.files) {
			for (let i = 0; i < dt.files.length; i++) {
				const f = dt.files[i]
				const nativePath = (typeof (globalThis as any).vscode?.webUtils?.getPathForFile === 'function')
					? (globalThis as any).vscode.webUtils.getPathForFile(f)
					: undefined
				console.log(`[DnD] file[${i}]:`, f.name, 'type:', f.type, 'size:', f.size, 'nativePath:', nativePath)
			}
		}
		let handled = false

		// 1. Try VS Code internal CodeEditors format (files dragged from editor tabs)
		// Note: CodeEditors data is serialized with marshalling's stringify(),
		// which stores URIs as UriComponents objects (not strings), so we need URI.revive()
		try {
			const rawEditors = dt.getData('CodeEditors')
			if (rawEditors) {
				const editors = JSON.parse(rawEditors) as { resource?: any }[]
				const uris = editors.map(e => {
					if (!e.resource) return null
					if (typeof e.resource === 'string') return URI.parse(e.resource)
					// UriComponents object from marshalling's stringify()
					return URI.revive(e.resource)
				}).filter((u): u is URI => !!u)
				if (uris.length > 0) {
					handleDroppedURIs(uris)
					handled = true
				}
			}
		} catch { /* invalid transfer */ }

		// 2. Try VS Code internal Resources format (files dragged from explorer)
		if (!handled) {
			try {
				const rawResources = dt.getData('ResourceURLs')
				if (rawResources) {
					const resources: string[] = JSON.parse(rawResources)
					const uris = resources.map(r => URI.parse(r)).filter((u): u is URI => !!u)
					if (uris.length > 0) {
						handleDroppedURIs(uris)
						handled = true
					}
				}
			} catch { /* invalid transfer */ }
		}

		// 3. Try VS Code internal CodeFiles format
		if (!handled) {
			try {
				const rawCodeFiles = dt.getData('CodeFiles')
				if (rawCodeFiles) {
					const codeFiles: string[] = JSON.parse(rawCodeFiles)
					const uris = codeFiles.map(f => URI.file(f))
					if (uris.length > 0) {
						handleDroppedURIs(uris)
						handled = true
					}
				}
			} catch { /* invalid transfer */ }
		}

		// 4. Fallback to native file transfer (e.g. from OS file manager)
		if (!handled && dt.files && dt.files.length > 0) {
			handleFiles(dt.files)
		}
	}, [handleFiles, handleDroppedURIs])

	return (
		<div
			ref={divRef}
			className={`
				gap-x-1
                flex flex-col p-2 relative input text-left shrink-0
                rounded-xl
                bg-gradient-to-b from-void-bg-1 to-[color-mix(in_srgb,var(--void-bg-1)_92%,var(--vscode-focusBorder)_8%)]
				backdrop-blur-sm
				transition-all duration-300 ease-out
				border border-void-border-3
				focus-within:border-[color-mix(in_srgb,var(--vscode-focusBorder)_60%,var(--void-border-1)_40%)]
				focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--vscode-focusBorder)_15%,transparent),0_8px_24px_-8px_rgba(0,0,0,0.4)]
				hover:border-void-border-1
				max-h-[80vh] overflow-y-auto
				${isDragOver ? '!border-blue-400 bg-blue-500/10 shadow-[0_0_0_3px_rgba(59,130,246,0.2)]' : ''}
                ${className}
            `}
			onClick={(e) => {
				onClickAnywhere?.()
			}}
			onDragOver={onDragOver}
			onDragEnter={onDragOver}
			onDragLeave={onDragLeave}
			onDrop={onDrop}
		>
			{/* Drag & drop overlay */}
			{isDragOver && (
				<div className='absolute inset-0 z-10 flex items-center justify-center bg-gradient-to-br from-blue-500/15 to-blue-600/10 backdrop-blur-[2px] border-2 border-dashed border-blue-400 rounded-lg pointer-events-none animate-in fade-in duration-150'>
					<div className='flex items-center gap-2 text-blue-200 text-sm font-semibold px-3 py-1.5 bg-blue-500/20 rounded-full border border-blue-400/40 shadow-lg'>
						<Paperclip size={16} className='animate-pulse' />
						ここにファイルをドロップ
					</div>
				</div>
			)}

			{/* Selections section */}
			{showSelections && selections && setSelections && (
				<SelectedFiles
					type='staging'
					selections={selections}
					setSelections={setSelections}
					showProspectiveSelections={showProspectiveSelections}
				/>
			)}

			{/* Input section */}
			<div className="relative w-full">
				{children}

				{/* Close button (X) if onClose is provided */}
				{onClose && (
					<div className='absolute -top-1 -right-1 cursor-pointer z-1'>
						<IconX
							size={12}
							className="stroke-[2] opacity-80 text-void-fg-3 hover:brightness-95"
							onClick={onClose}
						/>
					</div>
				)}
			</div>

			{/* Hidden file input for attachment */}
			<input
				ref={fileInputRef}
				type='file'
				accept='image/*'
				multiple
				className='hidden'
				onChange={(e) => {
					handleFiles(e.target.files)
					if (fileInputRef.current) fileInputRef.current.value = ''
				}}
			/>

			{/* Bottom row */}
			<div
				className='flex flex-row justify-between items-end gap-1 p-1.5 rounded-lg -mx-1 mb-[-4px] mt-1'
				style={{
					background: 'linear-gradient(180deg, color-mix(in srgb, var(--void-bg-3) 40%, transparent) 0%, color-mix(in srgb, var(--void-bg-3) 70%, transparent) 100%)',
					backdropFilter: 'blur(8px)',
					border: '1px solid color-mix(in srgb, var(--void-border-2) 40%, transparent)',
				}}
			>
				{showModelDropdown && (
					<div className='flex flex-col gap-y-1'>
						<ReasoningOptionSlider featureName={featureName} />

						<div className='flex items-center flex-wrap gap-x-2 gap-y-1 text-nowrap '>
							{featureName === 'Chat' && <ChatModeDropdown className='text-xs text-void-fg-3 bg-void-bg-1 border border-void-border-2 rounded py-0.5 px-1' />}
							{featureName === 'Chat' && (
								<div className='flex items-center gap-1'>
									<span className='text-void-fg-4 text-[10px] pointer-events-none'>プロジェクト</span>
									<DivisionProjectDropdown className='text-xs text-void-fg-3 bg-void-bg-1 border border-void-border-2 rounded py-0.5 px-1' />
								</div>
							)}
							<div className='flex items-center gap-1'>
								<span className='text-void-fg-4 text-[10px] pointer-events-none'>モデル</span>
								<ModelDropdown featureName={featureName} className='text-xs text-void-fg-3 bg-void-bg-1 rounded' />
							</div>
						</div>
					</div>
				)}

				<div className="flex items-center gap-2">

					{/* Attachment button */}
					{showSelections && (
						<button
							type='button'
							className='p-1 rounded cursor-pointer text-void-fg-3 hover:text-void-fg-1 hover:bg-void-bg-2 transition-colors duration-150'
							onClick={() => fileInputRef.current?.click()}
							data-tooltip-id='void-tooltip'
							data-tooltip-content='Attach image'
							data-tooltip-place='top'
						>
							<Paperclip size={16} className='stroke-[1.5]' />
						</button>
					)}

					{isStreaming && loadingIcon}

					{/* 過去メッセージを編集中（onClickRevert が渡されている）の場合は、
					    送信/停止ボタンを表示せずリバートボタンだけを置く。
					    通常の入力欄では従来どおり Submit / Stop を表示する。
					    ストリーミング中で onQueue が渡されている場合は
					    Stop と並んで「キューに追加」ボタンを出す (Cursor 風)。 */}
					{onClickRevert ? (
						<ButtonRevert onClick={onClickRevert} />
					) : (
						isStreaming ? (
							<>
								{onQueue && (
									<ButtonQueueAdd
										onClick={onQueue}
										disabled={isDisabled}
									/>
								)}
								<ButtonStop onClick={onAbort} />
							</>
						) : (
							<ButtonSubmit
								onClick={onSubmit}
								disabled={isDisabled}
							/>
						)
					)}
				</div>

			</div>
		</div>
	);
};




type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement>
const DEFAULT_BUTTON_SIZE = 22;
export const ButtonSubmit = ({ className, disabled, ...props }: ButtonProps & Required<Pick<ButtonProps, 'disabled'>>) => {

	return <button
		type='button'
		className={`rounded-full flex-shrink-0 flex-grow-0 flex items-center justify-center
			transition-all duration-200 ease-out
			${disabled
				? 'bg-vscode-disabled-fg cursor-default opacity-50'
				: 'bg-gradient-to-br from-white via-white to-zinc-200 cursor-pointer shadow-[0_2px_8px_rgba(255,255,255,0.25),inset_0_1px_0_rgba(255,255,255,0.8)] hover:shadow-[0_4px_14px_rgba(255,255,255,0.4),inset_0_1px_0_rgba(255,255,255,0.9)] hover:scale-[1.06] active:scale-95'
			}
			${className}
		`}
		// data-tooltip-id='void-tooltip'
		// data-tooltip-content={'Send'}
		// data-tooltip-place='left'
		{...props}
	>
		<IconArrowUp size={DEFAULT_BUTTON_SIZE} className="stroke-[2] p-[2px]" />
	</button>
}

export const ButtonStop = ({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => {
	return <button
		className={`rounded-full flex-shrink-0 flex-grow-0 cursor-pointer flex items-center justify-center
			bg-gradient-to-br from-white via-white to-zinc-200
			shadow-[0_2px_8px_rgba(255,255,255,0.25),inset_0_1px_0_rgba(255,255,255,0.8)]
			hover:shadow-[0_4px_14px_rgba(255,255,255,0.4)]
			hover:scale-[1.06] active:scale-95
			transition-all duration-200 ease-out
			relative
			before:absolute before:inset-0 before:rounded-full before:animate-pulse before:bg-white/10 before:pointer-events-none
			${className}
		`}
		type='button'
		{...props}
	>
		<IconSquare size={DEFAULT_BUTTON_SIZE} className="stroke-[3] p-[7px] relative z-10" />
	</button>
}

// 「キューに追加」ボタン。 ストリーミング中だけ Stop と並んで表示される。
// 見た目は ButtonSubmit と区別したいので、白い丸ではなく枠線+リスト追加アイコンの中性的なボタンにする。
export const ButtonQueueAdd = ({ className, disabled, ...props }: ButtonProps & Required<Pick<ButtonProps, 'disabled'>>) => {
	return <button
		type='button'
		className={`rounded-full flex-shrink-0 flex-grow-0 flex items-center justify-center
			w-[22px] h-[22px]
			transition-all duration-150
			border
			${disabled
				? 'border-void-border-2 text-void-fg-4 opacity-50 cursor-default'
				: 'border-void-border-1 text-void-fg-1 bg-void-bg-2 hover:bg-void-bg-3 cursor-pointer hover:scale-[1.06] active:scale-95'
			}
			${className ?? ''}
		`}
		data-tooltip-id='void-tooltip'
		data-tooltip-content='キューに追加 (生成中の応答が終わったら自動送信)'
		data-tooltip-place='top'
		disabled={disabled}
		{...props}
	>
		<ListPlus size={12} className='stroke-[2.2]' />
	</button>
}

// Revert button — icon-only, sits in the right-bottom action slot in place
// of Submit/Stop while editing a past message. Matches the size & shape of
// ButtonSubmit / ButtonStop so the layout stays consistent.
export const ButtonRevert = ({ className, onClick, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => {
	return <button
		type='button'
		{...props}
		className={`
			rounded-full flex-shrink-0 flex-grow-0 cursor-pointer
			flex items-center justify-center
			w-[22px] h-[22px]
			text-void-fg-2 hover:text-void-fg-1
			bg-void-bg-2 hover:bg-[color-mix(in_srgb,var(--void-fg-1)_10%,transparent)]
			border border-void-border-2 hover:border-void-border-1
			transition-colors duration-150
			${className ?? ''}
		`}
		onClick={(e) => {
			e.stopPropagation()
			onClick?.(e)
		}}
		data-tooltip-id='void-tooltip'
		data-tooltip-content='ここに戻す（チャットとコードを巻き戻し）'
		data-tooltip-place='top'
	>
		<RotateCcw size={12} className='stroke-[2]' />
	</button>
}



const scrollToBottom = (divRef: { current: HTMLElement | null }) => {
	if (divRef.current) {
		divRef.current.scrollTop = divRef.current.scrollHeight;
	}
};



const ScrollToBottomContainer = ({ children, className, style, scrollContainerRef }: { children: React.ReactNode, className?: string, style?: React.CSSProperties, scrollContainerRef: React.MutableRefObject<HTMLDivElement | null> }) => {
	const [isAtBottom, setIsAtBottom] = useState(true); // Start at bottom

	const divRef = scrollContainerRef
	const contentRef = useRef<HTMLDivElement>(null);
	const isAtBottomRef = useRef(isAtBottom);
	// True once the user has actively scrolled away from the bottom. While this
	// is set, we disable all auto-scroll-to-bottom behaviour so streaming output
	// or ResizeObserver ticks can't "pull" the user back down. Resets to false
	// only when the user explicitly returns to the bottom (scroll to bottom, or
	// clicks the floating chevron button).
	const userPinnedAwayRef = useRef(false);

	useEffect(() => {
		isAtBottomRef.current = isAtBottom;
	}, [isAtBottom]);

	const onScroll = () => {
		const div = divRef.current;
		if (!div) return;

		const distanceFromBottom = div.scrollHeight - div.clientHeight - div.scrollTop;
		const isBottom = Math.abs(distanceFromBottom) < 10;

		// When the user has moved meaningfully away from the bottom, pin them
		// there until they manually return. We use a larger threshold here so
		// tiny content-height adjustments don't accidentally release the pin.
		if (distanceFromBottom > 40) {
			userPinnedAwayRef.current = true;
		} else if (isBottom) {
			userPinnedAwayRef.current = false;
		}

		setIsAtBottom(isBottom);
	};

	// Detect active user scroll gestures. Once the user initiates any of these,
	// treat it as intent to stay where they are even if streaming content tries
	// to push the viewport.
	useEffect(() => {
		const div = divRef.current;
		if (!div) return;
		const markPinnedIfAway = () => {
			const el = divRef.current;
			if (!el) return;
			const distance = el.scrollHeight - el.clientHeight - el.scrollTop;
			if (distance > 40) userPinnedAwayRef.current = true;
		};
		const onWheel = () => markPinnedIfAway();
		const onTouchMove = () => markPinnedIfAway();
		const onKeyDown = (e: globalThis.KeyboardEvent) => {
			if (['ArrowUp', 'PageUp', 'Home', 'ArrowDown', 'PageDown', 'End'].includes(e.key)) {
				markPinnedIfAway();
			}
		};
		div.addEventListener('wheel', onWheel, { passive: true });
		div.addEventListener('touchmove', onTouchMove, { passive: true });
		div.addEventListener('keydown', onKeyDown);
		return () => {
			div.removeEventListener('wheel', onWheel);
			div.removeEventListener('touchmove', onTouchMove);
			div.removeEventListener('keydown', onKeyDown);
		};
	}, [divRef]);

	// When children change (new messages added)
	useEffect(() => {
		if (isAtBottom && !userPinnedAwayRef.current) {
			scrollToBottom(divRef);
		}
	}, [children, isAtBottom]); // Dependency on children to detect new messages

	// ResizeObserver to detect content height changes (streaming)
	useEffect(() => {
		if (!contentRef.current) return;
		const observer = new ResizeObserver(() => {
			if (isAtBottomRef.current && !userPinnedAwayRef.current) {
				scrollToBottom(divRef);
			}
		});
		observer.observe(contentRef.current);
		return () => observer.disconnect();
	}, []);

	// Initial scroll to bottom
	useEffect(() => {
		scrollToBottom(divRef);
	}, []);

	const jumpToBottom = () => {
		userPinnedAwayRef.current = false;
		scrollToBottom(divRef);
	};

	return (
		<div className='relative' style={style}>
			<div
				ref={divRef}
				onScroll={onScroll}
				className={`${className ?? ''} void-chat-scroll`}
				style={{ flex: '1 1 0', minHeight: 0, height: '100%' }}
			>
				<div ref={contentRef}>
					{children}
				</div>
			</div>

			{/* Cursor-style floating scroll-to-bottom pill */}
			{!isAtBottom && (
				<button
					onClick={jumpToBottom}
					className='absolute bottom-3 left-1/2 -translate-x-1/2 z-10
						h-7 px-2.5 rounded-full
						conductor-glass border border-void-border-2
						flex items-center gap-1
						cursor-pointer
						text-[11px] text-void-fg-2 hover:text-void-fg-1
						shadow-[0_4px_14px_-4px_rgba(0,0,0,0.4)]
						hover:border-void-border-1
						transition-all duration-150 ease-out'
					data-tooltip-id='void-tooltip'
					data-tooltip-content='Scroll to bottom'
					data-tooltip-place='top'
				>
					<ChevronDown size={13} className='text-void-fg-2' />
					<span className='font-medium tracking-tight'>Jump to latest</span>
				</button>
			)}
		</div>
	);
};

export const getRelative = (uri: URI, accessor: ReturnType<typeof useAccessor>) => {
	const workspaceContextService = accessor.get('IWorkspaceContextService')
	let path: string
	const isInside = workspaceContextService.isInsideWorkspace(uri)
	if (isInside) {
		const f = workspaceContextService.getWorkspace().folders.find(f => uri.fsPath?.startsWith(f.uri.fsPath))
		if (f) { path = uri.fsPath.replace(f.uri.fsPath, '') }
		else { path = uri.fsPath }
	}
	else {
		path = uri.fsPath
	}
	return path || undefined
}

export const getFolderName = (pathStr: string) => {
	// 'unixify' path
	pathStr = pathStr.replace(/[/\\]+/g, '/') // replace any / or \ or \\ with /
	const parts = pathStr.split('/') // split on /
	// Filter out empty parts (the last element will be empty if path ends with /)
	const nonEmptyParts = parts.filter(part => part.length > 0)
	if (nonEmptyParts.length === 0) return '/' // Root directory
	if (nonEmptyParts.length === 1) return nonEmptyParts[0] + '/' // Only one folder
	// Get the last two parts
	const lastTwo = nonEmptyParts.slice(-2)
	return lastTwo.join('/') + '/'
}

export const getBasename = (pathStr: string, parts: number = 1) => {
	// 'unixify' path
	pathStr = pathStr.replace(/[/\\]+/g, '/') // replace any / or \ or \\ with /
	const allParts = pathStr.split('/') // split on /
	if (allParts.length === 0) return pathStr
	return allParts.slice(-parts).join('/')
}



// Open file utility function
export const voidOpenFileFn = (
	uri: URI,
	accessor: ReturnType<typeof useAccessor>,
	range?: [number, number]
) => {
	const commandService = accessor.get('ICommandService')
	const editorService = accessor.get('ICodeEditorService')

	// Get editor selection from CodeSelection range
	let editorSelection = undefined;

	// If we have a selection, create an editor selection from the range
	if (range) {
		editorSelection = {
			startLineNumber: range[0],
			startColumn: 1,
			endLineNumber: range[1],
			endColumn: Number.MAX_SAFE_INTEGER,
		};
	}

	// open the file
	commandService.executeCommand('vscode.open', uri).then(() => {

		// select the text
		setTimeout(() => {
			if (!editorSelection) return;

			const editor = editorService.getActiveCodeEditor()
			if (!editor) return;

			editor.setSelection(editorSelection)
			editor.revealRange(editorSelection, ScrollType.Immediate)

		}, 50) // needed when document was just opened and needs to initialize

	})

};


export const SelectedFiles = (
	{ type, selections, setSelections, showProspectiveSelections, messageIdx, }:
		| { type: 'past', selections: StagingSelectionItem[]; setSelections?: undefined, showProspectiveSelections?: undefined, messageIdx: number, }
		| { type: 'staging', selections: StagingSelectionItem[]; setSelections: ((newSelections: StagingSelectionItem[]) => void), showProspectiveSelections?: boolean, messageIdx?: number }
) => {

	const accessor = useAccessor()
	const commandService = accessor.get('ICommandService')
	const modelReferenceService = accessor.get('IVoidModelService')




	// state for tracking prospective files
	const { uri: currentURI } = useActiveURI()
	const [recentUris, setRecentUris] = useState<URI[]>([])
	const maxRecentUris = 10
	const maxProspectiveFiles = 3
	useEffect(() => { // handle recent files
		if (!currentURI) return
		setRecentUris(prev => {
			const withoutCurrent = prev.filter(uri => uri.fsPath !== currentURI.fsPath) // remove duplicates
			const withCurrent = [currentURI, ...withoutCurrent]
			return withCurrent.slice(0, maxRecentUris)
		})
	}, [currentURI])
	const [prospectiveSelections, setProspectiveSelections] = useState<StagingSelectionItem[]>([])


	// handle prospective files
	useEffect(() => {
		const computeRecents = async () => {
			const prospectiveURIs = recentUris
				.filter(uri => !selections.find(s => s.type === 'File' && s.uri.fsPath === uri.fsPath))
				.slice(0, maxProspectiveFiles)

			const answer: StagingSelectionItem[] = []
			for (const uri of prospectiveURIs) {
				answer.push({
					type: 'File',
					uri: uri,
					language: (await modelReferenceService.getModelSafe(uri)).model?.getLanguageId() || 'plaintext',
					state: { wasAddedAsCurrentFile: false },
				})
			}
			return answer
		}

		// add a prospective file if type === 'staging' and if the user is in a file, and if the file is not selected yet
		if (type === 'staging' && showProspectiveSelections) {
			computeRecents().then((a) => setProspectiveSelections(a))
		}
		else {
			setProspectiveSelections([])
		}
	}, [recentUris, selections, type, showProspectiveSelections])


	const allSelections = [...selections, ...prospectiveSelections]

	if (allSelections.length === 0) {
		return null
	}

	return (
		<div className='flex items-center flex-wrap text-left relative gap-x-0.5 gap-y-1 pb-0.5'>

			{allSelections.map((selection, i) => {

				const isThisSelectionProspective = i > selections.length - 1

				const thisKey = selection.type === 'CodeSelection' ? selection.type + selection.language + selection.range + selection.state.wasAddedAsCurrentFile + selection.uri.fsPath
					: selection.type === 'File' ? selection.type + selection.language + selection.state.wasAddedAsCurrentFile + selection.uri.fsPath
						: selection.type === 'Folder' ? selection.type + selection.language + selection.state + selection.uri.fsPath
							: selection.type === 'Image' ? 'Image_' + selection.fileName + '_' + i
								: selection.type === 'ContextTag' ? 'Tag_' + selection.tagGroup + '_' + selection.tagId
									: i

				// Render image selections as thumbnails
				if (selection.type === 'Image') {
					return <div key={thisKey} className='flex flex-col space-y-[1px]'>
						<div
							className={`
								flex items-center gap-1 relative
								px-1 py-0.5
								w-fit h-fit
								select-none
								text-xs text-nowrap
								border rounded-sm
								${isThisSelectionProspective ? 'bg-void-bg-1 text-void-fg-3 opacity-80' : 'bg-void-bg-1 hover:brightness-95 text-void-fg-1'}
								${isThisSelectionProspective ? 'border-void-border-2' : 'border-void-border-1'}
								hover:border-void-border-1
								transition-all duration-150
							`}
						>
							<img
								src={`data:${selection.mimeType};base64,${selection.base64Data}`}
								alt={selection.fileName}
								className='w-6 h-6 object-cover rounded-sm'
							/>
							<span className='max-w-[80px] truncate'>{selection.fileName}</span>
							{type === 'staging' && !isThisSelectionProspective ?
								<div
									className='cursor-pointer z-1 self-stretch flex items-center justify-center'
									onClick={(e) => {
										e.stopPropagation();
										if (type !== 'staging') return;
										setSelections([...selections.slice(0, i), ...selections.slice(i + 1)])
									}}
								>
									<IconX className='stroke-[2]' size={10} />
								</div>
								: <></>
							}
						</div>
					</div>
				}

				if (selection.type === 'ContextTag') {
					const tag = contextTags.find(t => t.id === selection.tagId);
					const groupInfo = contextTagGroups[selection.tagGroup];
					const TagIcon = selection.tagGroup === 'design' ? Palette
						: selection.tagGroup === 'feature' ? Blocks
							: selection.tagGroup === 'language' ? Code
								: selection.tagGroup === 'framework' ? Package
									: Blocks;
					return <div key={thisKey} className='flex flex-col space-y-[1px]'>
						<div
							className={`
								flex items-center gap-1 relative
								px-1 py-0.5
								w-fit h-fit
								select-none
								text-xs text-nowrap
								border rounded-sm
								bg-void-bg-1 hover:brightness-95 text-void-fg-1
								border-void-border-1
								transition-all duration-150
							`}
							data-tooltip-id='void-tooltip'
							data-tooltip-content={tag ? `${groupInfo.title}: ${tag.description}` : selection.tagId}
							data-tooltip-place='top'
							data-tooltip-delay-show={500}
						>
							<TagIcon size={10} />
							<span>{tag?.title ?? selection.tagId}</span>
							{type === 'staging' && !isThisSelectionProspective ?
								<div
									className='cursor-pointer z-1 self-stretch flex items-center justify-center'
									onClick={(e) => {
										e.stopPropagation();
										if (type !== 'staging') return;
										setSelections([...selections.slice(0, i), ...selections.slice(i + 1)])
									}}
								>
									<IconX className='stroke-[2]' size={10} />
								</div>
								: <></>
							}
						</div>
					</div>
				}

				const SelectionIcon = (
					selection.type === 'File' ? File
						: selection.type === 'Folder' ? Folder
							: selection.type === 'CodeSelection' ? Text
								: (undefined as never)
				)

				return <div // container for summarybox and code
					key={thisKey}
					className={`flex flex-col space-y-[1px]`}
				>
					{/* tooltip for file path */}
					<span className="truncate overflow-hidden text-ellipsis"
						data-tooltip-id='void-tooltip'
						data-tooltip-content={getRelative(selection.uri, accessor)}
						data-tooltip-place='top'
						data-tooltip-delay-show={3000}
					>
						{/* summarybox */}
						<div
							className={`
								flex items-center gap-1 relative
								px-1
								w-fit h-fit
								select-none
								text-xs text-nowrap
								border rounded-sm
								${isThisSelectionProspective ? 'bg-void-bg-1 text-void-fg-3 opacity-80' : 'bg-void-bg-1 hover:brightness-95 text-void-fg-1'}
								${isThisSelectionProspective
									? 'border-void-border-2'
									: 'border-void-border-1'
								}
								hover:border-void-border-1
								transition-all duration-150
							`}
							onClick={() => {
								if (type !== 'staging') return; // (never)
								if (isThisSelectionProspective) { // add prospective selection to selections
									setSelections([...selections, selection])
								}
								else if (selection.type === 'File') { // open files
									voidOpenFileFn(selection.uri, accessor);

									const wasAddedAsCurrentFile = selection.state.wasAddedAsCurrentFile
									if (wasAddedAsCurrentFile) {
										// make it so the file is added permanently, not just as the current file
										const newSelection: StagingSelectionItem = { ...selection, state: { ...selection.state, wasAddedAsCurrentFile: false } }
										setSelections([
											...selections.slice(0, i),
											newSelection,
											...selections.slice(i + 1)
										])
									}
								}
								else if (selection.type === 'CodeSelection') {
									voidOpenFileFn(selection.uri, accessor, selection.range);
								}
								else if (selection.type === 'Folder') {
									// TODO!!! reveal in tree
								}
							}}
						>
							{<SelectionIcon size={10} />}

							{ // file name and range
								getBasename(selection.uri.fsPath)
								+ (selection.type === 'CodeSelection' ? ` (${selection.range[0]}-${selection.range[1]})` : '')
							}

							{selection.type === 'File' && selection.state.wasAddedAsCurrentFile && messageIdx === undefined && currentURI?.fsPath === selection.uri.fsPath ?
								<span className={`text-[8px] 'void-opacity-60 text-void-fg-4`}>
									{`(Current File)`}
								</span>
								: null
							}

							{type === 'staging' && !isThisSelectionProspective ? // X button
								<div // box for making it easier to click
									className='cursor-pointer z-1 self-stretch flex items-center justify-center'
									onClick={(e) => {
										e.stopPropagation(); // don't open/close selection
										if (type !== 'staging') return;
										setSelections([...selections.slice(0, i), ...selections.slice(i + 1)])
									}}
								>
									<IconX
										className='stroke-[2]'
										size={10}
									/>
								</div>
								: <></>
							}
						</div>
					</span>
				</div>

			})}


		</div>

	)
}


type ToolHeaderParams = {
	icon?: React.ReactNode;
	title: React.ReactNode;
	desc1: React.ReactNode;
	desc1OnClick?: () => void;
	desc2?: React.ReactNode;
	isError?: boolean;
	info?: string;
	desc1Info?: string;
	isRejected?: boolean;
	numResults?: number;
	hasNextPage?: boolean;
	children?: React.ReactNode;
	bottomChildren?: React.ReactNode;
	onClick?: () => void;
	desc2OnClick?: () => void;
	isOpen?: boolean;
	className?: string;
}

const ToolHeaderWrapper = ({
	icon,
	title,
	desc1,
	desc1OnClick,
	desc1Info,
	desc2,
	numResults,
	hasNextPage,
	children,
	info,
	bottomChildren,
	isError,
	onClick,
	desc2OnClick,
	isOpen,
	isRejected,
	className, // applies to the main content
}: ToolHeaderParams) => {

	const [isOpen_, setIsOpen] = useState(false);
	const isExpanded = isOpen !== undefined ? isOpen : isOpen_

	const isDropdown = children !== undefined
	const isClickable = !!(isDropdown || onClick)

	const isDesc1Clickable = !!desc1OnClick

	const desc1HTML = <span
		className={`text-void-fg-4 text-[11px] truncate ml-1.5
			${isDesc1Clickable ? 'cursor-pointer hover:text-void-fg-2' : ''}
		`}
		onClick={desc1OnClick}
		{...desc1Info ? {
			'data-tooltip-id': 'void-tooltip',
			'data-tooltip-content': desc1Info,
			'data-tooltip-place': 'top',
			'data-tooltip-delay-show': 1000,
		} : {}}
	>{desc1}</span>

	return (<div className={className}>
		<div className={`select-none flex items-center min-h-[24px] py-0.5`}>
			<div className={`flex items-center w-full gap-x-2 overflow-hidden justify-between ${isRejected ? 'line-through opacity-50' : ''}`}>
				<div className='flex items-center overflow-hidden'>
					<div className={`flex items-center min-w-0 overflow-hidden grow ${isClickable ? 'cursor-pointer hover:text-void-fg-1' : ''}`}
						onClick={() => {
							if (isDropdown) { setIsOpen(v => !v); }
							if (onClick) { onClick(); }
						}}
					>
						{isDropdown && (<ChevronRight
							className={`text-void-fg-4 mr-1 h-3 w-3 flex-shrink-0 transition-transform duration-100 ${isExpanded ? 'rotate-90' : ''}`}
						/>)}
						<span className="text-void-fg-3 text-[12px] flex-shrink-0">{title}</span>
						{!isDesc1Clickable && desc1HTML}
					</div>
					{isDesc1Clickable && desc1HTML}
				</div>

				<div className="flex items-center gap-x-1.5 flex-shrink-0">
					{isError && <AlertTriangle className='text-void-warning flex-shrink-0' size={12} />}
					{isRejected && <Ban className='text-void-fg-4 flex-shrink-0' size={12} />}
					{desc2 && <span className="text-void-fg-4 text-[11px]" onClick={desc2OnClick}>{desc2}</span>}
					{numResults !== undefined && (
						<span className="text-void-fg-4 text-[10px]">{`${numResults}${hasNextPage ? '+' : ''}`}</span>
					)}
				</div>
			</div>
		</div>
		{<div className={`overflow-hidden ${isExpanded ? 'py-0.5' : 'max-h-0 opacity-0'} text-void-fg-4 overflow-x-auto`}>
			{children}
		</div>}
		{bottomChildren}
	</div>);
};



const EditTool = ({ toolMessage, threadId, messageIdx, content }: Parameters<ResultWrapper<'edit_file' | 'rewrite_file'>>[0] & { content: string }) => {
	const accessor = useAccessor()
	const isError = false
	const isRejected = toolMessage.type === 'rejected'

	const title = getTitle(toolMessage)

	const { desc1, desc1Info } = toolNameToDesc(toolMessage.name, toolMessage.params, accessor)
	const icon = null

	const { rawParams, params, name } = toolMessage
	const desc1OnClick = () => voidOpenFileFn(params.uri, accessor)
	const componentParams: ToolHeaderParams = { title, desc1, desc1OnClick, desc1Info, isError, icon, isRejected, }


	const editToolType = toolMessage.name === 'edit_file' ? 'diff' : 'rewrite'
	if (toolMessage.type === 'running_now' || toolMessage.type === 'tool_request') {
		componentParams.children = <ToolChildrenWrapper className='bg-void-bg-3'>
			<EditToolChildren
				uri={params.uri}
				code={content}
				type={editToolType}
			/>
		</ToolChildrenWrapper>
		// JumpToFileButton removed in favor of FileLinkText
	}
	else if (toolMessage.type === 'success' || toolMessage.type === 'rejected' || toolMessage.type === 'tool_error') {
		// add apply box
		const applyBoxId = getApplyBoxId({
			threadId: threadId,
			messageIdx: messageIdx,
			tokenIdx: 'N/A',
		})
		componentParams.desc2 = <EditToolHeaderButtons
			applyBoxId={applyBoxId}
			uri={params.uri}
			codeStr={content}
			toolName={name}
			threadId={threadId}
		/>

		// add children
		componentParams.children = <ToolChildrenWrapper className='bg-void-bg-3'>
			<EditToolChildren
				uri={params.uri}
				code={content}
				type={editToolType}
			/>
		</ToolChildrenWrapper>

		if (toolMessage.type === 'success' || toolMessage.type === 'rejected') {
			const { result } = toolMessage
			componentParams.bottomChildren = <BottomChildren title='Lint errors'>
				{result?.lintErrors?.map((error, i) => (
					<div key={i} className='whitespace-nowrap'>Lines {error.startLineNumber}-{error.endLineNumber}: {error.message}</div>
				))}
			</BottomChildren>
		}
		else if (toolMessage.type === 'tool_error') {
			// error
			const { result } = toolMessage
			componentParams.bottomChildren = <BottomChildren title='Error'>
				<CodeChildren>
					{result}
				</CodeChildren>
			</BottomChildren>
		}
	}

	return <ToolHeaderWrapper {...componentParams} />
}

const SimplifiedToolHeader = ({
	title,
	children,
}: {
	title: string;
	children?: React.ReactNode;
}) => {
	const [isOpen, setIsOpen] = useState(false);
	const isDropdown = children !== undefined;
	return (
		<div>
			<div className="w-full">
				{/* header */}
				<div
					className={`select-none flex items-center min-h-[24px] ${isDropdown ? 'cursor-pointer' : ''}`}
					onClick={() => {
						if (isDropdown) { setIsOpen(v => !v); }
					}}
				>
					{isDropdown && (
						<ChevronRight
							className={`text-void-fg-3 mr-0.5 h-4 w-4 flex-shrink-0 transition-transform duration-100 ease-[cubic-bezier(0.4,0,0.2,1)] ${isOpen ? 'rotate-90' : ''}`}
						/>
					)}
					<div className="flex items-center w-full overflow-hidden">
						<span className="text-void-fg-3">{title}</span>
					</div>
				</div>
				{/* children */}
				{<div
					className={`overflow-hidden transition-all duration-200 ease-in-out ${isOpen ? 'opacity-100' : 'max-h-0 opacity-0'} text-void-fg-4`}
				>
					{children}
				</div>}
			</div>
		</div>
	);
};




// ---------------------------------------------------------------------------
// Sticky prompt-card stack context
//
// The sidebar chat renders each user message as a `position: sticky top:0`
// card. Without coordination, newer messages just paint on top of older ones
// during scroll, which feels abrupt. This context lets every sticky user
// card report when it becomes pinned to the top of the scroll container,
// and then read back its "depth" in the overall stack: depth 0 = the
// currently active card (the newest pinned one), depth 1+ = older cards
// receding behind it. UserMessageComponent uses the depth to animate
// scale / opacity / z-index, producing a layered history-stack effect
// instead of a hard cross-fade.
// ---------------------------------------------------------------------------
type StickyStackCtx = {
	scrollRoot: HTMLElement | null;
	reportPinned: (messageIdx: number, pinned: boolean) => void;
	getDepth: (messageIdx: number) => number; // -1 = not pinned
};
const StickyStackContext = React.createContext<StickyStackCtx | null>(null);

const StickyStackProvider = ({
	scrollRootRef,
	children,
}: {
	scrollRootRef: React.MutableRefObject<HTMLElement | null>;
	children: React.ReactNode;
}) => {
	// The ref's `.current` is null on the first render pass (before the scroll
	// container mounts). We mirror it into state so that once the ref is
	// populated, the context value updates and child IntersectionObservers are
	// re-created with the correct root.
	const [scrollRoot, setScrollRoot] = useState<HTMLElement | null>(scrollRootRef.current);
	useEffect(() => {
		if (scrollRootRef.current !== scrollRoot) {
			setScrollRoot(scrollRootRef.current);
		}
	});

	// Sorted ascending by messageIdx → the last element is the *newest* pinned
	// card (which is also the active one, depth 0). Using an array keeps
	// `indexOf` O(n) but n is small (at most a handful pinned at once).
	const [pinnedIdxs, setPinnedIdxs] = useState<number[]>([]);

	const reportPinned = useCallback((messageIdx: number, pinned: boolean) => {
		setPinnedIdxs((prev) => {
			const has = prev.indexOf(messageIdx) >= 0;
			if (pinned && !has) {
				const next = [...prev, messageIdx];
				next.sort((a, b) => a - b);
				return next;
			}
			if (!pinned && has) {
				return prev.filter((i) => i !== messageIdx);
			}
			return prev;
		});
	}, []);

	const getDepth = useCallback((messageIdx: number) => {
		const pos = pinnedIdxs.indexOf(messageIdx);
		if (pos < 0) return -1;
		// Newest pinned (largest idx, end of array) is depth 0.
		return pinnedIdxs.length - 1 - pos;
	}, [pinnedIdxs]);

	const value = useMemo<StickyStackCtx>(() => ({
		scrollRoot,
		reportPinned,
		getDepth,
	}), [scrollRoot, reportPinned, getDepth]);

	return <StickyStackContext.Provider value={value}>{children}</StickyStackContext.Provider>;
};




const UserMessageComponent = ({ chatMessage, messageIdx, isCheckpointGhost, currCheckpointIdx, _scrollToBottom }: { chatMessage: ChatMessage & { role: 'user' }, messageIdx: number, currCheckpointIdx: number | undefined, isCheckpointGhost: boolean, _scrollToBottom: (() => void) | null }) => {

	const accessor = useAccessor()
	const chatThreadsService = accessor.get('IChatThreadService')

	// global state
	let isBeingEdited = false
	let stagingSelections: StagingSelectionItem[] = []
	let setIsBeingEdited = (_: boolean) => { }
	let setStagingSelections = (_: StagingSelectionItem[]) => { }

	if (messageIdx !== undefined) {
		const _state = chatThreadsService.getCurrentMessageState(messageIdx)
		isBeingEdited = _state.isBeingEdited
		stagingSelections = _state.stagingSelections
		setIsBeingEdited = (v) => chatThreadsService.setCurrentMessageState(messageIdx, { isBeingEdited: v })
		setStagingSelections = (s) => chatThreadsService.setCurrentMessageState(messageIdx, { stagingSelections: s })
	}


	// local state
	const mode: ChatBubbleMode = isBeingEdited ? 'edit' : 'display'
	const [isFocused, setIsFocused] = useState(false)
	const [isHovered, setIsHovered] = useState(false)
	const [isDisabled, setIsDisabled] = useState(false)
	const [showRevertConfirm, setShowRevertConfirm] = useState(false)
	const [isReverting, setIsReverting] = useState(false)
	const [textAreaRefState, setTextAreaRef] = useState<HTMLTextAreaElement | null>(null)
	const textAreaFnsRef = useRef<TextAreaFns | null>(null)

	// Sticky-stack wiring: observe our own sticky element and report pinned
	// state so this card can receive its depth in the stack and animate.
	const stackCtx = useContext(StickyStackContext)
	const stickyRef = useRef<HTMLDivElement | null>(null)
	useEffect(() => {
		const reportPinned = stackCtx?.reportPinned
		const scrollRoot = stackCtx?.scrollRoot ?? null
		if (!reportPinned) return
		const el = stickyRef.current
		if (!el) return
		// Trick: observe the sticky element with a -1px top rootMargin. While
		// the element sits in its natural flow, intersectionRatio === 1. Once
		// `position: sticky` pins it to the container's top edge, the synthetic
		// 1px cut-off makes the ratio drop below 1, which is our pinned signal.
		const observer = new IntersectionObserver(
			([entry]) => {
				const pinned = entry.intersectionRatio < 1
				reportPinned(messageIdx, pinned)
			},
			{
				root: scrollRoot,
				rootMargin: '-1px 0px 0px 0px',
				threshold: [1],
			}
		)
		observer.observe(el)
		return () => {
			observer.disconnect()
			reportPinned(messageIdx, false)
		}
	}, [stackCtx?.scrollRoot, stackCtx?.reportPinned, messageIdx, mode])

	const depth = stackCtx?.getDepth(messageIdx) ?? -1
	const isActiveTop = depth === 0
	// Stack animation parameters. Keep step sizes small so the effect feels
	// layered rather than cartoonish. depth < 0 means "not pinned yet" — the
	// card is in its natural flow and should render unaffected.
	const stackTransform = depth > 0
		? `scale(${Math.max(0.82, 1 - 0.04 * depth)}) translateY(${-3 * depth}px)`
		: undefined
	const stackOpacity = depth > 0 ? Math.max(0.15, 1 - 0.28 * depth) : 1
	const stackFilter = depth > 1 ? `blur(${Math.min(0.6 * (depth - 1), 1.2)}px)` : undefined
	const stackZ = depth >= 0 ? 30 - depth : 10
	// initialize on first render, and when edit was just enabled
	const _mustInitialize = useRef(true)
	const _justEnabledEdit = useRef(false)
	useEffect(() => {
		const canInitialize = mode === 'edit' && textAreaRefState
		const shouldInitialize = _justEnabledEdit.current || _mustInitialize.current
		if (canInitialize && shouldInitialize) {
			setStagingSelections(
				(chatMessage.selections || []).map(s => { // quick hack so we dont have to do anything more
					if (s.type === 'File') return { ...s, state: { ...s.state, wasAddedAsCurrentFile: false, } }
					else return s
				})
			)

			if (textAreaFnsRef.current)
				textAreaFnsRef.current.setValue(chatMessage.displayContent || '')

			textAreaRefState.focus();

			_justEnabledEdit.current = false
			_mustInitialize.current = false
		}

	}, [chatMessage, mode, _justEnabledEdit, textAreaRefState, textAreaFnsRef.current, _justEnabledEdit.current, _mustInitialize.current])

	const onOpenEdit = () => {
		// Only one message can be in edit mode at a time. Close any other user
		// messages that currently have their input/edit panel open before opening
		// this one so the sidebar never stacks multiple prompt input areas.
		const thread = chatThreadsService.getCurrentThread()
		if (thread?.messages) {
			for (let i = 0; i < thread.messages.length; i++) {
				if (i === messageIdx) continue
				const m = thread.messages[i]
				if (m.role === 'user' && m.state?.isBeingEdited) {
					chatThreadsService.setCurrentMessageState(i, { isBeingEdited: false })
				}
			}
		}
		setIsBeingEdited(true)
		chatThreadsService.setCurrentlyFocusedMessageIdx(messageIdx)
		_justEnabledEdit.current = true
	}
	const onCloseEdit = () => {
		setIsFocused(false)
		setIsHovered(false)
		setIsBeingEdited(false)
		chatThreadsService.setCurrentlyFocusedMessageIdx(undefined)

	}

	const EditSymbol = mode === 'display' ? Pencil : X

	// 「このメッセージは現在のチェックポイントの直後か？」
	// = リバート済み（or もともとチェックポイントの境界）であれば、
	// 編集→そのまま送信が自然な動線になる。
	const isMsgAfterCheckpoint = currCheckpointIdx !== undefined && currCheckpointIdx === messageIdx - 1

	let chatbubbleContents: React.ReactNode
	if (mode === 'display') {
		// When the user message is pinned as a sticky header, long prompts eat
		// up vertical space while scrolling. Clamp to 2 lines with an ellipsis
		// and collapse internal whitespace so the header stays compact. The
		// full text is still reachable by clicking into edit mode (or via the
		// native `title` tooltip on hover).
		chatbubbleContents = <>
			<SelectedFiles type='past' messageIdx={messageIdx} selections={chatMessage.selections || []} />
			<span
				className='px-0.5'
				style={{
					display: '-webkit-box',
					WebkitLineClamp: 2,
					WebkitBoxOrient: 'vertical',
					overflow: 'hidden',
					textOverflow: 'ellipsis',
					whiteSpace: 'normal',
					wordBreak: 'break-word',
					maxHeight: '2.8em',
					lineHeight: '1.35em',
				}}
				title={chatMessage.displayContent}
			>
				{chatMessage.displayContent}
			</span>
		</>
	}
	else if (mode === 'edit') {

		const onSubmit = async () => {

			if (isDisabled) return;
			if (!textAreaRefState) return;
			if (messageIdx === undefined) return;

			// cancel any streams on this thread
			const threadId = chatThreadsService.state.currentThreadId

			await chatThreadsService.abortRunning(threadId)

			// update state
			setIsBeingEdited(false)
			chatThreadsService.setCurrentlyFocusedMessageIdx(undefined)

			// stream the edit
			const userMessage = textAreaRefState.value;
			try {
				await chatThreadsService.editUserMessageAndStreamResponse({ userMessage, messageIdx, threadId })
			} catch (e) {
				console.error('Error while editing message:', e)
			}
			await chatThreadsService.focusCurrentChat()
			requestAnimationFrame(() => _scrollToBottom?.())
		}

		const onAbort = async () => {
			const threadId = chatThreadsService.state.currentThreadId
			await chatThreadsService.abortRunning(threadId)
		}

		const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
			if (e.key === 'Escape') {
				onCloseEdit()
			}
			if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
				onSubmit()
			}
		}

		if (!chatMessage.content) { // don't show if empty and not loading (if loading, want to show).
			return null
		}

		// リバートが必要なケースだけ onClickRevert を渡す。
		// - リバート済み or 本来チェックポイント直後の状態 (`isMsgAfterCheckpoint`)
		//   なら、そのまま編集して送信できるよう Submit ボタンを残す（=undefined）
		// - そうでない過去メッセージ（`messageIdx > 0`）はリバート前提なのでリバート
		//   ボタンを表示する。
		const canSubmitDirectly = messageIdx === 0 || isMsgAfterCheckpoint
		chatbubbleContents = <VoidChatArea
			featureName='Chat'
			onSubmit={onSubmit}
			onAbort={onAbort}
			isStreaming={false}
			isDisabled={isDisabled}
			showSelections={true}
			showProspectiveSelections={false}
			selections={stagingSelections}
			setSelections={setStagingSelections}
			onClickRevert={canSubmitDirectly ? undefined : () => setShowRevertConfirm(true)}
		>
			<VoidInputBox2
				enableAtToMention
				ref={setTextAreaRef}
				className='min-h-[81px] max-h-[500px] px-0.5'
				placeholder="Edit your message..."
				onChangeText={(text) => setIsDisabled(!text)}
				onFocus={() => {
					setIsFocused(true)
					chatThreadsService.setCurrentlyFocusedMessageIdx(messageIdx);
				}}
				onBlur={() => {
					setIsFocused(false)
				}}
				onKeyDown={onKeyDown}
				fnsRef={textAreaFnsRef}
				multiline={true}
			/>
		</VoidChatArea>
	}

	return <div
		ref={stickyRef}
		className={`
        void-bubble-in group relative w-full max-w-full rounded-lg overflow-hidden mb-1.5
        ${mode === 'edit' ? 'pl-0 pr-0 py-0' : 'pl-2.5 pr-7 py-1'}

        ${isCheckpointGhost && !isMsgAfterCheckpoint ? 'opacity-50 pointer-events-none' : ''}
    `}
		// 過去はユーザーメッセージを `position: sticky` でビューポート上端に
		// 重ね積みする Cursor 風 UI だったが、複数の入力欄が重なって見えるので
		// やめた。 通常フローに戻し、1 枚ずつ縦に並ぶシンプル表示にする。
		// stickyRef は sticky-stack コンテキストに残しているが、もはや何も pin
		// されないため depth は常に -1 で、stackTransform 等は無効化される。
		style={{
			maxHeight: mode === 'display' ? '3.6em' : undefined,
			background: mode === 'display'
				? 'color-mix(in srgb, var(--void-bg-1) 88%, transparent)'
				: 'color-mix(in srgb, var(--void-bg-1) 94%, transparent)',
			backdropFilter: 'blur(10px) saturate(130%)',
			WebkitBackdropFilter: 'blur(10px) saturate(130%)',
			border: '1px solid color-mix(in srgb, var(--void-border-3) 80%, transparent)',
			boxShadow: '0 1px 2px 0 rgba(0,0,0,0.18), 0 0 0 1px color-mix(in srgb, var(--void-fg-1) 2%, transparent) inset',
			transition: 'background-color 200ms ease, box-shadow 200ms ease',
		}}
		onMouseEnter={() => setIsHovered(true)}
		onMouseLeave={() => setIsHovered(false)}
	>
		{/* Cursor-style subtle left accent strip on the sticky header */}
		{mode === 'display' && (
			<span
				aria-hidden
				className="pointer-events-none absolute left-0 top-1 bottom-1 w-[2px] rounded-full"
				style={{ background: 'color-mix(in srgb, var(--void-fg-3) 55%, transparent)' }}
			/>
		)}
		<div
			className={`
            text-left max-w-full
            ${mode === 'edit' ? ''
					: mode === 'display' ? 'flex flex-col text-void-fg-1 overflow-hidden cursor-pointer text-[12.5px] leading-[1.35]' : ''
				}
        `}
			onClick={() => { if (mode === 'display') { onOpenEdit() } }}
		>
			{chatbubbleContents}
		</div>

		{/* Cursor 風のホバーアクション（右上、編集ボタンのみ）。
		    リバートは編集モード時に右下のスタート/停止ボタンと同じ場所へ移し、
		    display モード時は重複表示を避けるためここでは編集だけを出す。 */}
		<div
			className={`
				absolute top-1.5 right-1.5 z-1 flex items-center gap-1
				transition-all duration-150 ease-out
				${(isHovered || (isFocused && mode === 'edit')) ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-0.5 pointer-events-none'}
			`}
		>
			<button
				type="button"
				onClick={() => {
					if (mode === 'display') {
						onOpenEdit()
					} else if (mode === 'edit') {
						onCloseEdit()
					}
				}}
				className={`
					inline-flex items-center gap-1
					px-1.5 py-[3px] rounded-md
					text-[10px] font-medium leading-none
					text-void-fg-2 hover:text-void-fg-1
					bg-[color-mix(in_srgb,var(--void-bg-1)_85%,transparent)]
					hover:bg-[color-mix(in_srgb,var(--void-fg-1)_8%,transparent)]
					border border-void-border-2 hover:border-void-border-1
					backdrop-blur-sm
					shadow-sm
					transition-colors duration-150 ease-out
					cursor-pointer
				`}
				data-tooltip-id="void-tooltip"
				data-tooltip-content={mode === 'display' ? 'このメッセージを編集' : '編集を閉じる'}
				data-tooltip-place="top"
			>
				<EditSymbol size={11} className="opacity-80" />
				<span>{mode === 'display' ? '編集' : '閉じる'}</span>
			</button>
		</div>

		{showRevertConfirm && (
			<RevertConfirmDialog
				isReverting={isReverting}
				onCancel={() => setShowRevertConfirm(false)}
				onConfirm={async () => {
					if (isReverting) return
					setIsReverting(true)
					try {
						const threadId = chatThreadsService.state.currentThreadId
						const isThreadRunning = !!chatThreadsService.streamState[threadId]?.isRunning
						if (isThreadRunning) {
							// _setAborter で登録された callback が /api/tasks/stop を叩いた後、
							// ローカル fetch も中断する。
							try { await chatThreadsService.abortRunning(threadId) } catch { /* best-effort */ }
						}
						// jumpToUserModified: true により、AI による変更だけでなく
						// その後ユーザーが手動で編集した内容も含めて、すべて
						// このメッセージを送信する直前のスナップショットに戻す。
						chatThreadsService.jumpToCheckpointBeforeMessageIdx({
							threadId,
							messageIdx,
							jumpToUserModified: true,
						})
					} finally {
						setIsReverting(false)
						setShowRevertConfirm(false)
					}
				}}
			/>
		)}
	</div>

}

const RevertConfirmDialog = ({
	isReverting,
	onCancel,
	onConfirm,
}: {
	isReverting: boolean,
	onCancel: () => void,
	onConfirm: () => void,
}) => {
	const isDark = useIsDark()
	const mouseDownInsideModal = useRef(false)

	// Portal で body 直下にマウントしているため、scope-tailwind の生成 CSS が
	// 効かないことがある。背景色や枠線は CSS 変数 (var(--void-bg-1) など) を
	// インラインで直接指定して、確実にスタイルが反映されるようにする。
	void isDark; // 参照しておく（使用箇所はインライン style 側）
	return (
		<FloatingPortal>
			<div
				style={{
					position: 'fixed',
					inset: 0,
					zIndex: 9999999,
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					padding: '16px',
					backgroundColor: 'rgba(0, 0, 0, 0.6)',
					backdropFilter: 'blur(4px)',
					WebkitBackdropFilter: 'blur(4px)',
				}}
				onClick={(e) => e.stopPropagation()}
				onMouseDown={() => { mouseDownInsideModal.current = false }}
				onMouseUp={() => {
					if (!mouseDownInsideModal.current && !isReverting) {
						onCancel()
					}
					mouseDownInsideModal.current = false
				}}
			>
				<div
					style={{
						width: '100%',
						maxWidth: '380px',
						display: 'flex',
						flexDirection: 'column',
						gap: '12px',
						padding: '20px',
						borderRadius: '12px',
						backgroundColor: 'var(--void-bg-1, #1e1e1e)',
						color: 'var(--void-fg-1, #e6e6e6)',
						border: '1px solid var(--void-border-2, #3a3a3a)',
						boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)',
					}}
					onClick={(e) => e.stopPropagation()}
					onMouseDown={(e) => {
						mouseDownInsideModal.current = true
						e.stopPropagation()
					}}
				>
					<div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
						<div
							style={{
								flexShrink: 0,
								width: '36px',
								height: '36px',
								borderRadius: '50%',
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
								backgroundColor: 'rgba(245, 158, 11, 0.15)',
							}}
						>
							<RotateCcw size={18} style={{ color: '#f59e0b' }} />
						</div>
						<div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
							<h3 style={{
								fontSize: '14px',
								fontWeight: 600,
								margin: 0,
								color: 'var(--void-fg-1, #e6e6e6)',
								lineHeight: 1.2,
							}}>
								本当にリバートしますか？
							</h3>
							<p style={{
								fontSize: '12px',
								margin: 0,
								color: 'var(--void-fg-3, #a0a0a0)',
								lineHeight: 1.45,
							}}>
								このメッセージ以降のチャット履歴を取り消し、
								<br />
								<span style={{ fontWeight: 500, color: 'var(--void-fg-2, #cfcfcf)' }}>
									編集されたコードファイルもこのメッセージ送信前の状態に戻します。
								</span>
								<br />
								<span style={{ color: 'var(--void-fg-4, #7a7a7a)' }}>
									この操作は元に戻せません。
								</span>
							</p>
						</div>
					</div>

					<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
						<button
							type="button"
							onClick={onCancel}
							disabled={isReverting}
							style={{
								padding: '6px 12px',
								borderRadius: '6px',
								fontSize: '12px',
								fontWeight: 500,
								color: 'var(--void-fg-2, #cfcfcf)',
								backgroundColor: 'var(--void-bg-2, #252525)',
								border: '1px solid var(--void-border-2, #3a3a3a)',
								cursor: isReverting ? 'not-allowed' : 'pointer',
								opacity: isReverting ? 0.5 : 1,
								transition: 'all 150ms',
							}}
						>
							キャンセル
						</button>
						<button
							type="button"
							onClick={onConfirm}
							disabled={isReverting}
							style={{
								display: 'inline-flex',
								alignItems: 'center',
								gap: '6px',
								padding: '6px 12px',
								borderRadius: '6px',
								fontSize: '12px',
								fontWeight: 600,
								color: '#ffffff',
								backgroundColor: '#dc2626',
								border: '1px solid rgba(220, 38, 38, 0.4)',
								boxShadow: '0 1px 2px rgba(0, 0, 0, 0.1)',
								cursor: isReverting ? 'not-allowed' : 'pointer',
								opacity: isReverting ? 0.6 : 1,
								transition: 'all 150ms',
							}}
						>
							{isReverting ? (
								<>
									<Loader2 size={12} className="animate-spin" />
									リバート中…
								</>
							) : (
								<>
									<RotateCcw size={12} />
									リバートする
								</>
							)}
						</button>
					</div>
				</div>
			</div>
		</FloatingPortal>
	)
}

const SmallProseWrapper = ({ children }: { children: React.ReactNode }) => {
	return <div className='
text-void-fg-4
prose
prose-sm
break-words
max-w-none
leading-snug
text-[13px]

[&>:first-child]:!mt-0
[&>:last-child]:!mb-0

prose-h1:text-[14px]
prose-h1:my-4

prose-h2:text-[13px]
prose-h2:my-4

prose-h3:text-[13px]
prose-h3:my-3

prose-h4:text-[13px]
prose-h4:my-2

prose-p:my-2
prose-p:leading-snug
prose-hr:my-2

prose-ul:my-2
prose-ul:pl-4
prose-ul:list-outside
prose-ul:list-disc
prose-ul:leading-snug


prose-ol:my-2
prose-ol:pl-4
prose-ol:list-outside
prose-ol:list-decimal
prose-ol:leading-snug

marker:text-inherit

prose-blockquote:pl-2
prose-blockquote:my-2

prose-code:text-void-fg-3
prose-code:text-[12px]
prose-code:before:content-none
prose-code:after:content-none

prose-pre:text-[12px]
prose-pre:p-2
prose-pre:my-2

prose-table:text-[13px]
'>
		{children}
	</div>
}

const ProseWrapper = ({ children }: { children: React.ReactNode }) => {
	return <div className='
text-void-fg-2
prose
prose-sm
break-words
prose-p:block
prose-p:my-1.5
prose-hr:my-3
prose-pre:my-1.5
marker:text-inherit
prose-ol:list-outside
prose-ol:list-decimal
prose-ol:my-1.5
prose-ul:list-outside
prose-ul:list-disc
prose-ul:my-1.5
prose-li:my-0
prose-code:before:content-none
prose-code:after:content-none
prose-headings:prose-sm
prose-headings:font-bold
prose-h1:my-2.5
prose-h2:my-2.5
prose-h3:my-2
prose-h4:my-1.5

prose-p:leading-snug
prose-ol:leading-snug
prose-ul:leading-snug

[&>:first-child]:!mt-0
[&>:last-child]:!mb-0

max-w-none
'
	>
		{children}
	</div>
}

// ─── Flow Indicator ──────────────────────────────────────
type FlowPhase = {
	id: string;
	label: string;
	status: 'idle' | 'active' | 'done';
	modelName?: string; // model assigned to this phase's role
}

const detectFlowPhases = (messages: ChatMessage[], isRunning: IsRunningType, reasoningSoFar?: string, roleAssignments?: RoleAssignment[]): FlowPhase[] => {
	// Map phases to roles
	const phaseRoleMap: { id: string; label: string; role: AgentRole }[] = [
		{ id: 'thinking', label: '思考中', role: 'leader' },
		{ id: 'searching', label: '検索中', role: 'search' },
		{ id: 'reading', label: '読み込み', role: 'research' },
		{ id: 'coding', label: '実装中', role: 'coder' },
		{ id: 'running', label: '実行中', role: 'leader' },
	];

	const phases: FlowPhase[] = phaseRoleMap.map(p => {
		const assignment = roleAssignments?.find(r => r.role === p.role);
		return {
			id: p.id,
			label: p.label,
			status: 'idle' as const,
			modelName: assignment?.model,
		};
	});

	const searchTools = ['search_for_files', 'search_pathnames_only'];
	const readTools = ['read_file', 'ls_dir', 'get_dir_tree'];
	const codeTools = ['edit_file', 'rewrite_file', 'create_file_or_folder', 'delete_file_or_folder'];
	const runTools = ['run_command', 'run_persistent_command', 'open_persistent_terminal'];

	let hasReasoning = false;
	let hasSearch = false;
	let hasRead = false;
	let hasCode = false;
	let hasRun = false;

	for (const msg of messages) {
		if (msg.role === 'assistant' && msg.reasoning) hasReasoning = true;
		if (msg.role === 'tool') {
			const name = msg.name;
			if (searchTools.includes(name)) hasSearch = true;
			if (readTools.includes(name)) hasRead = true;
			if (codeTools.includes(name)) hasCode = true;
			if (runTools.includes(name)) hasRun = true;
		}
	}

	if (reasoningSoFar) hasReasoning = true;

	if (hasReasoning) phases[0].status = 'done';
	if (hasSearch) phases[1].status = 'done';
	if (hasRead) phases[2].status = 'done';
	if (hasCode) phases[3].status = 'done';
	if (hasRun) phases[4].status = 'done';

	if (isRunning) {
		if (reasoningSoFar && !hasSearch && !hasRead && !hasCode && !hasRun) {
			phases[0].status = 'active';
		}
		const lastToolMsg = [...messages].reverse().find(m => m.role === 'tool');
		if (lastToolMsg && lastToolMsg.role === 'tool') {
			const name = lastToolMsg.name;
			if (searchTools.includes(name) && lastToolMsg.type === 'tool_request') phases[1].status = 'active';
			if (readTools.includes(name) && lastToolMsg.type === 'tool_request') phases[2].status = 'active';
			if (codeTools.includes(name) && lastToolMsg.type === 'tool_request') phases[3].status = 'active';
			if (runTools.includes(name) && lastToolMsg.type === 'tool_request') phases[4].status = 'active';
		}
		if (isRunning === 'LLM' && !hasSearch && !hasRead && !hasCode && !hasRun) {
			phases[0].status = 'active';
		}
	}

	const activatedPhases = phases.filter(p => p.status !== 'idle');
	if (activatedPhases.length === 0 && isRunning) {
		phases[0].status = 'active';
		return [phases[0]];
	}

	return activatedPhases;
};

const FlowIndicator = ({ messages, isRunning, reasoningSoFar }: {
	messages: ChatMessage[],
	isRunning: IsRunningType,
	reasoningSoFar?: string,
	displayContentSoFar?: string, // 後方互換: 旧シグネチャを温存
}) => {
	const settingsState = useSettingsState()
	const modelSelection = settingsState.modelSelectionOfFeature['Chat']
	const roleAssignments = settingsState.globalSettings.roleAssignments
	const isDivision = modelSelection?.providerName === 'divisionAPI'

	// Division 利用時もロール割当があれば phase 検出には使う (ただしパイプライン UI は描画しない)
	const phases = useMemo(() =>
		detectFlowPhases(messages, isRunning, reasoningSoFar, isDivision ? roleAssignments : undefined),
		[messages, isRunning, reasoningSoFar, isDivision, roleAssignments]
	);

	if (!isRunning || phases.length === 0) return null;

	const activePhase = phases.find(p => p.status === 'active');
	if (!activePhase) return null;

	return (
		<div className="flex items-center gap-1.5 text-[11px] text-void-fg-3 py-1">
			<span
				className="void-pulse-dot inline-block w-1.5 h-1.5 rounded-full bg-[var(--vscode-focusBorder)]"
				style={{ boxShadow: '0 0 6px var(--vscode-focusBorder)' }}
			/>
			<span>{activePhase.label}</span>
			<IconLoading className="text-void-fg-4" />
		</div>
	);
};
// 各フローを Cursor 風に 1 件ずつ折りたためるカード。
// `DivisionOrchestrationComponent` と `FlowReviewComponent` で共有。
const flowRoleLabel: Record<string, string> = {
	leader: 'リーダー',
	coder: 'コーダー',
	planner: 'プランナー',
	search: '検索',
	research: 'リサーチ',
	design: 'デザイン',
	writing: 'ライティング',
	ideaman: 'アイデア',
	filesearch: 'ファイル検索',
	image: 'イメージ',
	review: 'レビュー',
}

type CollapsibleFlowCardProps = {
	title: React.ReactNode
	roleLabel?: React.ReactNode
	isStreaming?: boolean
	defaultOpen?: boolean
	rightAction?: React.ReactNode
	children: React.ReactNode
}

const CollapsibleFlowCard = ({
	title,
	roleLabel,
	isStreaming,
	defaultOpen = false,
	rightAction,
	children,
}: CollapsibleFlowCardProps) => {
	const [isOpen, setIsOpen] = useState(defaultOpen)

	// ストリーミングが終わった瞬間は開いていれば閉じてあげる(完了済み履歴を畳む)。
	const prevStreamingRef = useRef(isStreaming)
	useEffect(() => {
		if (prevStreamingRef.current && !isStreaming) setIsOpen(false)
		prevStreamingRef.current = isStreaming
	}, [isStreaming])

	return (
		<div className='rounded-md border border-void-border-2 bg-void-bg-2/60 overflow-hidden'>
			<div
				className='flex items-center gap-1.5 px-2 py-1 cursor-pointer select-none hover:bg-void-bg-3/60 transition-colors min-h-[24px]'
				onClick={() => setIsOpen(o => !o)}
				role='button'
				tabIndex={0}
				aria-expanded={isOpen}
				onKeyDown={(e) => {
					if (e.key === 'Enter' || e.key === ' ') {
						e.preventDefault()
						setIsOpen(o => !o)
					}
				}}
			>
				<ChevronRight
					className={`h-3 w-3 text-void-fg-4 transition-transform duration-150 flex-shrink-0 ${isOpen ? 'rotate-90' : ''}`}
				/>
				<span className='text-[12px] text-void-fg-2 font-medium truncate flex-1 min-w-0'>
					{title}
				</span>
				{roleLabel && (
					<span className='text-[10px] text-void-fg-4 px-1.5 py-0.5 rounded bg-void-bg-3 leading-none flex-shrink-0'>
						{roleLabel}
					</span>
				)}
				{isStreaming && (
					<Loader2 className='h-3 w-3 text-void-fg-3 animate-spin flex-shrink-0' />
				)}
				{rightAction && (
					<div className='flex-shrink-0' onClick={(e) => e.stopPropagation()}>
						{rightAction}
					</div>
				)}
			</div>
			<div
				className={`overflow-hidden transition-all duration-150 ${isOpen ? 'opacity-100' : 'max-h-0 opacity-0'}`}
			>
				<div className='px-2 py-1 border-t border-void-border-2/60'>
					{children}
				</div>
			</div>
		</div>
	)
}

// ---------------------------------------------------------------------------
// Cursor 風: 通常の AI 返答 (markdown) を見出し単位で折りたたみ可能に分割する。
// ## / ### を境にセクション化し、それぞれを CollapsibleFlowCard で包む。
// 見出しが無い場合は単一カードにフォールバック (auto-fold は呼び出し側で制御)。
// コードフェンス内の `#` は無視する。
// ---------------------------------------------------------------------------
type AssistantSection = { title: string; level: number; body: string }

const splitMarkdownByHeadings = (md: string): AssistantSection[] => {
	const sections: AssistantSection[] = []
	const lines = md.split('\n')
	let current: { title: string; level: number; body: string[] } | null = null
	let inCodeFence = false

	const flush = () => {
		if (!current) return
		const body = current.body.join('\n').replace(/^\s+|\s+$/g, '')
		// 見出し直前の preamble (level=0) は中身が空なら捨てる
		if (current.level === 0 && !body) { current = null; return }
		sections.push({ title: current.title, level: current.level, body })
		current = null
	}

	for (const line of lines) {
		if (/^\s*```/.test(line)) inCodeFence = !inCodeFence
		const headingMatch = !inCodeFence ? line.match(/^(#{2,3})\s+(.+?)\s*#*\s*$/) : null
		if (headingMatch) {
			flush()
			current = { title: headingMatch[2], level: headingMatch[1].length, body: [] }
			continue
		}
		if (!current) current = { title: '', level: 0, body: [] }
		current.body.push(line)
	}
	flush()
	return sections
}

// オーケストレーションのストリーム出力をタスク (= ロール) 単位で分割する。
// sendLLMMessage.impl.ts は各タスク開始時に
//   `\n---\n\n### N. <role> — <title>\n\n`
// という見出しを差し込んでいる。 これを境界としてカード化することで、
// 見出しの ## / ### でバラバラに分割されるのを避け、
// 「ロールごとに 1 枚のカード」 にする。
type AssistantTaskSection = {
	taskNumber: number
	role: string
	title: string
	body: string
}
const splitMarkdownByTasks = (md: string): { preamble: string; tasks: AssistantTaskSection[] } | null => {
	const lines = md.split('\n')
	const tasks: AssistantTaskSection[] = []
	const preambleLines: string[] = []
	let current: { taskNumber: number; role: string; title: string; bodyLines: string[] } | null = null
	let inCodeFence = false
	// `### N. role — title` (— は EM DASH U+2014)。タイトルは空のことがある。
	const taskHeaderRe = /^###\s+(\d+)\.\s+([^—\n]+?)(?:\s+—\s*(.*))?\s*$/

	const flush = () => {
		if (!current) return
		const body = current.bodyLines.join('\n')
			.replace(/^\s*-{3,}\s*$/gm, '')   // 区切り行を取り除く
			.replace(/^\s+|\s+$/g, '')
		tasks.push({
			taskNumber: current.taskNumber,
			role: current.role,
			title: current.title,
			body,
		})
		current = null
	}

	for (const line of lines) {
		if (/^\s*```/.test(line)) inCodeFence = !inCodeFence
		const headingMatch = !inCodeFence ? line.match(taskHeaderRe) : null
		if (headingMatch) {
			flush()
			current = {
				taskNumber: parseInt(headingMatch[1], 10),
				role: (headingMatch[2] || '').trim(),
				title: (headingMatch[3] || '').trim(),
				bodyLines: [],
			}
			continue
		}
		if (current) current.bodyLines.push(line)
		else preambleLines.push(line)
	}
	flush()

	if (tasks.length === 0) return null
	const preamble = preambleLines.join('\n').replace(/^\s*-{3,}\s*$/gm, '').replace(/^\s+|\s+$/g, '')
	return { preamble, tasks }
}

// markdown の最初の意味のある行を 1 行プレビューに整形 (見出し記号や箇条書き記号は除去)。
const previewFromMarkdown = (md: string, max = 60): string => {
	const firstLine = md
		.split('\n')
		.map(l => l.replace(/^\s*#{1,6}\s*/, '').replace(/^\s*[-*+]\s+/, '').replace(/^\s*\d+\.\s+/, '').trim())
		.find(l => !!l && !/^```/.test(l)) ?? ''
	const cleaned = firstLine.replace(/[`*_~]/g, '').trim()
	return cleaned.length > max ? cleaned.slice(0, max) + '…' : cleaned
}

// 通常の返答カード。 開閉は呼び出し側のヒント (defaultOpen / autoFold / isStreaming) と
// ユーザー操作の両方で決まる。
//   - 初期表示: defaultOpen をそのまま使う
//   - autoFold が true に変化: 自動で閉じる (例: 履歴扱いになった)
//   - isStreaming が true→false に変化: 自動で閉じる (= ストリーミング完了)
//   - ユーザーがクリックでトグル: 以後の自動 close は無効化 (意思を尊重)
const StaticCollapsibleCard = ({
	title,
	isStreaming,
	defaultOpen,
	autoFold,
	children,
}: {
	title: React.ReactNode,
	isStreaming?: boolean,
	defaultOpen: boolean,
	autoFold: boolean, // true になったら現在開いていても閉じる (例: 後続メッセージが来た)
	children: React.ReactNode,
}) => {
	const [isOpen, setIsOpen] = useState(defaultOpen)
	const userToggledRef = useRef(false)
	const prevStreamingRef = useRef(!!isStreaming)

	// autoFold が true に切り替わった瞬間 (= 履歴扱いになった) は閉じる。
	// ただしユーザが明示的にトグル済みの場合はその意思を尊重する。
	useEffect(() => {
		if (autoFold && !userToggledRef.current) setIsOpen(false)
	}, [autoFold])

	// isStreaming が true→false へ落ちた瞬間 (= ストリーミング完了) も閉じる。
	// ユーザー要望「生成が終わったら閉じてほしい」をここで反映する。
	useEffect(() => {
		const wasStreaming = prevStreamingRef.current
		const nowStreaming = !!isStreaming
		prevStreamingRef.current = nowStreaming
		if (wasStreaming && !nowStreaming && !userToggledRef.current) {
			setIsOpen(false)
		}
	}, [isStreaming])

	const toggle = () => {
		userToggledRef.current = true
		setIsOpen(o => !o)
	}

	return (
		<div
			className='void-bubble-in rounded-md border overflow-hidden transition-[border-color,box-shadow] duration-200'
			style={{
				borderColor: isStreaming
					? 'color-mix(in srgb, var(--vscode-focusBorder) 45%, var(--void-border-2))'
					: 'var(--void-border-2)',
				borderLeftWidth: '3px',
				borderLeftColor: isStreaming
					? 'var(--vscode-focusBorder)'
					: 'color-mix(in srgb, var(--vscode-focusBorder) 55%, transparent)',
				background: 'color-mix(in srgb, var(--void-bg-2) 60%, transparent)',
				boxShadow: isStreaming ? '0 1px 6px color-mix(in srgb, var(--vscode-focusBorder) 12%, transparent)' : undefined,
			}}
		>
			<div
				className='flex items-center gap-1.5 px-2 py-1 cursor-pointer select-none hover:bg-void-bg-3/60 transition-colors min-h-[24px]'
				onClick={toggle}
				role='button'
				tabIndex={0}
				aria-expanded={isOpen}
				onKeyDown={(e) => {
					if (e.key === 'Enter' || e.key === ' ') {
						e.preventDefault()
						toggle()
					}
				}}
			>
				<ChevronRight
					className={`h-3 w-3 text-void-fg-4 transition-transform duration-150 flex-shrink-0 ${isOpen ? 'rotate-90' : ''}`}
				/>
				<span className='text-[12px] text-void-fg-2 font-medium truncate flex-1 min-w-0'>
					{title}
				</span>
				{isStreaming && (
					<Loader2 className='h-3 w-3 text-[color:var(--vscode-focusBorder)] animate-spin flex-shrink-0' />
				)}
			</div>
			<div
				className={`overflow-hidden transition-all duration-150 ${isOpen ? 'opacity-100' : 'max-h-0 opacity-0'}`}
			>
				<div className='px-2 py-1 border-t border-void-border-2/60'>
					{children}
				</div>
			</div>
		</div>
	)
}

const CollapsibleAssistantResponse = ({
	content,
	chatMessageLocation,
	isStreaming,
	autoFold,
}: {
	content: string,
	chatMessageLocation: ChatMessageLocation,
	isStreaming: boolean,
	autoFold: boolean,
}) => {
	// Hooks はトップレベルで一度ずつ呼び出す (条件分岐の前)。
	const taskSplit = useMemo(() => splitMarkdownByTasks(content), [content])
	const sections = useMemo(() => splitMarkdownByHeadings(content), [content])

	// オーケストレーション出力 (`### N. role — title` で区切られる) を最優先で検出。
	// 見つかれば「ロール (タスク) ごとに 1 枚のカード」 を生成する。
	if (taskSplit && taskSplit.tasks.length > 0) {
		const lastIdx = taskSplit.tasks.length - 1
		return (
			<div className='flex flex-col gap-1.5'>
				{taskSplit.preamble && (
					<div>
						<SmallProseWrapper>
							<ChatMarkdownRender
								string={taskSplit.preamble}
								chatMessageLocation={chatMessageLocation}
								isApplyEnabled={true}
								isLinkDetectionEnabled={true}
							/>
						</SmallProseWrapper>
					</div>
				)}
				{taskSplit.tasks.map((task, i) => {
					const roleKey = task.role.toLowerCase().replace(/[^a-z]/g, '')
					const roleLabel = flowRoleLabel[roleKey] ?? task.role
					const isCurrentlyStreaming = isStreaming && i === lastIdx
					const sectionAutoFold = autoFold || (isStreaming && i !== lastIdx)
					const titleNode = (
						<span className='inline-flex items-center gap-1.5 min-w-0'>
							<span className='text-[10px] text-void-fg-4 flex-shrink-0'>#{task.taskNumber}</span>
							<span className='truncate'>{task.title || roleLabel}</span>
							<span className='text-[10px] text-void-fg-4 px-1.5 py-0.5 rounded bg-void-bg-3 leading-none flex-shrink-0'>
								{roleLabel}
							</span>
						</span>
					)
					return (
						<StaticCollapsibleCard
							key={`task-${task.taskNumber}-${i}`}
							title={titleNode}
							isStreaming={isCurrentlyStreaming}
							defaultOpen={isCurrentlyStreaming}
							autoFold={sectionAutoFold}
						>
							<SmallProseWrapper>
								<ChatMarkdownRender
									string={task.body || '_(出力待機中…)_'}
									chatMessageLocation={chatMessageLocation}
									isApplyEnabled={true}
									isLinkDetectionEnabled={true}
								/>
							</SmallProseWrapper>
						</StaticCollapsibleCard>
					)
				})}
			</div>
		)
	}

	const hasHeadings = sections.some(s => s.level > 0)

	// 見出しが無い場合: 全体を 1 枚のカードで包む。
	// Antigravity 風: ストリーミング中だけ開いて生成過程を見せ、完了したら自動で閉じる。
	// (StaticCollapsibleCard 側に「isStreaming が true→false になったら閉じる」処理あり)
	if (!hasHeadings) {
		return (
			<StaticCollapsibleCard
				title={previewFromMarkdown(content) || '返答'}
				isStreaming={isStreaming}
				defaultOpen={isStreaming && !autoFold}
				autoFold={autoFold}
			>
				<SmallProseWrapper>
					<ChatMarkdownRender
						string={content}
						chatMessageLocation={chatMessageLocation}
						isApplyEnabled={true}
						isLinkDetectionEnabled={true}
					/>
				</SmallProseWrapper>
			</StaticCollapsibleCard>
		)
	}

	const lastIdx = sections.length - 1
	return (
		<div className='flex flex-col gap-1.5'>
			{sections.map((section, i) => {
				// preamble (見出し前) は折り畳まずそのまま prose で出す。
				if (section.level === 0) {
					return (
						<div key={`preamble-${i}`}>
							<SmallProseWrapper>
								<ChatMarkdownRender
									string={section.body}
									chatMessageLocation={chatMessageLocation}
									isApplyEnabled={true}
									isLinkDetectionEnabled={true}
								/>
							</SmallProseWrapper>
						</div>
					)
				}
				// このセクションが「いま書かれている最後のセクション」かどうか。
				// ストリーミング中に新しい見出しが下に増えたら、このセクションは
				// 「最後ではなくなる」ので autoFold が true になり、自動で閉じる。
				const isCurrentlyStreaming = isStreaming && i === lastIdx
				const sectionAutoFold = autoFold || (isStreaming && i !== lastIdx)
				return (
					<StaticCollapsibleCard
						key={`sec-${i}`}
						title={section.title}
						isStreaming={isCurrentlyStreaming}
						defaultOpen={isCurrentlyStreaming}
						autoFold={sectionAutoFold}
					>
						<SmallProseWrapper>
							<ChatMarkdownRender
								string={section.body || '_(空のセクション)_'}
								chatMessageLocation={chatMessageLocation}
								isApplyEnabled={true}
								isLinkDetectionEnabled={true}
							/>
						</SmallProseWrapper>
					</StaticCollapsibleCard>
				)
			})}
		</div>
	)
}

const DivisionOrchestrationComponent = ({ response, chatMessageLocation }: { response: any, chatMessageLocation: ChatMessageLocation }) => {
	const tasks = response.tasks || [];

	return (
		<div className='flex flex-col gap-1.5 my-1'>
			{tasks.map((task: any, i: number) => {
				const role = (task.role || '').toString().toLowerCase()
				const roleLabel = flowRoleLabel[role] ?? task.role
				const hasOutput = !!task.output && !!String(task.output).trim()
				// ストリーミング中(=出力待ち)のタスクのみ開く。
				// 出力が来た瞬間 isStreaming が false に変化し、CollapsibleFlowCard 側で
				// 自動的に閉じる (生成終了 → 折り畳む)。
				return (
					<CollapsibleFlowCard
						key={task.taskId || i}
						title={task.title || `ステップ ${i + 1}`}
						roleLabel={roleLabel}
						isStreaming={!hasOutput}
						defaultOpen={!hasOutput}
					>
						{hasOutput ? (
							<SmallProseWrapper>
								<ChatMarkdownRender
									string={task.output}
									chatMessageLocation={chatMessageLocation}
									isApplyEnabled={true}
									isLinkDetectionEnabled={true}
								/>
							</SmallProseWrapper>
						) : (
							<div className='text-[11px] text-void-fg-4 py-0.5'>出力を待機中...</div>
						)}
					</CollapsibleFlowCard>
				)
			})}
		</div>
	);
};

const looksLikeAssistantQuestion = (content: string): boolean => {
	const normalized = content.trim();
	if (!normalized) return false;
	const lastLine = normalized.split('\n').map(line => line.trim()).filter(Boolean).at(-1) ?? normalized;
	return /[?？]\s*$/.test(lastLine)
		|| /(どちら|どれ|どの|できますか|しますか|でしょうか|ですか|くださいか|選んで|教えて|確認してください)[。.!！\s]*$/.test(lastLine);
}

type AssistantTodoItem = {
	text: string;
	done: boolean;
}

const extractAssistantTodos = (content: string): AssistantTodoItem[] => {
	const lines = content.split('\n');
	const todos: AssistantTodoItem[] = [];
	let inTodoSection = false;

	for (const rawLine of lines) {
		const line = rawLine.trim();
		if (!line) continue;

		const headingText = line.replace(/^#{1,6}\s*/, '').replace(/[:：]\s*$/, '').trim();
		if (/^(to[\s-]?do|todos|todo list|やること|タスク|実行項目|作業項目|次にやること)$/i.test(headingText)) {
			inTodoSection = true;
			continue;
		}

		if (inTodoSection && /^#{1,6}\s+/.test(line) && !/todo|to do|やること|タスク|実行項目|作業項目/i.test(line)) {
			inTodoSection = false;
		}

		const checkboxMatch = line.match(/^[-*]\s+\[([ xX])\]\s+(.+)$/);
		const numberedMatch = line.match(/^\d+[.)]\s+(.+)$/);
		const bulletMatch = line.match(/^[-*]\s+(.+)$/);

		if (checkboxMatch) {
			todos.push({ done: checkboxMatch[1].toLowerCase() === 'x', text: checkboxMatch[2].trim() });
		}
		else if (inTodoSection && numberedMatch) {
			todos.push({ done: false, text: numberedMatch[1].trim() });
		}
		else if (inTodoSection && bulletMatch) {
			todos.push({ done: false, text: bulletMatch[1].trim() });
		}

		if (todos.length >= 12) break;
	}

	return todos.filter(todo => todo.text && !/^判定[:：]/.test(todo.text));
}

const AssistantTodoCard = ({ todos }: { todos: AssistantTodoItem[] }) => {
	if (todos.length === 0) return null;
	const doneCount = todos.filter(todo => todo.done).length;

	return <div className="my-2 rounded-xl border border-void-border-2 bg-void-bg-2/80 px-3 py-2 shadow-sm">
		<div className="mb-2 flex items-center justify-between gap-2">
			<div className="flex items-center gap-2 text-[12px] font-medium text-void-fg-2">
				<span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-void-bg-3 text-void-fg-2">
					<Check size={13} />
				</span>
				<span>To Do</span>
			</div>
			<span className="text-[11px] text-void-fg-4">{doneCount}/{todos.length}</span>
		</div>
		<div className="flex flex-col gap-1.5">
			{todos.map((todo, i) => (
				<div key={`${todo.text}-${i}`} className="flex items-start gap-2 rounded-lg bg-void-bg-1/60 px-2 py-1.5">
					<span className={`mt-0.5 inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border ${
						todo.done ? 'border-void-fg-3 bg-void-bg-3 text-void-fg-2' : 'border-void-border-2 text-transparent'
					}`}>
						<Check size={11} />
					</span>
					<span className={`text-[12px] leading-relaxed ${todo.done ? 'text-void-fg-4 line-through' : 'text-void-fg-2'}`}>
						{todo.text}
					</span>
				</div>
			))}
		</div>
	</div>
}

const AssistantQuestionReply = ({ threadId }: { threadId: string }) => {
	const accessor = useAccessor()
	const chatThreadsService = accessor.get('IChatThreadService')
	const [answer, setAnswer] = useState('')
	const [isSending, setIsSending] = useState(false)

	const quickReplies = ['このまま進めて', 'はい', 'いいえ', '詳しく説明して']

	const submitAnswer = useCallback(async (answerText?: string) => {
		const text = (answerText ?? answer).trim()
		if (!text || isSending) return
		setIsSending(true)
		try {
			await chatThreadsService.addUserMessageAndStreamResponse({ userMessage: text, threadId })
			setAnswer('')
		} catch (e) {
			console.error('Error while answering assistant question:', e)
		} finally {
			setIsSending(false)
		}
	}, [answer, chatThreadsService, isSending, threadId])

	const onKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
			e.preventDefault()
			submitAnswer()
		}
	}, [submitAnswer])

	return <div className="mt-2 mb-1 rounded-xl border border-void-border-2 bg-void-bg-2/80 px-3 py-2 shadow-sm">
		<div className="mb-2 flex items-center gap-2 text-[12px] text-void-fg-3">
			<span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-void-bg-3 text-void-fg-2">?</span>
			<span>質問に回答</span>
		</div>
		<textarea
			value={answer}
			onChange={e => setAnswer(e.target.value)}
			onKeyDown={onKeyDown}
			placeholder="回答を入力..."
			className="min-h-[72px] w-full resize-y rounded-lg border border-void-border-2 bg-void-bg-1 px-3 py-2 text-[13px] text-void-fg-1 outline-none placeholder:text-void-fg-4 focus:border-void-ring-color"
		/>
		<div className="mt-2 flex flex-wrap items-center justify-between gap-2">
			<div className="flex flex-wrap gap-1.5">
				{quickReplies.map(reply => (
					<button
						key={reply}
						onClick={() => submitAnswer(reply)}
						disabled={isSending}
						className="rounded-full border border-void-border-2 px-2.5 py-1 text-[12px] text-void-fg-3 hover:bg-void-bg-3 hover:text-void-fg-1 disabled:opacity-50"
					>
						{reply}
					</button>
				))}
			</div>
			<button
				onClick={() => submitAnswer()}
				disabled={!answer.trim() || isSending}
				className="inline-flex items-center justify-center rounded-lg bg-[var(--vscode-button-background)] p-1.5 text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] disabled:cursor-not-allowed disabled:opacity-50"
				data-tooltip-id='void-tooltip'
				data-tooltip-content='送信'
				data-tooltip-place='top'
			>
				<SendHorizontal size={13} />
			</button>
		</div>
	</div>
}



// =====================================================================
// Reviewer 出力の抽出 + 「次のプロンプトに挿入」ボタン
// =====================================================================
// Division オーケストレーションの最終 Reviewer 出力は assistant メッセージ末尾に
//   <!-- DIVISION_REVIEWER_BEGIN -->
//   ... reviewer markdown ...
//   <!-- DIVISION_REVIEWER_END -->
// として埋め込まれる (HTML コメント delimiter は markdown 上不可視)。
// 既定では次回送信時に chatThreadService 側で自動 prepend されるが、
// 「自分で編集してから送りたい」ケースのために、明示的に入力欄へ挿入する
// ボタンも提供する。
const REVIEWER_BEGIN_MARKER = '<!-- DIVISION_REVIEWER_BEGIN -->'
const REVIEWER_END_MARKER = '<!-- DIVISION_REVIEWER_END -->'

const extractReviewerNoteFromContent = (content: string | undefined | null): string | null => {
	if (!content) return null
	const beginIdx = content.lastIndexOf(REVIEWER_BEGIN_MARKER)
	if (beginIdx < 0) return null
	const endIdx = content.indexOf(REVIEWER_END_MARKER, beginIdx + REVIEWER_BEGIN_MARKER.length)
	if (endIdx < 0) return null
	const inner = content.slice(beginIdx + REVIEWER_BEGIN_MARKER.length, endIdx).trim()
	return inner.length > 0 ? inner : null
}

const buildReviewerInsertText = (reviewerNote: string, existingInput: string): string => {
	const reviewerSection = [
		'## 直前ターンの Reviewer 指摘',
		'',
		'> Division Reviewer の所見を踏まえて以下に追記してください。',
		'',
		reviewerNote,
		'',
		'---',
		'',
	].join('\n')
	const existing = existingInput.trim()
	return existing ? `${reviewerSection}${existingInput}` : reviewerSection
}

const ReviewerInsertActions = ({ reviewerNote }: { reviewerNote: string }) => {
	const accessor = useAccessor()
	const chatThreadsService = accessor.get('IChatThreadService')
	const clipboardService = accessor.get('IClipboardService')

	const [feedback, setFeedback] = useState<'idle' | 'inserted' | 'copied' | 'error'>('idle')

	useEffect(() => {
		if (feedback === 'idle') return
		const t = setTimeout(() => setFeedback('idle'), 1500)
		return () => clearTimeout(t)
	}, [feedback])

	const onInsert = useCallback(async () => {
		try {
			const threadId = chatThreadsService.state.currentThreadId
			const thread = chatThreadsService.state.allThreads[threadId]
			const mounted = await thread?.state.mountedInfo?.whenMounted
			if (!mounted) {
				setFeedback('error')
				return
			}
			const ta = mounted.textAreaRef.current
			const existing = ta?.value ?? ''
			const newValue = buildReviewerInsertText(reviewerNote, existing)
			mounted.setInputText?.(newValue)
			ta?.focus()
			setFeedback('inserted')
		} catch {
			setFeedback('error')
		}
	}, [chatThreadsService, reviewerNote])

	const onCopy = useCallback(async () => {
		try {
			await clipboardService.writeText(reviewerNote)
			setFeedback('copied')
		} catch {
			setFeedback('error')
		}
	}, [clipboardService, reviewerNote])

	const insertLabel = feedback === 'inserted'
		? '挿入しました'
		: feedback === 'error'
			? '失敗'
			: '次のプロンプトに挿入'

	const copyLabel = feedback === 'copied' ? 'コピー済み' : 'コピー'

	return (
		<div className='mt-1.5 flex items-center gap-1.5 px-2 py-1 rounded-md border border-void-border-2 bg-void-bg-2/40'>
			<ClipboardCheck className='h-3 w-3 text-void-fg-3 flex-shrink-0' />
			<span className='text-[11px] text-void-fg-3 mr-auto truncate'>
				Reviewer 指摘あり
			</span>
			<button
				type='button'
				onClick={onCopy}
				className='inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-void-fg-2 hover:bg-void-bg-3 transition-colors'
				title='Reviewer 出力をクリップボードにコピー'
			>
				<CopyIcon className='h-3 w-3' />
				{copyLabel}
			</button>
			<button
				type='button'
				onClick={onInsert}
				className='inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium text-[var(--vscode-button-foreground)] bg-[var(--vscode-button-background)] hover:bg-[var(--vscode-button-hoverBackground)] transition-colors'
				title='現在の入力欄の先頭に Reviewer 出力を挿入する'
			>
				<CornerUpLeft className='h-3 w-3' />
				{insertLabel}
			</button>
		</div>
	)
}


const AssistantMessageComponent = ({ chatMessage, isCheckpointGhost, isCommitted, messageIdx }: { chatMessage: ChatMessage & { role: 'assistant' }, isCheckpointGhost: boolean, messageIdx: number, isCommitted: boolean }) => {

	const accessor = useAccessor()
	const chatThreadsService = accessor.get('IChatThreadService')
	const settingsState = useSettingsState()

	const reasoningStr = chatMessage.reasoning?.trim() || null
	const hasReasoning = !!reasoningStr
	const isDoneReasoning = !!chatMessage.displayContent
	const thread = chatThreadsService.getCurrentThread()
	const streamState = useChatThreadsStreamState(thread.id)

	// Get model info from current settings
	const modelSelection = settingsState.modelSelectionOfFeature['Chat']
	const modelLabel = modelSelection ? modelSelection.modelName : null


	const chatMessageLocation: ChatMessageLocation = {
		threadId: thread.id,
		messageIdx: messageIdx,
	}

	const divisionResponse = useMemo(() => {
		const content = chatMessage.displayContent?.trim();
		if (!content) return null;

		// Try to find JSON in the content
		let jsonStr = content;

		// Handle markdown code blocks
		const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
		if (jsonMatch) {
			jsonStr = jsonMatch[1];
		}

		try {
			// Only try parsing if it looks like an object
			const startIdx = jsonStr.indexOf('{');
			const endIdx = jsonStr.lastIndexOf('}');
			if (startIdx !== -1 && endIdx !== -1 && startIdx < endIdx) {
				const candidate = jsonStr.substring(startIdx, endIdx + 1);
				const parsed = JSON.parse(candidate);
				// Heuristic for Division API response
				if (parsed.sessionId && (parsed.tasks || parsed.status === 'error' || parsed.orchestration)) {
					return parsed;
				}
			}
			return null;
		} catch {
			return null;
		}
	}, [chatMessage.displayContent]);
	const todoItems = useMemo(() => extractAssistantTodos(chatMessage.displayContent || ''), [chatMessage.displayContent]);


	const isEmpty = !chatMessage.displayContent && !chatMessage.reasoning
	if (isEmpty) return null

	const hasLaterVisibleMessage = thread.messages.slice(messageIdx + 1).some(m => m.role !== 'checkpoint')
	const shouldShowQuestionReply = isCommitted
		&& !isCheckpointGhost
		&& !streamState?.isRunning
		&& !hasLaterVisibleMessage
		&& looksLikeAssistantQuestion(chatMessage.displayContent || '')

	// 既定で折り畳む方針: ストリーミング中だけ開いておき、コミット (=応答完了) した
	// 瞬間に閉じる。 過去の返答も当然閉じたまま。 ユーザーがクリックで開いた場合は
	// その意思を尊重する (StaticCollapsibleCard 側の userToggledRef で保護)。
	const isStreamingThis = !isCommitted || (streamState?.isRunning && !hasLaterVisibleMessage)
	const autoFold = isCommitted

	// Division Reviewer 指摘ブロックを抽出。 ストリーミング中はまだ完成していない
	// 可能性が高いので隠しておき、コミット済みのときだけボタンを露出する。
	const reviewerNote = isCommitted ? extractReviewerNoteFromContent(chatMessage.displayContent) : null

	return <div className="py-0.5">
		{/* reasoning token */}
		{hasReasoning &&
			<div className={`${isCheckpointGhost ? 'opacity-50' : ''}`}>
				<ReasoningWrapper
					isDoneReasoning={isDoneReasoning}
					isStreaming={!isCommitted}
					reasoningDuration={chatMessage.reasoningDuration}
				>
					<SmallProseWrapper>
						<ChatMarkdownRender
							string={reasoningStr}
							chatMessageLocation={chatMessageLocation}
							isApplyEnabled={false}
							isLinkDetectionEnabled={true}
						/>
					</SmallProseWrapper>
				</ReasoningWrapper>
			</div>
		}

		{/* assistant message */}
		{chatMessage.displayContent && (
			divisionResponse ? (
				<DivisionOrchestrationComponent response={divisionResponse} chatMessageLocation={chatMessageLocation} />
			) : (
				<div className={`${isCheckpointGhost ? 'opacity-50' : ''}`}>
					<AssistantTodoCard todos={todoItems} />
					<CollapsibleAssistantResponse
						content={chatMessage.displayContent || ''}
						chatMessageLocation={chatMessageLocation}
						isStreaming={!!isStreamingThis}
						autoFold={autoFold}
					/>
				</div>
			)
		)}
		{shouldShowQuestionReply && <AssistantQuestionReply threadId={thread.id} />}
		{reviewerNote && !isCheckpointGhost && (
			<ReviewerInsertActions reviewerNote={reviewerNote} />
		)}
	</div>

}

const ReasoningWrapper = ({ isDoneReasoning, isStreaming, reasoningDuration, children }: { isDoneReasoning: boolean, isStreaming: boolean, reasoningDuration?: number, children: React.ReactNode }) => {
	const isDone = isDoneReasoning || !isStreaming
	const isWriting = !isDone
	const [isOpen, setIsOpen] = useState(isWriting)

	let titleText = '思考'
	if (isWriting) {
		titleText = '思考中'
	} else if (reasoningDuration !== undefined) {
		titleText = `${reasoningDuration.toFixed(1)} 秒間思考しました`
	}
	const title = (
		<span className='inline-flex items-center gap-1.5'>
			<span
				className={`inline-block w-1.5 h-1.5 rounded-full ${isWriting ? 'void-pulse-dot bg-[var(--vscode-focusBorder)]' : 'bg-void-fg-4 opacity-50'}`}
				style={isWriting ? { boxShadow: '0 0 6px var(--vscode-focusBorder)' } : {}}
			/>
			{titleText}
		</span>
	)

	useEffect(() => {
		if (!isWriting) setIsOpen(false) // if just finished reasoning, close
	}, [isWriting])
	return <ToolHeaderWrapper title={title} desc1={isWriting ? <IconLoading /> : ''} isOpen={isOpen} onClick={() => setIsOpen(v => !v)}>
		<ToolChildrenWrapper>
			<div className='!select-text cursor-auto'>
				{children}
			</div>
		</ToolChildrenWrapper>
	</ToolHeaderWrapper>
}




// should either be past or "-ing" tense, not present tense. Eg. when the LLM searches for something, the user expects it to say "I searched for X" or "I am searching for X". Not "I search X".

const loadingTitleWrapper = (item: React.ReactNode): React.ReactNode => {
	return <span className='flex items-center flex-nowrap'>
		{item}
		<IconLoading className='w-3 text-sm' />
	</span>
}

const titleOfBuiltinToolName = {
	'read_file': { done: 'ファイルを読み込みました', proposed: 'ファイルの読み込み', running: loadingTitleWrapper('ファイルを読み込み中') },
	'ls_dir': { done: 'フォルダを確認しました', proposed: 'フォルダの確認', running: loadingTitleWrapper('フォルダを確認中') },
	'get_dir_tree': { done: 'フォルダツリーを確認しました', proposed: 'フォルダツリーの確認', running: loadingTitleWrapper('フォルダツリーを確認中') },
	'search_pathnames_only': { done: 'ファイル名で検索しました', proposed: 'ファイル名で検索', running: loadingTitleWrapper('ファイル名で検索中') },
	'search_for_files': { done: '検索しました', proposed: '検索', running: loadingTitleWrapper('検索中') },
	'create_file_or_folder': { done: `作成しました`, proposed: `作成`, running: loadingTitleWrapper(`作成中`) },
	'delete_file_or_folder': { done: `削除しました`, proposed: `削除`, running: loadingTitleWrapper(`削除中`) },
	'edit_file': { done: `ファイルを編集しました`, proposed: 'ファイルの編集', running: loadingTitleWrapper('ファイルを編集中') },
	'rewrite_file': { done: `ファイルを書き換えました`, proposed: 'ファイルの書き換え', running: loadingTitleWrapper('ファイルを書き換え中') },
	'run_command': { done: `ターミナルを実行しました`, proposed: 'ターミナルを実行', running: loadingTitleWrapper('ターミナルを実行中') },
	'run_persistent_command': { done: `ターミナルを実行しました`, proposed: 'ターミナルを実行', running: loadingTitleWrapper('ターミナルを実行中') },

	'open_persistent_terminal': { done: `ターミナルを開きました`, proposed: 'ターミナルを開く', running: loadingTitleWrapper('ターミナルを開いています') },
	'kill_persistent_terminal': { done: `ターミナルを終了しました`, proposed: 'ターミナルを終了', running: loadingTitleWrapper('ターミナルを終了しています') },

	'read_lint_errors': { done: `リンターエラーを読み込みました`, proposed: 'リンターエラーの読み込み', running: loadingTitleWrapper('リンターエラーを読み込み中') },
	'search_in_file': { done: 'ファイル内を検索しました', proposed: 'ファイル内を検索', running: loadingTitleWrapper('ファイル内を検索中') },
} as const satisfies Record<BuiltinToolName, { done: any, proposed: any, running: any }>


const getTitle = (toolMessage: Pick<ChatMessage & { role: 'tool' }, 'name' | 'type' | 'mcpServerName'>): React.ReactNode => {
	const t = toolMessage

	// non-built-in title
	if (!builtinToolNames.includes(t.name as BuiltinToolName)) {
		// descriptor of Running or Ran etc
		const descriptor =
			t.type === 'success' ? 'Called'
				: t.type === 'running_now' ? 'Calling'
					: t.type === 'tool_request' ? 'Call'
						: t.type === 'rejected' ? 'Call'
							: t.type === 'invalid_params' ? 'Call'
								: t.type === 'tool_error' ? 'Call'
									: 'Call'


		const title = `${descriptor} ${toolMessage.mcpServerName || 'MCP'}`
		if (t.type === 'running_now' || t.type === 'tool_request')
			return loadingTitleWrapper(title)
		return title
	}

	// built-in title
	else {
		const toolName = t.name as BuiltinToolName
		if (t.type === 'success') return titleOfBuiltinToolName[toolName].done
		if (t.type === 'running_now') return titleOfBuiltinToolName[toolName].running
		return titleOfBuiltinToolName[toolName].proposed
	}
}


const toolNameToDesc = (toolName: BuiltinToolName, _toolParams: BuiltinToolCallParams[BuiltinToolName] | undefined, accessor: ReturnType<typeof useAccessor>): {
	desc1: React.ReactNode,
	desc1Info?: string,
} => {

	if (!_toolParams) {
		return { desc1: '', };
	}

	const x = {
		'read_file': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['read_file']
			return {
				desc1: getBasename(toolParams.uri.fsPath),
				desc1Info: getRelative(toolParams.uri, accessor),
			};
		},
		'ls_dir': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['ls_dir']
			return {
				desc1: getFolderName(toolParams.uri.fsPath),
				desc1Info: getRelative(toolParams.uri, accessor),
			};
		},
		'search_pathnames_only': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['search_pathnames_only']
			return {
				desc1: `"${toolParams.query}"`,
			}
		},
		'search_for_files': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['search_for_files']
			return {
				desc1: `"${toolParams.query}"`,
			}
		},
		'search_in_file': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['search_in_file'];
			return {
				desc1: `"${toolParams.query}"`,
				desc1Info: getRelative(toolParams.uri, accessor),
			};
		},
		'create_file_or_folder': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['create_file_or_folder']
			return {
				desc1: toolParams.isFolder ? getFolderName(toolParams.uri.fsPath) ?? '/' : getBasename(toolParams.uri.fsPath),
				desc1Info: getRelative(toolParams.uri, accessor),
			}
		},
		'delete_file_or_folder': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['delete_file_or_folder']
			return {
				desc1: toolParams.isFolder ? getFolderName(toolParams.uri.fsPath) ?? '/' : getBasename(toolParams.uri.fsPath),
				desc1Info: getRelative(toolParams.uri, accessor),
			}
		},
		'rewrite_file': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['rewrite_file']
			return {
				desc1: getBasename(toolParams.uri.fsPath),
				desc1Info: getRelative(toolParams.uri, accessor),
			}
		},
		'edit_file': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['edit_file']
			return {
				desc1: getBasename(toolParams.uri.fsPath),
				desc1Info: getRelative(toolParams.uri, accessor),
			}
		},
		'run_command': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['run_command']
			return {
				desc1: `"${toolParams.command}"`,
			}
		},
		'run_persistent_command': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['run_persistent_command']
			return {
				desc1: `"${toolParams.command}"`,
			}
		},
		'open_persistent_terminal': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['open_persistent_terminal']
			return { desc1: '' }
		},
		'kill_persistent_terminal': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['kill_persistent_terminal']
			return { desc1: toolParams.persistentTerminalId }
		},
		'get_dir_tree': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['get_dir_tree']
			return {
				desc1: getFolderName(toolParams.uri.fsPath) ?? '/',
				desc1Info: getRelative(toolParams.uri, accessor),
			}
		},
		'read_lint_errors': () => {
			const toolParams = _toolParams as BuiltinToolCallParams['read_lint_errors']
			return {
				desc1: getBasename(toolParams.uri.fsPath),
				desc1Info: getRelative(toolParams.uri, accessor),
			}
		}
	}

	try {
		return x[toolName]?.() || { desc1: '' }
	}
	catch {
		return { desc1: '' }
	}
}

const ToolRequestAcceptRejectButtons = ({ toolName }: { toolName: ToolName }) => {
	const accessor = useAccessor()
	const chatThreadsService = accessor.get('IChatThreadService')
	const metricsService = accessor.get('IMetricsService')
	const voidSettingsService = accessor.get('IVoidSettingsService')
	const voidSettingsState = useSettingsState()

	const onAccept = useCallback(() => {
		try { // this doesn't need to be wrapped in try/catch anymore
			const threadId = chatThreadsService.state.currentThreadId
			chatThreadsService.approveLatestToolRequest(threadId)
			metricsService.capture('Tool Request Accepted', {})
		} catch (e) { console.error('Error while approving message in chat:', e) }
	}, [chatThreadsService, metricsService])

	const onReject = useCallback(() => {
		try {
			const threadId = chatThreadsService.state.currentThreadId
			chatThreadsService.rejectLatestToolRequest(threadId)
		} catch (e) { console.error('Error while approving message in chat:', e) }
		metricsService.capture('Tool Request Rejected', {})
	}, [chatThreadsService, metricsService])

	const approveButton = (
		<button
			onClick={onAccept}
			className={`
                px-2 py-1
                bg-[var(--vscode-button-background)]
                text-[var(--vscode-button-foreground)]
                hover:bg-[var(--vscode-button-hoverBackground)]
                rounded
                text-sm font-medium
            `}
		>
			Approve
		</button>
	)

	const cancelButton = (
		<button
			onClick={onReject}
			className={`
                px-2 py-1
                bg-[var(--vscode-button-secondaryBackground)]
                text-[var(--vscode-button-secondaryForeground)]
                hover:bg-[var(--vscode-button-secondaryHoverBackground)]
                rounded
                text-sm font-medium
            `}
		>
			Cancel
		</button>
	)

	const approvalType = isABuiltinToolName(toolName) ? approvalTypeOfBuiltinToolName[toolName] : 'MCP tools'
	const approvalToggle = approvalType ? <div key={approvalType} className="flex items-center ml-2 gap-x-1">
		<ToolApprovalTypeSwitch size='xs' approvalType={approvalType} desc={`Auto-approve ${approvalType}`} />
	</div> : null

	return <div className="flex gap-2 mx-0.5 items-center">
		{approveButton}
		{cancelButton}
		{approvalToggle}
	</div>
}

export const ToolChildrenWrapper = ({ children, className }: { children: React.ReactNode, className?: string }) => {
	return <div className={`${className ? className : ''} cursor-default select-none`}>
		<div className='px-2 min-w-full overflow-hidden'>
			{children}
		</div>
	</div>
}
export const CodeChildren = ({ children, className }: { children: React.ReactNode, className?: string }) => {
	return <div className={`${className ?? ''} p-1 rounded-sm overflow-auto text-sm`}>
		<div className='!select-text cursor-auto'>
			{children}
		</div>
	</div>
}

export const ListableToolItem = ({ name, onClick, isSmall, className, showDot }: { name: React.ReactNode, onClick?: () => void, isSmall?: boolean, className?: string, showDot?: boolean }) => {
	return <div
		className={`
			${onClick ? 'hover:brightness-125 hover:cursor-pointer transition-all duration-200 ' : ''}
			flex items-center flex-nowrap whitespace-nowrap
			${className ? className : ''}
			`}
		onClick={onClick}
	>
		{showDot === false ? null : <div className="flex-shrink-0"><svg className="w-1 h-1 opacity-60 mr-1.5 fill-current" viewBox="0 0 100 40"><rect x="0" y="15" width="100" height="10" /></svg></div>}
		<div className={`${isSmall ? 'italic text-void-fg-4 flex items-center' : ''}`}>{name}</div>
	</div>
}



const EditToolChildren = ({ uri, code, type }: { uri: URI | undefined, code: string, type: 'diff' | 'rewrite' }) => {

	const content = type === 'diff' ?
		<VoidDiffEditor uri={uri} searchReplaceBlocks={code} />
		: <ChatMarkdownRender string={`\`\`\`\n${code}\n\`\`\``} codeURI={uri} chatMessageLocation={undefined} />

	return <div className='!select-text cursor-auto'>
		<SmallProseWrapper>
			{content}
		</SmallProseWrapper>
	</div>

}


const LintErrorChildren = ({ lintErrors }: { lintErrors: LintErrorItem[] }) => {
	return <div className="text-xs text-void-fg-4 opacity-80 border-l-2 border-void-warning px-2 py-0.5 flex flex-col gap-0.5 overflow-x-auto whitespace-nowrap">
		{lintErrors.map((error, i) => (
			<div key={i}>Lines {error.startLineNumber}-{error.endLineNumber}: {error.message}</div>
		))}
	</div>
}

const BottomChildren = ({ children, title }: { children: React.ReactNode, title: string }) => {
	const [isOpen, setIsOpen] = useState(false);
	if (!children) return null;
	return (
		<div className="w-full px-2 mt-0.5">
			<div
				className={`flex items-center cursor-pointer select-none transition-colors duration-150 pl-0 py-0.5 rounded group`}
				onClick={() => setIsOpen(o => !o)}
				style={{ background: 'none' }}
			>
				<ChevronRight
					className={`mr-1 h-3 w-3 flex-shrink-0 transition-transform duration-100 text-void-fg-4 group-hover:text-void-fg-3 ${isOpen ? 'rotate-90' : ''}`}
				/>
				<span className="font-medium text-void-fg-4 group-hover:text-void-fg-3 text-xs">{title}</span>
			</div>
			<div
				className={`overflow-hidden transition-all duration-200 ease-in-out ${isOpen ? 'opacity-100' : 'max-h-0 opacity-0'} text-xs pl-4`}
			>
				<div className="overflow-x-auto text-void-fg-4 opacity-90 border-l-2 border-void-warning px-2 py-0.5">
					{children}
				</div>
			</div>
		</div>
	);
}


const EditToolHeaderButtons = ({ applyBoxId, uri, codeStr, toolName, threadId }: { threadId: string, applyBoxId: string, uri: URI, codeStr: string, toolName: 'edit_file' | 'rewrite_file' }) => {
	const { streamState } = useEditToolStreamState({ applyBoxId, uri })
	return <div className='flex items-center gap-1'>
		{/* <StatusIndicatorForApplyButton applyBoxId={applyBoxId} uri={uri} /> */}
		{/* <JumpToFileButton uri={uri} /> */}
		{streamState === 'idle-no-changes' && <CopyButton codeStr={codeStr} toolTipName='Copy' />}
		<EditToolAcceptRejectButtonsHTML type={toolName} codeStr={codeStr} applyBoxId={applyBoxId} uri={uri} threadId={threadId} />
	</div>
}



const InvalidTool = ({ toolName, message, mcpServerName }: { toolName: ToolName, message: string, mcpServerName: string | undefined }) => {
	const accessor = useAccessor()
	const title = getTitle({ name: toolName, type: 'invalid_params', mcpServerName })
	const desc1 = 'パラメータが無効です'
	const icon = null
	const isError = true
	const componentParams: ToolHeaderParams = { title, desc1, isError, icon }

	componentParams.children = <ToolChildrenWrapper>
		<CodeChildren className='bg-void-bg-3'>
			{message}
		</CodeChildren>
	</ToolChildrenWrapper>
	return <ToolHeaderWrapper {...componentParams} />
}

const CanceledTool = ({ toolName, mcpServerName }: { toolName: ToolName, mcpServerName: string | undefined }) => {
	const accessor = useAccessor()
	const title = getTitle({ name: toolName, type: 'rejected', mcpServerName })
	const desc1 = ''
	const icon = null
	const isRejected = true
	const componentParams: ToolHeaderParams = { title, desc1, icon, isRejected }
	return <ToolHeaderWrapper {...componentParams} />
}


const CommandTool = ({ toolMessage, type, threadId }: { threadId: string } & ({
	toolMessage: Exclude<ToolMessage<'run_command'>, { type: 'invalid_params' }>
	type: 'run_command'
} | {
	toolMessage: Exclude<ToolMessage<'run_persistent_command'>, { type: 'invalid_params' }>
	type: | 'run_persistent_command'
})) => {
	const accessor = useAccessor()

	const commandService = accessor.get('ICommandService')
	const terminalToolsService = accessor.get('ITerminalToolService')
	const toolsService = accessor.get('IToolsService')
	const isError = false
	const title = getTitle(toolMessage)
	const { desc1, desc1Info } = toolNameToDesc(toolMessage.name, toolMessage.params, accessor)
	const icon = null
	const streamState = useChatThreadsStreamState(threadId)

	const divRef = useRef<HTMLDivElement | null>(null)

	const isRejected = toolMessage.type === 'rejected'
	const { rawParams, params } = toolMessage
	const componentParams: ToolHeaderParams = { title, desc1, desc1Info, isError, icon, isRejected, }


	const effect = async () => {
		if (streamState?.isRunning !== 'tool') return
		if (type !== 'run_command' || toolMessage.type !== 'running_now') return;

		// wait for the interruptor so we know it's running

		await streamState?.interrupt
		const container = divRef.current;
		if (!container) return;

		const terminal = terminalToolsService.getTemporaryTerminal(toolMessage.params.terminalId);
		if (!terminal) return;

		try {
			terminal.attachToElement(container);
			terminal.setVisible(true)
		} catch {
		}

		// Listen for size changes of the container and keep the terminal layout in sync.
		const resizeObserver = new ResizeObserver((entries) => {
			const height = entries[0].borderBoxSize[0].blockSize;
			const width = entries[0].borderBoxSize[0].inlineSize;
			if (typeof terminal.layout === 'function') {
				terminal.layout({ width, height });
			}
		});

		resizeObserver.observe(container);
		return () => { terminal.detachFromElement(); resizeObserver?.disconnect(); }
	}

	useEffect(() => {
		effect()
	}, [terminalToolsService, toolMessage, toolMessage.type, type]);

	if (toolMessage.type === 'success') {
		const { result } = toolMessage

		// it's unclear that this is a button and not an icon.
		// componentParams.desc2 = <JumpToTerminalButton
		// 	onClick={() => { terminalToolsService.openTerminal(terminalId) }}
		// />

		let msg: string
		if (type === 'run_command') msg = toolsService.stringOfResult['run_command'](toolMessage.params, result)
		else msg = toolsService.stringOfResult['run_persistent_command'](toolMessage.params, result)

		if (type === 'run_persistent_command') {
			componentParams.info = persistentTerminalNameOfId(toolMessage.params.persistentTerminalId)
		}

		componentParams.children = <ToolChildrenWrapper className='whitespace-pre text-nowrap overflow-auto text-sm'>
			<div className='!select-text cursor-auto'>
				<BlockCode initValue={`${msg.trim()}`} language='shellscript' />
			</div>
		</ToolChildrenWrapper>
	}
	else if (toolMessage.type === 'tool_error') {
		const { result } = toolMessage
		componentParams.bottomChildren = <BottomChildren title='エラー'>
			<CodeChildren>
				{result}
			</CodeChildren>
		</BottomChildren>
	}
	else if (toolMessage.type === 'running_now') {
		if (type === 'run_command')
			componentParams.children = <div ref={divRef} className='relative h-[300px] text-sm' />
	}
	else if (toolMessage.type === 'rejected' || toolMessage.type === 'tool_request') {
	}

	return <>
		<ToolHeaderWrapper {...componentParams} isOpen={type === 'run_command' && toolMessage.type === 'running_now' ? true : undefined} />
	</>
}

type WrapperProps<T extends ToolName> = { toolMessage: Exclude<ToolMessage<T>, { type: 'invalid_params' }>, messageIdx: number, threadId: string }
const MCPToolWrapper = ({ toolMessage }: WrapperProps<string>) => {
	const accessor = useAccessor()
	const mcpService = accessor.get('IMCPService')

	const title = getTitle(toolMessage)
	const desc1 = removeMCPToolNamePrefix(toolMessage.name)
	const icon = null


	if (toolMessage.type === 'running_now') return null // do not show running

	const isError = false
	const isRejected = toolMessage.type === 'rejected'
	const { rawParams, params } = toolMessage
	const componentParams: ToolHeaderParams = { title, desc1, isError, icon, isRejected, }

	const paramsStr = JSON.stringify(params, null, 2)
	componentParams.desc2 = <CopyButton codeStr={paramsStr} toolTipName={`Copy inputs: ${paramsStr}`} />

	componentParams.info = !toolMessage.mcpServerName ? 'MCP tool not found' : undefined

	// Add copy inputs button in desc2


	if (toolMessage.type === 'success' || toolMessage.type === 'tool_request') {
		const { result } = toolMessage
		const resultStr = result ? mcpService.stringifyResult(result) : 'null'
		componentParams.children = <ToolChildrenWrapper>
			<SmallProseWrapper>
				<ChatMarkdownRender
					string={`\`\`\`json\n${resultStr}\n\`\`\``}
					chatMessageLocation={undefined}
					isApplyEnabled={false}
					isLinkDetectionEnabled={true}
				/>
			</SmallProseWrapper>
		</ToolChildrenWrapper>
	}
	else if (toolMessage.type === 'tool_error') {
		const { result } = toolMessage
		componentParams.bottomChildren = <BottomChildren title='エラー'>
			<CodeChildren>
				{result}
			</CodeChildren>
		</BottomChildren>
	}

	return <ToolHeaderWrapper {...componentParams} />

}

type ResultWrapper<T extends ToolName> = (props: WrapperProps<T>) => React.ReactNode

const builtinToolNameToComponent: { [T in BuiltinToolName]: { resultWrapper: ResultWrapper<T>, } } = {
	'read_file': {
		resultWrapper: ({ toolMessage }) => {
			const accessor = useAccessor()
			const commandService = accessor.get('ICommandService')

			const title = getTitle(toolMessage)

			const { desc1, desc1Info } = toolNameToDesc(toolMessage.name, toolMessage.params, accessor);
			const icon = null

			if (toolMessage.type === 'tool_request') return null // do not show past requests
			if (toolMessage.type === 'running_now') return null // do not show running

			const isError = false
			const isRejected = toolMessage.type === 'rejected'
			const { rawParams, params } = toolMessage
			const componentParams: ToolHeaderParams = { title, desc1, desc1Info, isError, icon, isRejected, }

			let range: [number, number] | undefined = undefined
			if (toolMessage.params.startLine !== null || toolMessage.params.endLine !== null) {
				const start = toolMessage.params.startLine === null ? `1` : `${toolMessage.params.startLine}`
				const end = toolMessage.params.endLine === null ? `` : `${toolMessage.params.endLine}`
				const addStr = `(${start}-${end})`
				componentParams.desc1 += ` ${addStr}`
				range = [params.startLine || 1, params.endLine || 1]
			}

			if (toolMessage.type === 'success') {
				const { result } = toolMessage
				componentParams.onClick = () => { voidOpenFileFn(params.uri, accessor, range) }
				if (result.hasNextPage && params.pageNumber === 1)  // first page
					componentParams.desc2 = `(truncated after ${Math.round(MAX_FILE_CHARS_PAGE) / 1000}k)`
				else if (params.pageNumber > 1) // subsequent pages
					componentParams.desc2 = `(part ${params.pageNumber})`
			}
			else if (toolMessage.type === 'tool_error') {
				const { result } = toolMessage
				// JumpToFileButton removed in favor of FileLinkText
				componentParams.bottomChildren = <BottomChildren title='Error'>
					<CodeChildren>
						{result}
					</CodeChildren>
				</BottomChildren>
			}

			return <ToolHeaderWrapper {...componentParams} />
		},
	},
	'get_dir_tree': {
		resultWrapper: ({ toolMessage }) => {
			const accessor = useAccessor()
			const commandService = accessor.get('ICommandService')

			const title = getTitle(toolMessage)
			const { desc1, desc1Info } = toolNameToDesc(toolMessage.name, toolMessage.params, accessor)
			const icon = null

			if (toolMessage.type === 'tool_request') return null // do not show past requests
			if (toolMessage.type === 'running_now') return null // do not show running

			const isError = false
			const isRejected = toolMessage.type === 'rejected'
			const { rawParams, params } = toolMessage
			const componentParams: ToolHeaderParams = { title, desc1, desc1Info, isError, icon, isRejected, }

			if (params.uri) {
				const rel = getRelative(params.uri, accessor)
				if (rel) componentParams.info = `Only search in ${rel}`
			}

			if (toolMessage.type === 'success') {
				const { result } = toolMessage
				componentParams.children = <ToolChildrenWrapper>
					<SmallProseWrapper>
						<ChatMarkdownRender
							string={`\`\`\`\n${result.str}\n\`\`\``}
							chatMessageLocation={undefined}
							isApplyEnabled={false}
							isLinkDetectionEnabled={true}
						/>
					</SmallProseWrapper>
				</ToolChildrenWrapper>
			}
			else if (toolMessage.type === 'tool_error') {
				const { result } = toolMessage
				componentParams.bottomChildren = <BottomChildren title='Error'>
					<CodeChildren>
						{result}
					</CodeChildren>
				</BottomChildren>
			}

			return <ToolHeaderWrapper {...componentParams} />

		}
	},
	'ls_dir': {
		resultWrapper: ({ toolMessage }) => {
			const accessor = useAccessor()
			const commandService = accessor.get('ICommandService')
			const explorerService = accessor.get('IExplorerService')
			const title = getTitle(toolMessage)
			const { desc1, desc1Info } = toolNameToDesc(toolMessage.name, toolMessage.params, accessor)
			const icon = null

			if (toolMessage.type === 'tool_request') return null // do not show past requests
			if (toolMessage.type === 'running_now') return null // do not show running

			const isError = false
			const isRejected = toolMessage.type === 'rejected'
			const { rawParams, params } = toolMessage
			const componentParams: ToolHeaderParams = { title, desc1, desc1Info, isError, icon, isRejected, }

			if (params.uri) {
				const rel = getRelative(params.uri, accessor)
				if (rel) componentParams.info = `Only search in ${rel}`
			}

			if (toolMessage.type === 'success') {
				const { result } = toolMessage
				componentParams.numResults = result.children?.length
				componentParams.hasNextPage = result.hasNextPage
				componentParams.children = !result.children || (result.children.length ?? 0) === 0 ? undefined
					: <ToolChildrenWrapper>
						{result.children.map((child, i) => (<ListableToolItem key={i}
							name={`${child.name}${child.isDirectory ? '/' : ''}`}
							className='w-full overflow-auto'
							onClick={() => {
								voidOpenFileFn(child.uri, accessor)
								// commandService.executeCommand('workbench.view.explorer'); // open in explorer folders view instead
								// explorerService.select(child.uri, true);
							}}
						/>))}
						{result.hasNextPage &&
							<ListableToolItem name={`Results truncated (${result.itemsRemaining} remaining).`} isSmall={true} className='w-full overflow-auto' />
						}
					</ToolChildrenWrapper>
			}
			else if (toolMessage.type === 'tool_error') {
				const { result } = toolMessage
				componentParams.bottomChildren = <BottomChildren title='Error'>
					<CodeChildren>
						{result}
					</CodeChildren>
				</BottomChildren>
			}

			return <ToolHeaderWrapper {...componentParams} />
		}
	},
	'search_pathnames_only': {
		resultWrapper: ({ toolMessage }) => {
			const accessor = useAccessor()
			const commandService = accessor.get('ICommandService')
			const isError = false
			const isRejected = toolMessage.type === 'rejected'
			const title = getTitle(toolMessage)
			const { desc1, desc1Info } = toolNameToDesc(toolMessage.name, toolMessage.params, accessor)
			const icon = null

			if (toolMessage.type === 'tool_request') return null // do not show past requests
			if (toolMessage.type === 'running_now') return null // do not show running

			const { rawParams, params } = toolMessage
			const componentParams: ToolHeaderParams = { title, desc1, desc1Info, isError, icon, isRejected, }

			if (params.includePattern) {
				componentParams.info = `Only search in ${params.includePattern}`
			}

			if (toolMessage.type === 'success') {
				const { result, rawParams } = toolMessage
				componentParams.numResults = result.uris.length
				componentParams.hasNextPage = result.hasNextPage
				componentParams.children = result.uris.length === 0 ? undefined
					: <ToolChildrenWrapper>
						{result.uris.map((uri, i) => (<ListableToolItem key={i}
							name={getBasename(uri.fsPath)}
							className='w-full overflow-auto'
							onClick={() => { voidOpenFileFn(uri, accessor) }}
						/>))}
						{result.hasNextPage &&
							<ListableToolItem name={'Results truncated.'} isSmall={true} className='w-full overflow-auto' />
						}

					</ToolChildrenWrapper>
			}
			else if (toolMessage.type === 'tool_error') {
				const { result } = toolMessage
				componentParams.bottomChildren = <BottomChildren title='Error'>
					<CodeChildren>
						{result}
					</CodeChildren>
				</BottomChildren>
			}

			return <ToolHeaderWrapper {...componentParams} />
		}
	},
	'search_for_files': {
		resultWrapper: ({ toolMessage }) => {
			const accessor = useAccessor()
			const commandService = accessor.get('ICommandService')
			const isError = false
			const isRejected = toolMessage.type === 'rejected'
			const title = getTitle(toolMessage)
			const { desc1, desc1Info } = toolNameToDesc(toolMessage.name, toolMessage.params, accessor)
			const icon = null

			if (toolMessage.type === 'tool_request') return null // do not show past requests
			if (toolMessage.type === 'running_now') return null // do not show running

			const { rawParams, params } = toolMessage
			const componentParams: ToolHeaderParams = { title, desc1, desc1Info, isError, icon, isRejected, }

			if (params.searchInFolder || params.isRegex) {
				let info: string[] = []
				if (params.searchInFolder) {
					const rel = getRelative(params.searchInFolder, accessor)
					if (rel) info.push(`Only search in ${rel}`)
				}
				if (params.isRegex) { info.push(`Uses regex search`) }
				componentParams.info = info.join('; ')
			}

			if (toolMessage.type === 'success') {
				const { result, rawParams } = toolMessage
				componentParams.numResults = result.uris.length
				componentParams.hasNextPage = result.hasNextPage
				componentParams.children = result.uris.length === 0 ? undefined
					: <ToolChildrenWrapper>
						{result.uris.map((uri, i) => (<ListableToolItem key={i}
							name={getBasename(uri.fsPath)}
							className='w-full overflow-auto'
							onClick={() => { voidOpenFileFn(uri, accessor) }}
						/>))}
						{result.hasNextPage &&
							<ListableToolItem name={`Results truncated.`} isSmall={true} className='w-full overflow-auto' />
						}

					</ToolChildrenWrapper>
			}
			else if (toolMessage.type === 'tool_error') {
				const { result } = toolMessage
				componentParams.bottomChildren = <BottomChildren title='Error'>
					<CodeChildren>
						{result}
					</CodeChildren>
				</BottomChildren>
			}
			return <ToolHeaderWrapper {...componentParams} />
		}
	},

	'search_in_file': {
		resultWrapper: ({ toolMessage }) => {
			const accessor = useAccessor();
			const toolsService = accessor.get('IToolsService');
			const title = getTitle(toolMessage);
			const isError = false
			const isRejected = toolMessage.type === 'rejected'
			const { desc1, desc1Info } = toolNameToDesc(toolMessage.name, toolMessage.params, accessor);
			const icon = null;

			if (toolMessage.type === 'tool_request') return null // do not show past requests
			if (toolMessage.type === 'running_now') return null // do not show running

			const { rawParams, params } = toolMessage;
			const componentParams: ToolHeaderParams = { title, desc1, desc1Info, isError, icon, isRejected };

			const infoarr: string[] = []
			const uriStr = getRelative(params.uri, accessor)
			if (uriStr) infoarr.push(uriStr)
			if (params.isRegex) infoarr.push('Uses regex search')
			componentParams.info = infoarr.join('; ')

			if (toolMessage.type === 'success') {
				const { result } = toolMessage; // result is array of snippets
				componentParams.numResults = result.lines.length;
				componentParams.children = result.lines.length === 0 ? undefined :
					<ToolChildrenWrapper>
						<CodeChildren className='bg-void-bg-3'>
							<pre className='font-mono whitespace-pre'>
								{toolsService.stringOfResult['search_in_file'](params, result)}
							</pre>
						</CodeChildren>
					</ToolChildrenWrapper>
			}
			else if (toolMessage.type === 'tool_error') {
				const { result } = toolMessage;
				componentParams.bottomChildren = <BottomChildren title='Error'>
					<CodeChildren>
						{result}
					</CodeChildren>
				</BottomChildren>
			}

			return <ToolHeaderWrapper {...componentParams} />;
		}
	},

	'read_lint_errors': {
		resultWrapper: ({ toolMessage }) => {
			const accessor = useAccessor()
			const commandService = accessor.get('ICommandService')

			const title = getTitle(toolMessage)

			const { uri } = toolMessage.params ?? {}
			const { desc1, desc1Info } = toolNameToDesc(toolMessage.name, toolMessage.params, accessor)
			const icon = null

			if (toolMessage.type === 'tool_request') return null // do not show past requests
			if (toolMessage.type === 'running_now') return null // do not show running

			const isError = false
			const isRejected = toolMessage.type === 'rejected'
			const { rawParams, params } = toolMessage
			const componentParams: ToolHeaderParams = { title, desc1, desc1Info, isError, icon, isRejected, }

			componentParams.info = getRelative(uri, accessor) // full path

			if (toolMessage.type === 'success') {
				const { result } = toolMessage
				componentParams.onClick = () => { voidOpenFileFn(params.uri, accessor) }
				if (result.lintErrors)
					componentParams.children = <LintErrorChildren lintErrors={result.lintErrors} />
				else
					componentParams.children = `No lint errors found.`

			}
			else if (toolMessage.type === 'tool_error') {
				const { result } = toolMessage
				// JumpToFileButton removed in favor of FileLinkText
				componentParams.bottomChildren = <BottomChildren title='Error'>
					<CodeChildren>
						{result}
					</CodeChildren>
				</BottomChildren>
			}

			return <ToolHeaderWrapper {...componentParams} />
		},
	},

	// ---

	'create_file_or_folder': {
		resultWrapper: ({ toolMessage }) => {
			const accessor = useAccessor()
			const commandService = accessor.get('ICommandService')
			const isError = false
			const isRejected = toolMessage.type === 'rejected'
			const title = getTitle(toolMessage)
			const { desc1, desc1Info } = toolNameToDesc(toolMessage.name, toolMessage.params, accessor)
			const icon = null


			const { rawParams, params } = toolMessage
			const componentParams: ToolHeaderParams = { title, desc1, desc1Info, isError, icon, isRejected, }

			componentParams.info = getRelative(params.uri, accessor) // full path

			if (toolMessage.type === 'success') {
				const { result } = toolMessage
				componentParams.onClick = () => { voidOpenFileFn(params.uri, accessor) }
			}
			else if (toolMessage.type === 'rejected') {
				componentParams.onClick = () => { voidOpenFileFn(params.uri, accessor) }
			}
			else if (toolMessage.type === 'tool_error') {
				const { result } = toolMessage
				if (params) { componentParams.onClick = () => { voidOpenFileFn(params.uri, accessor) } }
				componentParams.bottomChildren = <BottomChildren title='Error'>
					<CodeChildren>
						{result}
					</CodeChildren>
				</BottomChildren>
			}
			else if (toolMessage.type === 'running_now') {
				// nothing more is needed
			}
			else if (toolMessage.type === 'tool_request') {
				// nothing more is needed
			}

			return <ToolHeaderWrapper {...componentParams} />
		}
	},
	'delete_file_or_folder': {
		resultWrapper: ({ toolMessage }) => {
			const accessor = useAccessor()
			const commandService = accessor.get('ICommandService')
			const isFolder = toolMessage.params?.isFolder ?? false
			const isError = false
			const isRejected = toolMessage.type === 'rejected'
			const title = getTitle(toolMessage)
			const { desc1, desc1Info } = toolNameToDesc(toolMessage.name, toolMessage.params, accessor)
			const icon = null

			const { rawParams, params } = toolMessage
			const componentParams: ToolHeaderParams = { title, desc1, desc1Info, isError, icon, isRejected, }

			componentParams.info = getRelative(params.uri, accessor) // full path

			if (toolMessage.type === 'success') {
				const { result } = toolMessage
				componentParams.onClick = () => { voidOpenFileFn(params.uri, accessor) }
			}
			else if (toolMessage.type === 'rejected') {
				componentParams.onClick = () => { voidOpenFileFn(params.uri, accessor) }
			}
			else if (toolMessage.type === 'tool_error') {
				const { result } = toolMessage
				if (params) { componentParams.onClick = () => { voidOpenFileFn(params.uri, accessor) } }
				componentParams.bottomChildren = <BottomChildren title='Error'>
					<CodeChildren>
						{result}
					</CodeChildren>
				</BottomChildren>
			}
			else if (toolMessage.type === 'running_now') {
				const { result } = toolMessage
				componentParams.onClick = () => { voidOpenFileFn(params.uri, accessor) }
			}
			else if (toolMessage.type === 'tool_request') {
				const { result } = toolMessage
				componentParams.onClick = () => { voidOpenFileFn(params.uri, accessor) }
			}

			return <ToolHeaderWrapper {...componentParams} />
		}
	},
	'rewrite_file': {
		resultWrapper: (params) => {
			return <EditTool {...params} content={params.toolMessage.params.newContent} />
		}
	},
	'edit_file': {
		resultWrapper: (params) => {
			return <EditTool {...params} content={params.toolMessage.params.searchReplaceBlocks} />
		}
	},

	// ---

	'run_command': {
		resultWrapper: (params) => {
			return <CommandTool {...params} type='run_command' />
		}
	},

	'run_persistent_command': {
		resultWrapper: (params) => {
			return <CommandTool {...params} type='run_persistent_command' />
		}
	},
	'open_persistent_terminal': {
		resultWrapper: ({ toolMessage }) => {
			const accessor = useAccessor()
			const terminalToolsService = accessor.get('ITerminalToolService')

			const { desc1, desc1Info } = toolNameToDesc(toolMessage.name, toolMessage.params, accessor)
			const title = getTitle(toolMessage)
			const icon = null

			if (toolMessage.type === 'tool_request') return null // do not show past requests
			if (toolMessage.type === 'running_now') return null // do not show running

			const isError = false
			const isRejected = toolMessage.type === 'rejected'
			const { rawParams, params } = toolMessage
			const componentParams: ToolHeaderParams = { title, desc1, desc1Info, isError, icon, isRejected, }

			const relativePath = params.cwd ? getRelative(URI.file(params.cwd), accessor) : ''
			componentParams.info = relativePath ? `Running in ${relativePath}` : undefined

			if (toolMessage.type === 'success') {
				const { result } = toolMessage
				const { persistentTerminalId } = result
				componentParams.desc1 = persistentTerminalNameOfId(persistentTerminalId)
				componentParams.onClick = () => terminalToolsService.focusPersistentTerminal(persistentTerminalId)
			}
			else if (toolMessage.type === 'tool_error') {
				const { result } = toolMessage
				componentParams.bottomChildren = <BottomChildren title='Error'>
					<CodeChildren>
						{result}
					</CodeChildren>
				</BottomChildren>
			}

			return <ToolHeaderWrapper {...componentParams} />
		},
	},
	'kill_persistent_terminal': {
		resultWrapper: ({ toolMessage }) => {
			const accessor = useAccessor()
			const commandService = accessor.get('ICommandService')
			const terminalToolsService = accessor.get('ITerminalToolService')

			const { desc1, desc1Info } = toolNameToDesc(toolMessage.name, toolMessage.params, accessor)
			const title = getTitle(toolMessage)
			const icon = null

			if (toolMessage.type === 'tool_request') return null // do not show past requests
			if (toolMessage.type === 'running_now') return null // do not show running

			const isError = false
			const isRejected = toolMessage.type === 'rejected'
			const { rawParams, params } = toolMessage
			const componentParams: ToolHeaderParams = { title, desc1, desc1Info, isError, icon, isRejected, }

			if (toolMessage.type === 'success') {
				const { persistentTerminalId } = params
				componentParams.desc1 = persistentTerminalNameOfId(persistentTerminalId)
				componentParams.onClick = () => terminalToolsService.focusPersistentTerminal(persistentTerminalId)
			}
			else if (toolMessage.type === 'tool_error') {
				const { result } = toolMessage
				componentParams.bottomChildren = <BottomChildren title='Error'>
					<CodeChildren>
						{result}
					</CodeChildren>
				</BottomChildren>
			}

			return <ToolHeaderWrapper {...componentParams} />
		},
	},
};


const Checkpoint = ({ message, threadId, messageIdx, isCheckpointGhost, threadIsRunning }: { message: CheckpointEntry, threadId: string; messageIdx: number, isCheckpointGhost: boolean, threadIsRunning: boolean }) => {
	const accessor = useAccessor()
	const chatThreadService = accessor.get('IChatThreadService')
	const streamState = useFullChatThreadsStreamState()

	const isRunning = useChatThreadsStreamState(threadId)?.isRunning
	const isDisabled = useMemo(() => {
		if (isRunning) return true
		return !!Object.keys(streamState).find((threadId2) => streamState[threadId2]?.isRunning)
	}, [isRunning, streamState])

	return <div
		className={`flex items-center justify-center gap-2 px-2 my-1 group`}
	>
		<div className={`h-px flex-1 bg-gradient-to-r from-transparent to-void-border-2 ${isCheckpointGhost ? 'opacity-50' : ''}`} />
		<div
			className={`
					inline-flex items-center gap-1.5
					text-[10px] tracking-wide uppercase font-medium
					text-void-fg-3
					px-2 py-0.5 rounded-full
					bg-void-bg-2 border border-void-border-2
					select-none transition-all duration-200
					${isCheckpointGhost ? 'opacity-50' : 'opacity-100'}
					${isDisabled ? 'cursor-default' : 'cursor-pointer hover:border-[var(--vscode-focusBorder)]/50 hover:text-void-fg-2 hover:shadow-sm'}
				`}
			onClick={() => {
				if (threadIsRunning) return
				if (isDisabled) return
				chatThreadService.jumpToCheckpointBeforeMessageIdx({
					threadId,
					messageIdx,
					jumpToUserModified: messageIdx === (chatThreadService.state.allThreads[threadId]?.messages.length ?? 0) - 1
				})
			}}
			{...isDisabled ? {
				'data-tooltip-id': 'void-tooltip',
				'data-tooltip-content': `Disabled ${isRunning ? 'when running' : 'because another thread is running'}`,
				'data-tooltip-place': 'top',
			} : {}}
		>
			<Flag size={10} className='opacity-70' />
			Checkpoint
		</div>
		<div className={`h-px flex-1 bg-gradient-to-l from-transparent to-void-border-2 ${isCheckpointGhost ? 'opacity-50' : ''}`} />
	</div>
}


type ChatBubbleMode = 'display' | 'edit'
type ChatBubbleProps = {
	chatMessage: ChatMessage,
	messageIdx: number,
	isCommitted: boolean,
	chatIsRunning: IsRunningType,
	threadId: string,
	currCheckpointIdx: number | undefined,
	_scrollToBottom: (() => void) | null,
}

const ChatBubble = (props: ChatBubbleProps) => {
	return <ErrorBoundary>
		<_ChatBubble {...props} />
	</ErrorBoundary>
}

const _ChatBubble = ({ threadId, chatMessage, currCheckpointIdx, isCommitted, messageIdx, chatIsRunning, _scrollToBottom }: ChatBubbleProps) => {
	const role = chatMessage.role

	const isCheckpointGhost = messageIdx > (currCheckpointIdx ?? Infinity) && !chatIsRunning // whether to show as gray (if chat is running, for good measure just dont show any ghosts)

	if (role === 'user') {
		return <UserMessageComponent
			chatMessage={chatMessage}
			isCheckpointGhost={isCheckpointGhost}
			currCheckpointIdx={currCheckpointIdx}
			messageIdx={messageIdx}
			_scrollToBottom={_scrollToBottom}
		/>
	}
	else if (role === 'assistant') {
		return <AssistantMessageComponent
			chatMessage={chatMessage}
			isCheckpointGhost={isCheckpointGhost}
			messageIdx={messageIdx}
			isCommitted={isCommitted}
		/>
	}
	else if (role === 'tool') {

		if (chatMessage.type === 'invalid_params') {
			return <div className={`${isCheckpointGhost ? 'opacity-50' : ''}`}>
				<InvalidTool toolName={chatMessage.name} message={chatMessage.content} mcpServerName={chatMessage.mcpServerName} />
			</div>
		}

		const toolName = chatMessage.name
		const isBuiltInTool = isABuiltinToolName(toolName)
		const ToolResultWrapper = isBuiltInTool ? builtinToolNameToComponent[toolName]?.resultWrapper as ResultWrapper<ToolName>
			: MCPToolWrapper as ResultWrapper<ToolName>

		if (ToolResultWrapper)
			return <>
				<div className={`${isCheckpointGhost ? 'opacity-50' : ''}`}>
					<ToolResultWrapper
						toolMessage={chatMessage}
						messageIdx={messageIdx}
						threadId={threadId}
					/>
				</div>
				{chatMessage.type === 'tool_request' ?
					<div className={`${isCheckpointGhost ? 'opacity-50 pointer-events-none' : ''}`}>
						<ToolRequestAcceptRejectButtons toolName={chatMessage.name} />
					</div> : null}
			</>
		return null
	}

	else if (role === 'interrupted_streaming_tool') {
		return <div className={`${isCheckpointGhost ? 'opacity-50' : ''}`}>
			<CanceledTool toolName={chatMessage.name} mcpServerName={chatMessage.mcpServerName} />
		</div>
	}

	else if (role === 'checkpoint') {
		return <Checkpoint
			threadId={threadId}
			message={chatMessage}
			messageIdx={messageIdx}
			isCheckpointGhost={isCheckpointGhost}
			threadIsRunning={!!chatIsRunning}
		/>
	}

	else if (role === 'flow_review') {
		return <FlowReviewComponent
			chatMessage={chatMessage}
			isCheckpointGhost={isCheckpointGhost}
		/>
	}

	return null
}

const FlowReviewComponent = ({ chatMessage, isCheckpointGhost }: {
	chatMessage: ChatMessage & { role: 'flow_review' },
	isCheckpointGhost: boolean,
}) => {
	const accessor = useAccessor()
	const chatThreadsService = accessor.get('IChatThreadService')

	const flowOutputs = chatMessage.allFlowOutputs || [
		{ role: chatMessage.flowRole, mdFileName: chatMessage.mdFileName, mdFilePath: chatMessage.mdFilePath, mdContent: chatMessage.mdContent }
	]

	const [editedContents, setEditedContents] = useState<Record<string, string>>(() => {
		const initial: Record<string, string> = {}
		for (const o of flowOutputs) {
			initial[o.mdFileName] = o.mdContent
		}
		return initial
	})

	const [isEditing, setIsEditing] = useState(false)

	const { status } = chatMessage
	const currentIdx = chatMessage.completedTaskIndex
	const totalTasks = chatMessage.totalTasks

	const onApprove = useCallback(() => {
		try {
			const threadId = chatThreadsService.state.currentThreadId
			// Only send editedOutputs if user actually edited content
			const hasEdits = flowOutputs.some(o => {
				const edited = editedContents[o.mdFileName]
				return edited !== undefined && edited !== o.mdContent
			})
			const editedOutputs = hasEdits
				? flowOutputs.map(o => ({
					mdFileName: o.mdFileName,
					mdContent: editedContents[o.mdFileName] ?? o.mdContent,
				})).filter(o => o.mdContent && o.mdContent.trim())
				: undefined
			chatThreadsService.approveFlowReview(threadId, editedOutputs)
		} catch (e) { console.error('Error approving flow review:', e) }
	}, [chatThreadsService, flowOutputs, editedContents])

	const onReject = useCallback(() => {
		try {
			const threadId = chatThreadsService.state.currentThreadId
			chatThreadsService.rejectFlowReview(threadId)
		} catch (e) { console.error('Error rejecting flow review:', e) }
	}, [chatThreadsService])

	return (
		<div className={`${isCheckpointGhost ? 'opacity-50 pointer-events-none' : ''} my-1.5`}>
			{/* Accordion: 各フロー出力を 1 件ずつ折りたためる */}
			<div className='flex flex-col gap-1.5'>
				{flowOutputs.map((o, i) => {
					const role = (o.role || '').toString().toLowerCase()
					const roleLabel = flowRoleLabel[role] ?? o.role
					const value = editedContents[o.mdFileName] ?? o.mdContent
					return (
						<CollapsibleFlowCard
							key={o.mdFileName}
							title={o.mdFileName}
							roleLabel={roleLabel}
							defaultOpen={false}
						>
							{status === 'pending' && isEditing ? (
								<textarea
									className='w-full min-h-[160px] p-2 text-[12px] font-mono bg-void-bg-1 text-void-fg-2 border border-void-border-1 rounded resize-y outline-none'
									value={value}
									onChange={(e) => {
										setEditedContents(prev => ({ ...prev, [o.mdFileName]: e.target.value }))
									}}
								/>
							) : (
								<SmallProseWrapper>
									<ChatMarkdownRender
										string={value}
										chatMessageLocation={{ threadId: chatThreadsService.state.currentThreadId, messageIdx: 0 }}
										isApplyEnabled={true}
										isLinkDetectionEnabled={true}
									/>
								</SmallProseWrapper>
							)}
						</CollapsibleFlowCard>
					)
				})}
			</div>

			{/* Progress */}
			<div className='text-void-fg-4 text-[10px] py-0.5'>{currentIdx + 1}/{totalTasks}</div>

			{/* Actions */}
			{status === 'pending' && (
				<div className='flex gap-2 pt-1'>
					<button
						onClick={onApprove}
						className='text-[12px] text-void-fg-3 hover:text-void-fg-1 cursor-pointer'
					>
						承認して実行
					</button>
					<span className='text-void-fg-4 text-[12px]'>|</span>
					<button
						onClick={() => setIsEditing(!isEditing)}
						className='text-[12px] text-void-fg-3 hover:text-void-fg-1 cursor-pointer'
					>
						{isEditing ? 'プレビュー' : '編集'}
					</button>
					<span className='text-void-fg-4 text-[12px]'>|</span>
					<button
						onClick={onReject}
						className='text-[12px] text-void-fg-3 hover:text-void-fg-1 cursor-pointer'
					>
						やり直す
					</button>
				</div>
			)}
			{status === 'approved' && (
				<div className='text-[11px] text-void-fg-4'>承認済み</div>
			)}
			{status === 'rejected' && (
				<div className='text-[11px] text-void-fg-4'>却下</div>
			)}
		</div>
	)
}

// 現在のスレッドの全メッセージを人間可読なプレーンテキストへ整形する。
const formatChatThreadAsText = (messages: ChatMessage[] | undefined): string => {
	if (!messages || messages.length === 0) return ''
	const lines: string[] = []
	for (const m of messages) {
		switch (m.role) {
			case 'user': {
				const body = (m.displayContent || m.content || '').trim()
				if (!body) break
				lines.push(`## User`, body, '')
				break
			}
			case 'assistant': {
				const body = (m.displayContent || '').trim()
				const reasoning = (m.reasoning || '').trim()
				if (!body && !reasoning) break
				lines.push(`## Assistant`)
				if (reasoning) {
					lines.push(`<thinking>`, reasoning, `</thinking>`, '')
				}
				if (body) lines.push(body, '')
				break
			}
			case 'tool': {
				const name = m.name ?? 'tool'
				let body = ''
				if (m.type === 'success') body = typeof m.result === 'string' ? m.result : JSON.stringify(m.result)
				else if (m.type === 'tool_error') body = m.result ?? ''
				else if (m.type === 'rejected') body = '(rejected by user)'
				else if (m.type === 'invalid_params' || m.type === 'tool_request' || m.type === 'running_now') body = m.content ?? ''
				lines.push(`## Tool (${name})`)
				if (body.trim()) lines.push(body.trim())
				lines.push('')
				break
			}
			case 'flow_review': {
				lines.push(`## Flow Review (${m.flowRole})`, `- status: ${m.status}`, `- file: ${m.mdFileName}`, '')
				if (m.mdContent?.trim()) {
					lines.push(m.mdContent.trim(), '')
				}
				break
			}
			// checkpoint / interrupted_streaming_tool: 内部情報のため含めない
			default:
				break
		}
	}
	return lines.join('\n').trim() + '\n'
}


const CommandBarInChat = () => {
	const { stateOfURI: commandBarStateOfURI, sortedURIs: sortedCommandBarURIs } = useCommandBarState()
	const numFilesChanged = sortedCommandBarURIs.length

	const accessor = useAccessor()
	const editCodeService = accessor.get('IEditCodeService')
	const commandService = accessor.get('ICommandService')
	const clipboardService = accessor.get('IClipboardService')
	const chatThreadsService = accessor.get('IChatThreadService')
	const chatThreadsState = useChatThreadsState()
	const commandBarState = useCommandBarState()
	const chatThreadsStreamState = useChatThreadsStreamState(chatThreadsState.currentThreadId)

	const [copyChatFeedback, setCopyChatFeedback] = useState<'idle' | 'copied' | 'error'>('idle')

	useEffect(() => {
		if (copyChatFeedback === 'idle') return
		const t = setTimeout(() => setCopyChatFeedback('idle'), 1500)
		return () => clearTimeout(t)
	}, [copyChatFeedback])

	const onCopyChatLog = useCallback(async () => {
		const threadId = chatThreadsService.state.currentThreadId
		const thread = threadId ? chatThreadsState.allThreads[threadId] : undefined
		const text = formatChatThreadAsText(thread?.messages)
		if (!text.trim()) {
			setCopyChatFeedback('error')
			return
		}
		try {
			await clipboardService.writeText(text)
			setCopyChatFeedback('copied')
		} catch {
			setCopyChatFeedback('error')
		}
	}, [chatThreadsService, chatThreadsState, clipboardService])

	const [fileDetailsOpenedState, setFileDetailsOpenedState] = useState<'auto-opened' | 'auto-closed' | 'user-opened' | 'user-closed'>('auto-closed');
	const isFileDetailsOpened = fileDetailsOpenedState === 'auto-opened' || fileDetailsOpenedState === 'user-opened';


	useEffect(() => {
		// close the file details if there are no files
		// this converts 'user-closed' to 'auto-closed'
		if (numFilesChanged === 0) {
			setFileDetailsOpenedState('auto-closed')
		}
		// open the file details if it hasnt been closed
		if (numFilesChanged > 0 && fileDetailsOpenedState !== 'user-closed') {
			setFileDetailsOpenedState('auto-opened')
		}
	}, [fileDetailsOpenedState, setFileDetailsOpenedState, numFilesChanged])


	const isFinishedMakingThreadChanges = (
		// there are changed files
		commandBarState.sortedURIs.length !== 0
		// none of the files are streaming
		&& commandBarState.sortedURIs.every(uri => !commandBarState.stateOfURI[uri.fsPath]?.isStreaming)
	)

	// ======== status of agent ========
	// This icon answers the question "is the LLM doing work on this thread?"
	// assume it is single threaded for now
	// green = Running
	// orange = Requires action
	// dark = Done

	const threadStatus = (
		chatThreadsStreamState?.isRunning === 'awaiting_user' ? { title: '承認待ち', color: 'yellow', } as const
			: chatThreadsStreamState?.isRunning ? { title: '実行中', color: 'orange', } as const
				: { title: '完了', color: 'dark', } as const
	)


	const threadStatusHTML = <StatusIndicator className='mx-1' indicatorColor={threadStatus.color} title={threadStatus.title} />


	// ======== info about changes ========
	// num files changed
	// acceptall + rejectall
	// popup info about each change (each with num changes + acceptall + rejectall of their own)

	const numFilesChangedStr = numFilesChanged === 0 ? '変更されたファイルはありません'
		: `${sortedCommandBarURIs.length}件の変更されたファイル`




	const acceptRejectAllButtons = <div
		// do this with opacity so that the height remains the same at all times
		className={`flex items-center gap-0.5
			${isFinishedMakingThreadChanges ? '' : 'opacity-0 pointer-events-none'}`
		}
	>
		<IconShell1 // RejectAllButtonWrapper
			// text="Reject All"
			// className="text-xs"
			Icon={X}
			onClick={() => {
				sortedCommandBarURIs.forEach(uri => {
					editCodeService.acceptOrRejectAllDiffAreas({
						uri,
						removeCtrlKs: true,
						behavior: "reject",
						_addToHistory: true,
					});
				});
			}}
			data-tooltip-id='void-tooltip'
			data-tooltip-place='top'
			data-tooltip-content='すべて拒否'
		/>

		<IconShell1 // AcceptAllButtonWrapper
			// text="Accept All"
			// className="text-xs"
			Icon={Check}
			onClick={() => {
				sortedCommandBarURIs.forEach(uri => {
					editCodeService.acceptOrRejectAllDiffAreas({
						uri,
						removeCtrlKs: true,
						behavior: "accept",
						_addToHistory: true,
					});
				});
			}}
			data-tooltip-id='void-tooltip'
			data-tooltip-place='top'
			data-tooltip-content='すべて承認'
		/>



	</div>


	// !select-text cursor-auto
	const fileDetailsContent = <div className="px-2 gap-1 w-full overflow-y-auto">
		{sortedCommandBarURIs.map((uri, i) => {
			const basename = getBasename(uri.fsPath)

			const { sortedDiffIds, isStreaming } = commandBarStateOfURI[uri.fsPath] ?? {}
			const isFinishedMakingFileChanges = !isStreaming

			const numDiffs = sortedDiffIds?.length || 0

			const fileStatus = (isFinishedMakingFileChanges
				? { title: '完了', color: 'dark', } as const
				: { title: '実行中', color: 'orange', } as const
			)

			const fileNameHTML = <div
				className="flex items-center gap-1.5 text-void-fg-3 hover:brightness-125 transition-all duration-200 cursor-pointer"
				onClick={() => voidOpenFileFn(uri, accessor)}
			>
				{/* <FileIcon size={14} className="text-void-fg-3" /> */}
				<span className="text-void-fg-3">{basename}</span>
			</div>




			const detailsContent = <div className='flex px-4'>
				<span className="text-void-fg-3 opacity-80">{numDiffs} diff{numDiffs !== 1 ? 's' : ''}</span>
			</div>

			const acceptRejectButtons = <div
				// do this with opacity so that the height remains the same at all times
				className={`flex items-center gap-0.5
					${isFinishedMakingFileChanges ? '' : 'opacity-0 pointer-events-none'}
				`}
			>
				{/* <JumpToFileButton
					uri={uri}
					data-tooltip-id='void-tooltip'
					data-tooltip-place='top'
					data-tooltip-content='Go to file'
				/> */}
				<IconShell1 // RejectAllButtonWrapper
					Icon={X}
					onClick={() => { editCodeService.acceptOrRejectAllDiffAreas({ uri, removeCtrlKs: true, behavior: "reject", _addToHistory: true, }); }}
					data-tooltip-id='void-tooltip'
					data-tooltip-place='top'
					data-tooltip-content='ファイルを拒否'

				/>
				<IconShell1 // AcceptAllButtonWrapper
					Icon={Check}
					onClick={() => { editCodeService.acceptOrRejectAllDiffAreas({ uri, removeCtrlKs: true, behavior: "accept", _addToHistory: true, }); }}
					data-tooltip-id='void-tooltip'
					data-tooltip-place='top'
					data-tooltip-content='ファイルを承認'
				/>

			</div>

			const fileStatusHTML = <StatusIndicator className='mx-1' indicatorColor={fileStatus.color} title={fileStatus.title} />

			return (
				// name, details
				<div key={i} className="flex justify-between items-center">
					<div className="flex items-center">
						{fileNameHTML}
						{detailsContent}
					</div>
					<div className="flex items-center gap-2">
						{acceptRejectButtons}
						{fileStatusHTML}
					</div>
				</div>
			)
		})}
	</div>

	const fileDetailsButton = (
		<button
			className={`flex items-center gap-1 rounded ${numFilesChanged === 0 ? 'cursor-pointer' : 'cursor-pointer hover:brightness-125 transition-all duration-200'}`}
			onClick={() => isFileDetailsOpened ? setFileDetailsOpenedState('user-closed') : setFileDetailsOpenedState('user-opened')}
			type='button'
			disabled={numFilesChanged === 0}
		>
			<svg
				className="transition-transform duration-200 size-3.5"
				style={{
					transform: isFileDetailsOpened ? 'rotate(0deg)' : 'rotate(180deg)',
					transition: 'transform 0.2s cubic-bezier(0.25, 0.1, 0.25, 1)'
				}}
				xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"></polyline>
			</svg>
			{numFilesChangedStr}
		</button>
	)

	return (
		<>
			{/* file details */}
			<div className='px-2'>
				<div
					className={`
						select-none
						flex w-full rounded-t-lg bg-void-bg-3
						text-void-fg-3 text-xs text-nowrap

						overflow-hidden transition-all duration-200 ease-in-out
						${isFileDetailsOpened ? 'max-h-24' : 'max-h-0'}
					`}
				>
					{fileDetailsContent}
				</div>
			</div>
			{/* main content */}
			<div
				className={`
					select-none
					flex w-full rounded-t-lg bg-void-bg-3
					text-void-fg-3 text-xs text-nowrap
					border-t border-l border-r border-zinc-300/10

					px-2 py-1
					justify-between
				`}
			>
				<div className="flex gap-2 items-center">
					{fileDetailsButton}
				</div>
				<div className="flex gap-2 items-center">
					<IconShell1
						Icon={copyChatFeedback === 'copied' ? Check : copyChatFeedback === 'error' ? X : CopyIcon}
						onClick={onCopyChatLog}
						data-tooltip-id='void-tooltip'
						data-tooltip-place='top'
						data-tooltip-content={
							copyChatFeedback === 'copied' ? 'コピーしました' :
								copyChatFeedback === 'error' ? 'コピーできませんでした' :
									'チャットログをコピー'
						}
					/>
					{acceptRejectAllButtons}
					{threadStatusHTML}
				</div>
			</div>
		</>
	)
}



const EditToolSoFar = ({ toolCallSoFar, }: { toolCallSoFar: RawToolCallObj }) => {
	// Rules of Hooks: フックは早期 return より前に呼び出す。
	const accessor = useAccessor()

	if (!isABuiltinToolName(toolCallSoFar.name)) return null

	const uri = toolCallSoFar.rawParams.uri ? URI.file(toolCallSoFar.rawParams.uri) : undefined

	const title = titleOfBuiltinToolName[toolCallSoFar.name].proposed

	const uriDone = toolCallSoFar.doneParams.includes('uri')
	const desc1 = <span className='flex items-center'>
		{uriDone ?
			getBasename(toolCallSoFar.rawParams['uri'] ?? 'unknown')
			: `Generating`}
		<IconLoading />
	</span>

	const desc1OnClick = () => { uri && voidOpenFileFn(uri, accessor) }

	// If URI has not been specified
	return <ToolHeaderWrapper
		title={title}
		desc1={desc1}
		desc1OnClick={desc1OnClick}
	>
		<EditToolChildren
			uri={uri}
			code={toolCallSoFar.rawParams.search_replace_blocks ?? toolCallSoFar.rawParams.new_content ?? ''}
			type={'rewrite'} // as it streams, show in rewrite format, don't make a diff editor
		/>
		<IconLoading />
	</ToolHeaderWrapper>

}


const SignedOutChatOverlay = ({ onLoginClick }: { onLoginClick: () => void }) => {
	return (
		<div
			className="absolute inset-0 z-10 flex flex-col items-center justify-center p-4 text-center rounded-xl border border-void-border-3 gap-3 overflow-hidden"
			style={{
				background: 'radial-gradient(circle at 50% 30%, color-mix(in srgb, var(--vscode-focusBorder) 10%, transparent) 0%, color-mix(in srgb, var(--void-bg-1) 80%, transparent) 70%)',
				backdropFilter: 'blur(6px)',
				WebkitBackdropFilter: 'blur(6px)',
			}}
		>
			<div className='absolute inset-0 pointer-events-none opacity-30'
				style={{ background: 'repeating-linear-gradient(45deg, transparent, transparent 10px, color-mix(in srgb, var(--vscode-focusBorder) 8%, transparent) 10px, color-mix(in srgb, var(--vscode-focusBorder) 8%, transparent) 11px)' }}
			/>
			<div className='relative z-10 flex flex-col items-center gap-3'>
				<div className='w-10 h-10 rounded-full flex items-center justify-center'
					style={{
						background: 'linear-gradient(135deg, var(--vscode-focusBorder), color-mix(in srgb, var(--vscode-focusBorder) 50%, transparent))',
						boxShadow: '0 4px 16px color-mix(in srgb, var(--vscode-focusBorder) 40%, transparent)',
					}}>
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
						<path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
						<path d="M8 11V7a4 4 0 118 0v4" />
					</svg>
				</div>
				<div className="text-xs font-medium text-void-fg-1 tracking-wide">チャットを開始するにはログインしてください</div>
				<button
					onClick={(e) => { e.stopPropagation(); onLoginClick(); }}
					className="px-5 py-1.5 rounded-full text-[11px] font-bold transition-all duration-200 hover:scale-105 active:scale-95"
					style={{
						background: 'linear-gradient(135deg, #ffffff 0%, #e4e4e7 100%)',
						color: '#000',
						boxShadow: '0 4px 14px rgba(255,255,255,0.25), inset 0 1px 0 rgba(255,255,255,0.9)',
					}}
				>
					ログイン
				</button>
			</div>
		</div>
	)
}

// Reusable section label with decorative gradient line
const SectionLabel = ({ label }: { label: string }) => {
	return (
		<div className='pt-8 mb-3 flex items-center gap-2 select-none pointer-events-none'>
			<span className='text-[11px] uppercase tracking-[0.15em] font-semibold text-void-fg-3'>{label}</span>
			<div className='flex-1 h-px bg-gradient-to-r from-void-border-1 via-void-border-2 to-transparent' />
		</div>
	)
}

// Inject keyframes once for landing page suggestion animations
const SidebarChatGlobalStyles = () => (
	<style>{`
		@keyframes fadeInUp {
			0% { opacity: 0; transform: translateY(6px); }
			100% { opacity: 1; transform: translateY(0); }
		}
		@keyframes orchestraPulse {
			0%, 100% { opacity: 0.6; transform: scale(1); }
			50% { opacity: 1; transform: scale(1.15); }
		}
	`}</style>
)


// ─── Theme Switcher ──────────────────────────────────────
// 3 つのテーマ (Light / Dark / Sun Red) をサイクル切替するボタン。
// 内部的には VS Code 設定 `workbench.colorTheme` を更新するだけ。
type OrchestraThemeMode = 'light' | 'dark' | 'sunRed'
const ORCHESTRA_THEME_NAMES: Record<OrchestraThemeMode, string> = {
	light: 'Orchestra Light',
	dark: 'Orchestra Dark',
	sunRed: 'Sun Red',
}
const ORCHESTRA_THEME_LABELS: Record<OrchestraThemeMode, string> = {
	light: 'ライト',
	dark: 'ダーク',
	sunRed: 'サンレッド',
}
const ORCHESTRA_THEME_ORDER: OrchestraThemeMode[] = ['light', 'dark', 'sunRed']

export const detectOrchestraTheme = (currentName: string | undefined): OrchestraThemeMode => {
	if (!currentName) return 'dark'
	if (currentName === ORCHESTRA_THEME_NAMES.sunRed) return 'sunRed'
	if (currentName === ORCHESTRA_THEME_NAMES.light || currentName.toLowerCase().includes('light')) return 'light'
	return 'dark'
}

export const OrchestraThemeSwitcher = ({ compact }: { compact?: boolean }) => {
	const accessor = useAccessor()
	const configurationService = accessor.get('IConfigurationService') as any
	// VS Code 設定が変更されたら再描画したいので useState + listener
	const initialName = (configurationService.getValue('workbench.colorTheme') as string | undefined) ?? ''
	const [currentName, setCurrentName] = useState<string>(initialName)
	useEffect(() => {
		const d = configurationService.onDidChangeConfiguration?.((e: any) => {
			if (e?.affectsConfiguration?.('workbench.colorTheme')) {
				setCurrentName((configurationService.getValue('workbench.colorTheme') as string | undefined) ?? '')
			}
		})
		return () => { d?.dispose?.() }
	}, [configurationService])

	const current = detectOrchestraTheme(currentName)
	const apply = useCallback(async (mode: OrchestraThemeMode) => {
		try {
			await configurationService.updateValue('workbench.colorTheme', ORCHESTRA_THEME_NAMES[mode])
		} catch (e) { console.error('Failed to set theme:', e) }
	}, [configurationService])

	const iconOf = (mode: OrchestraThemeMode) => {
		if (mode === 'light') return <Sun className='w-3.5 h-3.5' />
		if (mode === 'dark') return <Moon className='w-3.5 h-3.5' />
		return <Flame className='w-3.5 h-3.5' />
	}

	if (compact) {
		// サイドバーヘッダー用: 1 ボタン (アイコンだけ) で次のテーマへサイクル切替。
		const nextMode = ORCHESTRA_THEME_ORDER[(ORCHESTRA_THEME_ORDER.indexOf(current) + 1) % ORCHESTRA_THEME_ORDER.length]
		return (
			<button
				onClick={() => apply(nextMode)}
				title={`テーマ: ${ORCHESTRA_THEME_LABELS[current]} → ${ORCHESTRA_THEME_LABELS[nextMode]}`}
				className='text-void-fg-3 hover:text-void-fg-1 transition-colors p-1 rounded-md hover:bg-void-bg-3'
			>
				{iconOf(current)}
			</button>
		)
	}

	return (
		<div className='inline-flex items-center rounded-md border border-void-border-2 bg-void-bg-2/60 p-0.5'>
			{ORCHESTRA_THEME_ORDER.map(mode => {
				const isActive = mode === current
				return (
					<button
						key={mode}
						onClick={() => apply(mode)}
						className={`flex items-center gap-1.5 px-2 py-1 text-[12px] rounded transition-colors ${
							isActive
								? 'bg-void-bg-3 text-void-fg-1 shadow-sm'
								: 'text-void-fg-3 hover:text-void-fg-1 hover:bg-void-bg-3/60'
						}`}
						title={ORCHESTRA_THEME_LABELS[mode]}
					>
						{iconOf(mode)}
						<span>{ORCHESTRA_THEME_LABELS[mode]}</span>
					</button>
				)
			})}
		</div>
	)
}

// アップデートが利用可能な場合のみサイドバー上部に表示する小さいバナー
// (一度ユーザーが「あとで」を押したら、そのバージョンに対しては再表示しない)
const ORCHESTRA_DISMISSED_UPDATE_KEY = 'orchestra.updateBannerDismissedTag'
const OrchestraUpdateBanner: React.FC = () => {
	const accessor = useAccessor()
	const openerService = accessor.get('IOpenerService')
	const commandService = accessor.get('ICommandService') as ICommandService
	const storageService = accessor.get('IStorageService')
	const updateState = useOrchestraUpdateState()

	const info = updateState.kind === 'ok' || updateState.kind === 'downloading' || updateState.kind === 'downloaded' || updateState.kind === 'installing'
		? updateState.info
		: null
	const isDownloading = updateState.kind === 'downloading'
	const isDownloaded = updateState.kind === 'downloaded'
	const isInstalling = updateState.kind === 'installing'
	const dismissedTag = (() => {
		try { return storageService.get(ORCHESTRA_DISMISSED_UPDATE_KEY, StorageScope.APPLICATION) ?? null }
		catch { return null }
	})()

	const [isDismissed, setIsDismissed] = useState(false)
	useEffect(() => {
		if (info?.tagName && dismissedTag === info.tagName) setIsDismissed(true)
		else setIsDismissed(false)
	}, [info?.tagName, dismissedTag])

	if (!info || !info.hasUpdate || (isDismissed && !isDownloading && !isDownloaded && !isInstalling)) return null

	const onOpen = () => openerService.open(URI.parse(info.htmlUrl))
	const onSettings = () => commandService.executeCommand(VOID_OPEN_SETTINGS_ACTION_ID)
	const onDismiss = () => {
		try { storageService.store(ORCHESTRA_DISMISSED_UPDATE_KEY, info.tagName, StorageScope.APPLICATION, StorageTarget.USER) }
		catch { /* ignore storage errors */ }
		setIsDismissed(true)
	}

	return (
		<div className='shrink-0 px-3 py-2 border-b border-amber-500/30 bg-amber-500/10'>
			<div className='flex items-center gap-2'>
				{isDownloading || isInstalling ? (
					<Loader2 className='w-3.5 h-3.5 text-amber-400 flex-shrink-0 animate-spin' />
				) : (
					<DownloadIcon className='w-3.5 h-3.5 text-amber-400 flex-shrink-0' />
				)}
				<div className='flex-1 min-w-0'>
					<div className='text-[12px] text-void-fg-1 leading-tight'>
						{isInstalling ? 'インストールを準備しています…'
							: isDownloaded ? `${info.tagName} の準備ができました`
								: isDownloading ? `${info.tagName} をダウンロード中…`
									: <>新バージョン <span className='font-semibold'>{info.tagName}</span> が利用可能</>}
					</div>
					<div className='text-[10px] text-void-fg-3 truncate'>
						現在: v{info.currentVersion}
					</div>
				</div>
				{!isDownloading && !isInstalling && (
					<button
						onClick={isDownloaded ? onSettings : onOpen}
						className='flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 transition-colors'
						title={isDownloaded ? 'Settings の Updates タブから再起動してインストールする' : 'GitHub のリリースページを開く'}
					>
						<ExternalLinkIcon className='w-3 h-3' />
						{isDownloaded ? 'インストール' : '開く'}
					</button>
				)}
				<button
					onClick={onSettings}
					className='text-[11px] px-2 py-0.5 rounded text-void-fg-3 hover:text-void-fg-1 hover:bg-void-bg-3 transition-colors'
					title='Settings の Updates タブで詳細を見る'
				>
					詳細
				</button>
				{!isDownloading && !isDownloaded && !isInstalling && (
					<button
						onClick={onDismiss}
						className='p-0.5 rounded text-void-fg-3 hover:text-void-fg-1 hover:bg-void-bg-3 transition-colors'
						title='このバージョンの通知を非表示にする'
					>
						<X className='w-3 h-3' />
					</button>
				)}
			</div>
		</div>
	)
}


const SidebarHeader = ({ onLoginClick }: { onLoginClick: () => void }) => {
	const accessor = useAccessor()
	const commandService = accessor.get('ICommandService') as ICommandService
	const settingsService = accessor.get('IVoidSettingsService')
	const settingsState = useSettingsState()
	const isLoggedIn = settingsState.globalSettings.isLoggedIn

	return (
		<div className="shrink-0 px-4 pt-2 pb-1.5 border-b border-void-border-3/60 bg-gradient-to-b from-void-bg-1 to-transparent">
			<div className="flex items-center justify-end gap-2">

				<OrchestraThemeSwitcher compact />

				{!isLoggedIn ? (
					<button
						onClick={onLoginClick}
						className="text-[11px] font-medium px-2 py-0.5 rounded bg-white text-black hover:bg-zinc-200 transition-colors"
					>
						ログイン
					</button>
				) : (
					<button
						onClick={() => {
							settingsService.setGlobalSetting('isLoggedIn', false)
							settingsService.setGlobalSetting('divisionUserId', '')
							settingsService.setGlobalSetting('divisionUserEmail', '')
							settingsService.setGlobalSetting('divisionAccessToken', '')
							settingsService.setGlobalSetting('divisionRefreshToken', '')
							settingsService.setGlobalSetting('divisionApiKey', '')
						}}
						className="text-[11px] font-medium px-2 py-0.5 rounded text-void-fg-3 hover:text-void-fg-1 transition-colors"
					>
						サインアウト
					</button>
				)}

				<button
					onClick={() => commandService.executeCommand(VOID_OPEN_SETTINGS_ACTION_ID)}
					className="text-void-fg-3 hover:text-void-fg-1 hover:rotate-45 transition-all duration-300 ease-out p-1 rounded-md hover:bg-void-bg-3"
					title="Settings"
				>
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
						<circle cx="12" cy="12" r="3" />
						<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
					</svg>
				</button>
				</div>
			</div>
		
	)
}


// 「キューに追加」されたユーザーメッセージのリスト表示。
// 入力欄の真上に出して、現在の応答が終わると上から順に自動送信される旨をユーザーに示す。
type QueueListItem = { id: string; text: string; selections: StagingSelectionItem[] }
const MessageQueueList = ({
	items,
	onRemove,
	onClear,
}: {
	items: QueueListItem[]
	onRemove: (id: string) => void
	onClear: () => void
}) => {
	if (items.length === 0) return null
	return (
		<div className='mb-1 rounded-md border border-void-border-2 bg-void-bg-2/70 overflow-hidden'>
			<div className='flex items-center gap-1.5 px-2 py-1 border-b border-void-border-2/60'>
				<ListPlus className='h-3 w-3 text-void-fg-3 flex-shrink-0' />
				<span className='text-[11px] text-void-fg-2 font-medium flex-1'>
					キュー <span className='text-void-fg-4'>({items.length})</span>
				</span>
				<button
					type='button'
					onClick={onClear}
					className='text-[10px] text-void-fg-4 hover:text-void-fg-1 transition-colors px-1 py-0.5 rounded hover:bg-void-bg-3'
					title='すべてキャンセル'
				>
					すべて削除
				</button>
			</div>
			<ul className='divide-y divide-void-border-2/40 max-h-[140px] overflow-y-auto'>
				{items.map((item, idx) => {
					const oneLine = item.text.replace(/\s+/g, ' ').trim()
					const preview = oneLine.length > 80 ? oneLine.slice(0, 80) + '…' : oneLine
					const selCount = item.selections?.length ?? 0
					return (
						<li
							key={item.id}
							className='flex items-center gap-1.5 px-2 py-1 hover:bg-void-bg-3/40 transition-colors'
						>
							<span className='text-[10px] text-void-fg-4 w-4 text-right flex-shrink-0'>{idx + 1}.</span>
							<span
								className='text-[12px] text-void-fg-2 truncate flex-1 min-w-0'
								title={item.text}
							>
								{preview || '(空のメッセージ)'}
							</span>
							{selCount > 0 && (
								<span
									className='text-[10px] text-void-fg-4 px-1 py-0.5 rounded bg-void-bg-3 border border-void-border-2 flex-shrink-0'
									title={`${selCount} 件の選択を含む`}
								>
									+{selCount}
								</span>
							)}
							<button
								type='button'
								onClick={() => onRemove(item.id)}
								className='p-0.5 rounded text-void-fg-4 hover:text-void-fg-1 hover:bg-void-bg-3 transition-colors flex-shrink-0'
								title='このキューを削除'
							>
								<X className='h-3 w-3' />
							</button>
						</li>
					)
				})}
			</ul>
		</div>
	)
}

export const SidebarChat = ({ viewOverride }: { viewOverride?: React.ReactNode }) => {
	const textAreaRef = useRef<HTMLTextAreaElement | null>(null)
	const textAreaFnsRef = useRef<TextAreaFns | null>(null)

	const accessor = useAccessor()
	const commandService = accessor.get('ICommandService')
	const chatThreadsService = accessor.get('IChatThreadService')

	const settingsState = useSettingsState()
	const { t: tUI } = useTranslation()
	// ----- HIGHER STATE -----

	// threads state
	const [showLoginScreen, setShowLoginScreen] = useState(false);

	const chatThreadsState = useChatThreadsState()

	const currentThread = chatThreadsService.getCurrentThread()
	const previousMessages = currentThread?.messages ?? []

	const selections = currentThread.state.stagingSelections
	const setSelections = (s: StagingSelectionItem[]) => { chatThreadsService.setCurrentThreadState({ stagingSelections: s }) }

	// stream state
	const currThreadStreamState = useChatThreadsStreamState(chatThreadsState.currentThreadId)
	const isRunning = currThreadStreamState?.isRunning
	const latestError = currThreadStreamState?.error
	const { displayContentSoFar, toolCallSoFar, reasoningSoFar } = currThreadStreamState?.llmInfo ?? {}

	// this is just if it's currently being generated, NOT if it's currently running
	const toolIsGenerating = toolCallSoFar && !toolCallSoFar.isDone // show loading for slow tools (right now just edit)

	// ----- SIDEBAR CHAT state (local) -----

	// state of current message
	const initVal = ''
	const [instructionsAreEmpty, setInstructionsAreEmpty] = useState(!initVal)

	const isDisabled = instructionsAreEmpty || !!isFeatureNameDisabled('Chat', settingsState)

	// ----- メッセージキュー (per-thread) -----
	// 生成中に「キューに追加」したプロンプトを溜めておき、
	// 現在の応答が終わったら自動で順番に送信する。
	// staging selections はキュー追加時点でスナップショットを取り、
	// 送信時に渡すことで「いま貼った文脈で後で送る」が成立する。
	type QueuedMessage = {
		id: string;
		text: string;
		selections: StagingSelectionItem[];
	}
	const [queuesByThread, setQueuesByThread] = useState<Record<string, QueuedMessage[]>>({})
	const currentQueue: QueuedMessage[] = queuesByThread[currentThread.id] ?? []

	const updateQueueForThread = useCallback((threadId: string, updater: (prev: QueuedMessage[]) => QueuedMessage[]) => {
		setQueuesByThread(prev => {
			const next = updater(prev[threadId] ?? [])
			return { ...prev, [threadId]: next }
		})
	}, [])

	const sidebarRef = useRef<HTMLDivElement>(null)
	const scrollContainerRef = useRef<HTMLDivElement | null>(null)

	// 実際にユーザーメッセージを送る共通処理 (textArea/staging のクリアつき)
	const sendUserMessageImmediately = useCallback(async (
		threadId: string,
		userMessage: string,
		_chatSelections?: StagingSelectionItem[],
	) => {
		try {
			await chatThreadsService.addUserMessageAndStreamResponse({ userMessage, _chatSelections, threadId })
		} catch (e) {
			console.error('Error while sending message in chat:', e)
		}
	}, [chatThreadsService])

	const onSubmit = useCallback(async (_forceSubmit?: string) => {

		if (isDisabled && !_forceSubmit) return

		const threadId = chatThreadsService.state.currentThreadId
		const userMessage = _forceSubmit || textAreaRef.current?.value || ''
		if (!userMessage.trim()) return

		// 入力欄と staging を即クリア (UX 上、押した瞬間に空にする)
		const snapshotSelections = selections.slice()
		setSelections([])
		textAreaFnsRef.current?.setValue('')
		textAreaRef.current?.focus()

		await sendUserMessageImmediately(threadId, userMessage, snapshotSelections)
	}, [chatThreadsService, isDisabled, textAreaRef, textAreaFnsRef, setSelections, selections, sendUserMessageImmediately])

	// 「キューに追加」: 実行中に呼ばれる。 入力欄は即クリアし、
	// 後で isRunning が落ちた瞬間に順次送る。
	const onQueue = useCallback(() => {
		if (isDisabled) return
		const threadId = chatThreadsService.state.currentThreadId
		const userMessage = textAreaRef.current?.value || ''
		if (!userMessage.trim()) return

		const snapshotSelections = selections.slice()
		const item: QueuedMessage = {
			id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
			text: userMessage,
			selections: snapshotSelections,
		}
		updateQueueForThread(threadId, prev => [...prev, item])

		// 入力欄 / staging をクリアして次のキュー待ち状態へ
		setSelections([])
		textAreaFnsRef.current?.setValue('')
		textAreaRef.current?.focus()
	}, [isDisabled, chatThreadsService, textAreaRef, textAreaFnsRef, setSelections, selections, updateQueueForThread])

	// isRunning が「真→偽」に変わった瞬間 + キューに残りがある場合、
	// 先頭を取り出して自動送信する。
	const prevIsRunningRef = useRef<typeof isRunning>(isRunning)
	useEffect(() => {
		const wasRunning = !!prevIsRunningRef.current
		const nowRunning = !!isRunning
		prevIsRunningRef.current = isRunning

		if (wasRunning && !nowRunning) {
			const threadId = currentThread.id
			const queue = queuesByThread[threadId] ?? []
			if (queue.length === 0) return
			const [next, ...rest] = queue
			updateQueueForThread(threadId, () => rest)
			// fire-and-forget; sendUserMessageImmediately 内で例外は握り潰している
			void sendUserMessageImmediately(threadId, next.text, next.selections)
		}
	}, [isRunning, currentThread.id, queuesByThread, updateQueueForThread, sendUserMessageImmediately])

	const onRemoveQueueItem = useCallback((id: string) => {
		const threadId = currentThread.id
		updateQueueForThread(threadId, prev => prev.filter(q => q.id !== id))
	}, [currentThread.id, updateQueueForThread])

	const onClearQueue = useCallback(() => {
		const threadId = currentThread.id
		updateQueueForThread(threadId, () => [])
	}, [currentThread.id, updateQueueForThread])

	const onAbort = async () => {
		const threadId = currentThread.id
		await chatThreadsService.abortRunning(threadId)
		// abort したらキューも一緒に流したいケースがあるので、ユーザーが明示的に
		// 残せるよう「キューも消すかどうか」は触らない。
	}

	const keybindingString = accessor.get('IKeybindingService').lookupKeybinding(VOID_CTRL_L_ACTION_ID)?.getLabel()

	const threadId = currentThread.id
	const currCheckpointIdx = chatThreadsState.allThreads[threadId]?.state?.currCheckpointIdx ?? undefined  // if not exist, treat like checkpoint is last message (infinity)



	// resolve mount info
	const isResolved = chatThreadsState.allThreads[threadId]?.state.mountedInfo?.mountedIsResolvedRef.current
	useEffect(() => {
		if (isResolved) return
		chatThreadsState.allThreads[threadId]?.state.mountedInfo?._whenMountedResolver?.({
			textAreaRef: textAreaRef,
			scrollToBottom: () => scrollToBottom(scrollContainerRef),
			setInputText: (text: string) => {
				textAreaFnsRef.current?.setValue(text)
			},
		})

	}, [chatThreadsState, threadId, textAreaRef, scrollContainerRef, isResolved])




	// stable key 戦略: コミット済み・ストリーミング中ともに `msg-{idx}` をキーに使う。
	// こうすると「ストリーミング中バブル (idx=N)」と「ストリーム完了後にコミットされた
	// バブル (同じく idx=N)」が同一 React インスタンスとして再利用されるため、
	// isStreaming / isCommitted のプロップが真→偽に遷移する瞬間を子の useEffect が
	// 検知できる (= CSS トランジションで滑らかに「閉じる」アニメーションが走る)。
	const previousMessagesHTML = useMemo(() => {
		// const lastMessageIdx = previousMessages.findLastIndex(v => v.role !== 'checkpoint')
		// tool request shows up as Editing... if in progress
		return previousMessages.map((message, i) => {
			return <ChatBubble
				key={`msg-${i}`}
				currCheckpointIdx={currCheckpointIdx}
				chatMessage={message}
				messageIdx={i}
				isCommitted={true}
				chatIsRunning={isRunning}
				threadId={threadId}
				_scrollToBottom={() => scrollToBottom(scrollContainerRef)}
			/>
		})
	}, [previousMessages, threadId, currCheckpointIdx, isRunning])

	const streamingChatIdx = previousMessagesHTML.length
	const currStreamingMessageHTML = reasoningSoFar || displayContentSoFar || isRunning ?
		<ChatBubble
			key={`msg-${streamingChatIdx}`}
			currCheckpointIdx={currCheckpointIdx}
			chatMessage={{
				role: 'assistant',
				displayContent: displayContentSoFar ?? '',
				reasoning: reasoningSoFar ?? '',
				anthropicReasoning: null,
			}}
			messageIdx={streamingChatIdx}
			isCommitted={false}
			chatIsRunning={isRunning}

			threadId={threadId}
			_scrollToBottom={null}
		/> : null


	// the tool currently being generated
	const generatingTool = toolIsGenerating ?
		toolCallSoFar.name === 'edit_file' || toolCallSoFar.name === 'rewrite_file' ? <EditToolSoFar
			key={'curr-streaming-tool'}
			toolCallSoFar={toolCallSoFar}
		/>
			: null
		: null

	const messagesHTML = <ScrollToBottomContainer
		key={'messages' + chatThreadsState.currentThreadId} // force rerender on all children if id changes
		scrollContainerRef={scrollContainerRef}
		className={`
			flex flex-col
			px-4 py-4 space-y-4
			w-full
			overflow-x-hidden
			overflow-y-auto
			${previousMessagesHTML.length === 0 && !displayContentSoFar ? 'hidden' : ''}
		`}
		style={{ flex: '1 1 0', minHeight: 0 }}
	>
		<StickyStackProvider scrollRootRef={scrollContainerRef as React.MutableRefObject<HTMLElement | null>}>
			{/* previous messages */}
			{previousMessagesHTML}
			{currStreamingMessageHTML}

			{/* Generating tool */}
			{generatingTool}

			{/* Flow indicator - shows current agent workflow phase as a small caption */}
			<FlowIndicator
				messages={previousMessages}
				isRunning={isRunning}
				reasoningSoFar={reasoningSoFar}
				displayContentSoFar={displayContentSoFar}
			/>

			{/* loading indicator — a compact "typing" pill so the wait reads as the
			    assistant composing a reply rather than a bare row of dots. */}
			{isRunning === 'LLM' || isRunning === 'idle' && !toolIsGenerating ?
				<div className='void-bubble-in flex items-center'>
					<span
						className='inline-flex items-center gap-2 px-2.5 py-1.5 rounded-full text-void-fg-3'
						style={{
							background: 'color-mix(in srgb, var(--void-bg-2) 88%, transparent)',
							border: '1px solid color-mix(in srgb, var(--void-border-2) 70%, transparent)',
							boxShadow: '0 1px 2px rgba(0,0,0,0.10)',
						}}
					>
						<IconLoading className='text-[color:var(--vscode-focusBorder)]' />
						<span className='text-[11px] leading-none text-void-fg-3'>{tUI('chat.generating')}</span>
					</span>
				</div>
				: null}
		</StickyStackProvider>


	</ScrollToBottomContainer>

	const errorDisplayHTML = latestError === undefined ? null :
		<div className='px-2 my-1'>
			<ErrorDisplay
				message={latestError.message}
				fullError={latestError.fullError}
				onDismiss={() => { chatThreadsService.dismissStreamError(currentThread.id) }}
				showDismiss={true}
			/>

			<WarningBox className='text-sm my-2 mx-4' onClick={() => { commandService.executeCommand(VOID_OPEN_SETTINGS_ACTION_ID) }} text='Open settings' />
		</div>


	const onChangeText = useCallback((newStr: string) => {
		setInstructionsAreEmpty(!newStr)
	}, [setInstructionsAreEmpty])
	const onKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
			// 実行中なら通常の送信ではなく「キューに追加」へフォールバック (Cursor 風)
			if (isRunning) {
				onQueue()
			} else {
				onSubmit()
			}
		} else if (e.key === 'Escape' && isRunning) {
			onAbort()
		}
	}, [onSubmit, onQueue, onAbort, isRunning])

	const queueListHTML = currentQueue.length > 0 ? (
		<MessageQueueList
			items={currentQueue}
			onRemove={onRemoveQueueItem}
			onClear={onClearQueue}
		/>
	) : null

	const inputChatArea = <VoidChatArea
		featureName='Chat'
		onSubmit={() => onSubmit()}
		onAbort={onAbort}
		onQueue={onQueue}
		isStreaming={!!isRunning}
		isDisabled={isDisabled}
		showSelections={true}
		// showProspectiveSelections={previousMessagesHTML.length === 0}
		selections={selections}
		setSelections={setSelections}
		onClickAnywhere={() => { textAreaRef.current?.focus() }}
	>
		<VoidInputBox2
			enableAtToMention
			className={`min-h-[81px] px-0.5 py-0.5`}
			placeholder={isRunning
				? `${tUI('chat.inputPlaceholder.streamingPrefix')}${keybindingString ? `${tUI('chat.inputPlaceholder.streamingAddSelection').replace('{kb}', keybindingString)}` : ''}${tUI('chat.inputPlaceholder.streamingStop')}`
				: `${tUI('chat.inputPlaceholder.mention')}${keybindingString ? `${tUI('chat.inputPlaceholder.addSelection').replace('{kb}', keybindingString)}` : ''}${tUI('chat.inputPlaceholder.enterInstructions')}`}
			onChangeText={onChangeText}
			onKeyDown={onKeyDown}
			onFocus={() => { chatThreadsService.setCurrentlyFocusedMessageIdx(undefined) }}
			ref={textAreaRef}
			fnsRef={textAreaFnsRef}
			multiline={true}
		/>

	</VoidChatArea>


	const isLandingPage = previousMessages.length === 0


	const suggestedPrompts: { text: string; icon: React.ReactNode; hint: string }[] = [
		{ text: tUI('chat.suggested.summarize'), icon: <Folder size={14} />, hint: tUI('chat.suggested.summarize.hint') },
		{ text: tUI('chat.suggested.types'), icon: <Info size={14} />, hint: tUI('chat.suggested.types.hint') },
		{ text: tUI('chat.suggested.voidrules'), icon: <CirclePlus size={14} />, hint: tUI('chat.suggested.voidrules.hint') },
	]

	const initiallySuggestedPromptsHTML = <div className='flex flex-col gap-2 w-full select-none'>
		{suggestedPrompts.map(({ text, icon, hint }, index) => (
			<button
				key={index}
				type='button'
				onClick={() => onSubmit(text)}
				className='group relative w-full text-left rounded-lg overflow-hidden
					border border-void-border-2 hover:border-[color-mix(in_srgb,var(--vscode-focusBorder)_50%,var(--void-border-1)_50%)]
					bg-gradient-to-br from-void-bg-2 to-[color-mix(in_srgb,var(--void-bg-2)_92%,var(--vscode-focusBorder)_8%)]
					transition-all duration-300 ease-out
					hover:shadow-[0_4px_16px_-4px_color-mix(in_srgb,var(--vscode-focusBorder)_40%,transparent)]
					hover:-translate-y-[1px]
					cursor-pointer'
				style={{ animation: `fadeInUp 0.4s ease-out ${index * 80}ms both` }}
			>
				<div className='absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b from-transparent via-[var(--vscode-focusBorder)] to-transparent opacity-0 group-hover:opacity-80 transition-opacity duration-300' />
				<div className='flex items-center gap-3 px-3 py-2.5'>
					<div className='flex-shrink-0 w-7 h-7 rounded-md flex items-center justify-center
						bg-void-bg-3 text-void-fg-3
						group-hover:bg-[color-mix(in_srgb,var(--vscode-focusBorder)_20%,var(--void-bg-3)_80%)]
						group-hover:text-void-fg-1
						transition-all duration-300'>
						{icon}
					</div>
					<div className='flex flex-col min-w-0 flex-1'>
						<span className='text-sm text-void-fg-2 group-hover:text-void-fg-1 transition-colors truncate'>{text}</span>
						<span className='text-[10px] text-void-fg-4 opacity-70 truncate'>{hint}</span>
					</div>
					<ChevronRight size={14} className='flex-shrink-0 text-void-fg-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all duration-300' />
				</div>
			</button>
		))}
	</div>



	const threadPageInput = <div key={'input' + chatThreadsState.currentThreadId}>
		{errorDisplayHTML && <div className='px-2'>{errorDisplayHTML}</div>}
		<div className='px-4'>
			<CommandBarInChat />
		</div>
		{queueListHTML && <div className='px-2'>{queueListHTML}</div>}
		<div className='px-2 pb-2'>
			{inputChatArea}
		</div>
	</div>

	const landingPageInput = <div>
		{errorDisplayHTML && <div className='px-2'>{errorDisplayHTML}</div>}
		{queueListHTML && <div className='px-2 pt-2'>{queueListHTML}</div>}
		<div className='pt-8'>
			{inputChatArea}
		</div>
	</div>

	const landingPageContent = <div
		ref={sidebarRef}
		className='w-full flex flex-col overflow-auto px-4'
		style={{ flex: '1 1 0', minHeight: 0 }}
	>
		<ErrorBoundary>
			{landingPageInput}
		</ErrorBoundary>

		{Object.keys(chatThreadsState.allThreads).length > 1 ? // show if there are threads
			<ErrorBoundary>
				<SectionLabel label='過去のチャット' />
				<PastThreadsList />
			</ErrorBoundary>
			:
			<ErrorBoundary>
				<SectionLabel label='おすすめの質問' />
				{initiallySuggestedPromptsHTML}
			</ErrorBoundary>
		}
	</div>


	// const threadPageContent = <div>
	// 	{/* Thread content */}
	// 	<div className='flex flex-col overflow-hidden'>
	// 		<div className={`overflow-hidden ${previousMessages.length === 0 ? 'h-0 max-h-0 pb-2' : ''}`}>
	// 			<ErrorBoundary>
	// 				{messagesHTML}
	// 			</ErrorBoundary>
	// 		</div>
	// 		<ErrorBoundary>
	// 			{inputForm}
	// 		</ErrorBoundary>
	// 	</div>
	// </div>
	const threadPageContent = <div
		ref={sidebarRef}
		className='w-full flex flex-col overflow-hidden'
		style={{ flex: '1 1 0', minHeight: 0 }}
	>

		<ErrorBoundary>
			{messagesHTML}
		</ErrorBoundary>
		<ErrorBoundary>
			{threadPageInput}
		</ErrorBoundary>
	</div>


	return (
		<div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden' }}>
			<SidebarChatGlobalStyles />
			<SidebarHeader onLoginClick={() => setShowLoginScreen(true)} />
			<OrchestraUpdateBanner />
			{showLoginScreen && <LoginScreen onClose={() => setShowLoginScreen(false)} />}
			<div style={{ flex: '1 1 0', minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
				{viewOverride ? (
					<div className="h-full overflow-auto">{viewOverride}</div>
				) : (
					<Fragment key={threadId}>
						{isLandingPage ?
							landingPageContent
							: threadPageContent}
					</Fragment>
				)}
			</div>
		</div>
	)
}
