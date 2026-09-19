import React, { useMemo, useState } from 'react';
import styles from './StructuredResponse.module.css';

type JsonRecord = Record<string, unknown>;

type Task = {
  id: string;
  title: string;
  role?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  dependsOn: string[];
  detail?: string;
  output?: string;
};

type ViewModel = {
  kind: 'plan' | 'search' | 'answers';
  title: string;
  subtitle?: string;
  tasks: Task[];
  files: string[];
  dependencies: string[];
  answers: Array<{ question: string; answer: string }>;
  raw: JsonRecord;
};

const asRecord = (value: unknown): JsonRecord | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null;

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

const asStrings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];

const cleanJson = (content: string): string => {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^\`\`\`(?:json)?\s*([\s\S]*?)\s*\`\`\`$/i);
  return fenced ? fenced[1] : trimmed;
};

const taskStatus = (value: unknown): Task['status'] => {
  const status = String(value ?? '').toLowerCase();
  if (['running', 'in_progress', 'in-progress', 'active'].includes(status)) return 'running';
  if (['completed', 'complete', 'done', 'success', 'succeeded'].includes(status)) return 'completed';
  if (['failed', 'error', 'blocked'].includes(status)) return 'failed';
  return 'pending';
};

const textValue = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value;
  if (value === undefined || value === null) return undefined;
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
};

const toTask = (value: unknown, index: number): Task | null => {
  const item = asRecord(value);
  if (!item) return null;
  const id = asString(item.id) ?? asString(item.task_id) ?? `task-${index + 1}`;
  const title =
    asString(item.title) ??
    asString(item.name) ??
    asString(item.description) ??
    `タスク ${index + 1}`;
  return {
    id,
    title,
    role: asString(item.role) ?? asString(item.agent) ?? asString(item.assignee),
    status: taskStatus(item.status ?? item.state),
    dependsOn: asStrings(item.dependsOn ?? item.dependencies ?? item.depends_on),
    detail: asString(item.detail) ?? asString(item.input) ?? asString(item.reason),
    output: textValue(item.output ?? item.result),
  };
};

export function parseStructuredResponse(content: string): ViewModel | null {
  let parsed: unknown;
  try { parsed = JSON.parse(cleanJson(content)); } catch { return null; }
  const root = asRecord(parsed);
  if (!root) return null;

  const rawTasks = Array.isArray(root.tasks)
    ? root.tasks
    : Array.isArray(root.plan)
      ? root.plan
      : Array.isArray(root.steps)
        ? root.steps
        : [];
  const tasks = rawTasks.map(toTask).filter((task): task is Task => Boolean(task));

  const files = asStrings(root.relevant_files ?? root.files ?? root.file_paths);
  const dependencies = asStrings(root.dependencies ?? root.dependency_graph);
  const answersSource = Array.isArray(root.answers) ? root.answers : [];
  const answers = answersSource.map((entry, index) => {
    const item = asRecord(entry);
    return {
      question: asString(item?.question) ?? `回答 ${index + 1}`,
      answer: textValue(item?.answer ?? item?.response ?? item?.content) ?? '',
    };
  }).filter((entry) => entry.answer);

  const hasSearchData = files.length > 0 || Boolean(root.summary) || Boolean(root.symbols);
  const hasStructuredData = tasks.length > 0 || answers.length > 0 || hasSearchData ||
    Boolean(root.finalRole ?? root.leader ?? root.provider ?? root.event ?? root.type);
  if (!hasStructuredData) return null;

  const kind: ViewModel['kind'] = tasks.length > 0 ? 'plan' : answers.length > 0 ? 'answers' : 'search';
  const leader = asString(root.finalRole) ?? asString(root.leader) ?? asString(root.provider);
  return {
    kind,
    title: kind === 'plan' ? '実行プラン' : kind === 'answers' ? 'Jev Leaderの判断' : '調査結果',
    subtitle: leader ? `Leader: ${leader}` : asString(root.summary),
    tasks,
    files,
    dependencies,
    answers,
    raw: root,
  };
}

const statusLabel: Record<Task['status'], string> = {
  pending: '待機中',
  running: '実行中',
  completed: '完了',
  failed: '失敗',
};

export const StructuredResponse: React.FC<{ content: string }> = ({ content }) => {
  const model = useMemo(() => parseStructuredResponse(content), [content]);
  const [showRaw, setShowRaw] = useState(false);
  if (!model) return null;

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div>
          <div className={styles.eyebrow}>DIVISION / ORCHESTRA</div>
          <div className={styles.title}>{model.title}</div>
        </div>
        <span className={styles.leaderBadge}>{model.subtitle ?? '構造化レスポンス'}</span>
      </div>

      {model.tasks.length > 0 && (
        <div className={styles.taskList}>
          {model.tasks.map((task) => (
            <article className={styles.task} key={task.id}>
              <div className={styles.taskTop}>
                <span className={`${styles.status} ${styles[`status-${task.status}`]}`}>
                  <span className={styles.statusDot} />
                  {statusLabel[task.status]}
                </span>
                {task.role && <span className={styles.role}>{task.role}</span>}
              </div>
              <div className={styles.taskTitle}>{task.title}</div>
              {task.dependsOn.length > 0 && (
                <div className={styles.chips}>
                  {task.dependsOn.map((dependency) => <span className={styles.chip} key={dependency}>依存: {dependency}</span>)}
                </div>
              )}
              {task.detail && <div className={styles.detail}>{task.detail}</div>}
              {task.output && <details className={styles.details}><summary>実行結果</summary><pre>{task.output}</pre></details>}
            </article>
          ))}
        </div>
      )}

      {model.answers.length > 0 && (
        <div className={styles.answerList}>
          {model.answers.map((item) => (
            <div className={styles.answer} key={item.question}>
              <div className={styles.question}>{item.question}</div>
              <div className={styles.answerText}>{item.answer}</div>
            </div>
          ))}
        </div>
      )}

      {(model.files.length > 0 || model.dependencies.length > 0) && (
        <div className={styles.metaGrid}>
          {model.files.length > 0 && <div><div className={styles.metaLabel}>関連ファイル</div><div className={styles.chips}>{model.files.map((file) => <span className={styles.chip} key={file}>{file}</span>)}</div></div>}
          {model.dependencies.length > 0 && <div><div className={styles.metaLabel}>依存関係</div><div className={styles.chips}>{model.dependencies.map((dependency) => <span className={styles.chip} key={dependency}>{dependency}</span>)}</div></div>}
        </div>
      )}

      <details className={styles.rawDetails} open={showRaw} onToggle={(event) => setShowRaw(event.currentTarget.open)}>
        <summary>JSONを表示</summary>
        <pre>{JSON.stringify(model.raw, null, 2)}</pre>
      </details>
    </div>
  );
};

export default StructuredResponse;
