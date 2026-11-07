/*--------------------------------------------------------------------------------------
 *  Copyright 2026 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

/*
 * The first-run onboarding's "how it works" page (void-onboarding/VoidOnboarding.tsx, after "Welcome to
 * Orchestra"): an animated hero, and a tutorial that plays itself and shows how a
 * Division Project run goes — the request, the workflow diagram (.division/workflow.json), the paper
 * (.division/paper.md) and the specification (.division/specification.md), the design (.division/design/)
 * and approving / editing them — with buttons that open those files.
 * Animations are CSS only and stop when the OS asks for reduced motion.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, CheckCircle2, MessageSquare, ChevronLeft, ChevronRight, FileJson, FileText, LayoutTemplate, Pause, Play, Repeat, Sparkles, Split, UserCheck, Users, Workflow, X } from 'lucide-react';
import { URI } from '../../../../../../../base/common/uri.js';
import { useAccessor } from '../util/services.js';
import { scopedCss } from '../util/scopedCss.js';
import '../styles.css';
import { TranslationKey, useTranslation } from '../util/i18n.js';

const STEP_MS = 5200;
// The chat's Ctrl+L action (opens the chat sidebar and focuses its input). See actionIDs.ts.
const OPEN_CHAT_COMMAND_ID = 'void.ctrlLAction';
const HIDE_KEY = 'orchestra.intro.tutorialHidden';

const readHidden = (): boolean => {
	try { return window.localStorage.getItem(HIDE_KEY) === '1'; } catch { return false; }
};
const writeHidden = (hidden: boolean): void => {
	try { window.localStorage.setItem(HIDE_KEY, hidden ? '1' : '0'); } catch { /* not remembered: fine */ }
};

