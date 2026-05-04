/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useState, useEffect } from 'react';
import { Check, Edit3, RefreshCw } from 'lucide-react';
import { AgentRole } from '../../../../common/voidSettingsTypes.js';
import { roleDisplayConfig } from './ConductorTypes.js';

interface ApprovalPanelProps {
	role: AgentRole;
	content: string;
	onApprove: (editedContent: string) => void;
	onRegenerate?: () => void;
}

export const ApprovalPanel: React.FC<ApprovalPanelProps> = ({
	role, content, onApprove, onRegenerate,
}) => {
	const [editedContent, setEditedContent] = useState(content);
	const [isEditing, setIsEditing] = useState(false);
	const display = roleDisplayConfig[role];

	// Sync content when the agent regenerates output
	useEffect(() => {
		setEditedContent(content);
	}, [content]);

	return (
		<div style={{
			borderRadius: '10px',
			border: `1px solid ${display.color}33`,
			background: `
				linear-gradient(180deg, ${display.color}10, transparent 55%),
				color-mix(in srgb, var(--void-bg-1) 92%, ${display.color} 8%)
			`,
			overflow: 'hidden',
			marginTop: '2px',
			boxShadow: `0 4px 18px -10px ${display.color}66, 0 0 0 1px ${display.color}11 inset`,
		}}>
			{/* Header */}
			<div style={{
				display: 'flex', alignItems: 'center', justifyContent: 'space-between',
				padding: '9px 12px',
				borderBottom: `1px solid ${display.color}1f`,
				background: `linear-gradient(90deg, ${display.color}10, transparent 70%)`,
			}}>
				<div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
					<div
						className="conductor-dot is-live"
						style={{
							width: '7px', height: '7px',
							backgroundColor: '#a855f7',
							color: '#a855f7',
							boxShadow: '0 0 6px #a855f7',
						}}
					/>
					<span style={{
						fontSize: '11px', fontWeight: 600,
						color: display.color, letterSpacing: '0.005em',
					}}>
						{display.label} の出力
					</span>
					<span className="conductor-pill" style={{
						background: 'linear-gradient(135deg, rgba(168,85,247,0.18), rgba(168,85,247,0.08))',
						color: '#d8b4fe',
						border: '1px solid rgba(168,85,247,0.3)',
						fontSize: '9.5px',
						textTransform: 'uppercase',
						letterSpacing: '0.06em',
						fontWeight: 600,
					}}>
						承認待ち
					</span>
				</div>
				<button
					onClick={() => setIsEditing(!isEditing)}
					title={isEditing ? 'プレビューに切り替え' : '内容を編集'}
					className="conductor-btn"
					style={{
						padding: '3px 9px',
						fontSize: '10px',
						background: isEditing ? `${display.color}22` : 'transparent',
						border: `1px solid ${isEditing ? display.color + '55' : 'color-mix(in srgb, var(--void-border-2) 70%, transparent)'}`,
						color: isEditing ? display.color : 'var(--void-fg-3)',
					}}
				>
					<Edit3 size={10} />
					{isEditing ? 'プレビュー' : '編集'}
				</button>
			</div>

			{/* Content: editable textarea or read-only preview */}
			<div style={{ padding: '11px 12px' }}>
				{isEditing ? (
					<textarea
						value={editedContent}
						onChange={(e) => setEditedContent(e.target.value)}
						spellCheck={false}
						autoFocus
						style={{
							width: '100%', minHeight: '140px',
							padding: '10px', borderRadius: '7px',
							border: '1px solid color-mix(in srgb, var(--void-border-2) 80%, transparent)',
							background: 'color-mix(in srgb, var(--void-bg-2) 60%, transparent)',
							color: 'var(--void-fg-1)',
							fontSize: '11.5px', fontFamily: 'var(--monaco-monospace-font, monospace)',
							lineHeight: 1.65, resize: 'vertical',
							outline: 'none', boxSizing: 'border-box',
							transition: 'border-color 180ms ease, background-color 180ms ease',
						}}
						onFocus={(e) => {
							e.currentTarget.style.borderColor = `${display.color}66`;
							e.currentTarget.style.background = 'var(--void-bg-2)';
						}}
						onBlur={(e) => {
							e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--void-border-2) 80%, transparent)';
							e.currentTarget.style.background = 'color-mix(in srgb, var(--void-bg-2) 60%, transparent)';
						}}
					/>
				) : (
					<div
						className="conductor-scroll"
						style={{
							fontSize: '11.5px', color: 'var(--void-fg-2)',
							lineHeight: 1.7, whiteSpace: 'pre-wrap',
							maxHeight: '220px', overflowY: 'auto',
							wordBreak: 'break-word',
							paddingRight: '4px',
						}}
					>
						{editedContent}
					</div>
				)}
			</div>

			{/* Action buttons */}
			<div style={{
				display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px',
				padding: '9px 12px',
				borderTop: `1px solid ${display.color}1f`,
				background: 'color-mix(in srgb, var(--void-bg-1) 70%, transparent)',
			}}>
				{onRegenerate && (
					<button
						onClick={() => {
							setIsEditing(false);
							onRegenerate();
						}}
						title="このエージェントを再実行"
						className="conductor-btn conductor-btn-ghost"
						style={{ fontSize: '10.5px' }}
					>
						<RefreshCw size={10} />
						再生成
					</button>
				)}
				<button
					onClick={() => onApprove(editedContent)}
					title="内容を承認して次のステップへ進む"
					className="conductor-btn conductor-btn-approve"
					style={{ padding: '5px 14px' }}
				>
					<Check size={11} />
					承認して続行
				</button>
			</div>
		</div>
	);
};
