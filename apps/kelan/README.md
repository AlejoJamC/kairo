# Kelan — Kairo Internal Backoffice

Kelan is the internal platform administration tool for Kairo. It provides
cross-tenant visibility into users, system health, and AI pipeline metrics.
See `kairo-internal/architecture/ADR-018-kelan-backoffice.md` for the full
architecture rationale.

## Local Development

### Prerequisites

- Bun >= 1.0.0
- Node >= 20
- Supabase project running (same project as `apps/landing`)

### Setup

1. **Install dependencies** (from repo root):
   ```bash
   bun install
   ```

2. **Create environment file**:
   ```bash
   cp apps/kelan/.env.example apps/kelan/.env.local
   # Fill in the values (see "Environment variables" below)
   ```

3. **Run migrations** (see "Migrations" below).

4. **Seed initial admin users** (see "Seeding admins" below).

5. **Start the dev server**:
   ```bash
   cd apps/kelan && bun dev
   # or from repo root:
   turbo dev --filter=@kairo/kelan
   ```
   Kelan runs on **http://localhost:3002**.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role key — server only, never public |
| `NEXT_PUBLIC_KELAN_URL` | Yes | Full URL of this app (`http://localhost:3002` locally) |
| `KELAN_ADMIN_EMAILS` | No | Comma-separated email allowlist (optional safeguard) |

> **Security:** `SUPABASE_SERVICE_ROLE_KEY` bypasses ALL Row Level Security.
> It must never be prefixed with `NEXT_PUBLIC_` and must never be sent to
> the browser.

## Migrations

All schema changes use the Supabase CLI workflow (see `supabase/SKILL.md`):

```bash
# From repo root — apply pending migrations
supabase db push

# Regenerate types after migration
supabase db dump --schema public > supabase/schema.sql 2>/dev/null
supabase gen types typescript --schema public > packages/types/src/database.ts 2>/dev/null
```

Kelan-specific migrations:
- `20260409000000_create_admin_users.sql` — admin identity table
- `20260409000001_create_admin_audit_log.sql` — audit trail (populated Phase 2+)

## Seeding Initial Admin Users

**Do not include seed data in migration files.** Seed admins manually after
confirming their Supabase Auth UIDs:

1. Have the admin sign in with Google at least once via Kairo or Supabase
   Auth directly to create an `auth.users` row.

2. Look up their `auth.users.id` in the Supabase dashboard.

3. Run the seed SQL in the Supabase SQL editor:
   ```sql
   INSERT INTO admin_users (auth_uid, email, display_name, role) VALUES
     ('<auth-uid>', 'admin@example.com', 'Display Name', 'superadmin');
   ```

## Vercel Deployment

Configure a **separate Vercel project** (not the same project as `apps/landing`):

| Setting | Value |
|---|---|
| Framework | Next.js |
| Root directory | `apps/kelan` |
| Build command | `cd ../.. && turbo build --filter=@kairo/kelan` |
| Output directory | `.next` |
| Node version | 20.x |
| Domain | `kelan.alejojamc.com` |

**Environment variables to set in Vercel dashboard:**
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_KELAN_URL` → `https://kelan.alejojamc.com`

> **Recommended:** Enable Vercel password protection on this project before
> the first deploy (ADR-018 Security section).

## Auth Flow

```
1. Admin visits kelan.alejojamc.com
2. Clicks "Sign in with Google"
3. Supabase Auth handles OAuth (same project, same Google client as Kairo)
4. Callback at /auth/callback:
   a. Exchange code for session
   b. Query admin_users WHERE auth_uid = user.id AND is_active = true
   c. Found → update last_login_at, redirect to /dashboard
   d. Not found → sign out, redirect to /login?error=access_denied
5. Dashboard layout calls verifyAdminSession() on every render
6. Revoking access: set is_active = false in admin_users
```

## Project Structure

```
apps/kelan/
  app/
    layout.tsx              Root layout
    page.tsx                Redirects to /dashboard
    login/page.tsx          Google OAuth trigger + access denied state
    auth/callback/route.ts  Supabase OAuth callback
    dashboard/
      layout.tsx            Auth guard (verifyAdminSession)
      page.tsx              Placeholder — Phase 2
    api/
      auth/session/         GET current admin session
      admin/verify/         POST verify admin status
  components/
    LoginButton.tsx         "Sign in with Google" button
    AccessDenied.tsx        Shown when not in admin_users
    AdminShell.tsx          Authenticated layout wrapper
  lib/
    constants.ts            Route paths, error codes, role values
    supabase/
      server.ts             Service role + session clients
      client.ts             Browser anon client
    auth/
      guard.ts              verifyAdminSession() — used in all protected routes
      actions.ts            signInWithGoogle(), signOut() server actions
  middleware.ts             Protects /dashboard/* and /api/admin/*
  env.ts                    Env validation via @t3-oss/env-nextjs
```