const STYLES = `
.oi-root { --oi-accent: var(--vscode-button-background, #0e70c0); --oi-violet: #8b5cf6; --oi-green: #10b981; --oi-amber: #f59e0b; --oi-red: #dc2626; }
@keyframes oi-fade-up { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes oi-float { 0%, 100% { transform: translate(0, 0) scale(1); } 50% { transform: translate(6px, -6px) scale(1.06); } }
@keyframes oi-spin { to { transform: rotate(360deg); } }
@keyframes oi-pop { 0% { opacity: 0; transform: scale(0.6); } 70% { opacity: 1; transform: scale(1.06); } 100% { opacity: 1; transform: scale(1); } }
@keyframes oi-draw { from { stroke-dashoffset: 60; } to { stroke-dashoffset: 0; } }
@keyframes oi-type { from { max-width: 0; } to { max-width: 16em; } }
@keyframes oi-caret { 50% { border-color: transparent; } }
@keyframes oi-glow { 0%, 100% { box-shadow: 0 0 0 0 rgba(139, 92, 246, 0); } 50% { box-shadow: 0 0 0 4px rgba(139, 92, 246, 0.25); } }
@keyframes oi-progress { from { transform: scaleX(0); } to { transform: scaleX(1); } }
@keyframes oi-shimmer { from { background-position: -160px 0; } to { background-position: 160px 0; } }
@keyframes oi-press { 0%, 60% { transform: none; } 70% { transform: scale(0.94); } 80%, 100% { transform: none; } }
.oi-hero { position: relative; overflow: hidden; border-radius: 14px; padding: 18px 16px 14px; border: 1px solid var(--void-border-2); background: var(--void-bg-2); }
.oi-orb { position: absolute; border-radius: 999px; filter: blur(26px); opacity: 0.55; pointer-events: none; animation: oi-float 7s ease-in-out infinite; }
.oi-ring { position: absolute; right: 14px; top: 14px; width: 34px; height: 34px; border-radius: 999px; border: 2px dashed rgba(139, 92, 246, 0.5); animation: oi-spin 14s linear infinite; }
.oi-in { opacity: 0; animation: oi-fade-up 0.5s ease-out forwards; }
.oi-pill { display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 999px; font-size: 11px; border: 1px solid var(--void-border-2); background: var(--void-bg-1); color: var(--void-fg-2); }
.oi-card { border-radius: 14px; border: 1px solid var(--void-border-2); background: var(--void-bg-2); overflow: hidden; }
.oi-stage { position: relative; height: 150px; margin: 0 12px; border-radius: 10px; background: var(--void-bg-1); border: 1px solid var(--void-border-2); overflow: hidden; }
.oi-svg-pop { opacity: 0; transform-box: fill-box; transform-origin: center; animation: oi-pop 0.45s ease-out forwards; }
.oi-edge { stroke: var(--void-fg-3); stroke-width: 1.4; fill: none; stroke-dasharray: 60; stroke-dashoffset: 60; animation: oi-draw 0.5s ease-out forwards; }
.oi-file { display: inline-flex; align-items: center; gap: 4px; padding: 2px 7px; border-radius: 6px; font-size: 10.5px; font-family: var(--vscode-editor-font-family, monospace); color: var(--void-fg-1); background: rgba(139, 92, 246, 0.14); border: 1px solid rgba(139, 92, 246, 0.45); opacity: 0; animation: oi-pop 0.45s ease-out forwards, oi-glow 2.2s ease-in-out 0.6s infinite; }
.oi-typing { display: inline-block; overflow: hidden; white-space: nowrap; vertical-align: bottom; border-right: 2px solid var(--void-fg-1); animation: oi-type 1.8s steps(14) 0.3s both, oi-caret 0.8s step-end infinite; }
.oi-skeleton { border-radius: 4px; background: linear-gradient(90deg, rgba(255,255,255,0.05), rgba(255,255,255,0.14), rgba(255,255,255,0.05)); background-size: 320px 100%; animation: oi-shimmer 1.6s linear infinite; }
.oi-dot { width: 7px; height: 7px; border-radius: 999px; border: none; padding: 0; cursor: pointer; background: var(--void-border-1, rgba(127,127,127,0.4)); transition: width 0.25s ease, background 0.25s ease; }
.oi-dot[data-active='true'] { width: 18px; background: var(--oi-accent); }
.oi-bar { height: 2px; background: var(--oi-accent); transform-origin: left; }
.oi-btn { display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 6px; font-size: 11px; cursor: pointer; border: 1px solid var(--void-border-2); background: transparent; color: var(--void-fg-2); }
.oi-btn:hover:not(:disabled) { color: var(--void-fg-1); border-color: var(--void-fg-3); }
.oi-btn:disabled { opacity: 0.5; cursor: default; }
.oi-icon-btn { display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: 6px; border: none; background: transparent; color: var(--void-fg-3); cursor: pointer; }
.oi-icon-btn:hover { color: var(--void-fg-1); background: var(--void-bg-3, rgba(127,127,127,0.15)); }
.oi-press { animation: oi-press 2.4s ease-in-out 1s infinite; }
.oi-welcome { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr); gap: 16px; align-items: start; text-align: left; }
@media (max-width: 760px) { .oi-welcome { grid-template-columns: minmax(0, 1fr); } }
.oi-cta { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; border: none; background: var(--oi-accent); color: var(--vscode-button-foreground, #fff); }
.oi-cta:hover { filter: brightness(1.08); }
@media (prefers-reduced-motion: reduce) {
	.oi-root *, .oi-root *::before, .oi-root *::after { animation-duration: 0.001ms !important; animation-delay: 0ms !important; animation-iteration-count: 1 !important; }
}
`;

const delay = (s: number): React.CSSProperties => ({ animationDelay: `${s}s` });

