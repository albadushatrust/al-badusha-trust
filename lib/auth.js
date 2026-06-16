import jwt from 'jsonwebtoken';

const COOKIE_NAME = 'trust_session';
const MAX_AGE_SEC = 60 * 60 * 24 * 7;

function getSecret() {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('Missing JWT_SECRET');
    return secret;
}

export function signSession(payload) {
    return jwt.sign(payload, getSecret(), { expiresIn: MAX_AGE_SEC });
}

export function verifySession(token) {
    try {
        return jwt.verify(token, getSecret());
    } catch {
        return null;
    }
}

export function parseCookies(cookieHeader) {
    const out = {};
    if (!cookieHeader) return out;
    cookieHeader.split(';').forEach((part) => {
        const idx = part.indexOf('=');
        if (idx === -1) return;
        const key = part.slice(0, idx).trim();
        const val = part.slice(idx + 1).trim();
        out[key] = decodeURIComponent(val);
    });
    return out;
}

export function getSessionFromRequest(req) {
    const cookies = parseCookies(req.headers.cookie || '');
    const token = cookies[COOKIE_NAME];
    if (!token) return null;
    return verifySession(token);
}

export function setSessionCookie(res, token) {
    const secure = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
    const parts = [
        `${COOKIE_NAME}=${encodeURIComponent(token)}`,
        'Path=/',
        'HttpOnly',
        'SameSite=Lax',
        `Max-Age=${MAX_AGE_SEC}`
    ];
    if (secure) parts.push('Secure');
    res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearSessionCookie(res) {
    const secure = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
    const parts = [
        `${COOKIE_NAME}=`,
        'Path=/',
        'HttpOnly',
        'SameSite=Lax',
        'Max-Age=0'
    ];
    if (secure) parts.push('Secure');
    res.setHeader('Set-Cookie', parts.join('; '));
}

export function requireAuth(req, res) {
    const session = getSessionFromRequest(req);
    if (!session) {
        json(res, 401, { error: 'Not authenticated' });
        return null;
    }
    return session;
}

export function requireAdmin(req, res) {
    const session = requireAuth(req, res);
    if (!session) return null;
    if (session.role !== 'admin') {
        json(res, 403, { error: 'Admin access required' });
        return null;
    }
    return session;
}

export function json(res, status, body) {
    if (res && typeof res.status === 'function' && typeof res.json === 'function') {
        res.status(status).json(body);
        return;
    }
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
}

export function readJsonBody(req) {
    return new Promise((resolve, reject) => {
        let raw = '';
        req.on('data', (chunk) => { raw += chunk; });
        req.on('end', () => {
            try {
                resolve(raw ? JSON.parse(raw) : {});
            } catch (err) {
                reject(err);
            }
        });
        req.on('error', reject);
    });
}
