#!/usr/bin/env node
// Orchestra のリリース (アップデート) 時に、
//   - AI (Claude) でアップデート情報とメール文面を生成し
//   - GitHub Release のタイトル・本文 (= アプリ内のアップデート情報) を更新し
//   - Resend で全アカウントへ一斉配信する。
//
// 流れ:
//   1. GitHub Release (タグ・タイトル・本文) と、前回リリースからのコミット一覧を取得
//   2. Claude で以下を生成 (構造化出力)
//        リリースタイトル / アップデート情報 (Markdown) /
//        メールの件名・プレヘッダー・導入文・主な変更点・締めの一文
//   3. GitHub Release のタイトルと本文を生成結果で更新
//      (アプリの自動アップデート画面と HP のダウンロード欄はこの Release を読む)
//   4. Supabase Auth からメール確認済みのアカウントを全件取得し、
//      HP のアカウントページで「Orchestra のアップデート情報を受け取る」を
//      オフにしたアカウント (profiles.release_notifications = false) を除く
//   5. Resend の Segment ("Orchestra Users") にコンタクトとして同期
//      (受信をオフにしたアカウントは Segment から外す)
//   6. その Segment 宛てに Broadcast を作成して即時送信
//      (Broadcast なので配信停止リンク {{{RESEND_UNSUBSCRIBE_URL}}} が自動で効き、
//       配信停止したユーザーには送られない)
//
// 同じタグの Broadcast が既に送信済みならメールは送らず、文章の再生成もしない (二重送信防止)。
// ANTHROPIC_API_KEY が無い / 生成に失敗した場合は、Release 本文をそのまま使う従来の文面で送る。
//
// 必要な環境変数:
//   RESEND_API_KEY              Resend の API キー (Full access)
//   SUPABASE_URL                例: https://xxxx.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY   Supabase の service_role キー
//   RELEASE_TAG                 例: v1.4.10
//   GITHUB_REPOSITORY           例: tapiocaTakeshi/Orchestra (Actions では自動で入る)
//   GITHUB_TOKEN                リリース取得・更新用 (Actions では自動で入る。contents: write が必要)
//   ANTHROPIC_API_KEY           文章生成用の Claude API キー (未設定なら AI 生成をスキップ)
// 任意:
//   ANTHROPIC_MODEL             既定: claude-opus-5-5
//   AI_REGENERATE=true          送信済みのリリースでもアップデート情報を作り直して Release を更新する
//   RESEND_FROM                 既定: "Orchestra <updates@he-ro.io>"
//   RESEND_REPLY_TO             返信先アドレス
//   RESEND_SEGMENT_ID           既存 Segment を使う場合。未指定なら名前で検索/作成
//   RESEND_SEGMENT_NAME         既定: "Orchestra Users"
//   DRY_RUN=true                Release の更新もメール送信もせず、生成結果とメール HTML を出力するだけ

import { writeFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';

const env = process.env;
const DRY_RUN = /^(1|true|yes)$/i.test(env.DRY_RUN || '');
const FROM = env.RESEND_FROM || 'Orchestra <updates@he-ro.io>';
const SEGMENT_NAME = env.RESEND_SEGMENT_NAME || 'Orchestra Users';
const RESEND = 'https://api.resend.com';
const AI_MODEL = (env.ANTHROPIC_MODEL || '').trim() || 'claude-opus-5-5';
const AI_REGENERATE = /^(1|true|yes)$/i.test(env.AI_REGENERATE || '');

function required(name) {
	const v = (env[name] || '').trim();
	if (!v) {
		console.error(`::error::環境変数 ${name} が未設定です`);
		process.exit(1);
	}
	return v;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Resend (レート制限 2 req/s を守りつつ 429 はリトライ) ----------
let lastResendCall = 0;
async function resend(method, path, body) {
	const key = required('RESEND_API_KEY');
	for (let attempt = 1; ; attempt++) {
		const wait = lastResendCall + 550 - Date.now();
		if (wait > 0) { await sleep(wait); }
		lastResendCall = Date.now();
		const res = await fetch(RESEND + path, {
			method,
			headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
			body: body ? JSON.stringify(body) : undefined,
		});
		const text = await res.text();
		let json;
		try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
		if (res.status === 429 && attempt < 6) {
			await sleep(1000 * attempt);
			continue;
		}
		return { ok: res.ok, status: res.status, json };
	}
}

async function resendOrThrow(method, path, body) {
	const r = await resend(method, path, body);
	if (!r.ok) {
		throw new Error(`Resend ${method} ${path} failed (${r.status}): ${JSON.stringify(r.json)}`);
	}
	return r.json;
}

// ---------- GitHub ----------
function githubHeaders() {
	const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'orchestra-release-notifier' };
	if (env.GITHUB_TOKEN) { headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`; }
	return headers;
}

async function github(method, path, body) {
	const res = await fetch(`https://api.github.com${path}`, {
		method,
		headers: { ...githubHeaders(), ...(body ? { 'Content-Type': 'application/json' } : {}) },
		body: body ? JSON.stringify(body) : undefined,
	});
	if (!res.ok) { throw new Error(`GitHub ${method} ${path} failed (${res.status}): ${await res.text()}`); }
	return res.json();
}

