# Kairo

Agentic-first support orchestration for automation companies.

## Status

**Prototype** — Static frontend dashboard with dummy data. No backend or API integrations yet.

## What's Inside

Kairo is an AI Support Cockpit that helps support teams triage, investigate, and escalate customer tickets with AI assistance. The current prototype includes:

- **Sidebar navigation** with categorized ticket queues (Auto Resolvable, Guided, Escalation)
- **Ticket list** with priority levels (P1/P2/P3), channel tags (Email, API, Outage), and filtering
- **Ticket detail view** with customer conversation thread and telemetry overview (run stats, error info)
- **AI Assistant panel** with escalation suggestions, related knowledge articles, and pre-built escalation packets
- **Reply bar** for agent responses

Clicking a ticket in the list updates the detail view and AI assistant panel.

## Tech Stack

- **Runtime**: [Bun](https://bun.sh)
- **Build tool**: [Vite](https://vite.dev)
- **Framework**: [React](https://react.dev) 19 + TypeScript
- **Styling**: [Tailwind CSS](https://tailwindcss.com) v4
- **Components**: [ShadCN UI](https://ui.shadcn.com) (card, table, badge, button, input, collapsible, scroll-area, separator)
- **Icons**: [Lucide React](https://lucide.dev)

## Getting Started

```bash
bun install
bun run dev
```

Open [http://localhost:5173](http://localhost:5173) to view the dashboard.

## Build

```bash
bun run build
```

Output goes to the `dist/` directory.
