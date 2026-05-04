/*--------------------------------------------------------------------------------------
 *  Role Output Panel
 *  Displays markdown output from each agent role in the main editor area.
 *--------------------------------------------------------------------------------------*/

import React, { useMemo, useState } from 'react';
import { useChatThreadsState, useSettingsState } from '../util/services.js';
import { ChatMarkdownRender, ChatMessageLocation } from '../markdown/ChatMarkdownRender.js';
import { ChevronDown, ChevronRight, FileText, Layers } from 'lucide-react';
import { ChatMessage } from '../../../../common/chatThreadServiceTypes.js';
import { roleDisplayConfig } from '../conductor-tsx/ConductorTypes.js';
import { AgentRole } from '../../../../common/voidSettingsTypes.js';

type RoleOutput = {
	role: string;
	mdFileName?: string;
	mdContent: string;
	status?: 'pending' | 'approved' | 'rejected';
	provider?: string;
	model?: string;
	durationMs?: number;
	messageIdx: number;
	source: 'flow_review' | 'orchestration';
};

function extractRoleOutputs(messages: ChatMessage[]): RoleOutput[] {
	const outputs: RoleOutput[] = [];

	for (let idx = 0; idx < messages.length; idx++) {
		const msg = messages[idx];

		if (msg.role === 'flow_review') {
			outputs.push({
				role: msg.flowRole,
				mdFileName: msg.mdFileName,
				mdContent: msg.mdContent,
				status: msg.status,
				messageIdx: idx,
				source: 'flow_review',
			});
		}

		if (msg.role === 'assistant' && msg.displayContent) {
			const content = msg.displayContent.trim();
			try {
				let jsonStr = content;
				const jsonMatch = content.match(/```json\s*([\s\S]*?)```/);
				if (jsonMatch) jsonStr = jsonMatch[1].trim();
				const parsed = JSON.parse(jsonStr);
				if (parsed && parsed.sessionId && Array.isArray(parsed.tasks)) {
					for (const task of parsed.tasks) {
						if (task.output) {
							outputs.push({
								role: task.role || 'unknown',
								mdContent: task.output,
								provider: task.provider,
								model: task.model,
								durationMs: task.durationMs,
								messageIdx: idx,
								source: 'orchestration',
							});
						}
					}
				}
			} catch {
				// not a Division JSON response
			}
		}
	}

	return outputs;
}

function buildCombinedMarkdown(outputs: RoleOutput[]): string {
	const sections: string[] = [];

	for (const output of outputs) {
		const roleLower = output.role.toLowerCase() as AgentRole;
		const config = roleDisplayConfig[roleLower];
		const roleLabel = config?.label || (output.role.charAt(0).toUpperCase() + output.role.slice(1));

		const meta: string[] = [];
		if (output.mdFileName) meta.push(`📄 ${output.mdFileName}`);
		if (output.provider) meta.push(output.provider);
		if (output.model) meta.push(output.model);
		if (output.durationMs !== undefined) meta.push(`${output.durationMs}ms`);
		if (output.status) {
			const statusLabel = output.status === 'approved' ? '✓ 承認済み'
				: output.status === 'rejected' ? '✕ 却下' : '⏳ レビュー待ち';
			meta.push(statusLabel);
		}

		let section = `## ${roleLabel}\n`;
		if (meta.length > 0) section += `> ${meta.join(' · ')}\n\n`;
		section += output.mdContent;
		sections.push(section);
	}

	return sections.join('\n\n---\n\n');
}

