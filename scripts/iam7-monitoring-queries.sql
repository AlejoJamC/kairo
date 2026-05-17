-- =============================================================================
-- IAM-7 monitoring queries (KAI-221)
-- Run in Supabase SQL editor to detect regressions post-deploy.
-- =============================================================================

-- ── 1. Users without an active account (should be 0 after KAI-216 deploy) ──
-- A non-zero result means the provisioning trigger or callback failed.
SELECT
    u.id,
    u.email,
    u.created_at,
    u.raw_user_meta_data->>'full_name' AS google_name
FROM auth.users u
LEFT JOIN public.account_members am
    ON am.user_id = u.id
    AND am.status = 'active'
WHERE am.id IS NULL
  AND u.created_at > NOW() - INTERVAL '7 days'
ORDER BY u.created_at DESC;

-- ── 2. New accounts provisioned per day (last 14 days) ────────────────────
SELECT
    DATE_TRUNC('day', a.created_at AT TIME ZONE 'UTC') AS day,
    COUNT(*)                                             AS accounts_created
FROM public.accounts a
WHERE a.created_at > NOW() - INTERVAL '14 days'
GROUP BY 1
ORDER BY 1 DESC;

-- ── 3. support_channels without a matching gmail_accounts row ─────────────
-- Indicates a partial write during the OAuth callback.
SELECT
    sc.id,
    sc.account_id,
    sc.email_address,
    sc.created_at
FROM public.support_channels sc
WHERE sc.channel_type = 'gmail'
  AND NOT EXISTS (
      SELECT 1 FROM public.gmail_accounts ga
      WHERE ga.account_id   = sc.account_id
        AND ga.email        = sc.email_address
  )
ORDER BY sc.created_at DESC
LIMIT 20;

-- ── 4. Accounts missing owner membership ──────────────────────────────────
-- Every account must have at least one owner. If not, provisioning was partial.
SELECT
    a.id,
    a.name,
    a.created_at
FROM public.accounts a
WHERE NOT EXISTS (
    SELECT 1 FROM public.account_members am
    WHERE am.account_id = a.id
      AND am.role       = 'owner'
      AND am.status     = 'active'
)
ORDER BY a.created_at DESC
LIMIT 20;

-- ── 5. Tickets with NULL account_id (should be impossible post-migration) ──
SELECT COUNT(*) AS tickets_with_null_account_id
FROM public.tickets
WHERE account_id IS NULL;

-- ── 6. Users where profiles.company_name IS NULL but account exists ────────
-- These are users who started the wizard but never submitted the form.
-- Not an error, just useful for product analytics.
SELECT
    p.id,
    p.email,
    p.created_at,
    a.name AS account_name
FROM public.profiles p
JOIN public.account_members am ON am.user_id = p.id AND am.status = 'active'
JOIN public.accounts a         ON a.id = am.account_id
WHERE p.company_name IS NULL
   OR p.company_name = ''
ORDER BY p.created_at DESC
LIMIT 20;