/** The hero. `showOpenChat` adds a button that opens the chat (off in the onboarding, which covers the IDE). */
export const OrchestraHero = ({ showOpenChat = true }: { showOpenChat?: boolean }) => {
	const { t } = useTranslation();
	const commandService = useAccessor().get('ICommandService');
	return (
		<div className='oi-root oi-hero select-none'>
			<style>{scopedCss(STYLES)}</style>
			<div className='oi-orb' style={{ width: 120, height: 120, left: -30, top: -40, background: 'var(--oi-violet)' }} />
			<div className='oi-orb' style={{ width: 110, height: 110, right: -40, bottom: -50, background: 'var(--oi-accent)', animationDelay: '-3s' }} />
			<div className='oi-ring' />
			<div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 8 }}>
				<div className='oi-in' style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--void-fg-3)', ...delay(0) }}>
					<Sparkles size={13} /> Orchestra
				</div>
				<div className='oi-in' style={{ fontSize: 18, fontWeight: 650, lineHeight: 1.3, color: 'var(--void-fg-1)', paddingRight: 40, ...delay(0.08) }}>
					{t('intro.hero.title')}
				</div>
				<div className='oi-in' style={{ fontSize: 12, lineHeight: 1.55, color: 'var(--void-fg-3)', ...delay(0.18) }}>
					{t('intro.hero.sub')}
				</div>
				<div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
					<span className='oi-pill oi-in' style={delay(0.3)}><Users size={12} color='var(--oi-red)' /> {t('intro.pill.team')}</span>
					<span className='oi-pill oi-in' style={delay(0.4)}><Workflow size={12} color='var(--oi-violet)' /> {t('intro.pill.workflow')}</span>
					<span className='oi-pill oi-in' style={delay(0.5)}><UserCheck size={12} color='var(--oi-amber)' /> {t('intro.pill.approve')}</span>
				</div>
				{showOpenChat && <div className='oi-in' style={{ marginTop: 6, ...delay(0.6) }}>
					<button type='button' className='oi-cta' onClick={() => { void commandService.executeCommand(OPEN_CHAT_COMMAND_ID); }}>
						<MessageSquare size={13} /> {t('intro.hero.openChat')}
					</button>
				</div>}
			</div>
		</div>
	);
};

// ---------------------------------------------------------------------------
// Tutorial scenes (each is redrawn, so its animations replay, when it comes up)
// ---------------------------------------------------------------------------

const SceneAsk = () => {
	const { t } = useTranslation();
	return (
		<div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 10, padding: '0 14px' }}>
			<div className='oi-in' style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 9, border: '1px solid var(--void-border-2)', background: 'var(--void-bg-2)', fontSize: 12, color: 'var(--void-fg-1)' }}>
				<span className='oi-typing'>{t('intro.step1.typing')}</span>
				<span style={{ marginLeft: 'auto', display: 'inline-grid', placeItems: 'center', width: 22, height: 22, borderRadius: 6, background: 'var(--oi-accent)', color: '#fff' }} className='oi-press'>
					<ChevronRight size={13} />
				</span>
			</div>
			<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
				{['Leader', 'Searcher', 'Researcher', 'Writer', 'Designer', 'Coder', 'Reviewer'].map((r, i) => (
					<span key={r} className='oi-pill oi-in' style={{ ...delay(1.9 + i * 0.12), fontSize: 10, padding: '2px 7px' }}>{r}</span>
				))}
			</div>
		</div>
	);
};