async function listReleases() {
	const repo = required('GITHUB_REPOSITORY');
	const all = [];
	for (let page = 1; page <= 10; page++) {
		const list = await github('GET', `/repos/${repo}/releases?per_page=100&page=${page}`);
		all.push(...list);
		if (list.length < 100) { break; }
	}
	return all;
}

// /releases/tags/{tag} はドラフトを返さないので、一覧から探す
function findRelease(releases, tag) {
	const hit = releases.find((r) => r.tag_name === tag);
	if (!hit) { throw new Error(`リリース ${tag} が見つかりません`); }
	return hit;
}

// 1 つ前の公開済み (ドラフト・prerelease 以外) リリースのタグ
function previousTag(releases, current) {
	const at = (r) => Date.parse(r.published_at || r.created_at || 0);
	const currentAt = at(current);
	const prev = releases
		.filter((r) => r.id !== current.id && !r.draft && !r.prerelease && at(r) < currentAt)
		.sort((a, b) => at(b) - at(a))[0];
	return prev ? prev.tag_name : null;
}

// 前回リリースから今回のタグまでのコミット (最大 250 件)
async function getCommits(prevTag, tag) {
	const repo = required('GITHUB_REPOSITORY');
	let commits;
	if (prevTag) {
		const cmp = await github('GET', `/repos/${repo}/compare/${encodeURIComponent(prevTag)}...${encodeURIComponent(tag)}?per_page=250`);
		commits = cmp.commits || [];
	} else {
		commits = (await github('GET', `/repos/${repo}/commits?sha=${encodeURIComponent(tag)}&per_page=50`)).reverse();
	}
	return commits
		.map((c) => (c.commit?.message || '').trim())
		// マージコミットは中身が他のコミットと重複するので除く
		.filter((m) => m && !/^Merge (pull request|branch|remote-tracking branch)/.test(m))
		// 署名行・セッション URL などはノイズなので落とす
		.map((m) => m.split('\n').filter((l) => !/^(Co-Authored-By|Signed-off-by|Claude-Session):/i.test(l)).join('\n').trim())
		.map((m) => (m.length > 1500 ? `${m.slice(0, 1500)}…` : m));
}

async function updateRelease(release, { name, body }) {
	const repo = required('GITHUB_REPOSITORY');
	return github('PATCH', `/repos/${repo}/releases/${release.id}`, { name, body });
}

// ---------- Supabase: メール確認済みアカウントと受信設定 ----------
function supabase() {
	return {
		url: required('SUPABASE_URL').replace(/\/+$/, ''),
		key: required('SUPABASE_SERVICE_ROLE_KEY'),
	};
}

// HP のアカウントページでアップデートメールの受信をオフにしたユーザーの id
async function getOptedOutUserIds() {
	const { url, key } = supabase();
	const ids = new Set();
	for (let from = 0; ; from += 1000) {
		const res = await fetch(`${url}/rest/v1/profiles?select=id&release_notifications=eq.false&order=id`, {
			headers: { apikey: key, Authorization: `Bearer ${key}`, Range: `${from}-${from + 999}` },
		});
		if (!res.ok) { throw new Error(`Supabase profiles API failed (${res.status}): ${await res.text()}`); }
		const rows = await res.json();
		for (const r of rows) { ids.add(r.id); }
		if (rows.length < 1000) { break; }
	}
	return ids;
}

