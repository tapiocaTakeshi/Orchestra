/*--------------------------------------------------------------------------------------
 *  Copyright 2026 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

/*
 * .division/workflow.json opened as a diagram instead of JSON text (workflowEditorPane.ts).
 * The same diagram and node editor as the approval card in the chat; every change is saved to the file
 * right away, and the diagram follows when the file changes on disk (the Leader rewrites it each run).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Braces, Check, Loader2, Workflow } from 'lucide-react';
import { URI } from '../../../../../../../base/common/uri.js';
import { VSBuffer } from '../../../../../../../base/common/buffer.js';
import { useAccessor, useIsDark } from '../util/services.js';
import { DivisionWorkflow, layoutWorkflow, normalizeWorkflow, workflowErrors } from '../../../../common/divisionWorkflow.js';
import { DIVISION_ROLES, divisionRoleLabel } from '../../../../common/voidSettingsTypes.js';
import { WorkflowDiagram, WorkflowLoopSummary, WorkflowNodeEditor, useWorkflowRoleOptions } from './WorkflowReview.js';
import '../styles.css';

const SAVE_DELAY_MS = 400;

type LoadState =
	| { kind: 'loading' }
	| { kind: 'ok' }
	| { kind: 'invalid'; message: string };

const serialize = (w: DivisionWorkflow): string => JSON.stringify(w, null, 2) + '\n';

const ROLE_NAMES: Record<string, string> = Object.fromEntries(DIVISION_ROLES.map(r => [r, divisionRoleLabel[r]]));
const ROLE_OPTIONS: string[] = [...DIVISION_ROLES];
const EMPTY: DivisionWorkflow = { version: 1, enabled: true, nodes: [], edges: [] };

const Editor = ({ uri, openAsText }: { uri: URI; openAsText: () => void }) => {
	const fileService = useAccessor().get('IFileService');
	const [state, setState] = useState<LoadState>({ kind: 'loading' });
	const [workflow, setWorkflow] = useState<DivisionWorkflow | null>(null);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [saving, setSaving] = useState<'idle' | 'pending' | 'saved' | 'error'>('idle');

	// What is on disk as far as we know: our own writes do not reload the diagram.
	const lastText = useRef<string | null>(null);
	const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const pendingSave = useRef<DivisionWorkflow | null>(null);

	const load = useCallback(async () => {
		let text: string;
		try {
			text = (await fileService.readFile(uri)).value.toString();
		} catch (e) {
			setState({ kind: 'invalid', message: `ファイルを読めませんでした: ${e instanceof Error ? e.message : String(e)}` });
			return;
		}
		if (text === lastText.current || pendingSave.current) { return; }
		lastText.current = text;
		const parsed = normalizeWorkflow(text);
		if (!parsed) {
			setState({ kind: 'invalid', message: 'ワークフローとして読めない JSON です (nodes と edges が必要です)。JSON で開いて直してください。' });
			return;
		}
		setWorkflow(layoutWorkflow(parsed));
		setState({ kind: 'ok' });
	}, [fileService, uri.toString()]);

	useEffect(() => {
		void load();
		const sub = fileService.onDidFilesChange(e => { if (e.contains(uri)) { void load(); } });
		return () => sub.dispose();
	}, [load]);

	const flush = useCallback(async () => {
		const w = pendingSave.current;
		if (!w) { return; }
		const text = serialize(w);
		try {
			lastText.current = text;
			await fileService.writeFile(uri, VSBuffer.fromString(text));
			if (pendingSave.current === w) { pendingSave.current = null; }
			setSaving('saved');
		} catch (e) {
			console.error('workflow.json save', e);
			setSaving('error');
		}
	}, [fileService, uri.toString()]);

	// Save what is left when the editor closes.
	useEffect(() => () => {
		if (saveTimer.current) { clearTimeout(saveTimer.current); }
		void flush();
	}, [flush]);

	const change = (next: DivisionWorkflow) => {
		setWorkflow(next);
		pendingSave.current = next;
		setSaving('pending');
		if (saveTimer.current) { clearTimeout(saveTimer.current); }
		saveTimer.current = setTimeout(() => { saveTimer.current = null; void flush(); }, SAVE_DELAY_MS);
	};

	const options = useWorkflowRoleOptions(workflow ?? EMPTY, ROLE_OPTIONS);
	const errors = useMemo(() => (workflow ? workflowErrors(workflow) : []), [workflow]);
	const selected = workflow?.nodes.find(n => n.id === selectedId) ?? null;
	const relPath = uri.path.split('/').slice(-2).join('/');

	return (
		<div style={{ height: '100%', overflow: 'auto', background: 'var(--void-bg-1)', color: 'var(--void-fg-1)' }}>
			<div style={{ maxWidth: 1100, margin: '0 auto', padding: '16px 20px 32px', display: 'flex', flexDirection: 'column', gap: 10 }}>
				<div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
					<Workflow size={16} color='#8b5cf6' />
					<span style={{ fontSize: 14, fontWeight: 600 }}>ワークフロー</span>
					<code style={{ fontSize: 11.5, color: 'var(--void-fg-3)' }}>{relPath}</code>
					<span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
						<span style={{ fontSize: 11.5, color: saving === 'error' ? '#f87171' : 'var(--void-fg-3)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
							{saving === 'pending' && <><Loader2 size={12} className='animate-spin' /> 保存中…</>}
							{saving === 'saved' && <><Check size={12} /> 保存しました</>}
							{saving === 'error' && '保存できませんでした'}
						</span>
						<button type='button' onClick={openAsText} title='JSON テキストとして開く'
							style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 6, fontSize: 11.5, cursor: 'pointer', border: '1px solid var(--void-border-2)', background: 'transparent', color: 'var(--void-fg-2)' }}>
							<Braces size={12} /> JSON で開く
						</button>
					</span>
				</div>

				{state.kind === 'loading' && <div style={{ fontSize: 12, color: 'var(--void-fg-3)' }}>読み込み中…</div>}
				{state.kind === 'invalid' && <div style={{ fontSize: 12.5, color: '#f87171' }}>{state.message}</div>}

				{state.kind === 'ok' && workflow && <>
					<div style={{ fontSize: 12, color: 'var(--void-fg-3)' }}>
						ノードを押すと編集できます。変更はすぐこのファイルに保存され、次の Division Project の実行で使われます。繰り返しは for / while ループ、同時に進めたい作業は並列ノードで組めます。
					</div>
					<WorkflowLoopSummary workflow={workflow} />
					<WorkflowDiagram workflow={workflow} selectedId={selectedId} onSelect={setSelectedId} roleNames={ROLE_NAMES} />
					{selected && <WorkflowNodeEditor workflow={workflow} selected={selected} options={options} roleNames={ROLE_NAMES} onChange={change} onSelect={setSelectedId} />}
					{errors.length > 0 && <div style={{ fontSize: 12, color: '#f87171' }}>{errors.join(' ')}</div>}
				</>}
			</div>
		</div>
	);
};

export const WorkflowFileEditor = ({ uri, openAsText }: { uri: URI; openAsText: () => void }) => {
	const isDark = useIsDark();
	return (
		<div className={`@@void-scope ${isDark ? 'dark' : ''}`} style={{ width: '100%', height: '100%' }}>
			<Editor key={uri.toString()} uri={uri} openAsText={openAsText} />
		</div>
	);
};