const RoleCard = ({ output, threadId }: { output: RoleOutput; threadId: string }) => {
	const [isExpanded, setIsExpanded] = useState(true);
	const roleLower = output.role.toLowerCase() as AgentRole;
	const config = roleDisplayConfig[roleLower];
	const accentColor = config?.color || 'var(--vscode-focusBorder)';
	const roleLabel = config?.label || (output.role.charAt(0).toUpperCase() + output.role.slice(1));

	const chatMessageLocation: ChatMessageLocation = {
		threadId,
		messageIdx: output.messageIdx,
	};

	return (
		<div style={{
			borderRadius: '10px',
			border: '1px solid var(--void-border-1)',
			background: 'var(--void-bg-1)',
			overflow: 'hidden',
			boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
		}}>
			{/* Header */}
			<button
				onClick={() => setIsExpanded(!isExpanded)}
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: '10px',
					width: '100%',
					padding: '14px 18px',
					background: 'none',
					border: 'none',
					borderBottom: isExpanded ? '1px solid var(--void-border-1)' : 'none',
					cursor: 'pointer',
					textAlign: 'left',
				}}
			>
				{/* Accent dot */}
				<div style={{
					width: '10px', height: '10px', borderRadius: '50%',
					backgroundColor: accentColor,
					boxShadow: `0 0 8px ${accentColor}60`,
					flexShrink: 0,
				}} />

				<div style={{ flex: 1, minWidth: 0 }}>
					<div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
						<span style={{
							fontSize: '14px', fontWeight: 700,
							color: accentColor,
							letterSpacing: '0.02em',
						}}>
							{roleLabel}
						</span>
						{output.mdFileName && (
							<span style={{
								display: 'flex', alignItems: 'center', gap: '4px',
								fontSize: '11px', color: 'var(--void-fg-3)',
								background: 'var(--void-bg-2)', padding: '2px 8px', borderRadius: '4px',
							}}>
								<FileText size={11} />
								{output.mdFileName}
							</span>
						)}
						{output.status && (
							<span style={{
								fontSize: '10px', padding: '2px 8px', borderRadius: '10px',
								fontWeight: 600,
								...(output.status === 'approved'
									? { background: 'rgba(16,185,129,0.15)', color: '#10b981' }
									: output.status === 'rejected'
										? { background: 'rgba(239,68,68,0.15)', color: '#ef4444' }
										: { background: 'rgba(59,130,246,0.15)', color: '#60a5fa' }),
							}}>
								{output.status === 'approved' ? '✓ 承認済み'
									: output.status === 'rejected' ? '✕ 却下'
										: 'レビュー待ち'}
							</span>
						)}
					</div>
					{(output.provider || output.model || output.durationMs !== undefined) && (
						<div style={{
							fontSize: '11px', color: 'var(--void-fg-4)', marginTop: '3px',
							display: 'flex', alignItems: 'center', gap: '6px',
						}}>
							{output.provider && <span>{output.provider}</span>}
							{output.provider && output.model && <span>·</span>}
							{output.model && <span>{output.model}</span>}
							{output.durationMs !== undefined && (
								<>
									<span>·</span>
									<span>{output.durationMs}ms</span>
								</>
							)}
						</div>
					)}
				</div>

				{isExpanded
					? <ChevronDown size={16} style={{ color: 'var(--void-fg-3)', flexShrink: 0 }} />
					: <ChevronRight size={16} style={{ color: 'var(--void-fg-3)', flexShrink: 0 }} />
				}
			</button>

			{/* Content */}
			{isExpanded && (
				<div style={{
					padding: '20px 24px',
					fontSize: '14px',
					lineHeight: '1.7',
					color: 'var(--void-fg-1)',
				}}>
					<ChatMarkdownRender
						string={output.mdContent}
						chatMessageLocation={chatMessageLocation}
						isApplyEnabled={true}
						isLinkDetectionEnabled={true}
					/>
				</div>
			)}
		</div>
	);
};

type ViewMode = 'cards' | 'combined';