// { recipients: 送る人, optedOut: 受信をオフにした人 }
async function getAccounts() {
	const { url, key } = supabase();
	const optedOutIds = await getOptedOutUserIds();
	const recipients = new Map(); // lower(email) -> { email, first_name }
	const optedOut = new Map();
	for (let page = 1; ; page++) {
		const res = await fetch(`${url}/auth/v1/admin/users?page=${page}&per_page=1000`, {
			headers: { apikey: key, Authorization: `Bearer ${key}` },
		});
		if (!res.ok) { throw new Error(`Supabase admin users API failed (${res.status}): ${await res.text()}`); }
		const { users = [] } = await res.json();
		for (const u of users) {
			if (!u.email) { continue; }
			const lower = u.email.toLowerCase();
			if (optedOutIds.has(u.id)) {
				optedOut.set(lower, { email: u.email });
				continue;
			}
			if (!u.email_confirmed_at || u.banned_until || u.deleted_at || u.is_anonymous) { continue; }
			const meta = u.user_metadata || {};
			const name = String(meta.full_name || meta.name || '').trim();
			recipients.set(lower, { email: u.email, first_name: name.split(/\s+/)[0] || undefined });
		}
		if (users.length < 1000) { break; }
	}
	// 同じメールで受信オンのアカウントが別にある場合はそちらを優先する
	for (const email of recipients.keys()) { optedOut.delete(email); }
	return { recipients: [...recipients.values()], optedOut: [...optedOut.values()] };
}

// ---------- Segment / Contacts ----------
async function ensureSegment() {
	if (env.RESEND_SEGMENT_ID) { return env.RESEND_SEGMENT_ID.trim(); }
	const list = await resendOrThrow('GET', '/segments?limit=100');
	const hit = (list.data || []).find((s) => s.name === SEGMENT_NAME);
	if (hit) { return hit.id; }
	const created = await resendOrThrow('POST', '/segments', { name: SEGMENT_NAME });
	console.log(`Segment "${SEGMENT_NAME}" を作成しました`);
	return created.id;
}

async function syncContacts(segmentId, accounts) {
	let added = 0, failed = 0;
	for (const a of accounts) {
		const body = { email: a.email, segments: [{ id: segmentId }] };
		if (a.first_name) { body.first_name = a.first_name; }
		const r = await resend('POST', '/contacts', body);
		if (r.ok) { added++; continue; }
		// 既存コンタクト → Segment への追加だけ行う (配信停止状態は変更しない)
		const r2 = await resend('POST', `/contacts/${encodeURIComponent(a.email)}/segments/${segmentId}`);
		if (r2.ok) { added++; } else {
			failed++;
			console.warn(`::warning::コンタクト同期失敗 (${r.status}/${r2.status}): ${JSON.stringify(r2.json)}`);
		}
	}
	console.log(`コンタクト同期: ${added} 件 OK / ${failed} 件失敗`);
}

// 受信をオフにしたアカウントを Segment から外す (コンタクト自体と配信停止状態はそのまま)
async function removeFromSegment(segmentId, accounts) {
	let removed = 0;
	for (const a of accounts) {
		const r = await resend('DELETE', `/contacts/${encodeURIComponent(a.email)}/segments/${segmentId}`);
		if (r.ok) { removed++; }
		// 404 = もともと Segment に居ない / コンタクトが無い。問題ないので無視する
		else if (r.status !== 404) {
			console.warn(`::warning::Segment からの削除に失敗 (${r.status}): ${JSON.stringify(r.json)}`);
		}
	}
	console.log(`受信オフのアカウント: ${accounts.length} 件 (Segment から ${removed} 件外しました)`);
}

async function alreadySent(name) {
	const list = await resendOrThrow('GET', '/broadcasts?limit=100');
	return (list.data || []).some((b) => b.name === name && b.status !== 'draft');
}

