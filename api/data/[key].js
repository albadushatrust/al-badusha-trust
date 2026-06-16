import { setTrustRow, getTrustRow } from '../../lib/supabase.js';
import { hashPassword } from '../../lib/password.js';
import {
    requireAdmin,
    readJsonBody,
    json
} from '../../lib/auth.js';

const ALLOWED_KEYS = new Set([
    'settings',
    'donations',
    'expenses',
    'users',
    'counters',
    'activity_log'
]);

export default async function handler(req, res) {
    const key = req.query.key;

    if (!key || !ALLOWED_KEYS.has(key)) {
        return json(res, 400, { error: 'Invalid data key' });
    }

    if (req.method !== 'PUT') {
        return json(res, 405, { error: 'Method not allowed' });
    }

    const session = requireAdmin(req, res);
    if (!session) return;

    try {
        const body = await readJsonBody(req);
        let value = body.value;

        if (value === undefined) {
            return json(res, 400, { error: 'Missing value' });
        }

        if (key === 'users' && Array.isArray(value)) {
            const existing = (await getTrustRow('users')) || [];
            value = await Promise.all(value.map(async (u) => {
                const copy = { ...u };
                const prev = existing.find((e) => e.username === copy.username);
                if (!copy.password) {
                    copy.password = prev ? prev.password : await hashPassword('changeme');
                } else if (!String(copy.password).startsWith('$2')) {
                    copy.password = await hashPassword(copy.password);
                }
                return copy;
            }));
        }

        await setTrustRow(key, value);

        return json(res, 200, { ok: true, key });
    } catch (err) {
        console.error('data save error', key, err);
        return json(res, 500, { error: 'Failed to save data' });
    }
}
