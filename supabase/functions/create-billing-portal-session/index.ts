import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "npm:stripe@17.5.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";

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

	const customerId = profile?.stripe_customer_id as string | null | undefined;
	if (!customerId) {
		return json({ error: "決済情報がまだ登録されていません。先にプランを選択してください。" }, 400);
	}

	const stripe = new Stripe(STRIPE_SECRET_KEY, { httpClient: Stripe.createFetchHttpClient() });

	let session;
	try {
		session = await stripe.billingPortal.sessions.create({
			customer: customerId,
			return_url: `${SUPABASE_URL}/functions/v1/billing-return?status=portal`,
		});
	} catch (err) {
		return json({ error: `Stripe Billing Portal の作成に失敗しました: ${(err as Error).message}` }, 500);
	}

	return json({ url: session.url });
});
