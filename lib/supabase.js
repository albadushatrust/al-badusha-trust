import { createClient } from '@supabase/supabase-js';

let client = null;

export function getSupabase() {
    if (client) return client;

    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
        throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    }

    client = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false }
    });

    return client;
}

export const DATA_KEYS = ['settings', 'donations', 'expenses', 'users', 'counters', 'activity_log'];

export async function getTrustRow(key) {
    const supabase = getSupabase();
    const { data, error } = await supabase
        .from('trust_data')
        .select('value')
        .eq('key', key)
        .maybeSingle();

    if (error) throw error;
    return data ? data.value : null;
}

export async function setTrustRow(key, value) {
    const supabase = getSupabase();
    const { error } = await supabase
        .from('trust_data')
        .upsert({
            key,
            value,
            updated_at: new Date().toISOString()
        });

    if (error) throw error;
}

export async function getAllTrustData() {
    const supabase = getSupabase();
    const { data, error } = await supabase
        .from('trust_data')
        .select('key, value');

    if (error) throw error;

    const result = {};
    (data || []).forEach((row) => {
        result[row.key] = row.value;
    });
    return result;
}
