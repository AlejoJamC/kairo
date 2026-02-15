# Kairo

Agentic-first support orchestration for automation companies.

## Status

**Prototype** — Static frontend dashboard with dummy data. No backend or API integrations yet.

## What's Inside

Kairo is an AI Support Cockpit that helps support teams triage, investigate, and escalate customer tickets with AI assistance. The current prototype includes:

- **Sidebar navigation** with categorized ticket queues (Auto Resolvable, Guided, Escalation) and view switching (Inbox / Clients)
- **Ticket list** with priority levels (P1/P2/P3), channel tags (Email, API, Outage), and filtering
- **Ticket detail view** with customer conversation thread and telemetry overview (run stats, error info)
- **AI Assistant panel** with escalation suggestions, related knowledge articles, and pre-built escalation packets
- **Client Directory** with searchable table, plan/SLA badges, and slide-over detail panel
- **Reply bar** for agent responses
- **i18n** with English and Spanish translations

## Monorepo Structure

```
kairo/
├── apps/
│   ├── webapp/       # Vite + React 19 — support dashboard
│   ├── landing/      # Next.js 15 App Router — marketing page
│   ├── api/          # Bun + Hono — backend (placeholder)
│   └── mobile/       # Expo — mobile app (placeholder)
├── packages/
│   ├── types/        # @kairo/types — shared TypeScript interfaces
│   ├── i18n/         # @kairo/i18n — shared translations (EN/ES)
│   └── ui/           # @kairo/ui — shared ShadCN components
├── package.json      # Root workspace config
├── turbo.json        # Turborepo pipeline
└── tsconfig.json     # Base TypeScript config
```

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Monorepo | [Turborepo](https://turbo.build) | Task orchestration, caching |
| Package Manager | [Bun](https://bun.sh) | Install, scripts, workspaces |
| WebApp | [Vite](https://vite.dev) + [React](https://react.dev) 19 | Support dashboard SPA |
| Landing | [Next.js](https://nextjs.org) 15 | Static marketing page |
| API | [Hono](https://hono.dev) | Lightweight HTTP server |
| Mobile | [Expo](https://expo.dev) | React Native (future) |
| Language | TypeScript 5.9 | Strict mode across all packages |
| Styling | [Tailwind CSS](https://tailwindcss.com) v4 | Utility-first CSS |
| Components | [ShadCN UI](https://ui.shadcn.com) + [Radix UI](https://www.radix-ui.com) | Accessible component primitives |
| Icons | [Lucide React](https://lucide.dev) | Icon library |
| i18n | [i18next](https://www.i18next.com) + react-i18next | Internationalization (EN/ES) |

## Getting Started

```bash
# Install all dependencies
bun install
```

### Run everything (via Turborepo)

```bash
bun run dev
```

This starts all apps in parallel:
- **WebApp** → [http://localhost:5173](http://localhost:5173)
- **Landing** → [http://localhost:3000](http://localhost:3000)
- **API** → [http://localhost:3001](http://localhost:3001)

### Run individual apps

```bash
# WebApp only (dashboard)
cd apps/webapp && bun run dev

# Landing only
cd apps/landing && bun run dev

# API only
cd apps/api && bun run dev
```

## Build

```bash
# Build all apps
bun run build

# Build a specific app
cd apps/webapp && bun run build
cd apps/landing && bun run build
cd apps/api && bun run build
```

## Useful Commands

```bash
# Lint all packages
bun run lint

# Validate i18n translations (EN/ES key parity)
cd apps/webapp && bun scripts/validate-i18n.ts

# Clean all build artifacts
bun run clean
```
