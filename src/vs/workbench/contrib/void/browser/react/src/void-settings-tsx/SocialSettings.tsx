/*--------------------------------------------------------------------------------------
 *  Copyright 2025 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// 設定画面の「ソーシャル」タブ: Division プロジェクトのロール割り当ての共有。Web 版・モバイルと同じフィード。
//
//   - フィード: すべて / フォロー中 / 保存済み / 自分の投稿、新着 / 人気、検索、もっと見る
//   - 投稿: いいね・保存・コメント (自分のコメントと、自分の投稿へのコメントは消せる)・取り込み・削除 (自分の投稿)
//   - 投稿者: 名前から、投稿数・もらったいいね・フォロワーとフォローのボタン・その人の投稿
//   - 共有: 自分の Division プロジェクトを選んで投稿 (割り当てはサーバーがプロジェクトから写し取る)
// 取り込んだプロジェクトは Supabase から取り込み直し、使うプロジェクトにする。

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Bookmark, Download, Heart, Loader2, MessageSquare, RefreshCw, Search, Share2, Trash2, UserCheck, UserPlus } from 'lucide-react';
import { useAccessor, useDivisionProjects, useSettingsState } from '../util/services.js';
import { roleLabel } from './AutoRouting.js';
import { createSocialApi, type FeedFilter, type FeedSort, type SocialComment, type SocialPost, type SocialProfile } from './socialApi.js';

const FILTERS: { key: FeedFilter; label: string }[] = [
	{ key: 'all', label: 'すべて' },
	{ key: 'following', label: 'フォロー中' },
	{ key: 'bookmarked', label: '保存済み' },
	{ key: 'mine', label: '自分の投稿' },
];
const EFFORT_LABELS: Record<string, string> = { low: '低い', medium: 'ふつう', high: '高い', xhigh: 'とても高い', max: '最大' };
const TITLE_MAX = 80;
const DESCRIPTION_MAX = 280;
const COMMENT_MAX = 500;

const formatDate = (iso: string) => {
	const d = new Date(iso);
	return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};
const nameOf = (slug: string, fallback: string) => { const l = roleLabel(slug); return l !== slug ? l : fallback || slug; };
const errorOf = (e: unknown) => e instanceof Error ? e.message : String(e);

const chip = (on: boolean) =>
	`px-2.5 py-1 rounded-full border text-xs ${on ? 'border-[var(--vscode-button-background)] text-void-fg-1 bg-[color-mix(in_srgb,var(--vscode-button-background)_15%,transparent)]' : 'border-void-border-2 text-void-fg-3 hover:text-void-fg-1'}`;
const iconButton = 'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-void-fg-3 hover:text-void-fg-1 hover:bg-[color-mix(in_srgb,var(--void-fg-1)_6%,transparent)] disabled:opacity-40 disabled:cursor-not-allowed';
const primary = 'rounded px-2.5 py-1 text-xs bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] disabled:opacity-40 disabled:cursor-not-allowed';
const input = 'bg-void-bg-1 border border-void-border-2 rounded px-2 py-1 text-sm';

export const SocialSettings = () => {
	const accessor = useAccessor();
	const llmMessageService = accessor.get('ILLMMessageService');
	const divisionProjectService = accessor.get('IDivisionProjectService');
	const projects = useDivisionProjects();
	const settings = useSettingsState();
	const accessToken = settings.globalSettings.divisionAccessToken;
	const refreshToken = settings.globalSettings.divisionRefreshToken;
	const signedIn = !!settings.globalSettings.isLoggedIn && !!accessToken;
	const api = useMemo(() => createSocialApi(llmMessageService, accessToken, refreshToken), [llmMessageService, accessToken, refreshToken]);

	const [filter, setFilter] = useState<FeedFilter>('all');
	const [sort, setSort] = useState<FeedSort>('new');
	const [query, setQuery] = useState('');
	const [appliedQuery, setAppliedQuery] = useState('');
	/** 投稿者のページを見ているとき */
	const [author, setAuthor] = useState<SocialProfile | null>(null);

	const [posts, setPosts] = useState<SocialPost[]>([]);
	const [total, setTotal] = useState(0);
	const [page, setPage] = useState(0);
	const [pageSize, setPageSize] = useState(20);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');
	const [notice, setNotice] = useState('');
	const [publishing, setPublishing] = useState(false);

	const seq = useRef(0);
	const authorId = author?.id;
	const load = useCallback(async (nextPage = 0) => {
		const mySeq = ++seq.current;
		setLoading(true); setError('');
		try {
			const data = await api.feed({ filter: authorId ? 'all' : filter, sort, q: appliedQuery, page: nextPage, author: authorId });
			if (mySeq !== seq.current) return;
			setPosts(prev => nextPage === 0 ? data.posts : [...prev, ...data.posts.filter(p => !prev.some(q => q.id === p.id))]);
			setTotal(data.total); setPage(data.page); setPageSize(data.pageSize || 20);
		} catch (e) {
			if (mySeq === seq.current) setError(errorOf(e));
		} finally {
			if (mySeq === seq.current) setLoading(false);
		}
	}, [api, filter, sort, appliedQuery, authorId]);

	useEffect(() => { void load(0); }, [load]);

	const patchPost = (id: string, patch: Partial<SocialPost>) => setPosts(ps => ps.map(p => p.id === id ? { ...p, ...patch } : p));

	const openAuthor = async (authorId: string) => {
		setError('');
		try {
			const { profile } = await api.profile(authorId);
			setAuthor(profile);
		} catch (e) { setError(errorOf(e)); }
	};

	const toggleFollow = async () => {
		if (!author) return;
		const on = !author.following;
		setAuthor({ ...author, following: on, followerCount: author.followerCount + (on ? 1 : -1) });
		try {
			const r = await api.setFollow(author.id, on);
			setAuthor(a => a && { ...a, following: r.following, followerCount: r.followerCount });
		} catch (e) {
			setAuthor(a => a && { ...a, following: !on, followerCount: a.followerCount + (on ? -1 : 1) });
			setError(errorOf(e));
		}
	};

	const hasMore = (page + 1) * pageSize < total;

	return <div className='flex flex-col gap-4 max-w-3xl text-sm'>
		{!signedIn && <div className='rounded border border-void-border-2 bg-void-bg-2 p-3 text-void-fg-3'>
			ログインしていないので、閲覧だけできます。いいね・保存・コメント・フォロー・取り込み・投稿には Orchestra へのログインが必要です。
		</div>}

		{/* 操作の列 */}
		{author ? <div className='flex flex-col gap-3 rounded-lg border border-void-border-3 bg-void-bg-1 p-4'>
			<button type='button' className={`${iconButton} w-fit`} onClick={() => setAuthor(null)}><ArrowLeft size={13} />フィードに戻る</button>
			<div className='flex items-center justify-between gap-3 flex-wrap'>
				<div className='flex flex-col gap-1'>
					<span className='text-lg text-void-fg-1 font-medium'>{author.name}</span>
					<span className='text-xs text-void-fg-3'>
						投稿 {author.postCount} · もらったいいね {author.receivedLikeCount} · フォロワー {author.followerCount} · フォロー {author.followingCount}
					</span>
				</div>
				{!author.isSelf && <button type='button' disabled={!signedIn} onClick={() => { void toggleFollow(); }} className={author.following ? `${iconButton} border border-void-border-2` : primary}>
					<span className='inline-flex items-center gap-1'>{author.following ? <><UserCheck size={13} />フォロー中</> : <><UserPlus size={13} />フォローする</>}</span>
				</button>}
			</div>
		</div> : <div className='flex flex-col gap-2'>
			<div className='flex items-center gap-1.5 flex-wrap'>
				{FILTERS.map(f => <button
					key={f.key} type='button' className={chip(filter === f.key)} aria-pressed={filter === f.key}
					disabled={f.key !== 'all' && !signedIn}
					onClick={() => setFilter(f.key)}
				>{f.label}</button>)}
				<span className='flex-1' />
				<button type='button' className={primary} disabled={!signedIn} onClick={() => setPublishing(v => !v)}>
					<span className='inline-flex items-center gap-1'><Share2 size={12} />プロジェクトを共有</span>
				</button>
			</div>
			<form className='flex items-center gap-2' onSubmit={e => { e.preventDefault(); setAppliedQuery(query); }}>
				<div className='flex items-center gap-1.5 flex-1 border border-void-border-2 rounded px-2 bg-void-bg-1'>
					<Search size={13} className='text-void-fg-4' />
					<input aria-label='投稿を検索' placeholder='タイトル・説明で検索' value={query} onChange={e => setQuery(e.target.value)} className='flex-1 bg-transparent py-1 text-sm outline-none' />
				</div>
				<select aria-label='並び順' value={sort} onChange={e => setSort(e.target.value as FeedSort)} className={input}>
					<option value='new'>新着</option>
					<option value='popular'>人気</option>
				</select>
				<button type='button' title='再読み込み' className={iconButton} onClick={() => { void load(0); }}>
					{loading ? <Loader2 size={14} className='animate-spin' /> : <RefreshCw size={14} />}
				</button>
			</form>
		</div>}

		{publishing && !author && <PublishForm
			projects={projects}
			onCancel={() => setPublishing(false)}
			onPublish={async (input) => {
				await api.publish(input);
				setPublishing(false);
				setNotice(`「${input.title}」を共有しました。`);
				if (filter === 'all' || filter === 'mine') void load(0); else setFilter('mine');
			}}
		/>}

		{notice && <div role='status' className='flex items-center justify-between gap-2 rounded bg-void-bg-2 px-3 py-2 text-void-fg-2'>
			<span>{notice}</span>
			<button type='button' className={iconButton} onClick={() => setNotice('')}>閉じる</button>
		</div>}
		{error && <p role='alert' className='text-red-400'>{error}</p>}

		{/* 投稿の一覧 */}
		{!loading && posts.length === 0 && !error && <div className='rounded-lg border-2 border-dashed border-void-border-2 p-8 text-center text-void-fg-3'>
			{appliedQuery ? '見つかりませんでした。' : filter === 'following' ? 'フォローしている人の投稿はまだありません。' : filter === 'bookmarked' ? '保存した投稿はまだありません。' : filter === 'mine' ? 'まだ投稿していません。' : 'まだ投稿がありません。'}
		</div>}
		<div className='flex flex-col gap-3'>
			{posts.map(post => <PostCard
				key={post.id} post={post} signedIn={signedIn} api={api}
				onAuthor={() => { void openAuthor(post.authorId); }}
				onPatch={patch => patchPost(post.id, patch)}
				onDeleted={() => { setPosts(ps => ps.filter(p => p.id !== post.id)); setTotal(t => Math.max(0, t - 1)); }}
				onImported={async (name, projectId) => {
					// 取り込んだプロジェクトを Supabase から取り込み、使うプロジェクトにする
					await divisionProjectService.fetchFromSupabase();
					const added = divisionProjectService.projects.some(p => p.projectId === projectId);
					if (added) await divisionProjectService.setActiveProject(projectId);
					setNotice(added
						? `「${name}」として取り込み、使う Division プロジェクトにしました。`
						: `「${name}」として取り込みました。Division タブの「Supabase から取得」で一覧に出ます。`);
				}}
				onError={setError}
			/>)}
		</div>
		{hasMore && <button type='button' disabled={loading} className={`${iconButton} self-center border border-void-border-2 px-3 py-1`} onClick={() => { void load(page + 1); }}>
			{loading ? '読み込み中…' : 'もっと見る'}
		</button>}
	</div>;
};