/** A small workflow drawing itself: start → (searcher | researcher) → writer → approval → while { coder → reviewer }. */
const SceneWorkflow = () => {
	// One SVG (330 × 128 units) so the nodes and the arrows scale together with the sidebar's width.
	const nodes: Array<{ x: number; y: number; w: number; label: string; color: string; d: number; dashed?: boolean }> = [
		{ x: 6, y: 52, w: 40, label: '開始', color: '#3b82f6', d: 0.1 },
		{ x: 58, y: 24, w: 62, label: 'Searcher', color: '#dc2626', d: 0.35 },
		{ x: 58, y: 80, w: 62, label: 'Researcher', color: '#dc2626', d: 0.45 },
		{ x: 134, y: 52, w: 48, label: 'Writer', color: '#dc2626', d: 0.75 },
		{ x: 194, y: 52, w: 40, label: '承認', color: '#f59e0b', d: 1.0, dashed: true },
		{ x: 246, y: 24, w: 78, label: '↻ while: 目標', color: '#8b5cf6', d: 1.3 },
		{ x: 246, y: 80, w: 78, label: 'Coder→Reviewer', color: '#8b5cf6', d: 1.55 },
	];
	const edges: Array<{ d: string; t: number }> = [
		{ d: 'M 46 63 C 52 63, 52 35, 58 35', t: 0.25 },
		{ d: 'M 46 63 C 52 63, 52 91, 58 91', t: 0.3 },
		{ d: 'M 120 35 C 127 35, 127 63, 134 63', t: 0.6 },
		{ d: 'M 120 91 C 127 91, 127 63, 134 63', t: 0.65 },
		{ d: 'M 182 63 L 194 63', t: 0.9 },
		{ d: 'M 234 63 C 240 63, 240 35, 246 35', t: 1.2 },
		{ d: 'M 285 46 L 285 80', t: 1.45 },
	];
	return (
		<div style={{ position: 'absolute', inset: 0 }}>
			<svg width='100%' height='100%' viewBox='0 0 330 128' preserveAspectRatio='xMidYMid meet' style={{ position: 'absolute', inset: 0 }}>
				{edges.map((e, i) => <path key={i} className='oi-edge' d={e.d} style={delay(e.t)} />)}
				{nodes.map(n => (
					<g key={n.label} className='oi-svg-pop' style={delay(n.d)}>
						<rect x={n.x} y={n.y} width={n.w} height={22} rx={6} fill='var(--void-bg-2)' stroke={n.color} strokeWidth={1.2} strokeDasharray={n.dashed ? '4 2' : undefined} />
						<text x={n.x + n.w / 2} y={n.y + 14.5} textAnchor='middle' fontSize={9} fontWeight={600} fill='var(--void-fg-1)'>{n.label}</text>
					</g>
				))}
			</svg>
			<div style={{ position: 'absolute', right: 8, bottom: 6 }}>
				<span className='oi-file' style={delay(1.9)}><FileJson size={11} /> .division/workflow.json</span>
			</div>
			<div style={{ position: 'absolute', left: 8, top: 6, display: 'flex', gap: 4 }}>
				<span className='oi-pill oi-in' style={{ ...delay(2.2), fontSize: 9.5, padding: '1px 6px' }}><Repeat size={10} color='#8b5cf6' /> for / while</span>
				<span className='oi-pill oi-in' style={{ ...delay(2.35), fontSize: 9.5, padding: '1px 6px' }}><Split size={10} color='#10b981' /> 並列</span>
			</div>
		</div>
	);
};

/** The paper and the specification being written: paper.md → specification.md, both kept up to date. */
const SceneDocs = () => {
	const lines = (n: number, start: number) => Array.from({ length: n }, (_, i) => (
		<div key={i} className='oi-in' style={{ width: `${88 - (i % 3) * 18}%`, ...delay(start + i * 0.18) }}><div className='oi-skeleton' style={{ height: 6 }} /></div>
	));
	const doc = (icon: React.ReactNode, file: string, who: string, color: string, d: number, body: React.ReactNode) => (
		<div className='oi-in' style={{ flex: 1, minWidth: 0, borderRadius: 8, border: `1px solid ${color}`, background: 'var(--void-bg-2)', padding: '6px 7px', display: 'flex', flexDirection: 'column', gap: 4, ...delay(d) }}>
			<div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9.5, fontWeight: 600, color: 'var(--void-fg-1)', whiteSpace: 'nowrap', overflow: 'hidden' }}>
				<span style={{ color, display: 'inline-flex' }}>{icon}</span>{file}
			</div>
			<div style={{ fontSize: 9, color: 'var(--void-fg-3)' }}>{who}</div>
			{body}
		</div>
	);
	return (
		<div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px' }}>
			{doc(<BookOpen size={11} />, 'paper.md', 'Searcher · Researcher', '#3b82f6', 0.1, lines(4, 0.4))}
			<svg width='22' height='14' viewBox='0 0 22 14' style={{ flexShrink: 0 }}><path className='oi-edge' d='M 1 7 L 19 7 M 14 2 L 20 7 L 14 12' style={delay(1.2)} /></svg>
			{doc(<FileText size={11} />, 'specification.md', 'Writer', '#8b5cf6', 1.35, <>
				{['機能', '画面', 'データ', '受け入れ条件'].map((h, i) => (
					<div key={h} className='oi-in' style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, color: 'var(--void-fg-2)', ...delay(1.6 + i * 0.2) }}>
						<span style={{ width: 4, height: 4, borderRadius: 999, background: '#8b5cf6' }} />{h}
					</div>
				))}
			</>)}
			<div style={{ position: 'absolute', left: 10, bottom: 6 }}>
				<span className='oi-pill oi-in' style={{ ...delay(2.5), fontSize: 9.5, padding: '1px 6px' }}>↻ 毎回、一新せず更新</span>
			</div>
		</div>
	);
};

