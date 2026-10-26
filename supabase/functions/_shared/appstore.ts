// App Store (iOS In-App Purchase) — shared by apple-iap and apple-iap-notifications.
//
// Trust model: a transaction id from the app or from an App Store Server
// Notification is only a pointer. The transaction itself is always fetched
// from Apple's App Store Server API (authenticated with our API key over
// TLS), so a forged id or payload can at most make us re-read what Apple says.
//
// Credits follow the website (division-hp src/app/api/webhook/stripe):
//   - Orchestra Plus: plan "orchestra_plus" and 10 subscription credits per
//     billing period, expiring at the period end (reset_subscription_credits)
//   - credit packs: purchased credits that never expire (apply_credit_transaction)
// Every grant uses a source id derived from Apple's transaction id, and the
// database functions ignore a source id they have seen, so retries are safe.
//
// Edge Function secrets:
//   APPLE_IAP_ISSUER_ID     App Store Connect > Users and Access > Integrations > In-App Purchase: Issuer ID
//   APPLE_IAP_KEY_ID        the In-App Purchase key's Key ID
//   APPLE_IAP_PRIVATE_KEY   the .p8 file's contents (PEM, newlines may be written as \n)
//   APPLE_BUNDLE_ID         optional, default com.hero.orchestra

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const APPLE_BUNDLE_ID = Deno.env.get("APPLE_BUNDLE_ID") || "com.hero.orchestra";

export type AppleProduct = { type: "subscription" | "consumable"; credits: number };

/** Product ids created in App Store Connect. Keep in sync with Orchestra-Mobile src/lib/appStorePurchases.ts */
export const APPLE_PRODUCTS: Record<string, AppleProduct> = {
	"com.hero.orchestra.plus.monthly": { type: "subscription", credits: 10 },
	"com.hero.orchestra.credits.20": { type: "consumable", credits: 20 },
	"com.hero.orchestra.credits.50": { type: "consumable", credits: 50 },
};

export type AppleEnvironment = "Production" | "Sandbox";

const API_BASE: Record<AppleEnvironment, string> = {
	Production: "https://api.storekit.itunes.apple.com",
	Sandbox: "https://api.storekit-sandbox.itunes.apple.com",
};

/** Decoded JWSTransactionDecodedPayload (only the fields we use) */
export type AppleTransaction = {
	transactionId: string;
	originalTransactionId: string;
	bundleId: string;
	productId: string;
	purchaseDate?: number;
	expiresDate?: number;
	revocationDate?: number;
	revocationReason?: number;
	appAccountToken?: string;
	environment: AppleEnvironment;
	type?: string;
};

export class AppStoreError extends Error {
	constructor(message: string, public status: number, public code: string) {
		super(message);
	}
}

// ---------------------------------------------------------------------------
// App Store Server API
// ---------------------------------------------------------------------------

const b64url = (bytes: Uint8Array): string =>
	btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const b64urlJson = (value: unknown): string => b64url(new TextEncoder().encode(JSON.stringify(value)));

let cachedKey: CryptoKey | null = null;
let cachedToken: { token: string; expiresAt: number } | null = null;

async function signingKey(): Promise<CryptoKey> {
	if (cachedKey) return cachedKey;
	const pem = (Deno.env.get("APPLE_IAP_PRIVATE_KEY") ?? "").replace(/\\n/g, "\n");
	const body = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s+/g, "");
	if (!body) throw new AppStoreError("APPLE_IAP_PRIVATE_KEY が設定されていません。", 500, "not_configured");
	const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
	cachedKey = await crypto.subtle.importKey("pkcs8", der, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
	return cachedKey;
}

