/**
 * Local dev server — serves the app + API without Vercel CLI login.
 * Usage: npm run dev  →  open http://localhost:3000
 */
import http from 'http';
import { parse } from 'url';
import { readFileSync, existsSync, statSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const root = join(__dirname, '..');
const port = Number(process.env.PORT || 3000);

function loadEnv() {
    const envPath = join(root, '.env');
    if (!existsSync(envPath)) return;
    readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const idx = trimmed.indexOf('=');
        if (idx === -1) return;
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        if (!process.env[key]) process.env[key] = val;
    });
}

loadEnv();

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.json': 'application/json; charset=utf-8',
    '.ico': 'image/x-icon'
};

function sendJson(res, status, body) {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
}

function serveStatic(pathname, res) {
    let filePath = join(root, pathname === '/' ? 'index.html' : pathname);
    if (!filePath.startsWith(root)) {
        sendJson(res, 403, { error: 'Forbidden' });
        return;
    }
    if (existsSync(filePath) && statSync(filePath).isDirectory()) {
        filePath = join(filePath, 'index.html');
    }
    if (!existsSync(filePath)) {
        sendJson(res, 404, { error: 'Not found' });
        return;
    }
    const ext = extname(filePath);
    res.statusCode = 200;
    res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
    res.end(readFileSync(filePath));
}

async function handleApi(req, res, pathname) {
    try {
        if (pathname === '/api/auth/login') {
            const mod = await import('../api/auth/login.js');
            return mod.default(req, res);
        }
        if (pathname === '/api/auth/logout') {
            const mod = await import('../api/auth/logout.js');
            return mod.default(req, res);
        }
        if (pathname === '/api/auth/me') {
            const mod = await import('../api/auth/me.js');
            return mod.default(req, res);
        }
        if (pathname === '/api/auth/change-password') {
            const mod = await import('../api/auth/change-password.js');
            return mod.default(req, res);
        }
        if (pathname === '/api/data') {
            const mod = await import('../api/data/index.js');
            return mod.default(req, res);
        }
        if (pathname.startsWith('/api/data/')) {
            const key = decodeURIComponent(pathname.slice('/api/data/'.length));
            req.query = { key };
            const mod = await import('../api/data/[key].js');
            return mod.default(req, res);
        }
        sendJson(res, 404, { error: 'API route not found' });
    } catch (err) {
        console.error('API error', pathname, err);
        sendJson(res, 500, { error: 'Server error' });
    }
}

const server = http.createServer(async (req, res) => {
    const { pathname } = parse(req.url, true);

    if (pathname && pathname.startsWith('/api/')) {
        await handleApi(req, res, pathname);
        return;
    }

    serveStatic(pathname || '/', res);
});

server.listen(port, () => {
    console.log('');
    console.log('  Al Badusha Trust — local server running');
    console.log('  Open: http://localhost:' + port);
    console.log('  Login: admin / admin123');
    console.log('');
});
