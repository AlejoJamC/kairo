<p align="center">
  <img src="assets/banner.png" alt="Kairo — responder bien, no responder más" width="100%">
</p>

**Kairo ordena el correo de soporte de una empresa, aprende de su negocio y ayuda a su equipo a responder bien.** Empieza con Gmail. La IA propone y una persona decide: Kairo solo actúa por su cuenta en lo que ha demostrado hacer bien, y ninguna respuesta que redacte sale sin que alguien la revise.

[Sitio web](https://kairo.alejojamc.com) · [Qué funciona hoy](que-es-kairo.md) · [English](../README.md)

<p align="center">
  <img alt="Licencia" src="https://img.shields.io/badge/license-Apache--2.0-2B5BFF?style=flat-square">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-2B5BFF?style=flat-square">
  <img alt="Estado" src="https://img.shields.io/badge/status-alpha-09090B?style=flat-square">
</p>

## Qué hace

- **Lee y entiende cada correo al llegar.** Dice qué tipo de asunto es, qué tan grave es, qué tan urgente es y con qué ánimo escribe el cliente, antes de que nadie abra la bandeja.
- **Ordena la bandeja** por tipo de ticket, plan del cliente, ánimo, tiempo de espera y reincidencia, y deja cada ticket con un responsable, para que quien la abra sepa por dónde empezar.
- **Aprende del negocio.** Lo que el equipo aprende atendiendo deja de perderse: Kairo propone conocimiento a partir del correo de la empresa y de los tickets resueltos, y una persona lo publica.
- **Ayuda al equipo a responder bien.** Las respuestas salen desde el Gmail de la empresa, en el mismo hilo del cliente. Kairo no inventa soluciones, y un borrador siempre necesita la aprobación de una persona.
- **Se gana la autonomía por empresa y por tipo de ticket.** Un tipo queda en firme sin revisión solo tras medir su precisión, y una corrección le quita ese permiso otra vez.

## Cómo un mensaje se convierte en ticket

```mermaid
flowchart LR
  A[Mensaje entrante] --> B{Reglas de filtro}
  B -->|spam, automático, masivo| X[Se descarta · motivo guardado]
  B -->|relevante| C[Clasificación IA]
  C --> D{¿Autonomía ganada<br/>para este tipo?}
  D -->|sí| E[Actúa · tipo, prioridad, posición]
  D -->|no| F[Una persona decide]
  F --> G[Corrección registrada]
  G --> D
```

## Estado

| Estado | Qué incluye |
|---|---|
| **Funciona hoy** | Entrada desde Gmail · clasificación · cola por prioridad · respuestas en el hilo · escalamientos · tiempos de respuesta |
| **Construido, apagado por defecto** | Propuestas de conocimiento · notas internas · asistente del ticket · segundo modelo · borradores de contactos · correo de acuse |
| **Sin construir** | Canales distintos de Gmail · facturación · resolución automática |

Qué funciona, qué está apagado y dónde el sitio de marketing promete más de lo que hace el producto: **[what-is-kairo.md](what-is-kairo.md)**.

## Primeros pasos

Requiere Bun 1.3+, un proyecto de Supabase, credenciales de Google OAuth y una clave de AI Gateway (u Ollama local).

```bash
bun install
cp .env.example .env.local   # completa los valores
bun run dev                  # api :3001 · dashboard :5173 · landing :3000 · kelan :3002
bun run dev:inngest          # servidor de Inngest para el pipeline (otra terminal)
```

```bash
bun test        # pruebas unitarias y de integración
bun run build   # compila todo el monorepo con turbo
```

Cada variable se valida al arrancar con [`@kairo/env`](../packages/env/index.ts); la lista completa está en [`.env.example`](../.env.example).

## Arquitectura

```
apps/
  api/          Bun + Hono · REST v1 + pipeline Inngest (tiers, sondeo, reintentos)
  dashboard/    Vite + React 19 · la aplicación donde trabaja el equipo de soporte
  landing/      Next.js 15 · sitio de marketing, auth, asistente de registro
  kelan/        Next.js 15 · administración interna
  mobile/       Expo · solo esqueleto
packages/       librerías compartidas; la capa de IA es intelligence/ (AI SDK, roles de modelo, prompts)
supabase/
  migrations/   esquema, RLS, historial append-only
```

## Evaluaciones

La parte que importa: un banco de correos etiquetados a mano, puntuados contra el mismo pipeline que usa producción, campo por campo y no solo acierto o fallo. Varias decisiones de este repositorio — creerle al veredicto de spam del servidor, separar a quien compra de quien vende, aprobar automáticamente solo `support` al principio — salieron de estos números.

```bash
bun run eval:pipeline   # correos por el clasificador → CSV
bun run eval:metrics    # F1, calibración e inflación de tono por etiqueta
```

Los corpus son privados y no están en este repositorio.

## Documentación

| Documento | Qué cubre |
|---|---|
| [what-is-kairo.md](what-is-kairo.md) | Qué hace el producto hoy, en claro |
| [que-es-kairo.md](que-es-kairo.md) | Lo mismo, en español |
| [ai-engineering/](ai-engineering/) | Mapa de capacidades, skills y herramientas |
| [observability.md](observability.md) | Langfuse + ClickStack |
| [versioning.md](versioning.md) | Cómo se versionan reglas y prompts |

## Contribuir

Abre un issue antes de un cambio grande. Los commits usan [Conventional Commits](https://www.conventionalcommits.org/); los textos de interfaz necesitan inglés y español.

## Licencia

[Apache-2.0](../LICENSE).
