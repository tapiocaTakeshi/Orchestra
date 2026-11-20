#!/usr/bin/env node
// Orchestra のリリース (アップデート) 内容を Resend で全アカウントへ一斉配信する。
//
// 流れ:
//   1. GitHub Release (タグ・タイトル・本文) を取得
//   2. Supabase Auth からメール確認済みのアカウントを全件取得
//   3. Resend の Segment ("Orchestra Users") にコンタクトとして同期
//   4. その Segment 宛てに Broadcast を作成して即時送信
//      (Broadcast なので配信停止リンク {{{RESEND_UNSUBSCRIBE_URL}}} が自動で効き、
//       配信停止したユーザーには送られない)
//
// 同じタグの Broadcast が既に送信済みなら何もしない (二重送信防止)。
//
// 必要な環境変数:
//   RESEND_API_KEY              Resend の API キー (Full access)
//   SUPABASE_URL                例: https://xxxx.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY   Supabase の service_role キー
//   RELEASE_TAG                 例: v1.4.10
//   GITHUB_REPOSITORY           例: tapiocaTakeshi/Orchestra (Actions では自動で入る)
//   GITHUB_TOKEN                リリース本文の取得用 (Actions では自動で入る)
// 任意:
//   RESEND_FROM                 既定: "Orchestra <updates@he-ro.io>"
//   RESEND_REPLY_TO             返信先アドレス
//   RESEND_SEGMENT_ID           既存 Segment を使う場合。未指定なら名前で検索/作成
//   RESEND_SEGMENT_NAME         既定: "Orchestra Users"
//   DRY_RUN=true                送信せず、宛先数とメール HTML を出力するだけ

import { writeFileSync } from 'node:fs';

const env = process.env;
const DRY_RUN = /^(1|true|yes)$/i.test(env.DRY_RUN || '');
const FROM = env.RESEND_FROM || 'Orchestra <updates@he-ro.io>';
const SEGMENT_NAME = env.RESEND_SEGMENT_NAME || 'Orchestra Users';
const RESEND = 'https://api.resend.com';

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

// ---------- GitHub Release ----------
async function getRelease(tag) {
	const repo = required('GITHUB_REPOSITORY');
	const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'orchestra-release-notifier' };
	if (env.GITHUB_TOKEN) { headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`; }
	// /releases/tags/{tag} はドラフトを返さないので、一覧から探す
	for (let page = 1; page <= 10; page++) {
		const res = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=100&page=${page}`, { headers });
		if (!res.ok) { throw new Error(`GitHub releases API failed (${res.status}): ${await res.text()}`); }
		const list = await res.json();
		const hit = list.find((r) => r.tag_name === tag);
		if (hit) { return hit; }
		if (list.length < 100) { break; }
	}
	throw new Error(`リリース ${tag} が見つかりません`);
}

// ---------- Supabase Auth: メール確認済みアカウント ----------
async function getAccountEmails() {
	const url = required('SUPABASE_URL').replace(/\/+$/, '');
	const key = required('SUPABASE_SERVICE_ROLE_KEY');
	const emails = new Map(); // lower(email) -> { email, first_name }
	for (let page = 1; ; page++) {
		const res = await fetch(`${url}/auth/v1/admin/users?page=${page}&per_page=1000`, {
			headers: { apikey: key, Authorization: `Bearer ${key}` },
		});
		if (!res.ok) { throw new Error(`Supabase admin users API failed (${res.status}): ${await res.text()}`); }
		const { users = [] } = await res.json();
		for (const u of users) {
			if (!u.email || !u.email_confirmed_at || u.banned_until || u.deleted_at || u.is_anonymous) { continue; }
			const meta = u.user_metadata || {};
			const name = String(meta.full_name || meta.name || '').trim();
			emails.set(u.email.toLowerCase(), { email: u.email, first_name: name.split(/\s+/)[0] || undefined });
		}
		if (users.length < 1000) { break; }
	}
	return [...emails.values()];
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

async function alreadySent(name) {
	const list = await resendOrThrow('GET', '/broadcasts?limit=100');
	return (list.data || []).some((b) => b.name === name && b.status !== 'draft');
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

function buildEmail(release) {
	const title = release.name || `Orchestra ${release.tag_name}`;
	const notes = (release.body || '').trim();
	const html = `<!doctype html>
<html lang="ja"><body style="margin:0;background:#f6f6f8;font-family:-apple-system,BlinkMacSystemFont,'Hiragino Sans','Segoe UI',sans-serif;color:#1c1c22;">
<div style="max-width:600px;margin:0 auto;padding:24px 16px;">
  <div style="background:#ffffff;border-radius:12px;padding:28px 24px;line-height:1.7;font-size:14px;">
    <p style="margin:0 0 4px;color:#6e6e7a;font-size:12px;">Orchestra アップデートのお知らせ</p>
    <h1 style="font-size:22px;margin:0 0 16px;">${esc(title)}</h1>
    <p style="margin:0 0 16px;">いつも Orchestra をご利用いただきありがとうございます。Orchestra の新しいバージョン <strong>${esc(release.tag_name)}</strong> を公開しました。</p>
    ${notes ? markdownToHtml(notes) : '<p>詳しい変更内容はリリースページをご覧ください。</p>'}
    <p style="margin:24px 0 8px;">
      <a href="${esc(release.html_url)}" style="display:inline-block;background:#1c1c22;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;">リリースページを開く</a>
    </p>
    <p style="margin:8px 0 0;color:#6e6e7a;font-size:12px;">アプリを起動すると自動アップデートで最新版に更新されます。</p>
  </div>
  <p style="text-align:center;color:#9a9aa5;font-size:11px;margin:16px 0 0;">
    Orchestra アカウントをお持ちの方にお送りしています。<br>
    今後のお知らせが不要な場合は <a href="{{{RESEND_UNSUBSCRIBE_URL}}}" style="color:#9a9aa5;">配信停止</a> できます。<br>
    He-ro Corporation
  </p>
</div>
</body></html>`;
	return { subject: `【Orchestra】${release.tag_name} をリリースしました`, html };
}

// ---------- main ----------
async function main() {
	const tag = required('RELEASE_TAG');
	const release = await getRelease(tag);
	if (release.draft) {
		console.log(`${tag} はドラフトなので送信しません (公開時に送信されます)`);
		return;
	}
	const broadcastName = `Orchestra ${tag} release`;
	const { subject, html } = buildEmail(release);

	const accounts = await getAccountEmails();
	console.log(`メール確認済みアカウント: ${accounts.length} 件`);

	if (DRY_RUN) {
		writeFileSync('release-email-preview.html', html);
		console.log(`[DRY_RUN] 件名: ${subject}`);
		console.log('[DRY_RUN] release-email-preview.html にプレビューを書き出しました。送信はしていません。');
		return;
	}

	if (await alreadySent(broadcastName)) {
		console.log(`"${broadcastName}" は送信済みのためスキップします`);
		return;
	}

	const segmentId = await ensureSegment();
	await syncContacts(segmentId, accounts);

	const payload = { segment_id: segmentId, from: FROM, subject, html, name: broadcastName, send: true };
	if (env.RESEND_REPLY_TO) { payload.reply_to = env.RESEND_REPLY_TO; }
	const b = await resendOrThrow('POST', '/broadcasts', payload);
	console.log(`Broadcast を送信しました: ${b.id}`);
}

main().catch((err) => {
	console.error(`::error::${err.message}`);
	process.exit(1);
});