/** ES256 bearer token for the App Store Server API (valid for at most 1 hour; reused for 50 minutes). */
async function apiToken(): Promise<string> {
	const now = Math.floor(Date.now() / 1000);
	if (cachedToken && cachedToken.expiresAt - 600 > now) return cachedToken.token;
	const issuer = Deno.env.get("APPLE_IAP_ISSUER_ID") ?? "";
	const keyId = Deno.env.get("APPLE_IAP_KEY_ID") ?? "";
	if (!issuer || !keyId) throw new AppStoreError("APPLE_IAP_ISSUER_ID / APPLE_IAP_KEY_ID が設定されていません。", 500, "not_configured");
	const header = b64urlJson({ alg: "ES256", kid: keyId, typ: "JWT" });
	const payload = b64urlJson({ iss: issuer, iat: now, exp: now + 3600, aud: "appstoreconnect-v1", bid: APPLE_BUNDLE_ID });
	const signingInput = `${header}.${payload}`;
	// WebCrypto returns the raw r||s signature, which is exactly what JWS ES256 wants.
	const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, await signingKey(), new TextEncoder().encode(signingInput)));
	cachedToken = { token: `${signingInput}.${b64url(sig)}`, expiresAt: now + 3600 };
	return cachedToken.token;
}

/** The payload of a JWS from a response we fetched from Apple ourselves. */
export function decodeJws<T>(jws: string): T {
	const part = jws.split(".")[1] ?? "";
	const json = atob(part.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((part.length + 3) % 4));
	return JSON.parse(new TextDecoder().decode(Uint8Array.from(json, (c) => c.charCodeAt(0)))) as T;
}

async function apiGet(env: AppleEnvironment, path: string): Promise<Response> {
	return await fetch(`${API_BASE[env]}${path}`, { headers: { Authorization: `Bearer ${await apiToken()}` } });
}

/**
 * GET from the environment the transaction lives in. Apple's guidance: try
 * production first and fall back to sandbox (App Review buys in sandbox).
 */
async function apiGetAnyEnv(path: string, prefer?: AppleEnvironment): Promise<{ env: AppleEnvironment; body: any }> {
	const order: AppleEnvironment[] = prefer === "Sandbox" ? ["Sandbox", "Production"] : ["Production", "Sandbox"];
	let last = "";
	for (const env of order) {
		const res = await apiGet(env, path);
		if (res.ok) return { env, body: await res.json() };
		last = `${res.status} ${await res.text().catch(() => "")}`.slice(0, 300);
		if (res.status !== 404) break;
	}
	throw new AppStoreError(`App Store から取引を取得できませんでした (${last})`, 502, "apple_api_failed");
}

function validTransaction(tx: AppleTransaction): AppleTransaction {
	if (tx.bundleId !== APPLE_BUNDLE_ID) throw new AppStoreError("このアプリの取引ではありません。", 400, "wrong_bundle");
	if (!APPLE_PRODUCTS[tx.productId]) throw new AppStoreError(`未対応の商品です: ${tx.productId}`, 400, "unknown_product");
	return tx;
}

export async function getTransaction(transactionId: string, prefer?: AppleEnvironment): Promise<AppleTransaction> {
	if (!/^\d{1,30}$/.test(transactionId)) throw new AppStoreError("取引 ID が不正です。", 400, "invalid_transaction_id");
	const { body } = await apiGetAnyEnv(`/inApps/v1/transactions/${transactionId}`, prefer);
	return validTransaction(decodeJws<AppleTransaction>(body.signedTransactionInfo));
}

/** Subscription status (1 active, 2 expired, 3 billing retry, 4 grace period, 5 revoked) and its latest transaction. */
export async function getSubscriptionState(anyTransactionId: string, prefer?: AppleEnvironment): Promise<{ status: number; latest: AppleTransaction }> {
	const { body } = await apiGetAnyEnv(`/inApps/v1/subscriptions/${anyTransactionId}`, prefer);
	for (const group of body.data ?? []) {
		for (const item of group.lastTransactions ?? []) {
			const tx = decodeJws<AppleTransaction>(item.signedTransactionInfo);
			if (tx.bundleId === APPLE_BUNDLE_ID && APPLE_PRODUCTS[tx.productId]?.type === "subscription") {
				return { status: Number(item.status), latest: tx };
			}
		}
	}
	throw new AppStoreError("サブスクリプションの状態が見つかりませんでした。", 404, "subscription_not_found");
}

