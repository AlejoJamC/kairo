# @kairo/client-core

Client logic shared by every Kairo client (web dashboard, desktop shell, mobile).

## What it holds

- API client (`apiCall`) with injectable `/api` and `/bff` origins and a Supabase bearer token.
- Supabase client factory and session/profile provider (`AuthProvider`, `useAuth`).
- Platform ports: storage, navigation, clipboard, app focus and auth handoff.
- Triage state (`useTriageStore`), triage status buckets, note mentions, draft contact actions and the ticket data hooks.

Nothing in this package touches `window`, `document` or `localStorage`. Browser access lives in `src/web.ts`.

## Usage

Each host initializes the package once, before rendering:

```ts
import { initClientCore } from "@kairo/client-core/config";
import { createWebPlatform } from "@kairo/client-core/web";

initClientCore({
  apiBaseUrl: "",      // "" = same origin as the app
  bffBaseUrl: "",
  landingUrl: "https://example.com",
  supabaseUrl,
  supabaseAnonKey,
  platform: createWebPlatform(),
});
```

A desktop shell or React Native app passes its own `PlatformPorts` implementation instead of `createWebPlatform()`.

## Commands

- `bun run typecheck`
- `bun run test`
