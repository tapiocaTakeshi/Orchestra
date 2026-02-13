/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useState, useCallback } from 'react';
import { Plus, X, GripVertical, ArrowDown, Save, Brain, Code, FileText, Search, Palette, ChevronDown, ChevronUp } from 'lucide-react';
import { useSettingsState, useAccessor } from '../util/services.js';
import { AgentRole, ProviderName, providerNames, displayInfoOfProviderName } from '../../../../common/voidSettingsTypes.js';
import { defaultModelsOfProvider } from '../../../../common/modelCapabilities.js';
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
}

const PipelineStepCard: React.FC<PipelineStepCardProps> = ({
	step, index, totalSteps, onUpdate, onRemove, onMoveUp, onMoveDown,
}) => {
	const settingsState = useSettingsState();
	const display = roleDisplayConfig[step.role];
	const runtimeModels = settingsState.settingsOfProvider[step.provider]?.models || [];
	// Fallback to defaultModelsOfProvider when runtime models are empty (no API key set)
	const defaultModels = (defaultModelsOfProvider[step.provider] || []).map(m => ({ modelName: m }));
	const availableModels = runtimeModels.length > 0 ? runtimeModels : defaultModels;

	return (
		<div style={{
			display: 'flex', flexDirection: 'column', gap: '8px',
			padding: '10px 12px',
			borderRadius: '8px',
			border: '1px solid var(--void-border-2)',
			background: 'var(--void-bg-1)',
			transition: 'border-color 0.2s',
		}}>
			{/* Top row: number, role, controls */}
			<div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
				<div style={{
					width: '22px', height: '22px', borderRadius: '50%',
					display: 'flex', alignItems: 'center', justifyContent: 'center',
					fontSize: '11px', fontWeight: 700, flexShrink: 0,
					backgroundColor: `${display.color}20`, color: display.color,
				}}>
					{index + 1}
				</div>

				<select
					value={step.role}
					onChange={(e) => onUpdate({ ...step, role: e.target.value as AgentRole })}
					style={{
						padding: '4px 8px', background: 'var(--void-bg-2)',
						border: '1px solid var(--void-border-2)', borderRadius: '4px',
						fontSize: '11px', color: 'var(--void-fg-1)', flex: 1, minWidth: 0,
					}}
				>
					{allRoles.map(role => (
						<option key={role} value={role}>{roleDisplayConfig[role].label}</option>
					))}
				</select>

				<div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
					<button onClick={onMoveUp} disabled={index === 0}
						style={{ background: 'none', border: 'none', cursor: index === 0 ? 'default' : 'pointer', color: 'var(--void-fg-3)', opacity: index === 0 ? 0.3 : 1, padding: '0' }}>
						<ChevronUp size={12} />
					</button>
					<button onClick={onMoveDown} disabled={index === totalSteps - 1}
						style={{ background: 'none', border: 'none', cursor: index === totalSteps - 1 ? 'default' : 'pointer', color: 'var(--void-fg-3)', opacity: index === totalSteps - 1 ? 0.3 : 1, padding: '0' }}>
						<ChevronDown size={12} />
					</button>
				</div>

				<button onClick={onRemove}
					style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--void-fg-4)', padding: '2px' }}>
					<X size={14} />
				</button>
			</div>

			{/* Bottom row: provider + model */}
			<div style={{ display: 'flex', gap: '6px' }}>
				<select
					value={step.provider}
					onChange={(e) => {
						const newProvider = e.target.value as ProviderName;
						const rtModels = settingsState.settingsOfProvider[newProvider]?.models || [];
						const defModels = (defaultModelsOfProvider[newProvider] || []).map(m => ({ modelName: m }));
						const models = rtModels.length > 0 ? rtModels : defModels;
						onUpdate({
							...step,
							provider: newProvider,
							model: models[0]?.modelName || '',
						});
					}}
					style={{
						padding: '4px 8px', background: 'var(--void-bg-2)',
						border: '1px solid var(--void-border-2)', borderRadius: '4px',
						fontSize: '10px', color: 'var(--void-fg-2)', flex: 1, minWidth: 0,
					}}
				>
					{providerNames.map(pn => (
						<option key={pn} value={pn}>{displayInfoOfProviderName(pn).title}</option>
					))}
				</select>

				<select
					value={step.model}
					onChange={(e) => onUpdate({ ...step, model: e.target.value })}
					style={{
						padding: '4px 8px', background: 'var(--void-bg-2)',
						border: '1px solid var(--void-border-2)', borderRadius: '4px',
						fontSize: '10px', color: 'var(--void-fg-2)', flex: 1, minWidth: 0,
					}}
				>
					{availableModels.length === 0 ? (
						<option>No models</option>
					) : (
						availableModels.map(m => (
							<option key={m.modelName} value={m.modelName}>{m.modelName}</option>
						))
					)}
				</select>
			</div>
		</div>
	);
};