/** 自分の Division プロジェクトを選んで共有する */
const PublishForm = ({ projects, onPublish, onCancel }: {
	projects: { projectId: string; name: string }[];
	onPublish: (input: { projectId: string; title: string; description?: string }) => Promise<void>;
	onCancel: () => void;
}) => {
	const shareable = projects.filter(p => !!p.projectId);
	const [projectId, setProjectId] = useState(shareable[0]?.projectId ?? '');
	const [title, setTitle] = useState(shareable[0]?.name ?? '');
	const [description, setDescription] = useState('');
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');
	const pick = (id: string) => {
		const before = shareable.find(p => p.projectId === projectId);
		setProjectId(id);
		// 名前をそのまま使っていたら、選び直したプロジェクトの名前にする
		if (!title.trim() || title === before?.name) setTitle(shareable.find(p => p.projectId === id)?.name ?? '');
	};
	return <form
		className='flex flex-col gap-2 rounded-lg border border-void-border-3 bg-void-bg-1 p-3'
		onSubmit={e => {
			e.preventDefault();
			setBusy(true); setError('');
			onPublish({ projectId, title: title.trim(), description: description.trim() || undefined })
				.catch(err => setError(errorOf(err)))
				.finally(() => setBusy(false));
		}}
	>
		<strong className='text-void-fg-1'>プロジェクトを共有</strong>
		<span className='text-xs text-void-fg-3'>今のロールとモデルの割り当て (エフォートを含む) を写して投稿します。あとでプロジェクトを変えても、投稿は変わりません。</span>
		{shareable.length === 0
			? <span className='text-void-fg-3'>共有できる Division プロジェクトがありません。Division タブでプロジェクトを作るか、取り込んでください。</span>
			: <>
				<label className='flex flex-col gap-1'>
					<span className='text-xs text-void-fg-2'>プロジェクト</span>
					<select className={input} value={projectId} onChange={e => pick(e.target.value)}>
						{shareable.map(p => <option key={p.projectId} value={p.projectId}>{p.name || p.projectId}</option>)}
					</select>
				</label>
				<label className='flex flex-col gap-1'>
					<span className='text-xs text-void-fg-2'>タイトル</span>
					<input className={input} value={title} maxLength={TITLE_MAX} onChange={e => setTitle(e.target.value)} />
				</label>
				<label className='flex flex-col gap-1'>
					<span className='text-xs text-void-fg-2'>説明 (任意・{DESCRIPTION_MAX} 文字まで)</span>
					<textarea className={`${input} resize-y`} rows={2} value={description} maxLength={DESCRIPTION_MAX} onChange={e => setDescription(e.target.value)} placeholder='どんな仕事に向いた構成か、工夫した点など' />
				</label>
			</>}
		{error && <p role='alert' className='text-red-400 text-xs'>{error}</p>}
		<div className='flex gap-2'>
			<button type='submit' className={primary} disabled={busy || !projectId || !title.trim()}>{busy ? '投稿中…' : '投稿する'}</button>
			<button type='button' className={iconButton} onClick={onCancel}>やめる</button>
		</div>
	</form>;
};