/** A screen wireframe drawing itself, saved as .division/design/index.html. */
const SceneDesign = () => (
	<div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '0 14px' }}>
		<div className='oi-in' style={{ width: 128, height: 96, borderRadius: 8, border: '1px solid var(--void-border-2)', background: 'var(--void-bg-2)', padding: 7, display: 'flex', flexDirection: 'column', gap: 5, ...delay(0.1) }}>
			<div style={{ display: 'flex', gap: 3 }}>
				{['#ef4444', '#f59e0b', '#22c55e'].map(c => <span key={c} style={{ width: 5, height: 5, borderRadius: 999, background: c }} />)}
			</div>
			<div className='oi-in' style={{ width: '70%', ...delay(0.4) }}><div className='oi-skeleton' style={{ height: 10 }} /></div>
			<div style={{ display: 'flex', gap: 4 }}>
				<div className='oi-in' style={{ flex: 1, ...delay(0.7) }}><div className='oi-skeleton' style={{ height: 30 }} /></div>
				<div className='oi-in' style={{ flex: 1, ...delay(0.85) }}><div className='oi-skeleton' style={{ height: 30 }} /></div>
			</div>
			<div className='oi-in' style={{ height: 12, width: 46, borderRadius: 4, background: 'var(--oi-accent)', ...delay(1.1) }} />
		</div>
		<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6, minWidth: 0, flex: 1 }}>
			<span className='oi-file' style={delay(1.4)}><LayoutTemplate size={11} /> .division/design/</span>
			<span className='oi-pill oi-in' style={{ ...delay(1.7), fontSize: 10 }}>index.html · 画面ごとの HTML</span>
			<span className='oi-pill oi-in' style={{ ...delay(1.95), fontSize: 10 }}>開いて直接編集できる</span>
		</div>
	</div>
);

/** The approval card: the file is edited, then approved. */
const SceneApprove = () => (
	<div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8, padding: '0 14px' }}>
		<div className='oi-in' style={{ borderRadius: 9, border: '1px dashed var(--oi-amber)', background: 'var(--void-bg-2)', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6, ...delay(0.1) }}>
			<div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--void-fg-1)', fontWeight: 600 }}>
				<UserCheck size={12} color='var(--oi-amber)' /> 仕様書を確認
				<span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--void-fg-3)', fontWeight: 400 }}>.division/specification.md</span>
			</div>
			<div style={{ display: 'flex', gap: 6 }}>
				<span className='oi-pill oi-in' style={{ ...delay(0.6), fontSize: 10 }}>✎ 編集</span>
				<span className='oi-pill oi-in' style={{ ...delay(0.8), fontSize: 10 }}>↩ 差し戻す</span>
				<span className='oi-in' style={delay(1.0)}><span className='oi-pill oi-press' style={{ fontSize: 10, borderColor: 'var(--oi-accent)', background: 'var(--oi-accent)', color: '#fff' }}>✓ 承認</span></span>
			</div>
		</div>
		<div className='oi-in' style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--oi-green)', ...delay(2.1) }}>
			<CheckCircle2 size={13} /> 編集した内容でデザイン・実装へ
		</div>
	</div>
);

const SCENES: Array<{ title: TranslationKey; body: TranslationKey; Scene: () => React.ReactElement }> = [
	{ title: 'intro.step1.title', body: 'intro.step1.body', Scene: SceneAsk },
	{ title: 'intro.step2.title', body: 'intro.step2.body', Scene: SceneWorkflow },
	{ title: 'intro.stepDocs.title', body: 'intro.stepDocs.body', Scene: SceneDocs },
	{ title: 'intro.step3.title', body: 'intro.step3.body', Scene: SceneDesign },
	{ title: 'intro.step4.title', body: 'intro.step4.body', Scene: SceneApprove },
];

