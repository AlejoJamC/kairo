# Emails transaccionales de Kairo (templates v0.1)

Sistema de templates HTML para todos los correos **system-generated** que Kairo envía a clientes finales (el destinatario del ticket, no el agente). Fuente de verdad funcional: **KAI-223**. Decisión de arquitectura: **ADR-024** (`kairo-internal/architecture/ADR-024-transactional-email-templates.md`).

> ⚠️ No confundir con `response_templates` (tabla en DB): esos son *snippets de texto del agente* que se insertan en el composer del triage. Los templates de esta carpeta son los **sobres HTML completos** del correo saliente, versionados en el repo, sin interfaz administrativa (la administración llegará con KELAN, ADR-018 — fuera de alcance aquí).

## Inventario y disparadores

| Archivo | Template | Disparador | Estado backend |
|---|---|---|---|
| `templates/acknowledgement.html` | Kairo Support (acknowledgement) | Creación de ticket nuevo desde correo entrante (`was_created=true` en tier1 / incremental-sync) | **Implementar** (KAI-223) |
| `templates/agent-reply.html` | Agent Reply | Botón **Enviar** del triage → `POST /v1/tickets/:id/reply` | **Implementar** — reemplaza el wrapper genérico de `buildHtmlBody()` en `lib/template-renderer.ts` |
| `templates/resolved.html` | Resolved | Botón **Enviar y resolver** del triage (reply + transición a `resolved`) | **Implementar** (KAI-223) |
| `templates/csat-survey.html` | CSAT Survey | Encuesta post-resolución (cron/worker futuro) | **Sin trigger** — solo dejar renderizable |
| `templates/escalated.html` | Escalated | Escalamiento de ticket (ADR-013) | **Sin trigger** — solo dejar renderizable |

Regla del botón Enviar: si la acción es solo enviar → `agent-reply.html`; si la acción es "Enviar y resolver" (o un resolve con mensaje final) → `resolved.html`.

## Reglas de uso

1. **Los templates son autónomos.** HTML completo, email-safe (tablas, CSS inline, fallbacks MSO/Outlook, preheader oculto, responsive ≤620px). No se les inyecta wrapper adicional: se resuelven variables y se envía tal cual.
2. **Renderizado server-side al momento del envío** (ADR-023 §4): lo que se persiste en `messages.body_html` es exactamente lo que se entrega.
3. **Envío SIEMPRE por el outbox** (ADR-023 §1): insertar `messages` con `direction='outbound'`, `delivery_status='queued'` y emitir `messages/outbound.queued`. Nunca llamar a Gmail directo desde el trigger.
4. **Sintaxis de variables:** `{{snake_case}}`. Una variable sin valor se resuelve a `""` (nunca dejar el placeholder visible al cliente). El resolver de estos templates es independiente del vocabulario `{{cliente.nombre}}` del composer de agentes — son dos contratos distintos.
5. **Trazabilidad:** el token `[KAIRO-<ticket_number>]` viaja en el subject (vía `appendKairoToken`, `lib/ticket-traceability.ts`) y los templates ya renderizan `[{{ticket_id}}]` en el footer. `{{ticket_id}}` = id humano `KAI-T-<ticket_number>`, no UUID.
6. **Threading:** todo envío sobre un ticket existente setea `In-Reply-To`/`References` desde el último `message_id_header` entrante (ya implementado en `/reply`).

## Contrato de variables por template

### Comunes a todos
| Variable | Fuente |
|---|---|
| `{{customer_name}}` | `conversations.customer_display_name` (fallback: parte local del email) |
| `{{ticket_id}}` | `KAI-T-<tickets.ticket_number>` |
| `{{ticket_subject}}` | `tickets.subject` |
| `{{help_center_url}}`, `{{status_url}}`, `{{privacy_url}}`, `{{unsubscribe_url}}` | Config de tenant/entorno (env o columnas en `accounts`; ver KAI-223 §Config) |
| `{{ticket_url}}` | URL pública del ticket. **Gap conocido:** no existe portal de cliente; ver KAI-223 §Decisiones abiertas (fallback: `mailto:` al buzón de soporte con el token en subject) |

### `acknowledgement.html`
`{{ticket_category}}` (clasificación del pipeline), `{{ticket_created_at}}` (formateada, locale es).

### `agent-reply.html`
`{{agent_name}}`, `{{agent_role}}`, `{{agent_initials}}` (derivar de identidad del agente; fallback actual: buzón del tenant), `{{agent_message}}` (cuerpo del agente ya resuelto y sanitizado — `sanitizeHtml()`), `{{sent_at}}`, `{{original_message}}` (snippet/quote del último mensaje del cliente).

### `resolved.html`
`{{agent_name}}`, `{{agent_initials}}`, `{{resolution_summary}}` (texto final del agente), `{{resolved_at}}`, `{{time_to_resolve}}` (humanizado: "4h 12m"), `{{message_count}}` (mensajes del hilo), `{{csat_url}}` (CTA con `?score=bad|ok|good`), `{{reopen_url}}`.

### `csat-survey.html`
`{{agent_name}}`, `{{csat_url}}` (botones 1–5: `?score=1`..`?score=5`).

### `escalated.html`
`{{specialist_name}}`, `{{specialist_role}}`, `{{specialist_initials}}`, `{{priority_sla}}`.

## Cómo agregar un template nuevo

1. Crear el HTML autónomo en `templates/` (kebab-case), siguiendo las convenciones email-safe de los existentes.
2. Documentar aquí su contrato de variables y disparador.
3. Registrarlo en el registry/loader (cuando exista, ver KAI-223) — el render falla en build/test si una variable del contrato no está mapeada.
4. Si introduce un evento de ciclo de vida nuevo, evaluar ADR.

## Diseño fuente

Los archivos originales de diseño viven en `packages/claude_design/mailing template v0.1/` (nombres legibles). Esta carpeta es la copia canónica que consume el backend; ante cambios de diseño, actualizar ambos o mover el diseño aquí definitivamente.
