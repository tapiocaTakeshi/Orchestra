/*--------------------------------------------------------------------------------------
 *  .division/workflow.json as a diagram (workflowFilePane.ts opens it in place of the JSON text).
 *  A Dify-style canvas (WorkflowCanvas: pan / zoom, drag nodes, connect, "+" block list, minimap)
 *  with the node editor of the chat's workflow review in a side panel. Edits mark the editor dirty and are
 *  written back as JSON on Save (Ctrl+S, or the button). "Open as JSON" shows the text.
 *--------------------------------------------------------------------------------------*/

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileJson, RotateCcw, Save, Workflow, X } from 'lucide-react';
import { URI } from '../../../../../../../base/common/uri.js';
import type { Event } from '../../../../../../../base/common/event.js';
import { useAccessor, useDivisionProjectConfig, useIsDark } from '../util/services.js';
import { DivisionWorkflow, layoutWorkflow, normalizeWorkflow, workflowErrors } from '../../../../common/divisionWorkflow.js';
import { DIVISION_ROLES, divisionRoleLabel } from '../../../../common/voidSettingsTypes.js';
import { WorkflowLoopSummary, WorkflowNodeEditor, useWorkflowRoleOptions, workflowToJson } from '../workflow-tsx/WorkflowReview.js';
import { NODE_COLORS, NODE_ICONS, NODE_TYPE_LABEL, WORKFLOW_CANVAS_CSS, WorkflowCanvas, keepPositions, nodeTitle } from './WorkflowCanvas.js';
import { scopedCss } from '../util/scopedCss.js';
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
	/** Bumped on every load from disk, so the canvas fits the view again. */
	const [loadCount, setLoadCount] = useState(0);
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
			setLoadCount(c => c + 1);
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
		<div className='wfe-top'>
			<span className='wfe-badge'><Workflow size={14} color='#fff' /></span>
			<span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
				<span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--void-fg-1)' }}>ワークフロー</span>
				<code style={{ fontSize: 10.5, color: 'var(--void-fg-3)' }}>.division/workflow.json{dirty ? ' ● 未保存' : ''}</code>
			</span>
			{workflow && (
				<label className='wfe-switch' title='次の Division Project の実行でこのワークフローを使う (enabled)'>
					<input type='checkbox' checked={workflow.enabled} onChange={e => change({ ...workflow, enabled: e.target.checked })} />
					<span className='wfe-switch-track'><span className='wfe-switch-thumb' /></span>
					<span>{workflow.enabled ? '有効' : '無効'}</span>
				</label>
			)}
			<span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
				{dirty && <button type='button' style={buttonStyle(false)} onClick={() => { bridge.setPending(undefined); void reload(); }}><RotateCcw size={12} /> 元に戻す</button>}
				<button type='button' style={buttonStyle(false)} onClick={openAsJson}><FileJson size={12} /> JSON で開く</button>
				{load.kind === 'ok' && <button type='button' style={buttonStyle(true, !dirty)} disabled={!dirty} onClick={() => { void save(); }}><Save size={12} /> 保存 (Ctrl+S)</button>}
			</span>
		</div>
	);

	if (load.kind === 'loading') {
		return <div className='wfe-root'>{header}<div style={{ padding: 20, fontSize: 12, color: 'var(--void-fg-3)' }}>読み込み中…</div></div>;
	}
	if (load.kind === 'invalid' || !workflow) {
		return (
			<div className='wfe-root'>
				{header}
				<div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
					<div style={{ fontSize: 12.5, color: '#f87171' }}>{load.kind === 'invalid' ? load.message : ''}</div>
					<div style={{ fontSize: 12, color: 'var(--void-fg-3)' }}>「JSON で開く」でテキストとして直せます。直して保存すると、ここに図が出ます。</div>
				</div>
			</div>
		);
	}

	const selected = workflow.nodes.find(n => n.id === selectedId) ?? null;
	const SelectedIcon = selected ? NODE_ICONS[selected.type] : null;
	// The panel's add / delete buttons lay the graph out again: keep the user's positions.
	const changeFromPanel = (next: DivisionWorkflow) => change(keepPositions(workflow, next));

	return (
		<div className='wfe-root'>
			{header}
			<div className='wfe-main'>
				<WorkflowCanvas workflow={workflow} onChange={change} selectedId={selectedId} onSelect={setSelectedId}
					roleNames={roleNames} roles={options} fitKey={loadCount} />

				{/* Checklist and loops, floating top left as in Dify */}
				{(errors.length > 0 || saveError || workflow.nodes.length === 0) && (
					<div className='wfe-float wfe-errors'>
						{workflow.nodes.length === 0 && <div style={{ color: 'var(--void-fg-3)' }}>ノードがありません。「JSON で開く」で start / end ノードを書いてください。</div>}
						{errors.map((e, i) => <div key={i}>⚠ {e}</div>)}
						{saveError && <div>⚠ {saveError}</div>}
					</div>
				)}
				<div className='wfe-hint'>ドラッグで移動 · ホイールでスクロール · Ctrl+ホイールでズーム · ● をドラッグでつなぐ / クリックで追加 · Delete で削除</div>

				{selected && SelectedIcon && (
					<aside className='wfe-panel'>
						<div className='wfe-panel-head'>
							<span className='wfc-icon' style={{ background: NODE_COLORS[selected.type], width: 28, height: 28, borderRadius: 8 }}><SelectedIcon size={15} color='#fff' /></span>
							<span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
								<span style={{ fontSize: 14, fontWeight: 600, color: 'var(--void-fg-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nodeTitle(selected, roleNames)}</span>
								<span style={{ fontSize: 11, color: 'var(--void-fg-3)' }}>{NODE_TYPE_LABEL[selected.type]} · {selected.id}</span>
							</span>
							<button type='button' className='wfc-icon-btn' title='閉じる' onClick={() => setSelectedId(null)}><X size={14} /></button>
						</div>
						<div className='wfe-panel-body'>
							{selected.type === 'start' || selected.type === 'end'
								? <div style={{ fontSize: 12, color: 'var(--void-fg-3)', marginBottom: 8 }}>{selected.type === 'start' ? 'ワークフローはここから始まります。' : 'すべての分岐がここで終わります。'}</div>
								: null}
							<div className='wfe-node-editor'><WorkflowNodeEditor workflow={workflow} selected={selected} options={options} roleNames={roleNames} change={changeFromPanel} setSelectedId={setSelectedId} /></div>
							<div style={{ marginTop: 12 }}><WorkflowLoopSummary workflow={workflow} /></div>
						</div>
					</aside>
				)}
			</div>
		</div>
	);
};

const WORKFLOW_EDITOR_CSS = `
.wfe-root { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.wfe-top { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 8px 14px; border-bottom: 1px solid var(--void-border-2); background: var(--void-bg-2); }
.wfe-badge { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 8px; background: linear-gradient(135deg, #2970ff, #7a5af8); flex: none; }
.wfe-switch { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--void-fg-2); cursor: pointer; margin-left: 8px; }
.wfe-switch input { display: none; }
.wfe-switch-track { position: relative; width: 28px; height: 16px; border-radius: 8px; background: var(--void-border-2); transition: background .15s; }
.wfe-switch-thumb { position: absolute; left: 2px; top: 2px; width: 12px; height: 12px; border-radius: 50%; background: #fff; transition: left .15s; box-shadow: 0 1px 2px rgba(0,0,0,.2); }
.wfe-switch input:checked + .wfe-switch-track { background: #12b76a; }
.wfe-switch input:checked + .wfe-switch-track .wfe-switch-thumb { left: 14px; }
.wfe-main { position: relative; flex: 1; min-height: 0; display: flex; }
.wfe-float { position: absolute; left: 16px; top: 12px; max-width: 420px; padding: 8px 12px; border-radius: 10px; font-size: 12px; line-height: 1.5;
	background: var(--void-bg-1); border: 1px solid var(--void-border-2); box-shadow: 0 2px 6px rgba(16,24,40,.10); pointer-events: auto; }
.wfe-errors { color: #f87171; border-color: rgba(240,68,56,.4); }
.wfe-hint { position: absolute; left: 50%; bottom: 20px; transform: translateX(-50%); font-size: 11px; color: var(--void-fg-3); pointer-events: none; white-space: nowrap; }
@media (max-width: 900px) { .wfe-hint { display: none; } }
.wfe-panel { position: absolute; right: 12px; top: 12px; bottom: 12px; width: 360px; max-width: calc(100% - 24px); display: flex; flex-direction: column;
	border-radius: 14px; background: var(--void-bg-1); border: 1px solid var(--void-border-2); box-shadow: 0 12px 24px -6px rgba(16,24,40,.18); z-index: 4; }
.wfe-panel-head { display: flex; align-items: center; gap: 10px; padding: 14px 14px 10px; border-bottom: 1px solid var(--void-border-2); }
.wfe-panel-body { flex: 1; overflow-y: auto; padding: 12px 14px; }
.wfe-node-editor > div { border: none !important; padding: 0 !important; gap: 10px !important; }
.wfe-node-editor input, .wfe-node-editor textarea, .wfe-node-editor select { box-sizing: border-box; }
`;

export const WorkflowFileEditor = ({ bridge }: { bridge?: WorkflowFileBridge }) => {
	const isDark = useIsDark();
	return (
		<div className={`@@void-scope ${isDark ? 'dark' : ''}`} style={{ height: '100%', width: '100%' }}>
			{/* Also styles the header while loading or when the file is invalid. */}
			<style>{scopedCss(WORKFLOW_CANVAS_CSS + WORKFLOW_EDITOR_CSS)}</style>
			<div style={{ height: '100%', boxSizing: 'border-box', background: 'var(--void-bg-3)', color: 'var(--void-fg-1)' }}>
				{bridge ? <WorkflowFileEditorInner key={bridge.uri.toString()} bridge={bridge} /> : null}
			</div>
		</div>
	);
};