// ---------------------------------------------------------------------------
// Granting
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Which Division user a transaction belongs to. The app sets appAccountToken to
 * the user's id when it buys; a transaction already recorded keeps its owner.
 * `claimedUserId` (the signed-in caller of apple-iap) may only claim a
 * transaction that is not someone else's.
 */
export async function resolveOwner(admin: SupabaseClient, tx: AppleTransaction, claimedUserId?: string): Promise<string | null> {
	const { data: known } = await admin
		.from("AppStorePurchase")
		.select("userId")
		.eq("originalTransactionId", tx.originalTransactionId)
		.limit(1)
		.maybeSingle();
	const token = tx.appAccountToken && UUID_RE.test(tx.appAccountToken) ? tx.appAccountToken.toLowerCase() : null;
	const owner = (known?.userId as string | undefined) ?? token ?? claimedUserId ?? null;
	if (claimedUserId && owner && owner !== claimedUserId) {
		throw new AppStoreError("この購入は別の Division アカウントに紐づいています。", 409, "owned_by_another_user");
	}
	return owner;
}

async function recordPurchase(admin: SupabaseClient, tx: AppleTransaction, userId: string, credited: boolean) {
	const ms = (v?: number) => (v ? new Date(v).toISOString() : null);
	const row: Record<string, unknown> = {
		transactionId: tx.transactionId,
		originalTransactionId: tx.originalTransactionId,
		userId,
		productId: tx.productId,
		productType: APPLE_PRODUCTS[tx.productId].type,
		environment: tx.environment,
		purchaseDate: ms(tx.purchaseDate),
		expiresDate: ms(tx.expiresDate),
		revocationDate: ms(tx.revocationDate),
	};
	if (credited) row.creditedAt = new Date().toISOString();
	const { error } = await admin.from("AppStorePurchase").upsert(row, { onConflict: "transactionId" });
	if (error) throw new Error(`AppStorePurchase upsert failed: ${error.message}`);
}

function meta(tx: AppleTransaction, extra: Record<string, unknown> = {}) {
	return {
		apple_transaction_id: tx.transactionId,
		apple_original_transaction_id: tx.originalTransactionId,
		apple_product_id: tx.productId,
		apple_environment: tx.environment,
		...extra,
	};
}

/** A credit pack: add the credits once, or take them back after a refund. */
export async function syncConsumable(admin: SupabaseClient, tx: AppleTransaction, userId: string): Promise<void> {
	const credits = APPLE_PRODUCTS[tx.productId].credits;
	if (tx.revocationDate) {
		await recordPurchase(admin, tx, userId, false);
		await takeBackRefund(admin, tx, userId, credits);
		return;
	}
	const { error } = await admin.rpc("apply_credit_transaction", {
		p_user_id: userId,
		p_amount: credits,
		p_transaction_type: "purchase",
		p_source_id: `apple:transaction:${tx.transactionId}`,
		p_metadata: meta(tx),
	});
	if (error) throw new Error(`apply_credit_transaction failed: ${error.message}`);
	await recordPurchase(admin, tx, userId, true);
}

/** Refunded pack: remove its credits, or whatever is left of them if some were already used. */
async function takeBackRefund(admin: SupabaseClient, tx: AppleTransaction, userId: string, credits: number) {
	const { data: profile } = await admin.from("profiles").select("credit_balance").eq("id", userId).maybeSingle();
	const take = Math.min(credits, Number(profile?.credit_balance ?? 0));
	if (!(take > 0)) return;
	const { error } = await admin.rpc("apply_credit_transaction", {
		p_user_id: userId,
		p_amount: -take,
		p_transaction_type: "refund",
		p_source_id: `apple:refund:${tx.transactionId}`,
		p_metadata: meta(tx, { refunded_credits: credits, revocation_reason: tx.revocationReason ?? null }),
	});
	if (error && !/insufficient_credits/.test(error.message)) throw new Error(`refund failed: ${error.message}`);
}

