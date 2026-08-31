/*--------------------------------------------------------------------------------------
 *  Copyright 2025 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// Division (Supabase) の公開設定。
// SUPABASE_URL と SUPABASE_ANON_KEY は公開しても問題のない値です。
// （実際の権限は Supabase 側の Row Level Security で制御されます。）
//
// Anon キーで apikey テーブルにアクセスできるよう、Supabase 側で
// 「自分の userId に一致する行のみ select 可能」な RLS ポリシーを
// 設定しておくこと。

export const DIVISION_SUPABASE_URL = 'https://wmhrbhcnxglvqwvnbxlt.supabase.co';
export const DIVISION_SUPABASE_ANON_KEY =
	'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtaHJiaGNueGdsdnF3dm5ieGx0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3OTg1MDAsImV4cCI6MjA5MTM3NDUwMH0.4qjCIOjFwm4XnmtqZN_N0zcZlhjGc2GQ4-x7ygMa3hM';

// Division API のベース URL（API キーの作成時など）
export const DIVISION_API_BASE_URL = 'http://localhost:3000';

// Supabase 上の API キーテーブル名（Prisma 側のモデル名 = 物理テーブル名 = "ApiKey"）
export const DIVISION_API_KEY_TABLE = 'ApiKey';

// プラン・支払い方法（Stripe 連携）を扱う Supabase Edge Functions のベース URL
export const DIVISION_FUNCTIONS_BASE_URL = `${DIVISION_SUPABASE_URL}/functions/v1`;

// ユーザーのプラン・請求情報が入っている Supabase テーブル名
export const DIVISION_PROFILES_TABLE = 'profiles';
