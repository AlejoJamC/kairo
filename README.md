# Kairo

AI-powered support cockpit for n8n companies — classifies emails, routes tickets, and learns per-client behavior.

🇨🇴 [Versión en español](docs/README.es.md)

## Stack

| Layer | Tech |
|---|---|
| Monorepo | Turborepo + Bun |
| WebApp | Vite + React 19 |
| Landing | Next.js 15 |
| API | Bun + Hono |
| Database | Supabase (Postgres + Auth) |
| AI | Claude API (prod) / Ollama (local) |
| Email | Gmail API |
| Deploy | Vercel |
| Language | TypeScript (strict) |

## Structure

```
kairo/
├── apps/
│   ├── webapp/    # Vite + React — support dashboard
│   ├── landing/   # Next.js — marketing site
│   └── api/       # Bun + Hono — backend
├── packages/
│   ├── types/          # shared TypeScript interfaces
│   ├── i18n/           # shared translations (EN/ES)
│   ├── ui/             # shared ShadCN components
│   └── intelligence/   # modular LLM provider (Ollama / Anthropic)
└── specs/         # feature specs (pending/done)
```

## Getting Started

```bash
bun install
bun run dev
```

- WebApp → http://localhost:5173
- Landing → http://localhost:3000
- API → http://localhost:3001

## Commands

```bash
bun run build   # build all apps
bun run lint    # lint all packages
bun run clean   # clean build artifacts
bun test        # run tests
```
