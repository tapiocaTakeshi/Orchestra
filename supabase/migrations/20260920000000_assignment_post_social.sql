-- Orchestra Mobile のソーシャル機能 (役割割り当ての共有) で使うアクセス制御。
--
-- AssignmentPost / AssignmentPostLike は RLS が有効なのにポリシーが無く、
-- これまで anon / authenticated のどちらからも読み書きできなかった。ここで
-- 「投稿はログイン済みなら誰でも読める / 書き換えられるのは投稿者だけ」という
-- 最小限のルールを与え、いいね数と取り込み数はクライアントから直接は触らせず
-- トリガと SECURITY DEFINER 関数だけが更新するようにする。

-- ---------------------------------------------------------------------------
-- id の既定値。モバイルから uuid を作らなくても投稿できるようにする。
-- ---------------------------------------------------------------------------
alter table public."AssignmentPost"
	alter column id set default gen_random_uuid()::text;

-- ---------------------------------------------------------------------------
-- AssignmentPost のポリシー
-- ---------------------------------------------------------------------------
drop policy if exists "AssignmentPost_select_authenticated" on public."AssignmentPost";
create policy "AssignmentPost_select_authenticated"
	on public."AssignmentPost"
	for select
	to authenticated
	using (true);

drop policy if exists "AssignmentPost_insert_own" on public."AssignmentPost";
create policy "AssignmentPost_insert_own"
	on public."AssignmentPost"
	for insert
	to authenticated
	with check (auth.uid() = "authorId");

drop policy if exists "AssignmentPost_update_own" on public."AssignmentPost";
create policy "AssignmentPost_update_own"
	on public."AssignmentPost"
	for update
	to authenticated
	using (auth.uid() = "authorId")
	with check (auth.uid() = "authorId");

drop policy if exists "AssignmentPost_delete_own" on public."AssignmentPost";
create policy "AssignmentPost_delete_own"
	on public."AssignmentPost"
	for delete
	to authenticated
	using (auth.uid() = "authorId");

-- RLS は行単位までしか絞れないので、カウンタ列は列単位の権限で守る。
-- (投稿者が自分の投稿のいいね数を書き換えられないようにするため)
revoke update on table public."AssignmentPost" from authenticated;
grant update ("title", "description", "assignments", "sourceProjectId", "updatedAt")
	on table public."AssignmentPost" to authenticated;

revoke all on table public."AssignmentPost" from anon;
revoke all on table public."AssignmentPostLike" from anon;

-- ---------------------------------------------------------------------------
-- AssignmentPostLike のポリシー
-- ---------------------------------------------------------------------------
drop policy if exists "AssignmentPostLike_select_authenticated" on public."AssignmentPostLike";
create policy "AssignmentPostLike_select_authenticated"
	on public."AssignmentPostLike"
	for select
	to authenticated
	using (true);

drop policy if exists "AssignmentPostLike_insert_own" on public."AssignmentPostLike";
create policy "AssignmentPostLike_insert_own"
	on public."AssignmentPostLike"
	for insert
	to authenticated
	with check (auth.uid() = "userId");

drop policy if exists "AssignmentPostLike_delete_own" on public."AssignmentPostLike";
create policy "AssignmentPostLike_delete_own"
	on public."AssignmentPostLike"
	for delete
	to authenticated
	using (auth.uid() = "userId");

-- ---------------------------------------------------------------------------
-- いいね数はトリガで同期する。クライアントは AssignmentPostLike を足し引きするだけ。
-- ---------------------------------------------------------------------------
create or replace function public.sync_assignment_post_like_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
	if (tg_op = 'INSERT') then
		update public."AssignmentPost"
			set "likeCount" = "likeCount" + 1
			where id = new."postId";
		return new;
	end if;

	update public."AssignmentPost"
		set "likeCount" = greatest("likeCount" - 1, 0)
		where id = old."postId";
	return old;
end;
$$;

drop trigger if exists assignment_post_like_count on public."AssignmentPostLike";
create trigger assignment_post_like_count
	after insert or delete on public."AssignmentPostLike"
	for each row execute function public.sync_assignment_post_like_count();

-- 既存行のいいね数をテーブルの実態に合わせ直す。
update public."AssignmentPost" p
	set "likeCount" = coalesce((select count(*) from public."AssignmentPostLike" l where l."postId" = p.id), 0);

-- ---------------------------------------------------------------------------
-- 取り込み。件数を増やして、取り込んだ割り当てを返す。
-- ---------------------------------------------------------------------------
create or replace function public.import_assignment_post(p_post_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
	result jsonb;
begin
	if auth.uid() is null then
		raise exception 'authentication required';
	end if;

	update public."AssignmentPost"
		set "importCount" = "importCount" + 1
		where id = p_post_id
		returning assignments into result;

	if result is null then
		raise exception 'post not found';
	end if;

	return result;
end;
$$;

revoke all on function public.import_assignment_post(text) from public, anon;
grant execute on function public.import_assignment_post(text) to authenticated;