export const RoleOutputPanel: React.FC = () => {
	const chatThreadsState = useChatThreadsState();
	const settingsState = useSettingsState();
	const [viewMode, setViewMode] = useState<ViewMode>('combined');

	const currentThreadId = chatThreadsState.currentThreadId;
	const thread = chatThreadsState.allThreads[currentThreadId];
	const messages = thread?.messages || [];

	const roleOutputs = useMemo(() => extractRoleOutputs(messages), [messages]);
	const combinedMarkdown = useMemo(() => buildCombinedMarkdown(roleOutputs), [roleOutputs]);

	const totalChars = useMemo(() => roleOutputs.reduce((sum, o) => sum + o.mdContent.length, 0), [roleOutputs]);

	const modelSelection = settingsState.modelSelectionOfFeature['Chat'];
	const isDivision = modelSelection?.providerName === 'divisionAPI';

	const chatMessageLocation: ChatMessageLocation = {
		threadId: currentThreadId,
		messageIdx: roleOutputs.length > 0 ? roleOutputs[roleOutputs.length - 1].messageIdx : 0,
	};

	if (roleOutputs.length === 0) {
		return (
			<div style={{
				display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
				height: '100%', gap: '16px', color: 'var(--void-fg-3)',
			}}>
				<FileText size={48} style={{ opacity: 0.3 }} />
				<div style={{ textAlign: 'center' }}>
					<div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>
						ロール出力なし
					</div>
					<div style={{ fontSize: '13px', opacity: 0.7, maxWidth: '360px', lineHeight: '1.6' }}>
						{isDivision
							? 'Division APIでチャットを送信すると、各ロールの出力がここに表示されます。'
							: 'Division APIを選択してチャットを送信すると、各ロールの出力マークダウンがここに表示されます。'
						}
					</div>
				</div>
			</div>
		);
	}

	return (
		<div style={{
			height: '100%',
			overflowY: 'auto',
			background: 'var(--void-bg-2)',
		}}>
			{/* Header */}
			<div style={{
				position: 'sticky', top: 0, zIndex: 10,
				padding: '14px 24px',
				borderBottom: '1px solid var(--void-border-1)',
				background: 'var(--void-bg-1)',
				display: 'flex', alignItems: 'center', justifyContent: 'space-between',
			}}>
				<div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
					<span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--void-fg-1)' }}>
						ロール出力
					</span>
					<span style={{
						fontSize: '11px', padding: '2px 8px', borderRadius: '10px',
						background: 'rgba(59,130,246,0.1)', color: '#60a5fa',
						fontWeight: 600,
					}}>
						{roleOutputs.length} 件
					</span>
					<span style={{
						fontSize: '10px', color: 'var(--void-fg-4)',
					}}>
						{totalChars > 1000 ? `${(totalChars / 1000).toFixed(1)}K` : totalChars} 文字
					</span>
				</div>

				{/* View mode toggle */}
				<div style={{
					display: 'flex', borderRadius: '6px', overflow: 'hidden',
					border: '1px solid var(--void-border-1)',
				}}>
					<button
						onClick={() => setViewMode('combined')}
						style={{
							padding: '4px 10px', fontSize: '11px', fontWeight: 500,
							border: 'none', cursor: 'pointer',
							display: 'flex', alignItems: 'center', gap: '4px',
							background: viewMode === 'combined' ? 'var(--vscode-focusBorder)' : 'var(--void-bg-1)',
							color: viewMode === 'combined' ? 'white' : 'var(--void-fg-3)',
						}}
					>
						<Layers size={11} />
						まとめ
					</button>
					<button
						onClick={() => setViewMode('cards')}
						style={{
							padding: '4px 10px', fontSize: '11px', fontWeight: 500,
							border: 'none', cursor: 'pointer',
							display: 'flex', alignItems: 'center', gap: '4px',
							background: viewMode === 'cards' ? 'var(--vscode-focusBorder)' : 'var(--void-bg-1)',
							color: viewMode === 'cards' ? 'white' : 'var(--void-fg-3)',
						}}
					>
						<FileText size={11} />
						個別
					</button>
				</div>
			</div>

			{/* Content */}
			{viewMode === 'combined' ? (
				<div style={{
					padding: '28px 32px',
					maxWidth: '900px',
					margin: '0 auto',
				}}>
					<div style={{
						background: 'var(--void-bg-1)',
						borderRadius: '10px',
						border: '1px solid var(--void-border-1)',
						padding: '32px 40px',
						boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
						fontSize: '14px',
						lineHeight: '1.8',
						color: 'var(--void-fg-1)',
					}}>
						<ChatMarkdownRender
							string={combinedMarkdown}
							chatMessageLocation={chatMessageLocation}
							isApplyEnabled={true}
							isLinkDetectionEnabled={true}
						/>
					</div>
				</div>
			) : (
				<div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
					{roleOutputs.map((output, i) => (
						<RoleCard key={`${output.role}-${output.messageIdx}-${i}`} output={output} threadId={currentThreadId} />
					))}
				</div>
			)}
		</div>
	);
};
