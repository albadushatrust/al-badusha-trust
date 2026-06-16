/**
 * Seed Supabase with default trust data.
 * Usage: copy .env.example to .env, fill values, then run: npm run seed
 */
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function loadEnvFile() {
    const envPath = join(root, '.env');
    if (!existsSync(envPath)) return;
    const text = readFileSync(envPath, 'utf8');
    text.split('\n').forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const idx = trimmed.indexOf('=');
        if (idx === -1) return;
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        if (!process.env[key]) process.env[key] = val;
    });
}

loadEnvFile();

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
}

const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
});

async function hashPassword(plain) {
    return bcrypt.hash(plain, 10);
}

const DEFAULT_USERS = [
    { username: 'admin', password: 'admin123', role: 'admin', protected: true },
    { username: 'badusha', password: 'trust2025', role: 'admin', protected: false },
    { username: 'viewer', password: 'view2025', role: 'viewer', protected: false }
];

const DEFAULT_SETTINGS = {
    trustName: 'AL BADUSHA TRUST',
    address: 'No. 45, Golden Plaza, Nagore - 611002, Tamil Nadu, India',
    email: 'contact@albadushatrust.org',
    phone: '+91 94432 18765',
    pan: 'AABTA4892C',
    regNumber: '12A/URN/2023-24/TN/18928',
    managingTrustee: 'Syed Al Badusha',
    trustees: ['Syed Al Badusha', 'H. A. K. Badusha', 'M. S. Al Badusha'],
    financialYear: '2025-26',
    bankName: '',
    bankAccount: '',
    ifsc: '',
    taxNote: 'Donations are eligible for tax exemption under Section 80G.',
    lowBalanceAlert: 5000,
    language: 'en',
    theme: 'light',
    lastBackupDate: null
};

function readMockData() {
    const mockPath = join(root, 'mock_data.js');
    if (!existsSync(mockPath)) {
        return { donations: [], expenses: [] };
    }
    const text = readFileSync(mockPath, 'utf8');
    const sandbox = { window: {} };
    const run = new Function('window', text);
    run(sandbox.window);
    return {
        donations: sandbox.window.DEFAULT_DONATIONS || [],
        expenses: sandbox.window.DEFAULT_EXPENSES || []
    };
}

async function upsert(key, value) {
    const { error } = await supabase.from('trust_data').upsert({
        key,
        value,
        updated_at: new Date().toISOString()
    });
    if (error) throw error;
}

async function main() {
    const users = [];
    for (const u of DEFAULT_USERS) {
        users.push({
            ...u,
            password: await hashPassword(u.password)
        });
    }

    const { donations, expenses } = readMockData();

    await upsert('users', users);
    await upsert('settings', DEFAULT_SETTINGS);
    await upsert('donations', donations);
    await upsert('expenses', expenses);
    await upsert('counters', {});
    await upsert('activity_log', []);

    console.log('Seed complete.');
    console.log('Default logins: admin/admin123, badusha/trust2025, viewer/view2025');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
