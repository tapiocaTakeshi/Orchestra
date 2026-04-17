/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useState, useRef, useCallback } from 'react';
import { ArrowDown, Play, Square, RotateCcw, Zap, CheckCircle } from 'lucide-react';
import { useSettingsState } from '../util/services.js';
import { AgentRole, displayInfoOfProviderName } from '../../../../common/voidSettingsTypes.js';
import { AgentState, AgentStatus, roleDisplayConfig } from './ConductorTypes.js';
import { ApprovalPanel } from './ApprovalPanel.js';

// Sample outputs per role (shown in the approval panel after each agent completes)
const getDemoOutput = (role: AgentRole): string => {
	switch (role) {
		case 'leader':
			return `## タスク分解結果

以下のサブタスクに分解しました:

1. **情報収集** - 必要なデータと参考資料を検索する
2. **アーキテクチャ設計** - システム構成と技術スタックを決定する
3. **実装** - コアロジックとUIコンポーネントを実装する
4. **レビュー** - コード品質とセキュリティを確認する

### 優先度
- 高: タスク1, タスク2
- 中: タスク3
- 低: タスク4

### 担当エージェント
- Search → 情報収集
- Planner → 設計
- Coder → 実装`;

		case 'planner':
			return `## アーキテクチャ設計

### 技術スタック
- **フロントエンド**: React + TypeScript
- **スタイリング**: Tailwind CSS
- **状態管理**: Zustand

### コンポーネント構成
\`\`\`
App
├── Header
├── Main
│   ├── Dashboard
│   └── Settings
└── Footer
\`\`\`

### データフロー
1. ユーザー入力 → APIリクエスト
2. APIレスポンス → 状態更新
3. 状態変更 → UI再レンダリング`;

		case 'coder':
			return `## 実装完了

以下のコンポーネントを実装しました:

\`\`\`typescript
const Dashboard: React.FC = () => {
  const [data, setData] = useState<DataItem[]>([]);

  useEffect(() => {
    fetchData().then(setData);
  }, []);

  return (
    <div className="dashboard">
      {data.map(item => (
        <Card key={item.id} {...item} />
      ))}
    </div>
  );
};
\`\`\`

### 変更ファイル
- \`src/components/Dashboard.tsx\`
- \`src/hooks/useData.ts\`
- \`src/types/index.ts\``;

		case 'search':
			return `## 検索結果

以下の情報を収集しました:

### 参考ドキュメント
- React公式ドキュメント - Hooks API
- TypeScript Handbook - Generics
- Tailwind CSS - Configuration

### ベストプラクティス
1. コンポーネントの責務を単一に保つ
2. カスタムフックでロジックを分離
3. TypeScriptの型を厳密に定義

### 注意点
- パフォーマンス最適化のため \`React.memo\` を使用
- 大量データには仮想スクロールを検討`;

		case 'research':
			return `## リサーチ結果

### 市場分析
最新トレンドの調査結果:

| 技術 | 採用率 | 評価 |
|------|--------|------|
| React | 87% | ★★★★★ |
| Vue | 64% | ★★★★☆ |
| Angular | 45% | ★★★☆☆ |

### 推奨事項
既存のReactエコシステムを活用し、段階的に機能を拡張することを推奨します。`;

		case 'design':
			return `## デザイン仕様

### カラーパレット
- **Primary**: \`#3b82f6\` (Blue 500)
- **Secondary**: \`#8b5cf6\` (Purple 500)
- **Success**: \`#10b981\` (Emerald 500)
- **Error**: \`#ef4444\` (Red 500)

### タイポグラフィ
- **見出し**: Inter Bold 24px / 20px / 16px
- **本文**: Inter Regular 14px
- **コード**: JetBrains Mono 13px

### コンポーネント設計
- カード: 角丸8px、ボーダー1px、シャドウsm
- ボタン: 角丸6px、パディング8px 16px`;

		case 'writing':
			return `## コンテンツドラフト

### 概要
このプロジェクトは、最新のWeb技術を活用したダッシュボードアプリケーションです。

### 主な機能
1. **リアルタイムデータ可視化** - WebSocketによる即時更新
2. **カスタマイズ可能なレイアウト** - ドラッグ＆ドロップ対応
3. **レスポンシブデザイン** - モバイルファースト設計

### 技術的な特徴
> 本システムはReact 19とTypeScript 5.8を使用し、高いパフォーマンスと型安全性を実現しています。

### 次のステップ
- テストスイートの充実
- パフォーマンスモニタリングの追加`;

		default:
			return `## 処理完了\n\n処理が完了しました。内容を確認して承認してください。`;
	}
};