const PostCard = ({ post, signedIn, api, onAuthor, onPatch, onDeleted, onImported, onError }: {
	post: SocialPost; signedIn: boolean; api: ReturnType<typeof createSocialApi>;
	onAuthor: () => void; onPatch: (patch: Partial<SocialPost>) => void; onDeleted: () => void;
	onImported: (name: string, projectId: string) => Promise<void>;
	onError: (message: string) => void;
}) => {
	const [threadOpen, setThreadOpen] = useState(false);
	const [busy, setBusy] = useState<'import' | 'delete' | null>(null);

	const toggleLike = async () => {
		const on = !post.liked;
		onPatch({ liked: on, likeCount: post.likeCount + (on ? 1 : -1) });
		try { const r = await api.setLike(post.id, on); onPatch({ liked: r.liked, likeCount: r.likeCount }); }
		catch (e) { onPatch({ liked: !on, likeCount: post.likeCount }); onError(errorOf(e)); }
	};
	const toggleBookmark = async () => {
		const on = !post.bookmarked;
		onPatch({ bookmarked: on });
		try { const r = await api.setBookmark(post.id, on); onPatch({ bookmarked: r.bookmarked }); }
		catch (e) { onPatch({ bookmarked: !on }); onError(errorOf(e)); }
	};
	const importPost = async () => {
		setBusy('import');
		try {
			const r = await api.importPost(post.id);
			onPatch({ importCount: post.importCount + 1 });
			await onImported(r.name, r.projectId);
		} catch (e) { onError(errorOf(e)); } finally { setBusy(null); }
	};
	const deletePost = async () => {
		if (!window.confirm(`「${post.title}」を削除しますか？ この操作は取り消せません。`)) return;
		setBusy('delete');
		try { await api.deletePost(post.id); onDeleted(); } catch (e) { onError(errorOf(e)); setBusy(null); }
	};

	return <article className='flex flex-col gap-2 rounded-lg border border-void-border-3 bg-void-bg-1 p-4'>
		<div className='flex items-start justify-between gap-3'>
			<div className='flex flex-col gap-0.5 min-w-0'>
				<h3 className='text-base text-void-fg-1 font-medium break-words'>{post.title}</h3>
				<span className='text-xs text-void-fg-3'>
					<button type='button' className='text-void-link-color hover:underline' onClick={onAuthor}>{post.authorName}</button>
					{' · '}{formatDate(post.createdAt)}
				</span>
			</div>
			{post.isAuthor && <button type='button' title='投稿を削除' className={iconButton} disabled={busy !== null} onClick={() => { void deletePost(); }}><Trash2 size={13} /></button>}
		</div>
		{post.description && <p className='text-void-fg-2 whitespace-pre-wrap break-words'>{post.description}</p>}

		<div className='flex flex-col rounded border border-void-border-3 overflow-hidden'>
			{[...post.assignments].sort((a, b) => a.priority - b.priority).map((a, i) => <div key={`${a.roleSlug}-${i}`} className='flex items-center justify-between gap-3 px-2.5 py-1.5 text-xs border-b border-[color-mix(in_srgb,var(--void-border-2)_60%,transparent)] last:border-b-0'>
				<span className='text-void-fg-1 shrink-0'>{nameOf(a.roleSlug, a.roleName)}</span>
				<span className='text-void-fg-3 truncate text-right'>
					{a.modelDisplayName || a.model} <span className='text-void-fg-4'>· {a.providerDisplayName || a.providerName}{a.effort ? ` · ${EFFORT_LABELS[a.effort] ?? a.effort}` : ''}</span>
				</span>
			</div>)}
		</div>

		<div className='flex items-center gap-1 flex-wrap'>
			<button type='button' aria-pressed={post.liked} title={post.liked ? 'いいねを取り消す' : 'いいね'} disabled={!signedIn} className={iconButton} onClick={() => { void toggleLike(); }}>
				<Heart size={13} fill={post.liked ? 'currentColor' : 'none'} className={post.liked ? 'text-red-400' : ''} />{post.likeCount}
			</button>
			<button type='button' aria-expanded={threadOpen} title='コメント' className={iconButton} onClick={() => setThreadOpen(v => !v)}>
				<MessageSquare size={13} />{post.commentCount}
			</button>
			<button type='button' aria-pressed={post.bookmarked} title={post.bookmarked ? '保存を取り消す' : '保存'} disabled={!signedIn} className={iconButton} onClick={() => { void toggleBookmark(); }}>
				<Bookmark size={13} fill={post.bookmarked ? 'currentColor' : 'none'} />{post.bookmarked ? '保存済み' : '保存'}
			</button>
			<span className='flex-1' />
			<span className='text-xs text-void-fg-4'>取り込み {post.importCount}</span>
			<button type='button' className={primary} disabled={!signedIn || busy !== null} onClick={() => { void importPost(); }}>
				<span className='inline-flex items-center gap-1'>{busy === 'import' ? <Loader2 size={12} className='animate-spin' /> : <Download size={12} />}取り込む</span>
			</button>
		</div>

		{threadOpen && <CommentThread post={post} signedIn={signedIn} api={api}
			onCount={delta => onPatch({ commentCount: Math.max(0, post.commentCount + delta) })} />}
	</article>;
};