export const PipelineBuilder: React.FC = () => {
	const settingsState = useSettingsState();
	const accessor = useAccessor();
	const voidSettingsService = accessor.get('IVoidSettingsService');

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
		<div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
			{/* Header */}
			<div style={{
				display: 'flex', alignItems: 'center', justifyContent: 'space-between',
				padding: '12px 16px',
				borderBottom: '1px solid var(--void-border-2)',
			}}>
				<div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
					<span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--void-fg-1)' }}>Agent Builder</span>
					<span style={{
						fontSize: '10px', padding: '2px 6px', borderRadius: '4px',
						background: 'rgba(168,85,247,0.1)', color: '#c084fc',
					}}>Preview</span>
				</div>
				<div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
					<button
						onClick={() => setShowTemplates(!showTemplates)}
						style={{
							padding: '4px 8px', borderRadius: '4px', cursor: 'pointer',
							background: 'var(--void-bg-2)', border: '1px solid var(--void-border-2)',
							color: 'var(--void-fg-2)', fontSize: '10px',
						}}
					>
						Templates
					</button>
					<button
						onClick={savePipeline}
						style={{
							display: 'flex', alignItems: 'center', gap: '4px',
							padding: '4px 8px', borderRadius: '4px', cursor: 'pointer',
							background: 'rgba(16,185,129,0.1)', color: '#34d399',
							border: 'none', fontSize: '10px', fontWeight: 500,
						}}
					>
						<Save size={10} /> Save
					</button>
				</div>
			</div>

			{/* Templates */}
			{showTemplates && (
				<div style={{
					padding: '10px 16px',
					borderBottom: '1px solid var(--void-border-2)',
					background: 'var(--void-bg-2)',
				}}>
					<div style={{ fontSize: '10px', color: 'var(--void-fg-3)', marginBottom: '8px', fontWeight: 500 }}>Quick Templates</div>
					<div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
						{defaultTemplates.map(template => (
							<button
								key={template.id}
								onClick={() => loadTemplate(template)}
								style={{
									display: 'flex', alignItems: 'center', justifyContent: 'space-between',
									padding: '8px 10px', borderRadius: '6px',
									background: 'var(--void-bg-1)', border: '1px solid var(--void-border-2)',
									cursor: 'pointer', textAlign: 'left',
								}}
							>
								<div style={{ flex: 1, minWidth: 0 }}>
									<div style={{ fontSize: '11px', fontWeight: 500, color: 'var(--void-fg-1)' }}>{template.name}</div>
									<div style={{ fontSize: '10px', color: 'var(--void-fg-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{template.description}</div>
								</div>
								<div style={{ display: 'flex', gap: '3px', marginLeft: '8px' }}>
									{template.steps.map(s => {
										const StepIcon = roleIcons[s.role];
										return (
											<div key={s.id} style={{
												width: '18px', height: '18px', borderRadius: '4px',
												display: 'flex', alignItems: 'center', justifyContent: 'center',
												backgroundColor: `${roleDisplayConfig[s.role].color}20`,
											}}>
												<StepIcon size={10} />
											</div>
										);
									})}
								</div>
							</button>
						))}
					</div>
				</div>
			)}

			{/* Steps */}
			<div style={{ flex: '1 1 0', minHeight: 0, overflowY: 'auto', padding: '16px' }}>
				{/* Source */}
				<div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
					<div style={{
						padding: '4px 12px', borderRadius: '12px',
						background: 'var(--void-bg-2)', border: '1px solid var(--void-border-2)',
						fontSize: '10px', color: 'var(--void-fg-3)',
					}}>
						User Prompt
					</div>
				</div>

				{steps.length > 0 && (
					<div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px' }}>
						<ArrowDown size={14} style={{ color: 'var(--void-fg-4)' }} />
					</div>
				)}

				<div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
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
							/>
							{index < steps.length - 1 && (
								<div style={{ display: 'flex', justifyContent: 'center' }}>
									<ArrowDown size={14} style={{ color: 'var(--void-fg-4)' }} />
								</div>
							)}
						</React.Fragment>
					))}
				</div>

				{/* Add step */}
				<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '12px', gap: '8px' }}>
					{steps.length > 0 && <ArrowDown size={14} style={{ color: 'var(--void-fg-4)' }} />}
					<button
						onClick={addStep}
						style={{
							display: 'flex', alignItems: 'center', gap: '4px',
							padding: '6px 14px', borderRadius: '6px', cursor: 'pointer',
							border: '1px dashed var(--void-border-2)', background: 'none',
							color: 'var(--void-fg-3)', fontSize: '11px',
						}}
					>
						<Plus size={12} /> Add Agent
					</button>
				</div>

				{/* Output */}
				{steps.length > 0 && (
					<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '12px', gap: '6px' }}>
						<ArrowDown size={14} style={{ color: 'var(--void-fg-4)' }} />
						<div style={{
							padding: '4px 12px', borderRadius: '12px',
							background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)',
							fontSize: '10px', color: '#34d399',
						}}>
							Final Output
						</div>
					</div>
				)}
			</div>
		</div>
	);
};
