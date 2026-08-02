import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.208.0/crypto/mod.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// 30文字のランダムなAPIキーを生成
async function generateApiKey(): Promise<string> {
	const buffer = crypto.getRandomValues(new Uint8Array(24));
	return Array.from(buffer)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("")
		.slice(0, 30);
}

Deno.serve(async (req: Request) => {
	if (req.method !== "POST") {
		return new Response("Method not allowed", { status: 405 });
	}

	const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

	let body: { userId?: string };
	try {
		body = await req.json();
	} catch {
		return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
	}

	const userId = body.userId;
	if (!userId) {
		return new Response(JSON.stringify({ error: "userId is required" }), { status: 400 });
	}

	try {
		// 既存のアクティブなAPIキーがあるか確認
		const { data: existing, error: checkError } = await admin
			.from("ApiKey")
			.select("id")
			.eq("userId", userId)
			.eq("revoked", false)
			.maybeSingle();

		if (checkError) {
			console.error("Error checking existing API key:", checkError.message);
		}

		// 既に有効なAPIキーがある場合はスキップ
		if (existing) {
			return new Response(JSON.stringify({ success: true, message: "API key already exists" }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		}

		// 新しいAPIキーを生成
		const key = await generateApiKey();
		const now = new Date().toISOString();

		// APIキーを保存
		const { error: insertError } = await admin
			.from("ApiKey")
			.insert({
				userId,
				key,
				revoked: false,
				createdAt: now,
			});

		if (insertError) {
			console.error("Error inserting API key:", insertError.message);
			return new Response(JSON.stringify({ error: "Failed to create API key" }), { status: 500 });
		}

		return new Response(JSON.stringify({ success: true, key }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	} catch (err) {
		console.error("Error provisioning API key:", err);
		return new Response(JSON.stringify({ error: "Internal error" }), { status: 500 });
	}
});
