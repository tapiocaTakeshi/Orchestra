// App Store Server Notifications V2 for Orchestra Mobile.
// Set this function's URL in App Store Connect > App > App Information >
// App Store Server Notifications (both Production and Sandbox, Version 2).
//
// Renewals, expirations, refunds and revocations arrive here even when the
// app is never opened. The notification only tells us which transaction
// changed: its state is read back from Apple's API (_shared/appstore.ts), so
// the payload's signature does not need to be trusted. Deploy with
// verify_jwt = false (Apple does not send a Supabase JWT).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { APPLE_BUNDLE_ID, APPLE_PRODUCTS, AppStoreError, decodeJws, getTransaction, resolveOwner, syncTransaction, type AppleEnvironment } from "../_shared/appstore.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type NotificationPayload = {
	notificationType?: string;
	subtype?: string;
	notificationUUID?: string;
	data?: { bundleId?: string; environment?: AppleEnvironment; signedTransactionInfo?: string };
};

const ok = () => new Response(JSON.stringify({ received: true }), { status: 200, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
	if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

	let payload: NotificationPayload;
	try {
		const body = await req.json();
		payload = decodeJws<NotificationPayload>(String(body?.signedPayload ?? ""));
	} catch {
		return new Response("Invalid payload", { status: 400 });
	}

	const type = payload.notificationType ?? "";
	const data = payload.data ?? {};
	// TEST notifications and other apps' notifications need no work.
	if (type === "TEST" || data.bundleId !== APPLE_BUNDLE_ID || !data.signedTransactionInfo) return ok();

	let transactionId: string;
	try {
		transactionId = String(decodeJws<{ transactionId?: string }>(data.signedTransactionInfo).transactionId ?? "");
	} catch {
		return new Response("Invalid transaction", { status: 400 });
	}

	const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
	try {
		const tx = await getTransaction(transactionId, data.environment);
		const owner = await resolveOwner(admin, tx);
		if (!owner) {
			// Bought outside our app flow (no appAccountToken) and never claimed: the app's restore will claim it.
			console.warn(`apple-iap-notifications: no owner for ${tx.originalTransactionId} (${type})`);
			return ok();
		}
		await syncTransaction(admin, tx, owner);
		console.log(`apple-iap-notifications: ${type}${payload.subtype ? `/${payload.subtype}` : ""} ${APPLE_PRODUCTS[tx.productId].type} ${tx.transactionId} → ${owner}`);
		return ok();
	} catch (err) {
		if (err instanceof AppStoreError && err.status < 500) {
			// Not ours / unknown product: retrying will not help.
			console.warn("apple-iap-notifications ignored:", err.code, err.message);
			return ok();
		}
		console.error("apple-iap-notifications error:", err);
		// Non-2xx makes Apple retry the notification later.
		return new Response("Internal error", { status: 500 });
	}
});
