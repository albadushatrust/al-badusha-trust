import { getAllTrustData } from '../../lib/supabase.js';
import { getSessionFromRequest, json } from '../../lib/auth.js';

function sanitizeUsersForClient(users, isAdmin) {
    if (!isAdmin || !Array.isArray(users)) return [];
    return users.map((u) => ({
        username: u.username,
        role: u.role,
        protected: !!u.protected,
        password: ''
    }));
}

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return json(res, 405, { error: 'Method not allowed' });
    }

    const session = getSessionFromRequest(req);
    if (!session) {
        return json(res, 401, { error: 'Not authenticated' });
    }

    try {
        const rows = await getAllTrustData();
        const isAdmin = session.role === 'admin';

        const payload = {
            settings: rows.settings || {},
            donations: rows.donations || [],
            expenses: rows.expenses || [],
            counters: rows.counters || {},
            activity_log: rows.activity_log || []
        };

        if (isAdmin) {
            payload.users = sanitizeUsersForClient(rows.users || [], true);
        } else {
            payload.users = [];
        }

        return json(res, 200, payload);
    } catch (err) {
        console.error('data load error', err);
        return json(res, 500, { error: 'Failed to load data' });
    }
}
