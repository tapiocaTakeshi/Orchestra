import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "npm:stripe@17.5.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";

// プラン ID -> Stripe Price ID。Supabase の Edge Function Secrets で設定する。
const PRICE_BY_PLAN: Record<string, string> = {
	pro: Deno.env.get("STRIPE_PRICE_ID_PRO") ?? "",
	team: Deno.env.get("STRIPE_PRICE_ID_TEAM") ?? "",
};

const CORS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "POST, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json", ...CORS },
	});
}

Deno.serve(async (req: Request) => {
	if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
	if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

	if (!STRIPE_SECRET_KEY) {
		return json({ error: "STRIPE_SECRET_KEY が Supabase の Edge Function Secrets に設定されていません。" }, 500);
	}

	const authHeader = req.headers.get("Authorization") ?? "";
	if (!authHeader) return json({ error: "Unauthorized" }, 401);

	let body: { planId?: string };
	try {
		body = await req.json();
	} catch {
		return json({ error: "Invalid JSON" }, 400);
	}

	const planId = body.planId;
	const priceId = planId ? PRICE_BY_PLAN[planId] : undefined;
	if (!planId || !priceId) {
		return json({ error: `未対応のプランです: ${planId ?? "(none)"}` }, 400);
	}

	// ユーザーの JWT で本人確認する
	const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
		global: { headers: { Authorization: authHeader } },
	});
	const { data: userData, error: userError } = await userClient.auth.getUser();
	if (userError || !userData.user) return json({ error: "Unauthorized" }, 401);
	const user = userData.user;

	const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
	const { data: profile } = await admin
		.from("profiles")
		.select("stripe_customer_id")
		.eq("id", user.id)
		.maybeSingle();

	const stripe = new Stripe(STRIPE_SECRET_KEY, { httpClient: Stripe.createFetchHttpClient() });

	let customerId = profile?.stripe_customer_id as string | null | undefined;
	if (!customerId) {
		const customer = await stripe.customers.create({
			email: user.email ?? undefined,
			metadata: { supabase_user_id: user.id },
		});
		customerId = customer.id;
		await admin.from("profiles").update({ stripe_customer_id: customerId }).eq("id", user.id);
	}

	let session;
	try {
		session = await stripe.checkout.sessions.create({
			mode: "subscription",
			customer: customerId,
			client_reference_id: user.id,
			line_items: [{ price: priceId, quantity: 1 }],
			subscription_data: { metadata: { supabase_user_id: user.id, plan_id: planId } },
			success_url: `${SUPABASE_URL}/functions/v1/billing-return?status=success`,
			cancel_url: `${SUPABASE_URL}/functions/v1/billing-return?status=cancel`,
		});
	} catch (err) {
		return json({ error: `Stripe Checkout の作成に失敗しました: ${(err as Error).message}` }, 500);
	}

	if (!session.url) return json({ error: "Stripe が Checkout URL を返しませんでした。" }, 500);
	return json({ url: session.url });
});
