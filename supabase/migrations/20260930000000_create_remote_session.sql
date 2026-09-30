-- Orchestra Mobile のデバイス検出用テーブル。
--
-- デスクトップ (src/vs/code/electron-main/orchestraMobileRemoteControl.ts) が、
-- ログイン中の Division アカウントで約 25 秒ごとに自分の行を upsert し、
-- ログアウト・終了時に削除する。Orchestra Mobile は同じアカウントの行を読んで
-- 「見つかったデバイス」に出し、接続前にペアリングのトークンがここにあるかを確かめる。
--
-- 行には LAN のアドレスとペアリングのトークンが入るので、RLS で本人の行だけに絞る。
-- Mobile は新しい行の INSERT を Realtime で購読するので publication にも加える。

create table if not exists public."RemoteSession" (
	id uuid primary key,
	"userId" uuid not null references auth.users (id) on delete cascade,
	"deviceLabel" text not null default '',
	"lanUrl" text not null,
	token text not null,
	"protocolVersion" integer not null default 1,
	"lastSeenAt" timestamptz not null default now(),
	"createdAt" timestamptz not null default now()
);

create index if not exists "RemoteSession_userId_lastSeenAt_idx"
	on public."RemoteSession" ("userId", "lastSeenAt" desc);

alter table public."RemoteSession" enable row level security;

revoke all on table public."RemoteSession" from anon;
grant select, insert, update, delete on table public."RemoteSession" to authenticated;

create policy "RemoteSession_select_own" on public."RemoteSession"
	for select to authenticated using (auth.uid() = "userId");

create policy "RemoteSession_insert_own" on public."RemoteSession"
	for insert to authenticated with check (auth.uid() = "userId");

create policy "RemoteSession_update_own" on public."RemoteSession"
	for update to authenticated using (auth.uid() = "userId") with check (auth.uid() = "userId");

create policy "RemoteSession_delete_own" on public."RemoteSession"
	for delete to authenticated using (auth.uid() = "userId");

alter publication supabase_realtime add table public."RemoteSession";
