---
name: kairo-ui
description: Procedure for building or changing any user interface in Kairo (dashboard, landing, kelan, mobile, desktop shell). Use when a task adds or edits a screen, a component, a style, an icon, a form, an overlay, a color or spacing value, or anything under apps/*/ that renders UI or under packages/ui, packages/tokens or packages/client-core.
---

# Building UI in Kairo

One component library (`@kairo/ui`) and one set of design values (`@kairo/tokens`) serve the web dashboard, the marketing sites, the mobile app and the desktop shell. A screen composes pieces from the library; it does not define its own.

## Layers

| Layer | Owns | Never contains |
|---|---|---|
| `packages/tokens` | Design values as DTCG JSON, generated CSS and TS | Components, app code |
| `packages/ui` | Components, blocks, their specs and tests; web and `.native` variants | Data fetching, auth, Supabase, `@kairo/client-core` |
| `packages/client-core` | API client, session, endpoints, queries, polling hooks, stores, platform ports | UI, `react-dom`, Tamagui |
| `apps/*` | Screens and routing | Own versions of specified pieces, other apps |

## Workflow

```
UI task progress:
- [ ] 1. Find the piece in packages/ui/CATALOG.md
- [ ] 2. Read its spec in packages/ui/spec
- [ ] 3. Use the export, or implement the missing piece in packages/ui
- [ ] 4. Compose the screen from exports and tokens only
- [ ] 5. Add tests
- [ ] 6. Run the checks
```

1. **Find it.** `packages/ui/CATALOG.md` lists every specified piece, block and template and whether it is implemented. Search it before writing any markup.
2. **Read the spec.** `packages/ui/spec/<components|blocks|templates>/<name>.md` defines purpose, variants, the six states, accessibility and platforms. The approved design is final: a state or detail marked "Not defined in the approved design." or "Not designed" is not invented in code or in the spec. Ask instead.
3. **Implement the gap in `packages/ui`.** A specified piece with no export is built in the library first, following its spec, with a test for every state and its accessibility contract. Then the screen uses it. Never build a local version inside an app.
4. **Compose.** No `style` attribute, no color or hex literals, no hand-written CSS custom properties holding colors, no Tailwind classes, no `@tamagui/*` imports in apps. Colors, spacing, radii, shadows and type come from `@kairo/tokens`. Icons come from `Icon`. Overlays come from `Popover`, `Dialog`, `Drawer`, `Menu` and `Tooltip`; forms from `Field` and its controls.
5. **Data stays out of views.** A screen never calls `fetch`, `localStorage`, `window.location`, `navigator.clipboard` or Supabase. It uses `@kairo/client-core` (`endpoints`, `queries`, hooks, stores) and the platform ports, so the same screen runs in the browser, in the desktop shell and, where designed, on mobile.
6. **Platforms.** A component that needs DOM APIs ships a `.native.tsx` sibling; Metro and `tsconfig.native.json` resolve it. Behavior that makes no sense on touch (hover, drag-resize) renders nothing or the platform equivalent there.

## Writing a piece in `packages/ui`

- Build on Tamagui `styled` with values from `tokens[...]` (`@kairo/tokens`); convert pixel strings with `px()` from `lib/units`.
- Web-only DOM props and events go through `domProps()` from `lib/dom-props`; overlay behavior (esc, outside press, focus scope, anchored position) comes from `lib/overlay`.
- Motion is a CSS class injected by `lib/motion-css` and must stop under `prefers-reduced-motion`.
- Export it from `src/index.ts`; the `.native` variant is picked up automatically.
- Accessible names are required props where the control has no visible text (`IconButton`'s `label`, `Dialog`'s `title`).

## Checks

Run before reporting a UI task done:

```bash
bunx turbo run typecheck
bunx turbo run test --filter=@kairo/ui --filter=@kairo/dashboard
bun run --cwd apps/dashboard lint
bun run ui:boundaries
bun run ui:catalog -- --check
bun run ui:metrics
```

- Lint is enforced against a baseline (`apps/dashboard/eslint-suppressions.json`). Never add to it; after fixing violations run `bunx eslint --prune-suppressions` in `apps/dashboard` so the baseline only shrinks.
- `bun run ui:catalog` regenerates the catalog after a piece is added or its spec changes.
- `bun run ui:metrics` reports the remaining gap: specified pieces without code, inline styles, color literals, duplicated component names.
- An editor hook lints each dashboard file right after it is written and blocks on new violations.

## Anti-patterns

- A second implementation of a specified piece inside an app, even "just for this screen".
- A hex or `rgba()` string, an inline `style`, a Tailwind class, a magic pixel value that a token already names.
- Importing an icon pack, a headless-UI package or the styling engine from an app.
- Reaching into another app, or importing `@kairo/client-core` from `packages/ui`.
- Inventing a state, a variant or copy that the specification marks as not defined.