// ---------- AI (Claude) で文章を生成 ----------
const AiContent = z.object({
	release_title: z.string().describe('GitHub Release / アプリのアップデート画面に出すタイトル。"Orchestra vX.Y.Z — 〇〇" の形で、今回の目玉を短く (40 文字程度まで)'),
	release_notes_markdown: z.string().describe('アプリ内のアップデート情報として表示する本文 (Markdown)。"## 新機能" "## 改善" "## 不具合の修正" など該当する見出しだけを使い、各項目は "- " の箇条書きで 1〜2 文。該当がない見出しは出さない'),
	email_subject: z.string().describe('メールの件名。"【Orchestra】" で始め、バージョンと目玉の変更が分かる 40 文字程度まで'),
	email_preheader: z.string().describe('メール一覧で件名の横に出るプレヘッダー。60 文字程度まで'),
	email_intro: z.string().describe('メール冒頭のあいさつと今回のアップデートの要約。2〜3 文'),
	email_highlights: z.array(z.object({
		title: z.string().describe('変更点の見出し (20 文字程度まで)'),
		description: z.string().describe('ユーザーにとって何ができるようになったか / 何が良くなったかを 1〜2 文で'),
	})).describe('メールで紹介する主な変更点。ユーザーに影響が大きい順に 1〜5 件'),
	email_closing: z.string().describe('メール末尾の締めの一文 (アップデート方法の案内やお礼など)'),
});

const AI_SYSTEM = `あなたは開発者向け AI コーディングエディタ「Orchestra」(He-ro Corporation) のリリース担当です。
コミット履歴と自動生成のリリースノートから、ユーザー向けのアップデート情報とお知らせメールの文章を日本語で書きます。

方針:
- 読み手は Orchestra を使っている一般ユーザー。社内用語・ブランチ名・PR 番号・ファイル名・関数名は出さず、使う人にとっての変化として書く。
- コミットに書かれていない機能や効果を作らない。不確かなことは書かない。誇張表現 (「革命的」「圧倒的」など) は使わない。
- CI・ビルド設定・リファクタリング・テストなど、ユーザーから見えない変更は省く。ただし体感できる効果 (起動が速い、安定性向上など) がはっきりしている場合は「改善」にまとめてよい。
- 似た変更は 1 項目にまとめる。英語のコミットメッセージは自然な日本語にする。
- 丁寧語 (です・ます調) で、簡潔に。
- Markdown は見出し (##)、箇条書き (- )、太字 (**)、インラインコード (\`) だけを使う。表・画像・HTML は使わない。
- ユーザー向けの変更が見当たらない場合は、release_notes_markdown を「## 改善\n- 安定性と内部処理を改善しました。」のように控えめに書く。`;

async function generateAiContent({ release, prevTag, commits }) {
	const client = new Anthropic();
	const input = [
		`今回のバージョン: ${release.tag_name}`,
		`前回のバージョン: ${prevTag || '(なし: 初回リリース)'}`,
		`リリースページ: ${release.html_url}`,
		'',
		'## 自動生成されたリリースノート',
		(release.body || '').trim() || '(なし)',
		'',
		`## 前回リリースからのコミット (${commits.length} 件、古い順)`,
		commits.length ? commits.map((m, i) => `### ${i + 1}\n${m}`).join('\n\n') : '(なし)',
	].join('\n');

	const response = await client.beta.messages.parse({
		model: AI_MODEL,
		max_tokens: 16000,
		// 安全分類器で断られた場合はサーバー側で別モデルに自動フォールバックする
		betas: ['server-side-fallback-2026-07-01'],
		fallbacks: 'default',
		output_config: { effort: 'medium', format: betaZodOutputFormat(AiContent) },
		system: AI_SYSTEM,
		messages: [{ role: 'user', content: input }],
	});
	if (response.stop_reason === 'refusal') {
		throw new Error(`AI が生成を断りました (${response.stop_details?.category ?? 'unknown'})`);
	}
	if (response.stop_reason === 'max_tokens') {
		throw new Error('AI の出力が max_tokens で途切れました');
	}
	if (!response.parsed_output) {
		throw new Error('AI の出力を解析できませんでした');
	}
	console.log(`AI 生成完了 (${response.model}, 入力 ${response.usage.input_tokens} / 出力 ${response.usage.output_tokens} tokens)`);
	return response.parsed_output;
}

function buildReleaseBody(release, prevTag, ai) {
	const repo = required('GITHUB_REPOSITORY');
	const changelog = prevTag
		? `\n\n**Full Changelog**: https://github.com/${repo}/compare/${prevTag}...${release.tag_name}`
		: '';
	// HTML コメントはアプリのアップデート画面でそのまま文字として出てしまうので入れない
	return `${ai.release_notes_markdown.trim()}${changelog}\n`;
}

