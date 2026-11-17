/*--------------------------------------------------------------------------------------
 *  Copyright 2025 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// ソーシャル (ロール割り当ての共有) の通信。Division の Web サイトの /api/social/* を使う。
//
// コメント・保存・フォローのテーブルは RLS でクライアントから直接読み書きできない (Web のルートハンドラが
// 権限を確かめてから service role で触る) ので、Web 版・モバイルと同じルートを、ログイン中の
// Supabase のアクセストークン (Authorization: Bearer) で呼ぶ。Web サイトには CORS が無いので、
// 通信は main プロセス (ILLMMessageService.divisionApiRequest) から出す。

import { DIVISION_WEBSITE_URL } from '../../../../common/divisionAuthConfig.js';
import { restoreDivisionAuthSession } from '../../../../common/divisionSession.js';
import type { DivisionApiRequestParams, DivisionApiResponse } from '../../../../common/sendLLMMessageService.js';

export type PostedAssignment = {
	priority: number; roleSlug: string; roleName: string;
	providerName: string; providerDisplayName: string;
	model: string; modelDisplayName: string | null; providerId?: string; effort?: string;
};

export type SocialPost = {
	id: string; authorId: string; authorName: string; title: string; description: string | null;
	assignments: PostedAssignment[]; likeCount: number; importCount: number; commentCount: number;
	createdAt: string; liked: boolean; bookmarked: boolean; isAuthor: boolean;
};

export type SocialComment = { id: string; authorId: string; authorName: string; body: string; createdAt: string; canDelete: boolean };

export type SocialProfile = {
	id: string; name: string; avatarUrl: string | null; postCount: number; receivedLikeCount: number;
	followerCount: number; followingCount: number; following: boolean; isSelf: boolean;
};

export type FeedFilter = 'all' | 'following' | 'bookmarked' | 'mine';
export type FeedSort = 'new' | 'popular';
export type FeedPage = { posts: SocialPost[]; total: number; page: number; pageSize: number; signedIn: boolean };

type Requester = { divisionApiRequest: (params: DivisionApiRequestParams) => Promise<DivisionApiResponse> };

const errorText = (status: number, data: any, fallback?: string): string => {
	if (status === 0) return 'Division に接続できませんでした。ネットワークを確認して、もう一度お試しください。';
	if (typeof data?.error === 'string' && data.error) return data.error;
	if (status === 401) return 'ログインが必要です。Orchestra にログインしてください。';
	return fallback || `エラーが発生しました（${status}）`;
};

export function createSocialApi(requester: Requester, accessToken: string, refreshToken: string, endpoint = DIVISION_WEBSITE_URL) {
	const call = async <T = any>(path: string, method: DivisionApiRequestParams['method'] = 'GET', body?: unknown): Promise<T> => {
		// 保存済みのトークンは期限切れのことがあるので、セッションを戻して新しいものを使う
		let token = accessToken;
		if (accessToken) {
			try { token = (await restoreDivisionAuthSession(accessToken, refreshToken))?.access_token || accessToken; } catch { /* 保存済みのものを使う */ }
		}
		const res = await requester.divisionApiRequest({ endpoint, accessToken: token, path, method, body });
		if (!res.ok) throw new Error(errorText(res.status, res.data, res.error));
		return res.data as T;
	};
	const post = (id: string) => `/api/social/posts/${encodeURIComponent(id)}`;
	return {
		feed: (q: { filter: FeedFilter; sort: FeedSort; q?: string; page?: number; author?: string }) => {
			const params = new URLSearchParams({ filter: q.filter, sort: q.sort, page: String(q.page ?? 0) });
			if (q.q?.trim()) params.set('q', q.q.trim());
			if (q.author) params.set('author', q.author);
			return call<FeedPage>(`/api/social/posts?${params.toString()}`);
		},
		setLike: (id: string, on: boolean) => call<{ liked: boolean; likeCount: number }>(`${post(id)}/like`, on ? 'POST' : 'DELETE'),
		setBookmark: (id: string, on: boolean) => call<{ bookmarked: boolean }>(`${post(id)}/bookmark`, on ? 'POST' : 'DELETE'),
		comments: (id: string) => call<{ comments: SocialComment[]; total: number; signedIn: boolean }>(`${post(id)}/comments`),
		addComment: (id: string, body: string) => call<{ comment?: SocialComment }>(`${post(id)}/comments`, 'POST', { body }),
		deleteComment: (id: string, commentId: string) => call(`${post(id)}/comments/${encodeURIComponent(commentId)}`, 'DELETE'),
		importPost: (id: string, name?: string) =>
			call<{ projectId: string; name: string; imported: number; skipped?: unknown[]; substituted?: unknown[] }>(`${post(id)}/import`, 'POST', name ? { name } : {}),
		deletePost: (id: string) => call(post(id), 'DELETE'),
		publish: (input: { projectId: string; title: string; description?: string }) => call<{ id: string }>('/api/social/posts', 'POST', input),
		profile: (userId: string) => call<{ profile: SocialProfile; signedIn: boolean }>(`/api/social/users/${encodeURIComponent(userId)}`),
		setFollow: (userId: string, on: boolean) =>
			call<{ following: boolean; followerCount: number }>(`/api/social/users/${encodeURIComponent(userId)}/follow`, on ? 'POST' : 'DELETE'),
	};
}

export type SocialApi = ReturnType<typeof createSocialApi>;
