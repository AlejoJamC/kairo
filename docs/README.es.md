# Kairo

Cockpit de soporte con IA para empresas que usan n8n — clasifica correos, enruta tickets y aprende el comportamiento por cliente.

## Stack

| Capa | Tecnología |
|---|---|
| Monorepo | Turborepo + Bun |
| WebApp | Vite + React 19 |
| API | Bun + Hono + Inngest |
| Landing | Next.js 15 |
| Admin (Kelan) | Next.js 15 |
| Base de datos | Supabase (Postgres + Auth) |
| IA | Claude API (prod) / Ollama (local) |
| Correo | Gmail API |
| Deploy | Vercel |
| Lenguaje | TypeScript (strict) |

## Estructura

```
kairo/
├── apps/
│   ├── api/       # Bun + Hono — API backend + funciones Inngest (puerto 3001)
│   ├── dashboard/ # Vite + React — dashboard de soporte (puerto 5173)
│   ├── landing/   # Next.js — sitio de marketing (puerto 3000)
│   ├── kelan/     # Next.js — panel de administración (interno, puerto 3002)
│   └── mobile/    # Expo — app móvil
├── packages/
│   ├── env/            # validación centralizada de variables (@t3-oss/env-core)
│   ├── types/          # interfaces TypeScript compartidas
│   ├── i18n/           # traducciones compartidas (EN/ES)
│   ├── ui/             # componentes ShadCN compartidos
│   ├── feature-flags/  # feature flags estáticos y de runtime
│   ├── identity/       # normalización de email/teléfono, dedup de contactos
│   ├── claude_design/  # paquete de tokens de diseño Pencil
│   └── intelligence/   # proveedor LLM modular (Ollama / Anthropic)
│       └── prompts/    # prompts LLM versionados (markdown + frontmatter YAML)
├── supabase/
│   └── migrations/     # migraciones de base de datos compartidas (Postgres vía Supabase)
└── kairo-internal/
    └── architecture/   # 17 Architecture Decision Records
```

## Primeros pasos

```bash
bun install
bun run dev
```

- API → http://localhost:3001
- WebApp → http://localhost:5173
- Landing → http://localhost:3000
- Kelan (admin) → http://localhost:3002

## Comandos

```bash
bun run build   # compila todas las apps
bun run lint    # ejecuta el linter en todos los paquetes
bun run clean   # limpia los artefactos de compilación
bun test        # corre las pruebas
```

## Variables de entorno

Kairo usa [`@kairo/env`](../packages/env/index.ts) — una capa centralizada y con tipos seguros construida sobre [`@t3-oss/env-core`](https://env.t3.gg). Cada variable se valida con Zod al arrancar la app. El acceso directo a `process.env` o `import.meta.env` **no está permitido** en ningún lugar del código.

### Un único `.env.local` en la raíz

Todas las variables — compartidas y específicas de cada app — viven en un solo archivo en la raíz del monorepo:

```bash
cp .env.example .env.local   # llena los valores reales, nunca lo commitees
```

Cada app lee desde ese único archivo:

| App | Cómo lee el `.env.local` raíz |
|---|---|
| `apps/api` | `bun run --env-file ../../.env.local` — cargado directamente por Bun al arrancar |
| `apps/dashboard` | Vite tiene `envDir: "../../"` apuntando a la raíz del monorepo |
| `apps/landing` | `next.config.ts` llama a `loadEnvConfig("../../")` antes de que webpack compile, para que las variables `NEXT_PUBLIC_*` queden embebidas en el bundle del cliente |
| `apps/kelan` | `next.config.ts` llama a `loadEnvConfig("../../")` — mismo patrón que landing |

El `.env.example` está agrupado en tres secciones — `SHARED`, `LANDING` y `WEBAPP` — con comentarios que explican cada variable.

### Dónde se valida cada variable

| Paquete / App | Archivo | Variables que gestiona |
|---|---|---|
| `packages/env` | `index.ts` | Variables de backend compartidas: Supabase, AI/LLM, pipeline (tiempos, concurrencia), Inngest, feature flags de servidor |
| `apps/dashboard` | `src/env.ts` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_LANDING_URL` |
| `apps/landing` | `env.ts` | Todas las variables `NEXT_PUBLIC_*` + `GOOGLE_CLIENT_SECRET`, `INNGEST_EVENT_KEY` |
| `apps/kelan` | `env.ts` | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_KELAN_URL` |

Nunca accedas a `process.env` o `import.meta.env` directamente — siempre importa desde el `env.ts` más cercano:

```ts
// ✅ correcto
import { env } from "@/env";
const url = env.NEXT_PUBLIC_SUPABASE_URL;

// ❌ incorrecto — sin validación, sin tipos
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
```
