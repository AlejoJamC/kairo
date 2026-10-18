# Dashboard preview

Runs the dashboard against invented fixtures, with no backend or sign-in, and records the layout of every screen so two renders can be compared.

```bash
bun run --cwd apps/dashboard preview:dev      # http://localhost:5174
```

- `fixtures.ts` holds the data; `auth-stub.tsx` and `supabase-stub.ts` replace the session and the Supabase client; `main.tsx` answers the HTTP calls.
- `window.__snapshotAll()` (browser console) navigates every screen and stores its element geometry and computed styles under `preview/.snapshots/`.
- Compare two captures after a refactor:

```bash
mv apps/dashboard/preview/.snapshots apps/dashboard/preview/.snapshots-before   # before the change
# ...change the code, reload the preview, run window.__snapshotAll() again...
bun apps/dashboard/preview/diff-snapshots.ts apps/dashboard/preview/.snapshots-before apps/dashboard/preview/.snapshots
```

The diff lists, per screen, elements whose box or style changed. Added or removed wrapper elements are aligned by tag, text and size; `opacity` and `white-space` are ignored.
