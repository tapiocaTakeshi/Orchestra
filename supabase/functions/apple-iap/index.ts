// Orchestra Mobile (iOS) In-App Purchase: the app calls this after StoreKit
// reports a purchase (or on restore), with the transaction id. The purchase
// is read back from Apple (see _shared/appstore.ts) and granted to the
// signed-in user; the app finishes the StoreKit transaction only after this
// returns ok, so a failure here is retried by StoreKit on the next launch.
//
// POST { transactionId: string, environment?: "Production" | "Sandbox" }
//   → { ok: true, productId, type, active?, expiresAt?, profile: { plan, creditBalance, ... } }
//   errors: { error, code } (owned_by_another_user 409, unknown_product 400, not_configured 500, ...)

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { APPLE_PRODUCTS, AppStoreError, getTransaction, resolveOwner, syncTransaction } from "../_shared/appstore.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "POST, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS } });
}

Deno.serve(async (req: Request) => {
	if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
	if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

	const authHeader = req.headers.get("Authorization") ?? "";
	if (!authHeader) return json({ error: "Unauthorized" }, 401);
	const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
	const { data: userData, error: userError } = await userClient.auth.getUser();
	if (userError || !userData.user) return json({ error: "Unauthorized" }, 401);
	const userId = userData.user.id;

	let body: { transactionId?: unknown; environment?: unknown };
	try {
		body = await req.json();
	} catch {
		return json({ error: "Invalid JSON" }, 400);
	}
	const transactionId = typeof body.transactionId === "string" ? body.transactionId.trim() : String(body.transactionId ?? "");
	const prefer = body.environment === "Sandbox" ? "Sandbox" : body.environment === "Production" ? "Production" : undefined;

	const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
	try {
		const tx = await getTransaction(transactionId, prefer);
		const owner = await resolveOwner(admin, tx, userId);
		const result = await syncTransaction(admin, tx, owner ?? userId);
		const { data: profile } = await admin
			.from("profiles")
			.select("plan, subscription_status, current_period_end, credit_balance, purchased_credit_balance, subscription_credit_balance")
			.eq("id", userId)
			.maybeSingle();
		return json({
			ok: true,
			productId: tx.productId,
			type: APPLE_PRODUCTS[tx.productId].type,
			...result,
			profile: profile
				? {
					plan: profile.plan,
					subscriptionStatus: profile.subscription_status,
					currentPeriodEnd: profile.current_period_end,
					creditBalance: Number(profile.credit_balance ?? 0),
					purchasedCreditBalance: Number(profile.purchased_credit_balance ?? 0),
					subscriptionCreditBalance: Number(profile.subscription_credit_balance ?? 0),
				}
				: null,
		});
	} catch (err) {
		if (err instanceof AppStoreError) return json({ error: err.message, code: err.code }, err.status);
		console.error("apple-iap error:", err);
		return json({ error: "購入の確認に失敗しました。しばらくしてからもう一度お試しください。", code: "internal" }, 500);
	}
});
