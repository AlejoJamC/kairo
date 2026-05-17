# IAM-7 E2E Validation Checklist

Reproducible manual checklist for the new-user OAuth registration flow
introduced by KAI-216 → KAI-221. Run this before merging any future change
that touches `/auth/callback`, `provision_account_for_user`, or the wizard.

## Setup

```bash
# All services running locally
bun run dev          # landing on :3000, api on :3001
npx inngest-cli dev  # Inngest dev server on :8288

# Supabase migrations applied
supabase db push
```

Use an **incognito window** and a **dedicated test Google account** (not your
personal one — the test will create data). Before each run, delete any
existing rows for the test email:

```sql
-- Run in Supabase SQL editor (replace with test email)
DO $$
DECLARE v_uid uuid;
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE email = 'your-test@gmail.com';
  IF v_uid IS NOT NULL THEN
    DELETE FROM public.account_members     WHERE user_id = v_uid;
    DELETE FROM public.accounts
      WHERE id NOT IN (SELECT account_id FROM public.account_members);
    DELETE FROM public.gmail_accounts      WHERE user_id = v_uid;
    DELETE FROM public.support_channels    WHERE connected_by = v_uid;
    DELETE FROM public.profiles            WHERE id = v_uid;
    DELETE FROM auth.users                 WHERE id = v_uid;
  END IF;
END $$;
```

---

## Scenario 4 — Brand-new user (critical path)

### Step 1: OAuth flow

- [ ] Open `localhost:3000/wizard` in incognito
- [ ] Click "Continuar con Google"
- [ ] Authorise with test Google account (grant Gmail read access)
- [ ] Lands on `localhost:3000/wizard/complete`

### Step 2: Verify DB state immediately after callback (before form submit)

Run in Supabase SQL editor:

```sql
SELECT u.id, u.email, u.created_at
FROM auth.users u
WHERE u.email = 'your-test@gmail.com';
-- Expected: 1 row
```

```sql
SELECT id, email, name FROM public.profiles
WHERE email = 'your-test@gmail.com';
-- Expected: 1 row (created by handle_new_user trigger)
```

```sql
SELECT a.id, a.name, a.slug, a.plan_type, a.seat_limit
FROM public.accounts a
JOIN public.account_members am ON am.account_id = a.id
JOIN auth.users u ON u.id = am.user_id
WHERE u.email = 'your-test@gmail.com';
-- Expected: 1 row, plan_type='Starter', seat_limit=5
```

```sql
SELECT am.role, am.status, am.joined_at
FROM public.account_members am
JOIN auth.users u ON u.id = am.user_id
WHERE u.email = 'your-test@gmail.com';
-- Expected: role='owner', status='active', joined_at IS NOT NULL
```

```sql
SELECT ga.email, ga.account_id, ga.expires_at
FROM public.gmail_accounts ga
JOIN auth.users u ON u.id = ga.user_id
WHERE u.email = 'your-test@gmail.com';
-- Expected: 1 row, account_id IS NOT NULL
```

```sql
SELECT sc.email_address, sc.channel_type, sc.is_primary, sc.is_active
FROM public.support_channels sc
JOIN public.accounts a ON a.id = sc.account_id
JOIN public.account_members am ON am.account_id = a.id
JOIN auth.users u ON u.id = am.user_id
WHERE u.email = 'your-test@gmail.com';
-- Expected: 1 row, channel_type='gmail', is_primary=true, is_active=true
```

- [ ] All 6 queries return expected results

### Step 3: Wizard complete — organisation name

- [ ] Input is pre-filled with a name (derived from Google display name or email prefix)
- [ ] Edit the name to something custom (e.g. "Test Org Alpha")
- [ ] Click "Open cockpit"
- [ ] Lands on dashboard

Verify account name was updated:

```sql
SELECT a.name FROM public.accounts a
JOIN public.account_members am ON am.account_id = a.id
JOIN auth.users u ON u.id = am.user_id
WHERE u.email = 'your-test@gmail.com';
-- Expected: 'Test Org Alpha'
```

```sql
SELECT company_name FROM public.profiles
WHERE email = 'your-test@gmail.com';
-- Expected: 'Test Org Alpha' (kept in sync as wizard-completion signal)
```

- [ ] Both queries match the name entered in the wizard

### Step 4: Dashboard state

- [ ] `useAuth().accountId` is populated (check React DevTools or Network tab — requests carry `x-account-id` header)
- [ ] `useAuth().userRole` === `'owner'`
- [ ] Any `/api/v1/*` request returns 200, not `400 MISSING_ACCOUNT_CONTEXT`

### Step 5: Pipeline

- [ ] Inngest dev UI (`localhost:8288`) shows a `pipeline/tier1.triggered` event with `accountId` in the payload (not null/undefined)
- [ ] `tier1-fast-path` does NOT log `"account_id missing for user"` or the old `"NULL — tickets insert will FAIL"`
- [ ] After ~30s, at least 1 row appears in `public.tickets` with `account_id IS NOT NULL`

---

## Scenario 1 — Returning user / backfill user (regression)

> Use a Google account that already has an `accounts` + `account_members` row
> (any user created before or by the KAI-174 backfill).

- [ ] Login with that account
- [ ] Lands on `/wizard/detect` or `/auth/handoff` (NOT on `/wizard/complete`)
- [ ] Zero new rows in `accounts` or `account_members` for this user

```sql
SELECT COUNT(*) FROM public.account_members am
JOIN auth.users u ON u.id = am.user_id
WHERE u.email = 'existing-user@example.com';
-- Expected: same count as before login
```

---

## Scenario 3 — Invited user (regression)

> Requires an existing owner account to send an invitation.

```bash
# As the owner, create an invitation via API
curl -X POST http://localhost:3001/api/v1/invitations \
  -H "Authorization: Bearer <owner_access_token>" \
  -H "x-account-id: <owner_account_id>" \
  -H "Content-Type: application/json" \
  -d '{"email":"invitee@example.com","role":"agent"}'
# Note the invite_link from the response
```

- [ ] Logout, login as `invitee@example.com` via Google OAuth
- [ ] Verify:

```sql
-- Exactly 1 account_members row for the invitee, with the OWNER's account_id
SELECT am.account_id, am.role, am.status
FROM public.account_members am
JOIN auth.users u ON u.id = am.user_id
WHERE u.email = 'invitee@example.com';
-- Expected: account_id = owner's account_id, role='agent', status='active'
```

```sql
-- Invitation consumed
SELECT COUNT(*) FROM public.account_invitations
WHERE email = 'invitee@example.com';
-- Expected: 0
```

```sql
-- No new accounts created for the invitee
SELECT COUNT(*) FROM public.accounts a
JOIN public.account_members am ON am.account_id = a.id
JOIN auth.users u ON u.id = am.user_id
WHERE u.email = 'invitee@example.com';
-- Expected: 1 (the owner's account, not a new one)
```

- [ ] Lands on `/auth/handoff` → dashboard, NOT on `/wizard/complete`

---

## Scenario 2 — Duplicate email (regression)

> Requires an existing email/password user in the DB.

- [ ] Login with Google using the same email as an email/password account
- [ ] Lands on `/auth/error?type=duplicate_email`
- [ ] The just-created duplicate `auth.users` was deleted (only 1 row remains for that email)
- [ ] Zero new rows in `accounts` or `account_members`

---

## Idempotency check

Run the full Scenario 4 flow for the same user a second time (logout → login again):

- [ ] `provision_account_for_user` is called but returns the existing `account_id` (check Supabase logs or add a debug log temporarily)
- [ ] No duplicate rows in `accounts` or `account_members`
- [ ] Gmail tokens refreshed in-place (upsert, not new row)
