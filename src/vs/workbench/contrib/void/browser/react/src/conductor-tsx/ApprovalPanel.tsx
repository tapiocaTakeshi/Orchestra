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
			borderRadius: '8px',
			border: `1px solid ${display.color}40`,
			background: `${display.color}06`,
			overflow: 'hidden',
			marginTop: '4px',
		}}>
			{/* Header */}
			<div style={{
				display: 'flex', alignItems: 'center', justifyContent: 'space-between',
				padding: '8px 12px',
				borderBottom: `1px solid ${display.color}20`,
				background: `${display.color}08`,
			}}>
				<div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
					<div style={{
						width: '6px', height: '6px', borderRadius: '50%',
						backgroundColor: '#a855f7',
						boxShadow: '0 0 6px #a855f7',
						animation: 'conductor-pulse 1.5s infinite',
					}} />
					<span style={{ fontSize: '11px', fontWeight: 600, color: display.color }}>
						{display.label} の出力
					</span>
					<span style={{
						fontSize: '10px', padding: '1px 5px', borderRadius: '3px',
						background: 'rgba(168,85,247,0.12)', color: '#c084fc',
					}}>
						承認待ち
					</span>
				</div>
				<button
					onClick={() => setIsEditing(!isEditing)}
					title={isEditing ? 'プレビューに切り替え' : '内容を編集'}
					style={{
						display: 'flex', alignItems: 'center', gap: '3px',
						padding: '3px 7px', borderRadius: '4px', cursor: 'pointer',
						background: isEditing ? `${display.color}20` : 'none',
						border: `1px solid ${isEditing ? display.color + '50' : 'var(--void-border-2)'}`,
						fontSize: '10px',
						color: isEditing ? display.color : 'var(--void-fg-3)',
					}}
				>
					<Edit3 size={10} />
					{isEditing ? 'プレビュー' : '編集'}
				</button>
			</div>

			{/* Content: editable textarea or read-only preview */}
			<div style={{ padding: '10px 12px' }}>
				{isEditing ? (
					<textarea
						value={editedContent}
						onChange={(e) => setEditedContent(e.target.value)}
						spellCheck={false}
						autoFocus
						style={{
							width: '100%', minHeight: '140px',
							padding: '8px', borderRadius: '4px',
							border: '1px solid var(--void-border-2)',
							background: 'var(--void-bg-2)',
							color: 'var(--void-fg-1)',
							fontSize: '11px', fontFamily: 'var(--monaco-monospace-font, monospace)',
							lineHeight: 1.6, resize: 'vertical',
							outline: 'none', boxSizing: 'border-box',
						}}
					/>
				) : (
					<div
						style={{
							fontSize: '11px', color: 'var(--void-fg-2)',
							lineHeight: 1.65, whiteSpace: 'pre-wrap',
							maxHeight: '200px', overflowY: 'auto',
							wordBreak: 'break-word',
						}}
					>
						{editedContent}
					</div>
				)}
			</div>

			{/* Action buttons */}
			<div style={{
				display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px',
				padding: '8px 12px',
				borderTop: `1px solid ${display.color}20`,
			}}>
				{onRegenerate && (
					<button
						onClick={() => {
							setIsEditing(false);
							onRegenerate();
						}}
						title="このエージェントを再実行"
						style={{
							display: 'flex', alignItems: 'center', gap: '4px',
							padding: '5px 10px', borderRadius: '5px', cursor: 'pointer',
							background: 'none',
							border: '1px solid var(--void-border-2)',
							color: 'var(--void-fg-3)', fontSize: '10px',
						}}
					>
						<RefreshCw size={10} />
						再生成
					</button>
				)}
				<button
					onClick={() => onApprove(editedContent)}
					title="内容を承認して次のステップへ進む"
					style={{
						display: 'flex', alignItems: 'center', gap: '4px',
						padding: '5px 14px', borderRadius: '5px', cursor: 'pointer',
						background: 'rgba(16,185,129,0.15)', color: '#34d399',
						border: '1px solid rgba(16,185,129,0.35)',
						fontSize: '11px', fontWeight: 600,
					}}
				>
					<Check size={11} />
					承認して続行
				</button>
			</div>
		</div>
	);
};
