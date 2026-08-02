import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Stripe Checkout / Billing Portal からブラウザ側でリダイレクトされる
// 着地ページ。Orchestra はデスクトップアプリのため、決済完了後は
// このページを閉じてエディタへ戻ってもらう案内だけを表示する。
const MESSAGES: Record<string, string> = {
	success: "お支払いが完了しました。",
	cancel: "手続きはキャンセルされました。",
	portal: "設定を保存しました。",
};

Deno.serve((req: Request) => {
	const url = new URL(req.url);
	const status = url.searchParams.get("status") ?? "success";
	const message = MESSAGES[status] ?? MESSAGES.success;

	const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<title>Orchestra</title>
<style>
	body { font-family: system-ui, sans-serif; background: #111; color: #eee; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
	.card { text-align: center; padding: 2rem; }
	h1 { color: #dc2626; margin-bottom: 0.5rem; }
	p { color: #ccc; }
</style>
</head>
<body>
	<div class="card">
		<h1>Orchestra</h1>
		<p>${message}</p>
		<p>このタブを閉じて、エディタに戻ってください。</p>
	</div>
</body>
</html>`;

	return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
});
