/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useState, useCallback } from 'react';
import { Plus, X, GripVertical, ArrowDown, Save, Trash2, Brain, Code, FileText, Search, Palette, ChevronDown, ChevronUp } from 'lucide-react';
import { useSettingsState, useAccessor } from '../util/services.js';
import { AgentRole, ProviderName, providerNames, displayInfoOfProviderName } from '../../../../common/voidSettingsTypes.js';
import { PipelineStep, PipelineTemplate, defaultTemplates, roleDisplayConfig } from './ConductorTypes.js';

const roleIcons: Record<AgentRole, React.ComponentType<{ size?: number; className?: string }>> = {
	leader: Brain,
	coder: Code,
	planner: FileText,
	search: Search,
	design: Palette,
};

const allRoles: AgentRole[] = ['leader', 'coder', 'planner', 'search', 'design'];

interface PipelineStepCardProps {
	step: PipelineStep;
	index: number;
	totalSteps: number;
	onUpdate: (step: PipelineStep) => void;
	onRemove: () => void;
	onMoveUp: () => void;
	onMoveDown: () => void;
	onDragStart: (e: React.DragEvent, index: number) => void;
	onDragOver: (e: React.DragEvent) => void;
	onDrop: (e: React.DragEvent, index: number) => void;
}

const PipelineStepCard: React.FC<PipelineStepCardProps> = ({
	step, index, totalSteps, onUpdate, onRemove, onMoveUp, onMoveDown,
	onDragStart, onDragOver, onDrop,
}) => {
	const settingsState = useSettingsState();
	const Icon = roleIcons[step.role];
	const display = roleDisplayConfig[step.role];
	const availableModels = settingsState.settingsOfProvider[step.provider]?.models || [];

	return (
		<div
			draggable
			onDragStart={(e) => onDragStart(e, index)}
			onDragOver={onDragOver}
			onDrop={(e) => onDrop(e, index)}
			className="void-rounded-lg void-border void-border-void-border-2 void-bg-void-bg-1 void-p-3 void-transition-all void-duration-200 hover:void-border-void-border-1 void-group"
		>
			<div className="void-flex void-items-center void-gap-2">
				{/* Drag handle */}
				<div className="void-cursor-grab active:void-cursor-grabbing void-text-void-fg-4 hover:void-text-void-fg-2 void-transition-colors">
					<GripVertical size={14} />
				</div>

				{/* Step number */}
				<div
					className="void-w-5 void-h-5 void-rounded-full void-flex void-items-center void-justify-center void-text-xs void-font-bold void-flex-shrink-0"
					style={{ backgroundColor: `${display.color}20`, color: display.color }}
				>
					{index + 1}
				</div>

				{/* Role selector */}
				<select
					value={step.role}
					onChange={(e) => onUpdate({ ...step, role: e.target.value as AgentRole })}
					className="void-px-2 void-py-1 void-bg-void-bg-2 void-border void-border-void-border-2 void-rounded void-text-xs void-text-void-fg-1 void-min-w-[90px]"
				>
					{allRoles.map(role => (
						<option key={role} value={role}>{roleDisplayConfig[role].label}</option>
					))}
				</select>

				{/* Provider selector */}
				<select
					value={step.provider}
					onChange={(e) => {
						const newProvider = e.target.value as ProviderName;
						const models = settingsState.settingsOfProvider[newProvider]?.models || [];
						onUpdate({
							...step,
							provider: newProvider,
							model: models[0]?.modelName || '',
						});
					}}
					className="void-px-2 void-py-1 void-bg-void-bg-2 void-border void-border-void-border-2 void-rounded void-text-xs void-text-void-fg-1 void-flex-1 void-min-w-0"
				>
					{providerNames.map(pn => (
						<option key={pn} value={pn}>{displayInfoOfProviderName(pn).title}</option>
					))}
				</select>

				{/* Model selector */}
				<select
					value={step.model}
					onChange={(e) => onUpdate({ ...step, model: e.target.value })}
					className="void-px-2 void-py-1 void-bg-void-bg-2 void-border void-border-void-border-2 void-rounded void-text-xs void-text-void-fg-1 void-flex-1 void-min-w-0"
				>
					{availableModels.length === 0 ? (
						<option>No models</option>
					) : (
						availableModels.map(m => (
							<option key={m.modelName} value={m.modelName}>{m.modelName}</option>
						))
					)}
				</select>

				{/* Move buttons */}
				<div className="void-flex void-flex-col void-opacity-0 group-hover:void-opacity-100 void-transition-opacity">
					<button
						onClick={onMoveUp}
						disabled={index === 0}
						className="void-text-void-fg-4 hover:void-text-void-fg-1 disabled:void-opacity-30 void-transition-colors"
					>
						<ChevronUp size={10} />
					</button>
					<button
						onClick={onMoveDown}
						disabled={index === totalSteps - 1}
						className="void-text-void-fg-4 hover:void-text-void-fg-1 disabled:void-opacity-30 void-transition-colors"
					>
						<ChevronDown size={10} />
					</button>
				</div>

				{/* Remove button */}
				<button
					onClick={onRemove}
					className="void-text-void-fg-4 hover:void-text-red-400 void-transition-colors void-opacity-0 group-hover:void-opacity-100"
				>
					<X size={14} />
				</button>
			</div>
		</div>
	);
};

