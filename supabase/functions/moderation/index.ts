// Social feed moderation for Orchestra Mobile (App Store Guideline 1.2).
//
// POST { action: "report", postId, reason, details? } → { ok, reportId, notified }
// POST { action: "block", userId, postId? }           → { ok, notified }
//   errors: { error, code } — already_reported 409, cannot_report_own 400,
//           cannot_block_self 400, post_not_found 404, invalid_request 400
//
// Reports and blocks are written here with the service role (the tables
// have no insert policy) so that every one of them also notifies the
// developer by email. Blocked authors' posts disappear from the blocker's
// feed through the AssignmentPost select policy; unblocking is a plain
// delete the app does itself. Hidden/blocked handling lives in
// division-hp supabase/migrations/20261026_app_review_moderation_iap.sql.
//
// Secrets: RESEND_API_KEY, MODERATION_NOTIFY_EMAIL (who gets the mail),
//          MODERATION_FROM_EMAIL (optional sender).
// Without them the report is still stored and the response says notified: false.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const REASONS: Record<string, string> = {
	spam: "スパム",
	harassment: "嫌がらせ・誹謗中傷",
	hate: "差別・ヘイト",
	sexual: "性的なコンテンツ",
	violence: "暴力的なコンテンツ",
	illegal: "違法なコンテンツ",
	other: "その他",
};

const CORS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "POST, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS } });
}

const fail = (error: string, code: string, status: number) => json({ error, code }, status);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Tells the developer by email. Returns whether the mail was accepted. */
async function notifyDeveloper(subject: string, lines: Array<[string, string]>): Promise<boolean> {
	const apiKey = Deno.env.get("RESEND_API_KEY") ?? "";
	const to = Deno.env.get("MODERATION_NOTIFY_EMAIL") ?? "";
	if (!apiKey || !to) {
		console.warn("moderation: RESEND_API_KEY / MODERATION_NOTIFY_EMAIL not set; report stored without email");
		return false;
	}
	const html = `<h2>${escapeHtml(subject)}</h2><table>${lines
		.map(([k, v]) => `<tr><th align="left" valign="top">${escapeHtml(k)}</th><td style="white-space:pre-wrap">${escapeHtml(v)}</td></tr>`)
		.join("")}</table><p>24 時間以内に確認し、規約違反のコンテンツは AssignmentPost の hiddenAt を設定するか削除してください。</p>`;
	try {
		const res = await fetch("https://api.resend.com/emails", {
			method: "POST",
			headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
			body: JSON.stringify({
				from: Deno.env.get("MODERATION_FROM_EMAIL") || "Orchestra Moderation <onboarding@resend.dev>",
				to: [to],
				subject: `[Orchestra 通報] ${subject}`,
				html,
			}),
		});
		if (!res.ok) console.error("moderation: Resend failed", res.status, await res.text().catch(() => ""));
		return res.ok;
	} catch (err) {
		console.error("moderation: Resend error", err);
		return false;
	}
}

Deno.serve(async (req: Request) => {
	if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
	if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

	const authHeader = req.headers.get("Authorization") ?? "";
	if (!authHeader) return json({ error: "Unauthorized" }, 401);
	const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
	const { data: userData, error: userError } = await userClient.auth.getUser();
	if (userError || !userData.user) return json({ error: "Unauthorized" }, 401);
	const me = userData.user;

	let body: Record<string, unknown>;
	try {
		body = await req.json();
	} catch {
		return fail("Invalid JSON", "invalid_request", 400);
	}

	const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
	const loadPost = async (postId: string) => {
		const { data } = await admin
			.from("AssignmentPost")
			.select('id, "authorId", "authorName", title, description, "createdAt"')
			.eq("id", postId)
			.maybeSingle();
		return data as { id: string; authorId: string; authorName: string | null; title: string; description: string | null; createdAt: string } | null;
	};

	if (body.action === "report") {
		const postId = typeof body.postId === "string" ? body.postId.trim() : "";
		const reason = typeof body.reason === "string" ? body.reason : "";
		const details = typeof body.details === "string" ? body.details.trim().slice(0, 1000) : "";
		if (!postId || !REASONS[reason]) return fail("通報の内容が不正です。", "invalid_request", 400);
		const post = await loadPost(postId);
		if (!post) return fail("投稿が見つかりませんでした。", "post_not_found", 404);
		if (post.authorId === me.id) return fail("自分の投稿は通報できません。", "cannot_report_own", 400);

		const { data: report, error } = await admin
			.from("ContentReport")
			.insert({
				reporterId: me.id,
				postId: post.id,
				reportedUserId: post.authorId,
				reason,
				details: details || null,
				snapshot: { title: post.title, description: post.description, authorName: post.authorName, createdAt: post.createdAt },
			})
			.select("id")
			.single();
		if (error) {
			if (error.code === "23505") return fail("この投稿はすでに通報済みです。", "already_reported", 409);
			console.error("moderation: report insert failed", error);
			return fail("通報を送れませんでした。", "internal", 500);
		}
		const notified = await notifyDeveloper(`投稿「${post.title}」が通報されました`, [
			["理由", REASONS[reason]],
			["詳細", details || "(なし)"],
			["投稿 ID", post.id],
			["投稿者", `${post.authorName ?? "名無し"} (${post.authorId})`],
			["タイトル", post.title],
			["説明", post.description ?? ""],
			["通報者", `${me.email ?? ""} (${me.id})`],
			["通報 ID", String(report.id)],
		]);
		return json({ ok: true, reportId: report.id, notified });
	}

	if (body.action === "block") {
		const blockedId = typeof body.userId === "string" ? body.userId.trim().toLowerCase() : "";
		const postId = typeof body.postId === "string" ? body.postId.trim() : "";
		if (!UUID_RE.test(blockedId)) return fail("ブロックするユーザーが不正です。", "invalid_request", 400);
		if (blockedId === me.id) return fail("自分自身はブロックできません。", "cannot_block_self", 400);
		const post = postId ? await loadPost(postId) : null;
		const blockedName = post && post.authorId === blockedId ? post.authorName : null;

		const { error } = await admin
			.from("UserBlock")
			.upsert({ blockerId: me.id, blockedId, blockedName }, { onConflict: "blockerId,blockedId", ignoreDuplicates: true });
		if (error) {
			console.error("moderation: block insert failed", error);
			return fail("ブロックできませんでした。", "internal", 500);
		}
		// Record it as a report too, so blocks show up in the same review queue.
		await admin.from("ContentReport").insert({
			reporterId: me.id,
			postId: post?.id ?? null,
			reportedUserId: blockedId,
			reason: "blocked",
			snapshot: post ? { title: post.title, description: post.description, authorName: post.authorName } : {},
		}).then(({ error: e }) => {
			if (e && e.code !== "23505") console.error("moderation: block report insert failed", e);
		});
		const notified = await notifyDeveloper(`ユーザー「${blockedName ?? blockedId}」がブロックされました`, [
			["ブロックされたユーザー", `${blockedName ?? "名無し"} (${blockedId})`],
			["きっかけの投稿", post ? `${post.title} (${post.id})\n${post.description ?? ""}` : "(なし)"],
			["ブロックした人", `${me.email ?? ""} (${me.id})`],
		]);
		return json({ ok: true, notified });
	}

	return fail("未対応の操作です。", "invalid_request", 400);
});
