-- Phase 1: orchestra-mobile のアカウント自動連携用テーブル。
--
-- 本番 Supabase プロジェクト (wmhrbhcnxglvqwvnbxlt) への適用は、必ず人間が内容を
-- レビューした上で明示的に実行すること。このリポジトリに置いてあるだけでは
-- 自動適用されない (CI / アプリのどちらからも apply しない)。
--
-- 目的:
--   デスクトップ (IDE) がリモートコントロールを有効にして Division アカウントに
--   ログインしている間、自分の LAN 接続情報 (アドレス / トークン) をこのテーブルに
--   upsert (ハートビート) する。orchestra-mobile は同じアカウントでログインすると、
--   このテーブルを見て自動的に接続先候補を表示できる。
--
-- 関連コード:
--   desktop: src/vs/workbench/contrib/void/browser/remoteControlSessionSync.ts
--   mobile:  src/lib/divisionAuth.ts (listRemoteSessions / subscribeToNewRemoteSessions)

create table if not exists public."RemoteSession" (
	"id"              uuid primary key default gen_random_uuid(),
	"userId"          uuid not null references auth.users(id) on delete cascade,
	"deviceLabel"     text not null default '',
	"lanUrl"          text not null,
	"token"           text not null,
	"protocolVersion" integer not null default 1,
	"lastSeenAt"      timestamptz not null default now(),
	"createdAt"       timestamptz not null default now()
);

create index if not exists "RemoteSession_userId_idx" on public."RemoteSession" ("userId");
create index if not exists "RemoteSession_lastSeenAt_idx" on public."RemoteSession" ("lastSeenAt");

alter table public."RemoteSession" enable row level security;

drop policy if exists "RemoteSession_select_own" on public."RemoteSession";
create policy "RemoteSession_select_own" on public."RemoteSession"
	for select using (auth.uid() = "userId");

drop policy if exists "RemoteSession_insert_own" on public."RemoteSession";
create policy "RemoteSession_insert_own" on public."RemoteSession"
	for insert with check (auth.uid() = "userId");

drop policy if exists "RemoteSession_update_own" on public."RemoteSession";
create policy "RemoteSession_update_own" on public."RemoteSession"
	for update using (auth.uid() = "userId") with check (auth.uid() = "userId");

drop policy if exists "RemoteSession_delete_own" on public."RemoteSession";
create policy "RemoteSession_delete_own" on public."RemoteSession"
	for delete using (auth.uid() = "userId");

-- モバイル側の Realtime 購読 (新規セッション通知) 用。
alter publication supabase_realtime add table public."RemoteSession";
