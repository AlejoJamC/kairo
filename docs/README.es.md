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
| IA | Claude API |
| Correo | Gmail API |
| Deploy | Vercel |
| Lenguaje | TypeScript (strict) |

## Estructura

```
kairo/
├── apps/
│   ├── webapp/    # Vite + React — dashboard de soporte
│   ├── landing/   # Next.js — sitio de marketing
│   └── api/       # Bun + Hono — backend
├── packages/
│   ├── types/     # interfaces TypeScript compartidas
│   ├── i18n/      # traducciones compartidas (EN/ES)
│   └── ui/        # componentes ShadCN compartidos
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
