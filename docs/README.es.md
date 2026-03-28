# Kairo

Cockpit de soporte con IA para empresas que usan n8n — clasifica correos, enruta tickets y aprende el comportamiento por cliente.

## Stack

| Capa | Tecnología |
|---|---|
| Monorepo | Turborepo + Bun |
| WebApp | Vite + React 19 |
| Landing | Next.js 15 |
| API | Bun + Hono |
| Base de datos | Supabase (Postgres + Auth) |
| IA | Claude API (prod) / Ollama (local) |
| Correo | Gmail API |
| Deploy | Vercel |
| Lenguaje | TypeScript (strict) |

## Estructura

```
kairo/
├── apps/
│   ├── webapp/    # Vite + React — dashboard de soporte
│   ├── landing/   # Next.js — sitio de marketing
│   ├── api/       # Bun + Hono — backend
│   └── mobile/    # Expo — app móvil
├── packages/
│   ├── env/            # validación centralizada de variables (@t3-oss/env-core)
│   ├── types/          # interfaces TypeScript compartidas
│   ├── i18n/           # traducciones compartidas (EN/ES)
│   ├── ui/             # componentes ShadCN compartidos
│   └── intelligence/   # proveedor LLM modular (Ollama / Anthropic)
├── supabase/
│   └── migrations/     # migraciones de base de datos compartidas (Postgres vía Supabase)
└── specs/         # especificaciones de features (pending/done)
```

## Primeros pasos

```bash
bun install
bun run dev
```

- WebApp → http://localhost:5173
- Landing → http://localhost:3000
- API → http://localhost:3001

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
| `apps/api` | Bun lee `.env.local` desde la raíz del monorepo de forma nativa |
| `apps/webapp` | Vite tiene `envDir: "../../"` apuntando a la raíz del monorepo |
| `apps/landing` | `next.config.ts` llama a `loadEnvConfig("../../")` antes de que webpack compile, para que las variables `NEXT_PUBLIC_*` queden embebidas en el bundle del cliente |

El `.env.example` está agrupado en tres secciones — `SHARED`, `LANDING` y `WEBAPP` — con comentarios que explican cada variable.

**¿Migrando desde una configuración anterior?** Si tenías `apps/landing/.env.local` o `apps/webapp/.env.local`, fusiona su contenido en el `.env.local` raíz y renombra `GOOGLE_CLIENT_SECRET` → `GOOGLE_CLIENT_SECRET`.

### Dónde se valida cada variable

| Paquete / App | Archivo | Variables que gestiona |
|---|---|---|
| `packages/env` | `index.ts` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `INTELLIGENCE_PROVIDER`, `ANTHROPIC_API_KEY`, `GOOGLE_CLIENT_SECRET` |
| `apps/api` | `src/env.ts` | Re-exporta `@kairo/env` + `PORT` |
| `apps/webapp` | `src/env.ts` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_LANDING_URL` |
| `apps/landing` | `env.ts` | Todas las variables `NEXT_PUBLIC_*` + `GOOGLE_CLIENT_SECRET` |

Nunca accedas a `process.env` o `import.meta.env` directamente — siempre importa desde el `env.ts` más cercano:

```ts
// ✅ correcto
import { env } from "@/env";
const url = env.NEXT_PUBLIC_SUPABASE_URL;

// ❌ incorrecto — sin validación, sin tipos
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
```
