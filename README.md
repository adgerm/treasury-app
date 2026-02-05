# Treasury Receipt App

Multi-org receipt automation for fraternities: receipt uploads, per-org Google Sheets backup, messaging (DMs & group chats), RLS, refresh-token auth, admin endpoints.

## Quick start

1. Copy `.env.example` to `.env` and fill in values.
2. `npm install`
3. `npm run write-secrets` (if using GOOGLE_SA_JSON env secret)
4. `npm run migrate` — runs SQL migrations in order
5. `npm run dev` — start API server
6. In another terminal: `npm run worker` — sheets sync worker
7. Optionally: `npm run maintenance` — message retention pruning

## Migrations (order)

Run via `npm run migrate`, or manually:

1. `migrations/20260202_users.sql`
2. `migrations/20260203_add_multi_org_and_sheet_sync.sql`
3. `migrations/20260204_add_chat_tables.sql`
4. `migrations/20260205_rls_policies.sql`
5. `migrations/20260205_refresh_tokens.sql`
6. `migrations/20260205_roles_permissions.sql`

## Deploy on Render.com

1. Create a **Web Service** and connect your GitHub repo.
2. Add a **PostgreSQL** database in the same account and link it (Render sets `DATABASE_URL`).
3. **Build command:** `npm install`
4. **Start command:** `npm start`
5. Set env vars: `JWT_SECRET`, `REFRESH_TOKEN_SECRET` (required); optional: `SMTP_*`, `AWS_*`, `SENTRY_DSN`, `CORS_ORIGIN`.
6. After first deploy, run migrations: in Dashboard open **Shell** and run `npm run migrate`, or add a one-off job.

Alternatively, use the **Blueprint** (render.yaml) and add env vars in the dashboard.

## Deploy & test checklist

- Create org: `POST /api/orgs` with Bearer token
- Upload receipt: `POST /api/receipts` with `x-org-id`, Authorization, photo file, `description`, `amount`
- Check sheet: if SA configured, receipt row appears or pending_syncs processed by worker
- Create chat: `POST /api/chats`, then `POST /api/chats/:id/join`; Socket.IO join_room + message
- Promote member: `PATCH /api/admin/memberships/:userId/role` (admin)
- Approve receipt: `PATCH /api/receipts/:id` with `status=approved` (admin/treasurer)

## Permission matrix

See [docs/roles.md](docs/roles.md).

## Google Sheets note

Presigned image URLs in sheets (`=IMAGE("...")`) expire. Admins should be aware; optionally use a maintenance job to refresh URLs in sheet cells.
