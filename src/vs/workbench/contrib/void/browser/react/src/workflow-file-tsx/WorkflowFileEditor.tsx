/*--------------------------------------------------------------------------------------
 *  .division/workflow.json as a diagram (workflowFilePane.ts opens it in place of the JSON text).
 *  The same diagram and node editor as the workflow review in the chat: click a node to edit it,
 *  add a step / loop / parallel node after it or delete it. Edits mark the editor dirty and are
 *  written back as JSON on Save (Ctrl+S, or the button). "Open as JSON" shows the text.
 *--------------------------------------------------------------------------------------*/

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileJson, RotateCcw, Save } from 'lucide-react';
import { URI } from '../../../../../../../base/common/uri.js';
import type { Event } from '../../../../../../../base/common/event.js';
import { useAccessor, useDivisionProjectConfig, useIsDark } from '../util/services.js';
import { DivisionWorkflow, layoutWorkflow, normalizeWorkflow, workflowErrors } from '../../../../common/divisionWorkflow.js';
import { DIVISION_ROLES, divisionRoleLabel } from '../../../../common/voidSettingsTypes.js';
import { WorkflowDiagram, WorkflowLoopSummary, WorkflowNodeEditor, useWorkflowRoleOptions } from '../workflow-tsx/WorkflowReview.js';
import '../styles.css';

/** What the editor pane gives the component (one per opened file). */
export type WorkflowFileBridge = {
	uri: URI;
	/** The JSON to write on save, or undefined when there is nothing to save. */
	setPending: (json: string | undefined) => void;
	isDirty: () => boolean;
	onDidChangeDirty: Event<void>;
	/** Fired after a revert: reload from the file. */
	onDidRevert: Event<void>;
	/** Write now (the Save button). */
	save: () => Promise<void>;
};

/** The JSON written back, the same shape the Division Project run writes. */
export const workflowToJson = (w: DivisionWorkflow): string => JSON.stringify(w, null, 2) + '\n';

const OPEN_WITH_COMMAND_ID = 'vscode.openWith';

const buttonStyle = (primary: boolean, disabled = false): React.CSSProperties => ({
	display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 6, fontSize: 12, cursor: disabled ? 'default' : 'pointer',
	border: primary ? 'none' : '1px solid var(--void-border-2)', opacity: disabled ? 0.5 : 1,
	background: primary ? 'var(--vscode-button-background, #0e70c0)' : 'transparent',
	color: primary ? 'var(--vscode-button-foreground, #fff)' : 'var(--void-fg-2)',
});

type LoadState = { kind: 'loading' } | { kind: 'ok' } | { kind: 'invalid'; message: string };

