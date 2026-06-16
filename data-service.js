/**
 * Cloud data service — talks to Vercel API / Supabase backend.
 */
(function () {
    const API_BASE = '';

    async function apiFetch(path, options) {
        const opts = Object.assign({ credentials: 'include' }, options || {});
        opts.headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});

        const res = await fetch(API_BASE + path, opts);
        let body = null;
        try {
            body = await res.json();
        } catch {
            body = null;
        }

        if (!res.ok) {
            const msg = (body && body.error) ? body.error : ('Request failed (' + res.status + ')');
            throw new Error(msg);
        }

        return body;
    }

    async function login(username, password) {
        return apiFetch('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
    }

    async function logout() {
        try {
            await apiFetch('/api/auth/logout', { method: 'POST' });
        } catch {
            // ignore logout errors
        }
    }

    async function getSession() {
        try {
            return await apiFetch('/api/auth/me', { method: 'GET' });
        } catch {
            return null;
        }
    }

    async function loadFromServer() {
        return apiFetch('/api/data', { method: 'GET' });
    }

    async function saveToServer(key, value) {
        return apiFetch('/api/data/' + encodeURIComponent(key), {
            method: 'PUT',
            body: JSON.stringify({ value })
        });
    }

    async function changePassword(currentPassword, newPassword) {
        return apiFetch('/api/auth/change-password', {
            method: 'POST',
            body: JSON.stringify({ currentPassword, newPassword })
        });
    }

    window.TrustAPI = {
        login,
        logout,
        getSession,
        loadFromServer,
        saveToServer,
        changePassword,
        apiFetch
    };
})();
