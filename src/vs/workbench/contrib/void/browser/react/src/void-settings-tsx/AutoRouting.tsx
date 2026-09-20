import React, { useState } from 'react';

type Policy = { minPerformance: number; maxCostUsd: number; maxOutputTokens: number };
type Quote = { role: string; model: string; performance: number; performanceSource: string; inputTokens: number; outputTokens: number; totalCostUsd: number };
type History = { id: string; createdAt: string; role: string; modelId: string; inputTokens: number; outputTokens: number; totalCostUsd: number; routingDetails?: { requestGroupId?: string; estimateUsd?: number; allocatedOutputTokens?: number } };
const usd = (n: number) => `$${n.toFixed(6)}`;
export const AutoRouting = ({ endpoint, apiKey, policy, onChange }: { endpoint: string; apiKey: string; policy?: Policy; onChange: (p: Policy | undefined) => void }) => {
 const [draft, setDraft] = useState<Policy>(policy ?? { minPerformance: 70, maxCostUsd: 0.05, maxOutputTokens: 4096 });
 const [input, setInput] = useState('');
 const [inputTokens, setInputTokens] = useState(2000);
 const [quotes, setQuotes] = useState<Quote[]>([]);
 const [history, setHistory] = useState<History[]>([]);
 const [groupTotals, setGroupTotals] = useState<Record<string, number>>({});
 const [cursor, setCursor] = useState<string | null>(null);
 const [error, setError] = useState('');
 const [busy, setBusy] = useState(false);
 const valid = Number.isFinite(draft.minPerformance) && draft.minPerformance >= 0 && draft.minPerformance <= 100 &&
  Number.isFinite(draft.maxCostUsd) && draft.maxCostUsd > 0 && draft.maxCostUsd <= 100 &&
  Number.isInteger(draft.maxOutputTokens) && draft.maxOutputTokens >= 256 && draft.maxOutputTokens <= 32768;
 const request = async (path: string, body?: unknown) => {
  const response = await fetch(`${endpoint.replace(/\/$/, '')}/api/routing/${path}`, {
   method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
   ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
 };
 const run = async (action: () => Promise<void>) => {
  setBusy(true); setError('');
  try { await action(); } catch (err) { setError(err instanceof Error ? err.message : String(err)); } finally { setBusy(false); }
 };
 const loadHistory = async (more = false) => {
  const data = await request(`history${more && cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`);
  setHistory(old => more ? [...old, ...data.items] : data.items); setCursor(data.nextCursor); setGroupTotals(old => more ? { ...old, ...data.groupTotals } : data.groupTotals);
 };
 return <div className="flex flex-col gap-3 border border-void-border-2 rounded-sm p-3 text-xs">
  <strong>OpenRouter 自動割り当て・料金計算</strong>
  <p>Jev が各ロールの出力トークン予算を決定し、性能条件を満たす最安モデルを選択します。上限はロールごとの1回のモデル呼び出しに適用。Jev の判定料金は別途です。</p>
  {([
   ['minPerformance', '最低性能スコア（0〜100）', 0, 100, 1],
   ['maxCostUsd', '1回のモデル呼び出し上限（USD）', 0.000001, 100, 0.001],
   ['maxOutputTokens', 'Jev が割り当て可能な最大出力トークン', 256, 32768, 1],
  ] as const).map(([key, label, min, max, step]) => <label key={key} className="flex justify-between gap-3">{label}
   <input className="bg-void-bg-1 border border-void-border-2 p-1 w-28" type="number" min={min} max={max} step={step} value={draft[key]}
    onChange={e => { setDraft({ ...draft, [key]: Number(e.target.value) }); setQuotes([]); }} />
  </label>)}
  <div className="flex gap-3">
   <button disabled={!valid} onClick={() => onChange(draft)}>設定を保存して有効化</button>
   <button onClick={() => onChange(undefined)}>無効化</button><span>{policy ? '有効' : '無効'}</span>
  </div>
  <p>性能はサーバーに登録した評価スコアです。料金＝入力トークン×入力単価＋出力トークン×出力単価＋固定料金。</p>
  <textarea aria-label="見積もる依頼" placeholder="Jev にトークン予算を判定させる依頼内容" className="bg-void-bg-1 border border-void-border-2 p-2" value={input} onChange={e => { setInput(e.target.value); setQuotes([]); }} />
  <label>各ロールの想定入力トークン数 <input type="number" min={0} max={2000000} step={1} className="bg-void-bg-1 w-28 p-1" value={inputTokens} onChange={e => { setInputTokens(Number(e.target.value)); setQuotes([]); }} /></label>
  <button disabled={busy || !valid || !input.trim() || !Number.isInteger(inputTokens) || inputTokens < 0 || inputTokens > 2000000} onClick={() => run(async () => {
   setQuotes([]);
   const data = await request('quote', { input, inputTokens, roles: ['leader', 'coder', 'review'], policy: draft }); setQuotes(data.quotes);
  })}>Jev で見積もる（判定料金が発生）</button>
  {quotes.length > 0 && <><p>Leader / Coder / Review の試算。実行時は実際の各ロールで再判定します。</p><table><thead><tr><th>ロール / モデル</th><th>性能</th><th>入力 / 出力</th><th>見積 USD</th></tr></thead><tbody>{quotes.map(q => <tr key={q.role}><td>{q.role}<br />{q.model}</td><td title={q.performanceSource}>{q.performance}</td><td>{q.inputTokens} / {q.outputTokens}</td><td>{usd(q.totalCostUsd)}</td></tr>)}</tbody></table></>}
  <div className="flex gap-3"><strong>リクエスト履歴・実際の料金</strong><button disabled={busy} onClick={() => run(() => loadHistory())}>更新</button></div>
  <p>モデル実行ごとの実測使用量と料金。古い履歴は従来の記録値です。グループ合計には同じ依頼の全記録を含みます。</p>
  <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr><th>日時 / ロール</th><th>モデル</th><th>入力 / 出力</th><th>見積</th><th>実際 USD</th></tr></thead><tbody>{history.map(h => <tr key={h.id}><td>{new Date(h.createdAt).toLocaleString()}<br />{h.role}</td><td>{h.modelId}</td><td>{h.inputTokens} / {h.outputTokens}</td><td>{h.routingDetails?.estimateUsd === undefined ? '—' : usd(h.routingDetails.estimateUsd)}</td><td>{usd(h.totalCostUsd)}</td></tr>)}</tbody></table></div>
  {Object.entries(groupTotals).map(([id, sum]) => <div key={id}>リクエスト {id.slice(0, 8)}：{usd(sum)}</div>)}
  {cursor && <button disabled={busy} onClick={() => run(() => loadHistory(true))}>さらに読み込む</button>}
  {error && <p role="alert" className="text-red-400">{error}</p>}
 </div>;
};