const ACTIVE_STATUS: Record<number, string> = { 1: "active", 3: "past_due", 4: "in_grace_period" };

/**
 * Orchestra Plus: bring the profile in line with Apple's subscription state.
 * Active → plan orchestra_plus and this period's 10 credits (once per renewal
 * transaction). Expired / revoked → back to free and the period's credits
 * expire — unless a Stripe subscription (bought on the website) is still active.
 */
export async function syncSubscription(admin: SupabaseClient, anyTx: AppleTransaction, userId: string): Promise<{ active: boolean; expiresAt: string | null }> {
	const { status, latest } = await getSubscriptionState(anyTx.transactionId, anyTx.environment);
	const expiresAt = latest.expiresDate ? new Date(latest.expiresDate).toISOString() : null;
	const active = !!ACTIVE_STATUS[status] && !latest.revocationDate;

	if (active) {
		// Billing retry keeps the old transaction as the latest one, so no new credits until Apple is paid.
		const notExpired = !latest.expiresDate || latest.expiresDate > Date.now();
		if (notExpired) {
			const { error } = await admin.rpc("reset_subscription_credits", {
				p_user_id: userId,
				p_credits: APPLE_PRODUCTS[latest.productId].credits,
				p_source_id: `apple:transaction:${latest.transactionId}`,
				p_expires_at: expiresAt,
				p_metadata: meta(latest, { apple_subscription_status: status }),
			});
			if (error) throw new Error(`reset_subscription_credits failed: ${error.message}`);
		}
		await recordPurchase(admin, latest, userId, notExpired);
		const { error } = await admin
			.from("profiles")
			.update({
				plan: "orchestra_plus",
				subscription_status: ACTIVE_STATUS[status],
				current_period_end: expiresAt,
				apple_original_transaction_id: latest.originalTransactionId,
				apple_subscription_expires_at: expiresAt,
			})
			.eq("id", userId);
		if (error) throw new Error(`profiles update failed: ${error.message}`);
		return { active: true, expiresAt };
	}

	await recordPurchase(admin, latest, userId, false);
	const { data: profile } = await admin
		.from("profiles")
		.select("stripe_subscription_id, subscription_status, apple_original_transaction_id")
		.eq("id", userId)
		.maybeSingle();
	const stripeActive = !!profile?.stripe_subscription_id && ["active", "trialing", "past_due"].includes(String(profile?.subscription_status));
	const appleWasSource = !profile?.apple_original_transaction_id || profile.apple_original_transaction_id === latest.originalTransactionId;
	if (!stripeActive && appleWasSource) {
		const { error } = await admin.rpc("expire_subscription_credits", {
			p_user_id: userId,
			p_source_id: `apple:expire:${latest.transactionId}`,
			p_metadata: meta(latest, { apple_subscription_status: status }),
		});
		if (error) throw new Error(`expire_subscription_credits failed: ${error.message}`);
		const { error: upErr } = await admin
			.from("profiles")
			.update({
				plan: "free",
				subscription_status: latest.revocationDate || status === 5 ? "revoked" : "expired",
				apple_subscription_expires_at: expiresAt,
			})
			.eq("id", userId);
		if (upErr) throw new Error(`profiles update failed: ${upErr.message}`);
	}
	return { active: false, expiresAt };
}

/** Grant (or revoke) whatever the transaction is. */
export async function syncTransaction(admin: SupabaseClient, tx: AppleTransaction, userId: string) {
	return APPLE_PRODUCTS[tx.productId].type === "subscription"
		? await syncSubscription(admin, tx, userId)
		: (await syncConsumable(admin, tx, userId), { active: false, expiresAt: null });
}