/** Whether .division/workflow.json and .division/design/ exist in the open folder, and opening them. */
const useDivisionFiles = () => {
	const accessor = useAccessor();
	const workspace = accessor.get('IWorkspaceContextService');
	const fileService = accessor.get('IFileService');
	const commandService = accessor.get('ICommandService');
	const folder = workspace.getWorkspace().folders[0]?.uri as URI | undefined;
	type Exists = { workflow: boolean; paper: boolean; spec: boolean; design: boolean; designIndex: boolean };
	const [exists, setExists] = useState<Exists>({ workflow: false, paper: false, spec: false, design: false, designIndex: false });

	const folderKey = folder?.toString() ?? '';
	const latest = useRef({ folder, fileService });
	latest.current = { folder, fileService };
	const refresh = useCallback(async () => {
		const { folder: f, fileService: files } = latest.current;
		if (!f) { return; }
		const check = async (...parts: string[]) => { try { return await files.exists(URI.joinPath(f, '.division', ...parts)); } catch { return false; } };
		const [workflow, paper, spec, design, designIndex] = await Promise.all([
			check('workflow.json'), check('paper.md'), check('specification.md'), check('design'), check('design', 'index.html'),
		]);
		const next: Exists = { workflow, paper, spec, design, designIndex };
		// Only re-render when something changed (this runs every few seconds).
		setExists(prev => ((Object.keys(next) as Array<keyof Exists>).every(k => prev[k] === next[k]) ? prev : next));
	}, [folderKey]);

	useEffect(() => {
		void refresh();
		const timer = setInterval(() => { void refresh(); }, 8000);
		return () => clearInterval(timer);
	}, [refresh]);

	const openFile = (name: string) => { if (folder) { void commandService.executeCommand('vscode.open', URI.joinPath(folder, '.division', name)); } };
	const openWorkflow = () => openFile('workflow.json');
	const openPaper = () => openFile('paper.md');
	const openSpec = () => openFile('specification.md');
	const openDesign = () => {
		if (!folder) { return; }
		if (exists.designIndex) { void commandService.executeCommand('vscode.open', URI.joinPath(folder, '.division', 'design', 'index.html')); }
		else { void commandService.executeCommand('revealInExplorer', URI.joinPath(folder, '.division', 'design')); }
	};
	return { hasFolder: !!folder, exists, openWorkflow, openPaper, openSpec, openDesign };
};

/**
 * The self-playing tutorial. `hideable`: a button that hides it (remembered). `showFiles`: the list of
 * .division files with buttons that open them. The onboarding turns both off.
 */