// ---------- Markdown (リリースノート) → HTML ----------
function esc(s) {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function inline(s) {
	return esc(s)
		.replace(/`([^`]+)`/g, '<code style="background:#f1f1f4;padding:1px 4px;border-radius:4px;">$1</code>')
		.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
		.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" style="color:#5b5bd6;">$1</a>')
		.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" style="color:#5b5bd6;">$2</a>');
}
function markdownToHtml(md) {
	const out = [];
	let list = false;
	const closeList = () => { if (list) { out.push('</ul>'); list = false; } };
	for (const raw of md.replace(/\r/g, '').split('\n')) {
		const line = raw.trimEnd();
		if (/^<!--.*-->$/.test(line.trim())) { continue; }
		let m;
		if ((m = line.match(/^(#{1,6})\s+(.*)$/))) {
			closeList();
			const size = m[1].length <= 2 ? 18 : 15;
			out.push(`<h3 style="font-size:${size}px;margin:20px 0 8px;">${inline(m[2])}</h3>`);
		} else if ((m = line.match(/^\s*[-*+]\s+(.*)$/))) {
			if (!list) { out.push('<ul style="padding-left:20px;margin:8px 0;">'); list = true; }
			out.push(`<li style="margin:4px 0;">${inline(m[1])}</li>`);
		} else if (line.trim() === '') {
			closeList();
		} else {
			closeList();
			out.push(`<p style="margin:8px 0;">${inline(line)}</p>`);
		}
	}
	closeList();
	return out.join('\n');
}

function buildEmail(release, ai) {
	const title = ai ? ai.release_title : (release.name || `Orchestra ${release.tag_name}`);
	const notes = (release.body || '').trim();
	const intro = ai
		? ai.email_intro.split(/\n+/).filter(Boolean).map((p) => `<p style="margin:0 0 16px;">${inline(p)}</p>`).join('\n    ')
		: `<p style="margin:0 0 16px;">いつも Orchestra をご利用いただきありがとうございます。Orchestra の新しいバージョン <strong>${esc(release.tag_name)}</strong> を公開しました。</p>`;
	const highlights = ai && ai.email_highlights.length
		? `<h3 style="font-size:16px;margin:20px 0 8px;">主な変更点</h3>
    ${ai.email_highlights.map((h) => `<div style="margin:0 0 12px;padding:12px 14px;background:#f6f6f8;border-radius:8px;">
      <p style="margin:0 0 4px;font-weight:600;">${inline(h.title)}</p>
      <p style="margin:0;color:#3a3a44;">${inline(h.description)}</p>
    </div>`).join('\n    ')}`
		: '';
	const details = ai
		? `<h3 style="font-size:16px;margin:24px 0 8px;">アップデート情報</h3>\n    ${markdownToHtml(ai.release_notes_markdown)}`
		: (notes ? markdownToHtml(notes) : '<p>詳しい変更内容はリリースページをご覧ください。</p>');
	const closing = ai ? ai.email_closing : 'アプリを起動すると自動アップデートで最新版に更新されます。';
	const preheader = ai
		? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(ai.email_preheader)}</div>`
		: '';
	const html = `<!doctype html>
<html lang="ja"><body style="margin:0;background:#f6f6f8;font-family:-apple-system,BlinkMacSystemFont,'Hiragino Sans','Segoe UI',sans-serif;color:#1c1c22;">
${preheader}
<div style="max-width:600px;margin:0 auto;padding:24px 16px;">
  <div style="background:#ffffff;border-radius:12px;padding:28px 24px;line-height:1.7;font-size:14px;">
    <p style="margin:0 0 4px;color:#6e6e7a;font-size:12px;">Orchestra アップデートのお知らせ</p>
    <h1 style="font-size:22px;margin:0 0 16px;">${esc(title)}</h1>
    ${intro}
    ${highlights}
    ${details}
    <p style="margin:24px 0 8px;">
      <a href="${esc(release.html_url)}" style="display:inline-block;background:#1c1c22;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;">リリースページを開く</a>
    </p>
    <p style="margin:8px 0 0;color:#6e6e7a;font-size:12px;">${inline(closing)}</p>
  </div>
  <p style="text-align:center;color:#9a9aa5;font-size:11px;margin:16px 0 0;">
    Orchestra アカウントをお持ちの方にお送りしています。<br>
    今後のお知らせが不要な場合は <a href="{{{RESEND_UNSUBSCRIBE_URL}}}" style="color:#9a9aa5;">配信停止</a> できます。<br>
    He-ro Corporation
  </p>
</div>
</body></html>`;
	const subject = ai ? ai.email_subject : `【Orchestra】${release.tag_name} をリリースしました`;
	return { subject, html };
}

