# Deploy Al Badusha Trust to Vercel + Supabase

## 1. Supabase setup

1. Create a project at [supabase.com](https://supabase.com)
2. Open **SQL Editor** and run [`supabase/schema.sql`](supabase/schema.sql)
3. Copy from **Settings → API**:
   - Project URL → `SUPABASE_URL`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (keep secret)

## 2. Seed the database

```bash
cd "AL BADUSHA TRUST"
cp .env.example .env
# Edit .env with your Supabase values
npm install
npm run seed
```

Default logins after seed:

| Username | Password   | Role   |
|----------|------------|--------|
| admin    | admin123   | admin  |
| badusha  | trust2025  | admin  |
| viewer   | view2025   | viewer |

## 3. Deploy to Vercel

1. Push this folder to GitHub
2. Import the repo in [vercel.com](https://vercel.com)
3. Framework: **Other** — no build command
4. Add environment variables:

```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
JWT_SECRET=your-long-random-secret-min-32-chars
```

5. Deploy

## 4. Local development

```bash
npm install
cp .env.example .env
# fill .env
npx vercel dev
```

Open the local URL shown (usually `http://localhost:3000`).

## 5. Migrate existing browser data

1. On the old local-only app: **Settings → Export Backup**
2. On the deployed app: log in as admin → **Settings → Import Backup**

## 6. Verify shared data

1. Log in as **admin** in Browser A → add a donation
2. Log in as **viewer** in Browser B → click **Refresh** or switch tabs
3. The donation should appear

## Architecture

- Static frontend on Vercel (`index.html`, `app.js`, etc.)
- API routes in `/api` (login, data read/write)
- Shared data in Supabase `trust_data` table
- Sessions via httpOnly cookie (JWT)