export const OrchestraTutorial = ({ hideable = true, showFiles = true }: { hideable?: boolean, showFiles?: boolean }) => {
	const { t } = useTranslation();
	const [hiddenState, setHidden] = useState(readHidden);
	const hidden = hideable && hiddenState;
	const [step, setStep] = useState(0);
	const [paused, setPaused] = useState(false);
	const [hovered, setHovered] = useState(false);
	const files = useDivisionFiles();
	const running = !paused && !hovered && !hidden;

	useEffect(() => {
		if (!running) { return; }
		const timer = setTimeout(() => setStep(s => (s + 1) % SCENES.length), STEP_MS);
		return () => clearTimeout(timer);
	}, [running, step]);

	if (hidden) {
		return (
			<div className='oi-root' style={{ display: 'flex', justifyContent: 'flex-start' }}>
				<style>{scopedCss(STYLES)}</style>
				<button type='button' className='oi-btn' onClick={() => { setHidden(false); writeHidden(false); setStep(0); }}>
					<Play size={11} /> {t('intro.tutorial.show')}
				</button>
			</div>
		);
	}

	const { Scene, title, body } = SCENES[step];
	const go = (d: number) => setStep(s => (s + d + SCENES.length) % SCENES.length);

	return (
		<div className='oi-root oi-card select-none' onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} aria-label={t('intro.tutorial.title')}>
			<style>{scopedCss(STYLES)}</style>
			<div style={{ height: 2, background: 'var(--void-border-2)' }}>
				{/* keyed by step so the bar restarts; paused bars stop where they are */}
				<div key={step} className='oi-bar' style={{ animation: `oi-progress ${STEP_MS}ms linear forwards`, animationPlayState: running ? 'running' : 'paused' }} />
			</div>
			<div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px 6px' }}>
				<Sparkles size={12} color='var(--oi-violet)' />
				<span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--void-fg-1)' }}>{t('intro.tutorial.title')}</span>
				<span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 2 }}>
					<button type='button' className='oi-icon-btn' onClick={() => go(-1)} aria-label={t('intro.tutorial.prev')}><ChevronLeft size={13} /></button>
					<button type='button' className='oi-icon-btn' onClick={() => setPaused(p => !p)} aria-label={t(paused ? 'intro.tutorial.play' : 'intro.tutorial.pause')}>
						{paused ? <Play size={12} /> : <Pause size={12} />}
					</button>
					<button type='button' className='oi-icon-btn' onClick={() => go(1)} aria-label={t('intro.tutorial.next')}><ChevronRight size={13} /></button>
					{hideable && <button type='button' className='oi-icon-btn' onClick={() => { setHidden(true); writeHidden(true); }} aria-label={t('intro.tutorial.hide')} title={t('intro.tutorial.hide')}><X size={13} /></button>}
				</span>
			</div>

			<div className='oi-stage'>
				<Scene key={step} />
			</div>

			<div key={`text-${step}`} style={{ padding: '9px 12px 4px', display: 'flex', flexDirection: 'column', gap: 3 }}>
				<div className='oi-in' style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--void-fg-1)' }}>{t(title)}</div>
				<div className='oi-in' style={{ fontSize: 11.5, lineHeight: 1.55, color: 'var(--void-fg-3)', ...delay(0.08) }}>{t(body)}</div>
			</div>

			<div style={{ display: 'flex', justifyContent: 'center', gap: 5, padding: '6px 0 8px' }}>
				{SCENES.map((s, i) => (
					<button key={s.title} type='button' className='oi-dot' data-active={i === step} onClick={() => setStep(i)} aria-label={t(s.title)} />
				))}
			</div>

			{/* The files the user approves and edits, with a way to open them */}
			{showFiles && <div style={{ borderTop: '1px solid var(--void-border-2)', padding: '8px 12px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
				<div style={{ fontSize: 11, color: 'var(--void-fg-3)' }}>{t('intro.files.title')}</div>
				{[
					{ key: 'workflow', icon: <FileJson size={13} color='var(--oi-violet)' />, label: t('intro.files.workflow'), path: '.division/workflow.json', ok: files.exists.workflow, open: files.openWorkflow },
					{ key: 'paper', icon: <BookOpen size={13} color='#3b82f6' />, label: t('intro.files.paper'), path: '.division/paper.md', ok: files.exists.paper, open: files.openPaper },
					{ key: 'spec', icon: <FileText size={13} color='var(--oi-violet)' />, label: t('intro.files.spec'), path: '.division/specification.md', ok: files.exists.spec, open: files.openSpec },
					{ key: 'design', icon: <LayoutTemplate size={13} color='var(--oi-green)' />, label: t('intro.files.design'), path: '.division/design/', ok: files.exists.design, open: files.openDesign },
				].map(f => (
					<div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
						{f.icon}
						<span style={{ fontSize: 11.5, color: 'var(--void-fg-1)', minWidth: 0 }}>
							{f.label} <code style={{ fontSize: 10.5, color: 'var(--void-fg-3)' }}>{f.path}</code>
						</span>
						<span style={{ marginLeft: 'auto', flexShrink: 0 }}>
							{f.ok
								? <button type='button' className='oi-btn' onClick={f.open}>{t('intro.files.open')}</button>
								: <span style={{ fontSize: 10.5, color: 'var(--void-fg-4)' }}>{t(files.hasFolder ? 'intro.files.missing' : 'intro.files.noFolder')}</span>}
						</span>
					</div>
				))}
			</div>}
		</div>
	);
};

/** The intro on the onboarding's "how it works" page: the hero and the tutorial side by side (stacked when narrow). */
export const OrchestraWelcome = () => {
	return (
		<div className='oi-root oi-welcome' style={{ width: '100%' }}>
			<OrchestraHero showOpenChat={false} />
			<OrchestraTutorial hideable={false} showFiles={false} />
		</div>
	);
};