export const PipelineBuilder: React.FC = () => {
	const settingsState = useSettingsState();
	const accessor = useAccessor();
	const voidSettingsService = accessor.get('IVoidSettingsService');

	// Initialize from current role assignments
	const [steps, setSteps] = useState<PipelineStep[]>(() =>
		settingsState.globalSettings.roleAssignments.map((ra, i) => ({
			id: `step-${i}`,
			role: ra.role,
			provider: ra.provider,
			model: ra.model,
			order: i,
		}))
	);

	const [showTemplates, setShowTemplates] = useState(false);
	const [dragIndex, setDragIndex] = useState<number | null>(null);

	const addStep = () => {
		const newStep: PipelineStep = {
			id: `step-${Date.now()}`,
			role: 'coder',
			provider: 'anthropic',
			model: 'claude-sonnet-4-20250514',
			order: steps.length,
		};
		setSteps([...steps, newStep]);
	};

	const removeStep = (index: number) => {
		setSteps(steps.filter((_, i) => i !== index));
	};

	const updateStep = (index: number, updated: PipelineStep) => {
		setSteps(steps.map((s, i) => i === index ? updated : s));
	};

	const moveStep = (from: number, to: number) => {
		const newSteps = [...steps];
		const [moved] = newSteps.splice(from, 1);
		newSteps.splice(to, 0, moved);
		setSteps(newSteps.map((s, i) => ({ ...s, order: i })));
	};

	const handleDragStart = (e: React.DragEvent, index: number) => {
		setDragIndex(index);
		e.dataTransfer.effectAllowed = 'move';
	};

	const handleDragOver = (e: React.DragEvent) => {
		e.preventDefault();
		e.dataTransfer.dropEffect = 'move';
	};

	const handleDrop = (e: React.DragEvent, dropIndex: number) => {
		e.preventDefault();
		if (dragIndex !== null && dragIndex !== dropIndex) {
			moveStep(dragIndex, dropIndex);
		}
		setDragIndex(null);
	};

	const loadTemplate = (template: PipelineTemplate) => {
		setSteps(template.steps.map(s => ({ ...s })));
		setShowTemplates(false);
	};

	const savePipeline = () => {
		const newAssignments = steps.map(s => ({
			role: s.role,
			provider: s.provider,
			model: s.model,
		}));
		voidSettingsService.setGlobalSetting('roleAssignments', newAssignments);
	};

	return (
		<div className="void-flex void-flex-col void-h-full void-overflow-hidden">
			{/* Header */}
			<div className="void-flex void-items-center void-justify-between void-px-4 void-py-3 void-border-b void-border-void-border-2">
				<div className="void-text-sm void-text-void-fg-1 void-font-medium">
					Agent Builder
				</div>
				<div className="void-flex void-items-center void-gap-2">
					<button
						onClick={() => setShowTemplates(!showTemplates)}
						className="void-text-xs void-px-2 void-py-1 void-rounded void-bg-void-bg-2 void-text-void-fg-2 hover:void-text-void-fg-1 void-transition-colors"
					>
						Templates
					</button>
					<button
						onClick={savePipeline}
						className="void-flex void-items-center void-gap-1 void-text-xs void-px-2 void-py-1 void-rounded void-bg-emerald-500/10 void-text-emerald-400 hover:void-bg-emerald-500/20 void-transition-colors"
					>
						<Save size={10} />
						Save
					</button>
				</div>
			</div>

			{/* Templates panel */}
			{showTemplates && (
				<div className="void-border-b void-border-void-border-2 void-p-3 void-bg-void-bg-2/50">
					<div className="void-text-xs void-text-void-fg-3 void-mb-2 void-font-medium">Quick Templates</div>
					<div className="void-flex void-flex-col void-gap-2">
						{defaultTemplates.map(template => (
							<button
								key={template.id}
								onClick={() => loadTemplate(template)}
								className="void-flex void-items-center void-gap-3 void-p-2 void-rounded-lg void-bg-void-bg-1 void-border void-border-void-border-2 hover:void-border-void-border-1 void-transition-all void-text-left"
							>
								<div className="void-flex-1 void-min-w-0">
									<div className="void-text-xs void-font-medium void-text-void-fg-1">{template.name}</div>
									<div className="void-text-xs void-text-void-fg-3 void-truncate">{template.description}</div>
								</div>
								<div className="void-flex void-items-center void-gap-1">
									{template.steps.map(s => {
										const StepIcon = roleIcons[s.role];
										return (
											<div
												key={s.id}
												className="void-w-5 void-h-5 void-rounded void-flex void-items-center void-justify-center"
												style={{ backgroundColor: `${roleDisplayConfig[s.role].color}20` }}
											>
												<StepIcon size={10} style={{ color: roleDisplayConfig[s.role].color }} />
											</div>
										);
									})}
								</div>
							</button>
						))}
					</div>
				</div>
			)}

			{/* Pipeline steps */}
			<div className="void-flex-1 void-overflow-y-auto void-p-4">
				{/* Source label */}
				<div className="void-flex void-items-center void-justify-center void-mb-3">
					<div className="void-px-3 void-py-1 void-rounded-full void-bg-void-bg-2 void-border void-border-void-border-2 void-text-xs void-text-void-fg-3">
						User Prompt
					</div>
				</div>

				{steps.length > 0 && (
					<div className="void-flex void-justify-center void-mb-2">
						<ArrowDown size={14} className="void-text-void-fg-4" />
					</div>
				)}

				<div className="void-flex void-flex-col void-gap-2">
					{steps.map((step, index) => (
						<React.Fragment key={step.id}>
							<PipelineStepCard
								step={step}
								index={index}
								totalSteps={steps.length}
								onUpdate={(s) => updateStep(index, s)}
								onRemove={() => removeStep(index)}
								onMoveUp={() => index > 0 && moveStep(index, index - 1)}
								onMoveDown={() => index < steps.length - 1 && moveStep(index, index + 1)}
								onDragStart={handleDragStart}
								onDragOver={handleDragOver}
								onDrop={handleDrop}
							/>
							{index < steps.length - 1 && (
								<div className="void-flex void-justify-center">
									<ArrowDown size={14} className="void-text-void-fg-4" />
								</div>
							)}
						</React.Fragment>
					))}
				</div>

				{/* Add step button */}
				<div className="void-flex void-justify-center void-mt-3">
					{steps.length > 0 && (
						<div className="void-flex void-flex-col void-items-center void-gap-2">
							<ArrowDown size={14} className="void-text-void-fg-4" />
							<button
								onClick={addStep}
								className="void-flex void-items-center void-gap-1.5 void-px-3 void-py-1.5 void-rounded-lg void-border void-border-dashed void-border-void-border-2 void-text-void-fg-3 hover:void-text-void-fg-1 hover:void-border-void-border-1 void-transition-all void-text-xs"
							>
								<Plus size={12} />
								Add Agent
							</button>
						</div>
					)}
					{steps.length === 0 && (
						<button
							onClick={addStep}
							className="void-flex void-items-center void-gap-1.5 void-px-4 void-py-2 void-rounded-lg void-border void-border-dashed void-border-void-border-2 void-text-void-fg-3 hover:void-text-void-fg-1 hover:void-border-void-border-1 void-transition-all void-text-sm"
						>
							<Plus size={14} />
							Add First Agent
						</button>
					)}
				</div>

				{/* Final output label */}
				{steps.length > 0 && (
					<>
						<div className="void-flex void-justify-center void-mt-3">
							<ArrowDown size={14} className="void-text-void-fg-4" />
						</div>
						<div className="void-flex void-items-center void-justify-center void-mt-2">
							<div className="void-px-3 void-py-1 void-rounded-full void-bg-emerald-500/10 void-border void-border-emerald-500/30 void-text-xs void-text-emerald-400">
								Final Output
							</div>
						</div>
					</>
				)}
			</div>
		</div>
	);
};
