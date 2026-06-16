import { getTrustRow, setTrustRow } from '../../lib/supabase.js';
import { verifyPassword, hashPassword } from '../../lib/password.js';
import {
    requireAuth,
    readJsonBody,
    json
} from '../../lib/auth.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return json(res, 405, { error: 'Method not allowed' });
    }

    const session = requireAuth(req, res);
    if (!session) return;

    try {
        const body = await readJsonBody(req);
        const currentPassword = body.currentPassword || '';
        const newPassword = body.newPassword || '';

        if (!currentPassword || !newPassword) {
            return json(res, 400, { error: 'Current and new password required' });
        }

        if (newPassword.length < 4) {
            return json(res, 400, { error: 'Password must be at least 4 characters' });
        }

        const users = (await getTrustRow('users')) || [];
        const idx = users.findIndex((u) => u.username === session.username);
        if (idx === -1) {
            return json(res, 404, { error: 'User not found' });
        }

        const valid = await verifyPassword(currentPassword, users[idx].password);
        if (!valid) {
            return json(res, 401, { error: 'Current password is incorrect' });
        }

        users[idx] = {
            ...users[idx],
            password: await hashPassword(newPassword)
        };

        await setTrustRow('users', users);

        return json(res, 200, { ok: true });
    } catch (err) {
        console.error('change-password error', err);
        return json(res, 500, { error: 'Failed to change password' });
    }
}
