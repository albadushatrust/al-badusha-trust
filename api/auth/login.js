import { getTrustRow } from '../../lib/supabase.js';
import { verifyPassword } from '../../lib/password.js';
import {
    readJsonBody,
    json,
    signSession,
    setSessionCookie
} from '../../lib/auth.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return json(res, 405, { error: 'Method not allowed' });
    }

    try {
        const body = await readJsonBody(req);
        const username = (body.username || '').trim();
        const password = body.password || '';

        if (!username || !password) {
            return json(res, 400, { error: 'Username and password required' });
        }

        const users = (await getTrustRow('users')) || [];
        const account = users.find((u) => u.username === username);

        if (!account) {
            return json(res, 401, { error: 'Invalid username or password' });
        }

        const valid = await verifyPassword(password, account.password);
        if (!valid) {
            return json(res, 401, { error: 'Invalid username or password' });
        }

        const token = signSession({
            username: account.username,
            role: account.role
        });

        setSessionCookie(res, token);

        return json(res, 200, {
            user: account.username,
            role: account.role
        });
    } catch (err) {
        console.error('login error', err);
        return json(res, 500, { error: 'Login failed' });
    }
}