const CommentThread = ({ post, signedIn, api, onCount }: {
	post: SocialPost; signedIn: boolean; api: ReturnType<typeof createSocialApi>; onCount: (delta: number) => void;
}) => {
	const [comments, setComments] = useState<SocialComment[] | null>(null);
	const [draft, setDraft] = useState('');
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');

	useEffect(() => {
		let active = true;
		api.comments(post.id).then(r => { if (active) setComments(r.comments); }).catch(e => { if (active) setError(errorOf(e)); });
		return () => { active = false; };
	}, [api, post.id]);

	const send = async () => {
		const body = draft.trim();
		if (!body) return;
		setBusy(true); setError('');
		try {
			const r = await api.addComment(post.id, body);
			if (r.comment) setComments(cs => [...(cs ?? []), r.comment!]);
			setDraft(''); onCount(1);
		} catch (e) { setError(errorOf(e)); } finally { setBusy(false); }
	};
	const remove = async (c: SocialComment) => {
		try { await api.deleteComment(post.id, c.id); setComments(cs => (cs ?? []).filter(x => x.id !== c.id)); onCount(-1); }
		catch (e) { setError(errorOf(e)); }
	};

	return <div className='flex flex-col gap-2 border-t border-void-border-2 pt-2'>
		{comments === null && !error && <span className='text-xs text-void-fg-3'>読み込み中…</span>}
		{comments?.length === 0 && <span className='text-xs text-void-fg-3'>まだコメントはありません。</span>}
		{comments?.map(c => <div key={c.id} className='flex items-start justify-between gap-2 text-xs'>
			<div className='flex flex-col gap-0.5 min-w-0'>
				<span className='text-void-fg-3'>{c.authorName} · {formatDate(c.createdAt)}</span>
				<span className='text-void-fg-1 whitespace-pre-wrap break-words'>{c.body}</span>
			</div>
			{c.canDelete && <button type='button' title='コメントを削除' className={iconButton} onClick={() => { void remove(c); }}><Trash2 size={12} /></button>}
		</div>)}
		{signedIn && <div className='flex items-end gap-2'>
			<textarea aria-label='コメント' rows={1} maxLength={COMMENT_MAX} value={draft} onChange={e => setDraft(e.target.value)}
				onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send(); } }}
				placeholder='コメントを書く (Ctrl+Enter で送信)' className={`${input} flex-1 resize-y text-xs`} />
			<button type='button' className={primary} disabled={busy || !draft.trim()} onClick={() => { void send(); }}>{busy ? '送信中…' : '送信'}</button>
		</div>}
		{error && <p role='alert' className='text-red-400 text-xs'>{error}</p>}
	</div>;
};
