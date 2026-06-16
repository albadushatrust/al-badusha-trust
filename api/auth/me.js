import { getSessionFromRequest, json } from '../../lib/auth.js';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return json(res, 405, { error: 'Method not allowed' });
    }

    const session = getSessionFromRequest(req);
    if (!session) {
        return json(res, 401, { error: 'Not authenticated' });
    }

    return json(res, 200, {
        user: session.username,
        role: session.role
    });
}
