import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "npm:stripe@17.5.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";

// Stripe Price ID -> プラン ID の逆引き（create-checkout-session と対の設定）
const PLAN_BY_PRICE: Record<string, string> = {};
{
	const pro = Deno.env.get("STRIPE_PRICE_ID_PRO") ?? "";
	const team = Deno.env.get("STRIPE_PRICE_ID_TEAM") ?? "";
	if (pro) PLAN_BY_PRICE[pro] = "pro";
	if (team) PLAN_BY_PRICE[team] = "team";
}

const stripe = new Stripe(STRIPE_SECRET_KEY, { httpClient: Stripe.createFetchHttpClient() });
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const ACTIVE_STATUSES = new Set(["active", "trialing"]);

async function syncSubscription(subscription: Stripe.Subscription) {
	const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
	const priceId = subscription.items.data[0]?.price?.id;
	const mappedPlan = (priceId && PLAN_BY_PRICE[priceId]) || "free";
	const status = subscription.status;
	const periodEnd = subscription.current_period_end
		? new Date(subscription.current_period_end * 1000).toISOString()
		: null;

	// キャンセル・支払い失敗などアクティブでない状態では free 相当の扱いに落とす
	const effectivePlan = ACTIVE_STATUSES.has(status) ? mappedPlan : "free";

	const { error } = await admin
		.from("profiles")
		.update({
			stripe_subscription_id: subscription.id,
			subscription_status: status,
			current_period_end: periodEnd,
			plan: effectivePlan,
		})
		.eq("stripe_customer_id", customerId);

	if (error) {
		console.error("profiles update failed:", error.message);
	}
}

Deno.serve(async (req: Request) => {
	if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

	if (!STRIPE_WEBHOOK_SECRET) {
		return new Response("STRIPE_WEBHOOK_SECRET not configured", { status: 500 });
	}

	const signature = req.headers.get("Stripe-Signature");
	if (!signature) return new Response("Missing Stripe-Signature", { status: 400 });

	const rawBody = await req.text();

	let event: Stripe.Event;
	try {
		event = await stripe.webhooks.constructEventAsync(rawBody, signature, STRIPE_WEBHOOK_SECRET);
	} catch (err) {
		return new Response(`Webhook signature verification failed: ${(err as Error).message}`, { status: 400 });
	}

	try {
		switch (event.type) {
			case "checkout.session.completed": {
				const session = event.data.object as Stripe.Checkout.Session;
				if (session.mode === "subscription" && session.subscription) {
					const subscriptionId =
						typeof session.subscription === "string" ? session.subscription : session.subscription.id;
					const subscription = await stripe.subscriptions.retrieve(subscriptionId);
					await syncSubscription(subscription);
				}
				break;
			}
			case "customer.subscription.created":
			case "customer.subscription.updated": {
				await syncSubscription(event.data.object as Stripe.Subscription);
				break;
			}
			case "customer.subscription.deleted": {
				const subscription = event.data.object as Stripe.Subscription;
				const customerId =
					typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
				const { error } = await admin
					.from("profiles")
					.update({ plan: "free", subscription_status: "canceled", stripe_subscription_id: null })
					.eq("stripe_customer_id", customerId);
				if (error) console.error("profiles cancel update failed:", error.message);
				break;
			}
			default:
				break;
		}
	} catch (err) {
		console.error("stripe-webhook handling error:", err);
		return new Response("Internal error", { status: 500 });
	}

	return new Response(JSON.stringify({ received: true }), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	});
});
