/*--------------------------------------------------------------------------------------
 *  Copyright 2026 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { createClient } from '@supabase/supabase-js';
import { DIVISION_SUPABASE_ANON_KEY, DIVISION_SUPABASE_URL } from '../../../../common/divisionAuthConfig.js';
import { bindDivisionSession as bind, getSharedDivisionSupabase, type DivisionSessionStore } from '../../../../common/divisionSession.js';

export const getDivisionSupabase = () => getSharedDivisionSupabase(() => createClient(DIVISION_SUPABASE_URL, DIVISION_SUPABASE_ANON_KEY, {
	auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false },
}));

export const bindDivisionSession = (settings: DivisionSessionStore) => bind(settings, getDivisionSupabase());