// Demo data generator
const createDemoAgents = (roleAssignments: { role: AgentRole; provider: any; model: string }[]): AgentState[] => {
	return roleAssignments.map((ra) => ({
		role: ra.role,
		status: 'idle' as AgentStatus,
		provider: ra.provider,
		model: ra.model,
		startTime: null,
		endTime: null,
		tokensUsed: 0,
		summary: '',
		error: null,
		output: '',
	}));
};

const statusColors: Record<AgentStatus, string> = {
	completed: '#10b981',
	running: '#3b82f6',
	waiting: '#f59e0b',
	idle: 'var(--void-fg-4)',
	error: '#ef4444',
	awaiting_approval: '#a855f7',
};

const statusLabels: Record<AgentStatus, string> = {
	completed: 'Done',
	running: 'Running',
	waiting: 'Waiting',
	idle: 'Idle',
	error: 'Error',
	awaiting_approval: 'Review',
};

export const ConductorView: React.FC = () => {
	const settingsState = useSettingsState();
	const roleAssignments = settingsState.globalSettings.roleAssignments;

	const [isRunning, setIsRunning] = useState(false);
	const [agents, setAgents] = useState<AgentState[]>(() => createDemoAgents(roleAssignments));

	// Timer ref for cleanup on stop
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const completedCount = agents.filter(a => a.status === 'completed').length;
	const totalTokens = agents.reduce((sum, a) => sum + a.tokensUsed, 0);
	const hasAwaitingApproval = agents.some(a => a.status === 'awaiting_approval');

	// Start an agent at `nextIndex` running, then after 2s transition to awaiting_approval
	const startNextAgent = useCallback((nextIndex: number) => {
		if (timerRef.current) clearTimeout(timerRef.current);

		setAgents(prev => {
			if (nextIndex >= prev.length) return prev;
			return prev.map((a, i) =>
				i === nextIndex
					? { ...a, status: 'running' as AgentStatus, startTime: Date.now(), tokensUsed: 0 }
					: a
			);
		});

		timerRef.current = setTimeout(() => {
			setAgents(prev => {
				if (nextIndex >= prev.length) return prev;
				const agent = prev[nextIndex];
				return prev.map((a, i) =>
					i === nextIndex
						? {
							...a,
							status: 'awaiting_approval' as AgentStatus,
							output: getDemoOutput(agent.role),
							endTime: Date.now(),
							tokensUsed: 1200 + nextIndex * 600,
						}
						: a
				);
			});
		}, 2000);
	}, []);

	const handleStart = () => {
		if (timerRef.current) clearTimeout(timerRef.current);
		setIsRunning(true);
		// Reset all agents to waiting, then start the first one
		setAgents(prev => prev.map((a, i) => ({
			...a,
			status: 'waiting' as AgentStatus,
			startTime: null,
			endTime: null,
			tokensUsed: 0,
			summary: '',
			error: null,
			output: '',
		})));
		// Start the first agent after state settles
		setTimeout(() => startNextAgent(0), 50);
	};

	const handleStop = () => {
		if (timerRef.current) clearTimeout(timerRef.current);
		setIsRunning(false);
		setAgents(prev => prev.map(a => ({
			...a,
			status: (a.status === 'running' || a.status === 'awaiting_approval')
				? 'idle' as AgentStatus
				: a.status,
		})));
	};

	const handleReset = () => {
		if (timerRef.current) clearTimeout(timerRef.current);
		setIsRunning(false);
		setAgents(createDemoAgents(roleAssignments));
	};

	// Called when the user approves an agent's output (possibly edited)
	const handleApprove = useCallback((index: number, editedContent: string) => {
		setAgents(prev => prev.map((a, i) =>
			i === index
				? { ...a, status: 'completed' as AgentStatus, output: editedContent }
				: a
		));
		const nextIndex = index + 1;
		// Check against the latest agents length
		setAgents(prev => {
			if (nextIndex >= prev.length) {
				setIsRunning(false);
			}
			return prev;
		});
		if (nextIndex < agents.length) {
			startNextAgent(nextIndex);
		} else {
			setIsRunning(false);
		}
	}, [agents.length, startNextAgent]);

	// Called when the user wants to regenerate an agent's output
	const handleRegenerate = useCallback((index: number) => {
		if (timerRef.current) clearTimeout(timerRef.current);
		setAgents(prev => prev.map((a, i) =>
			i === index
				? { ...a, status: 'running' as AgentStatus, output: '', tokensUsed: 0, startTime: Date.now() }
				: a
		));
		timerRef.current = setTimeout(() => {
			setAgents(prev => {
				const agent = prev[index];
				if (!agent) return prev;
				return prev.map((a, i) =>
					i === index
						? {
							...a,
							status: 'awaiting_approval' as AgentStatus,
							output: getDemoOutput(agent.role),
							endTime: Date.now(),
							tokensUsed: 1200 + index * 600,
						}
						: a
				);
			});
		}, 2000);
	}, []);

	const progress = agents.length > 0 ? completedCount / agents.length : 0;

	return (
		<div style={{
			display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden',
			background: 'radial-gradient(1200px 600px at 50% -200px, color-mix(in srgb, var(--void-fg-1) 4%, transparent), transparent 60%)',
		}}>
			{/* Header with controls */}
			<div
				className="conductor-glass"
				style={{
					position: 'sticky', top: 0, zIndex: 2,
					display: 'flex', alignItems: 'center', justifyContent: 'space-between',
					padding: '12px 16px',
					borderBottom: '1px solid color-mix(in srgb, var(--void-border-2) 70%, transparent)',
				}}
			>
				<div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
					<div style={{
						width: '22px', height: '22px', borderRadius: '7px',
						display: 'flex', alignItems: 'center', justifyContent: 'center',
						background: 'linear-gradient(135deg, rgba(59,130,246,0.22), rgba(139,92,246,0.18))',
						border: '1px solid rgba(139,92,246,0.35)',
						boxShadow: '0 0 12px -4px rgba(139,92,246,0.5)',
					}}>
						<Zap size={11} color="#c4b5fd" />
					</div>
					<div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
						<div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
							<span style={{
								fontSize: '13px', fontWeight: 600,
								color: 'var(--void-fg-1)', letterSpacing: '0.01em',
							}}>Pipeline</span>
							<span className="conductor-pill" style={{
								background: 'linear-gradient(135deg, rgba(59,130,246,0.18), rgba(139,92,246,0.12))',
								color: '#93c5fd',
								border: '1px solid rgba(59,130,246,0.25)',
							}}>Preview</span>
						</div>
						<span className="conductor-eyebrow" style={{ marginTop: '2px' }}>
							{agents.length} agents · {completedCount} done
						</span>
					</div>
				</div>
				<div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
					<button
						onClick={handleReset}
						className="conductor-icon-btn"
						title="Reset pipeline"
						aria-label="Reset pipeline"
					>
						<RotateCcw size={13} />
					</button>
					{isRunning ? (
						<button onClick={handleStop} className="conductor-btn conductor-btn-stop">
							<Square size={10} /> Stop
						</button>
					) : (
						<button onClick={handleStart} className="conductor-btn conductor-btn-run">
							<Play size={10} /> Run
						</button>
					)}
				</div>
			</div>

			{/* Progress track */}
			<div style={{
				height: '2px', width: '100%',
				background: 'color-mix(in srgb, var(--void-border-2) 60%, transparent)',
				position: 'relative', overflow: 'hidden',
			}}>
				<div style={{
					height: '100%', width: `${progress * 100}%`,
					background: 'linear-gradient(90deg, #3b82f6, #8b5cf6, #ec4899)',
					boxShadow: '0 0 10px rgba(139,92,246,0.6)',
					transition: 'width 500ms cubic-bezier(0.2, 0.8, 0.2, 1)',
				}} />
			</div>

			{/* Quick stats bar */}
			<div style={{
				display: 'flex', alignItems: 'center', gap: '14px',
				padding: '9px 16px',
				borderBottom: '1px solid color-mix(in srgb, var(--void-border-2) 60%, transparent)',
				fontSize: '11px', color: 'var(--void-fg-3)',
			}}>
				<div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
					<CheckCircle size={11} color="#10b981" />
					<span style={{ fontVariantNumeric: 'tabular-nums' }}>
						<span style={{ color: 'var(--void-fg-1)', fontWeight: 600 }}>{completedCount}</span>
						<span style={{ opacity: 0.5 }}> / {agents.length}</span>
					</span>
				</div>
				<span style={{ width: 1, height: 10, background: 'var(--void-border-2)', opacity: 0.6 }} />
				<div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
					<Zap size={11} color="#f59e0b" />
					<span style={{ fontVariantNumeric: 'tabular-nums' }}>
						<span style={{ color: 'var(--void-fg-1)', fontWeight: 600 }}>
							{totalTokens > 1000 ? `${(totalTokens / 1000).toFixed(1)}K` : totalTokens}
						</span>
						<span style={{ opacity: 0.7 }}> tokens</span>
					</span>
				</div>
				{hasAwaitingApproval && (
					<div className="conductor-pill" style={{
						marginLeft: 'auto',
						background: 'linear-gradient(135deg, rgba(168,85,247,0.18), rgba(168,85,247,0.08))',
						color: '#d8b4fe',
						border: '1px solid rgba(168,85,247,0.35)',
						boxShadow: '0 0 12px -4px rgba(168,85,247,0.55)',
					}}>
						<span style={{
							width: 5, height: 5, borderRadius: '50%', background: '#c084fc',
							boxShadow: '0 0 6px #c084fc',
						}} />
						承認待ち
					</div>
				)}
			</div>

			{/* Pipeline Flow */}
			<div className="conductor-scroll" style={{ flex: '1 1 0', minHeight: 0, overflowY: 'auto', padding: '18px 16px 24px' }}>
				<div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
					{agents.map((agent, index) => {
						const display = roleDisplayConfig[agent.role];
						const providerTitle = displayInfoOfProviderName(agent.provider).title;
						const isAwaitingApproval = agent.status === 'awaiting_approval';
						const isRunningAgent = agent.status === 'running';
						const isCompleted = agent.status === 'completed';

						const cardClass = [
							'conductor-surface',
							isRunningAgent ? 'conductor-card-active' : '',
							isAwaitingApproval ? 'conductor-approval-border' : '',
						].filter(Boolean).join(' ');

						const dotClass = [
							'conductor-dot',
							(isRunningAgent || isAwaitingApproval) ? 'is-live' : '',
						].filter(Boolean).join(' ');

						return (
							<React.Fragment key={agent.role}>
								{/* Agent Card */}
								<div
									className={cardClass}
									style={{
										display: 'flex', alignItems: 'center', gap: '11px',
										padding: '11px 13px',
										borderRadius: '10px',
										// CSS custom properties drive the running animation accent color
										['--conductor-accent' as any]: display.color,
										['--conductor-accent-glow' as any]: display.glowColor,
										// Subtle tint when running/approval for better feedback
										backgroundImage: isAwaitingApproval
											? `linear-gradient(180deg, rgba(168,85,247,0.07), transparent 70%)`
											: isRunningAgent
												? `linear-gradient(180deg, ${display.color}14, transparent 70%)`
												: undefined,
									}}
								>
									{/* Status dot */}
									<div
										className={dotClass}
										style={{
											backgroundColor: statusColors[agent.status],
											color: statusColors[agent.status],
										}}
									/>

									{/* Role glyph — small color chip */}
									<div style={{
										width: '24px', height: '24px', borderRadius: '7px',
										display: 'flex', alignItems: 'center', justifyContent: 'center',
										background: `linear-gradient(135deg, ${display.color}22, ${display.color}0a)`,
										border: `1px solid ${display.color}33`,
										color: display.color,
										fontSize: '10px', fontWeight: 700, letterSpacing: '0.02em',
										flexShrink: 0,
									}}>
										{display.label.charAt(0)}
									</div>

									{/* Info */}
									<div style={{ flex: 1, minWidth: 0 }}>
										<div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '2px' }}>
											<span style={{
												fontSize: '12px', fontWeight: 600,
												color: 'var(--void-fg-1)', letterSpacing: '0.005em',
											}}>
												{display.label}
											</span>
											<span
												className="conductor-pill"
												style={{
													background: isAwaitingApproval
														? 'rgba(168,85,247,0.14)'
														: isRunningAgent
															? `${display.color}1f`
															: isCompleted
																? 'rgba(16,185,129,0.12)'
																: 'color-mix(in srgb, var(--void-fg-4) 14%, transparent)',
													color: isAwaitingApproval
														? '#d8b4fe'
														: isRunningAgent
															? display.color
															: isCompleted
																? '#34d399'
																: 'var(--void-fg-3)',
													padding: '1px 6px',
													fontSize: '9.5px',
													textTransform: 'uppercase',
													letterSpacing: '0.06em',
													fontWeight: 600,
												}}
											>
												{statusLabels[agent.status]}
											</span>
										</div>
										<div style={{
											fontSize: '10.5px', color: 'var(--void-fg-3)',
											overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
										}}>
											{providerTitle} <span style={{ opacity: 0.5 }}>·</span> <span style={{ fontFamily: 'var(--monaco-monospace-font, monospace)' }}>{agent.model}</span>
										</div>
									</div>

									{/* Tokens */}
									{agent.tokensUsed > 0 && (
										<span style={{
											fontSize: '10px', color: 'var(--void-fg-4)', flexShrink: 0,
											fontVariantNumeric: 'tabular-nums',
											padding: '2px 6px', borderRadius: '4px',
											background: 'color-mix(in srgb, var(--void-fg-1) 4%, transparent)',
										}}>
											{agent.tokensUsed > 1000 ? `${(agent.tokensUsed / 1000).toFixed(1)}K` : agent.tokensUsed}
										</span>
									)}
								</div>

								{/* Approval Panel — shown when this agent is awaiting user review */}
								{isAwaitingApproval && (
									<div className="conductor-enter" style={{ marginTop: '6px' }}>
										<ApprovalPanel
											role={agent.role}
											content={agent.output}
											onApprove={(editedContent) => handleApprove(index, editedContent)}
											onRegenerate={() => handleRegenerate(index)}
										/>
									</div>
								)}

								{/* Connector to next agent */}
								{index < agents.length - 1 && (
									<div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0' }}>
										<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
											<div
												className={`conductor-connector ${isCompleted || isRunningAgent ? 'is-active' : ''}`}
												style={{
													['--conductor-flow-color' as any]: isCompleted
														? display.color
														: isRunningAgent
															? display.color
															: 'var(--void-border-2)',
												}}
											/>
											<ArrowDown
												size={10}
												style={{
													color: isCompleted ? display.color : 'var(--void-fg-4)',
													opacity: isCompleted ? 0.85 : 0.35,
													transition: 'color 220ms ease, opacity 220ms ease',
												}}
											/>
										</div>
									</div>
								)}
							</React.Fragment>
						);
					})}
				</div>
			</div>
		</div>
	);
};