const WorkflowFileEditorInner = ({ bridge }: { bridge: WorkflowFileBridge }) => {
	const accessor = useAccessor();
	const fileService = accessor.get('IFileService');
	const commandService = accessor.get('ICommandService');
	const project = useDivisionProjectConfig();

	const [workflow, setWorkflow] = useState<DivisionWorkflow | null>(null);
	const [load, setLoad] = useState<LoadState>({ kind: 'loading' });
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [dirty, setDirty] = useState(bridge.isDirty());
	const [saveError, setSaveError] = useState<string | null>(null);
	const mounted = useRef(true);
	useEffect(() => () => { mounted.current = false; }, []);

	const reload = useCallback(async () => {
		try {
			const content = await fileService.readFile(bridge.uri);
			const text = content.value.toString();
			const parsed = normalizeWorkflow(text);
			if (!mounted.current) { return; }
			if (!parsed) {
				setWorkflow(null);
				setLoad({ kind: 'invalid', message: text.trim() ? 'ワークフローの形式 (nodes と edges) として読めませんでした。' : 'ファイルが空です。' });
				return;
			}
			// Nodes without positions (all at 0,0) are laid out; positions already set are kept.
			const needsLayout = parsed.nodes.length > 1 && parsed.nodes.every(n => n.position.x === 0 && n.position.y === 0);
			setWorkflow(needsLayout ? layoutWorkflow(parsed) : parsed);
			setLoad({ kind: 'ok' });
			setSelectedId(id => (id && parsed.nodes.some(n => n.id === id) ? id : null));
		} catch (e) {
			if (!mounted.current) { return; }
			setWorkflow(null);
			setLoad({ kind: 'invalid', message: `読み込めませんでした: ${e instanceof Error ? e.message : String(e)}` });
		}
	}, [fileService, bridge]);

	useEffect(() => { void reload(); }, [reload]);

	// The file changed on disk (for example the Division Project run rewrote it): reload unless there are unsaved edits.
	useEffect(() => {
		const d = fileService.onDidFilesChange(e => {
			if (e.contains(bridge.uri) && !bridge.isDirty()) { void reload(); }
		});
		return () => d.dispose();
	}, [fileService, bridge, reload]);

	useEffect(() => {
		const d1 = bridge.onDidChangeDirty(() => { setDirty(bridge.isDirty()); });
		const d2 = bridge.onDidRevert(() => { void reload(); });
		return () => { d1.dispose(); d2.dispose(); };
	}, [bridge, reload]);

	const roleOptions = useMemo(() => {
		const fromProject = (project?.agents ?? []).map(a => String(a.role));
		return [...new Set([...fromProject, ...DIVISION_ROLES])];
	}, [project]);
	const roleNames = useMemo(() => Object.fromEntries(Object.entries(divisionRoleLabel)) as Record<string, string>, []);
	const empty: DivisionWorkflow = { version: 1, enabled: true, nodes: [], edges: [] };
	const options = useWorkflowRoleOptions(workflow ?? empty, roleOptions);
	const errors = useMemo(() => (workflow ? workflowErrors(workflow) : []), [workflow]);

	const change = (next: DivisionWorkflow) => {
		setWorkflow(next);
		setSaveError(null);
		bridge.setPending(workflowToJson(next));
	};

	const save = async () => {
		try { await bridge.save(); setSaveError(null); }
		catch (e) { setSaveError(`保存できませんでした: ${e instanceof Error ? e.message : String(e)}`); }
	};
	const openAsJson = () => { void commandService.executeCommand(OPEN_WITH_COMMAND_ID, bridge.uri, 'default'); };

	const header = (
		<div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
			<span style={{ fontSize: 15, fontWeight: 600, color: 'var(--void-fg-1)' }}>🗺️ ワークフロー</span>
			<code style={{ fontSize: 11, color: 'var(--void-fg-3)' }}>.division/workflow.json</code>
			{dirty && <span style={{ fontSize: 11, color: 'var(--void-fg-3)' }}>● 未保存</span>}
			<span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
				{dirty && <button type='button' style={buttonStyle(false)} onClick={() => { bridge.setPending(undefined); void reload(); }}><RotateCcw size={12} /> 元に戻す</button>}
				<button type='button' style={buttonStyle(false)} onClick={openAsJson}><FileJson size={12} /> JSON で開く</button>
				{load.kind === 'ok' && <button type='button' style={buttonStyle(true, !dirty)} disabled={!dirty} onClick={() => { void save(); }}><Save size={12} /> 保存 (Ctrl+S)</button>}
			</span>
		</div>
	);

	if (load.kind === 'loading') {
		return <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{header}<div style={{ fontSize: 12, color: 'var(--void-fg-3)' }}>読み込み中…</div></div>;
	}
	if (load.kind === 'invalid' || !workflow) {
		return (
			<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
				{header}
				<div style={{ fontSize: 12.5, color: '#f87171' }}>{load.kind === 'invalid' ? load.message : ''}</div>
				<div style={{ fontSize: 12, color: 'var(--void-fg-3)' }}>「JSON で開く」でテキストとして直せます。直して保存すると、ここに図が出ます。</div>
			</div>
		);
	}

	const selected = workflow.nodes.find(n => n.id === selectedId) ?? null;

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
			{header}
			<div style={{ fontSize: 12, color: 'var(--void-fg-3)' }}>
				ノードを押すと編集できます。ステップの追加・for / while ループ (目標)・並列・削除もここでできます。変更は保存するとこのファイルに書き込まれ、次の Division Project の実行で使われます。
			</div>
			<label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--void-fg-2)', width: 'fit-content' }}>
				<input type='checkbox' checked={workflow.enabled} onChange={e => change({ ...workflow, enabled: e.target.checked })} />
				このワークフローを使う (enabled)
			</label>
			<WorkflowLoopSummary workflow={workflow} />
			{workflow.nodes.length
				? <WorkflowDiagram workflow={workflow} selectedId={selectedId} onSelect={setSelectedId} roleNames={roleNames} />
				: <div style={{ fontSize: 12, color: 'var(--void-fg-3)' }}>ノードがありません。</div>}
			{selected && <WorkflowNodeEditor workflow={workflow} selected={selected} options={options} roleNames={roleNames} change={change} setSelectedId={setSelectedId} />}
			{errors.length > 0 && <div style={{ fontSize: 12, color: '#f87171' }}>{errors.join(' ')}</div>}
			{saveError && <div style={{ fontSize: 12, color: '#f87171' }}>{saveError}</div>}
		</div>
	);
};

export const WorkflowFileEditor = ({ bridge }: { bridge?: WorkflowFileBridge }) => {
	const isDark = useIsDark();
	return (
		<div className={`@@void-scope ${isDark ? 'dark' : ''}`} style={{ height: '100%', width: '100%' }}>
			<div style={{ height: '100%', overflow: 'auto', boxSizing: 'border-box', padding: '16px 20px', background: 'var(--void-bg-3)', color: 'var(--void-fg-1)' }}>
				<div style={{ maxWidth: 1100, margin: '0 auto' }}>
					{bridge ? <WorkflowFileEditorInner key={bridge.uri.toString()} bridge={bridge} /> : null}
				</div>
			</div>
		</div>
	);
};
