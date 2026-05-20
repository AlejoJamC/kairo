# @kairo/identity

Identity utilities for Kairo: email normalization, phone E.164 formatting, organization inference, and draft contact deduplication.

## What it does / What it does NOT do

| Does | Does NOT |
|------|----------|
| Normalize emails to lowercase canonical form | Auto-merge draft contacts |
| Parse RFC 2822 email headers (`"Name" <email>`) | Access OAuth credentials |
| Normalize phone numbers to E.164 + extract extensions | Call `auth.uid()` or `current_account_id()` |
| Infer organization name from corporate email domain | Implement confidence scoring |
| Detect duplicate draft contacts by email or phone | Run cross-channel identity resolution |
| Suggest weak matches via `ILIKE` on display_name/organization | Enable trigram search (pg_trgm — TODO) |

## API

```ts
import {
  normalizeEmail,
  parseEmailHeader,
  normalizePhone,
  inferOrganizationFromEmail,
  GENERIC_EMAIL_PROVIDERS,
  findExistingDraft,
  detectWeakMatches,
} from '@kairo/identity';
```

## Architecture notes

- This package lives at **tenant resource level (Nivel 3)**.
- Functions receive `accountId` as an explicit parameter — they never call `auth.uid()` or query `account_members`.
- Pure string functions have no I/O. Only `findExistingDraft` and `detectWeakMatches` touch the database.
- Validation of who can see what is the consumer's responsibility (RLS for UI; job auth for workers).

## RFC email parser decision

We use `email-addresses` instead of `address-rfc2822` because `address-rfc2822` ships no TypeScript type declarations (no bundled types and no `@types/address-rfc2822` on DefinitelyTyped), which would require hand-written ambient declarations or `skipLibCheck` workarounds. `email-addresses@5` ships its own `.d.ts` file and receives regular maintenance, making it the safer choice for a strict TypeScript codebase.

## Phone normalization

`normalizePhone` returns `{ e164: string; extension: string | null } | null` instead of `string | null` because phone numbers in Colombia and Spain frequently include extensions (e.g. `+57 1 2345678 ext 100`). The E.164 portion goes into `draft_contact.phone`; the extension goes into `draft_contact.metadata`. The worker decides what to do with each field — this function only extracts them.

## Weak match TODO

`detectWeakMatches` currently uses `ILIKE '%val%'` as a placeholder. Once `pg_trgm` is enabled in the database, this should be migrated to trigram similarity (`% operator` or `similarity()`) for better performance and ranking. See `src/dedup.ts` TODO comment.