// AI で文章を生成する。使えなければ null (従来の文面にフォールバック)
async function resolveAiContent(releases, release) {
	const prevTag = previousTag(releases, release);
	if (!(env.ANTHROPIC_API_KEY || '').trim()) {
		console.warn('::warning::ANTHROPIC_API_KEY が未設定のため AI 生成をスキップし、Release 本文をそのまま使います');
		return { ai: null, prevTag };
	}
	try {
		const commits = await getCommits(prevTag, release.tag_name);
		console.log(`${prevTag || '(初回)'} → ${release.tag_name}: コミット ${commits.length} 件から文章を生成します`);
		const ai = await generateAiContent({ release, prevTag, commits });
		return { ai, prevTag };
	} catch (err) {
		console.warn(`::warning::AI 生成に失敗したため Release 本文をそのまま使います: ${err.message}`);
		return { ai: null, prevTag };
	}
}

// ---------- main ----------
async function main() {
	const tag = required('RELEASE_TAG');
	const releases = await listReleases();
	let release = findRelease(releases, tag);
	if (release.draft) {
		console.log(`${tag} はドラフトなので何もしません (公開時に実行されます)`);
		return;
	}
	const broadcastName = `Orchestra ${tag} release`;
	const sent = !DRY_RUN && (await alreadySent(broadcastName));

	if (sent && !AI_REGENERATE) {
		console.log(`"${broadcastName}" は送信済みのためスキップします (アップデート情報を作り直すときは AI_REGENERATE=true)`);
		return;
	}

	// 1. AI で文章を生成
	const { ai, prevTag } = await resolveAiContent(releases, release);

	// 2. アップデート情報 (GitHub Release のタイトル・本文) を更新
	if (ai) {
		const name = ai.release_title;
		const body = buildReleaseBody(release, prevTag, ai);
		if (DRY_RUN) {
			writeFileSync('release-ai-content.json', JSON.stringify(ai, null, 2));
			writeFileSync('release-notes-preview.md', body);
			console.log(`[DRY_RUN] タイトル: ${name}`);
			console.log('[DRY_RUN] release-ai-content.json / release-notes-preview.md に生成結果を書き出しました。Release は更新していません。');
		} else {
			release = await updateRelease(release, { name, body });
			console.log(`アップデート情報を更新しました: ${release.html_url}`);
		}
	}

	// 3. メール送信
	if (sent) {
		console.log(`"${broadcastName}" は送信済みのためメールはスキップします`);
		return;
	}
	const { subject, html } = buildEmail(release, ai);

	const { recipients, optedOut } = await getAccounts();
	console.log(`送信対象: ${recipients.length} 件 / 受信オフ: ${optedOut.length} 件`);

	if (DRY_RUN) {
		writeFileSync('release-email-preview.html', html);
		console.log(`[DRY_RUN] 件名: ${subject}`);
		console.log('[DRY_RUN] release-email-preview.html にプレビューを書き出しました。送信はしていません。');
		return;
	}

	const segmentId = await ensureSegment();
	// 先に外してから同期する (受信オフ → オンに戻した人は syncContacts で再追加される)
	await removeFromSegment(segmentId, optedOut);
	await syncContacts(segmentId, recipients);

	const payload = { segment_id: segmentId, from: FROM, subject, html, name: broadcastName, send: true };
	if (env.RESEND_REPLY_TO) { payload.reply_to = env.RESEND_REPLY_TO; }
	const b = await resendOrThrow('POST', '/broadcasts', payload);
	console.log(`Broadcast を送信しました: ${b.id}`);
}

main().catch((err) => {
	console.error(`::error::${err.message}`);
	process.exit(1);
});
