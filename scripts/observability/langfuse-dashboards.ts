/**
 * KAI-189 (Phase 3) — provisions a Langfuse dashboard for Kairo's LLM
 * telemetry, via the (unstable) dashboards/widgets REST API. Every
 * measure/dimension field name below was verified against a live
 * self-hosted Langfuse instance before being hardcoded here — the API
 * validates them server-side and there is no static enum to check against.
 *
 * Usage: bun scripts/observability/langfuse-dashboards.ts
 * Requires LANGFUSE_BASE_URL, LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY.
 *
 * Not idempotent — re-running creates duplicate widgets/dashboards. Meant to
 * run once against a fresh instance (matches LANGFUSE_INIT_* headless init
 * in docker-compose.observability.yml).
 */

const baseUrl = process.env.LANGFUSE_BASE_URL;
const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
const secretKey = process.env.LANGFUSE_SECRET_KEY;

if (!baseUrl || !publicKey || !secretKey) {
  console.error('LANGFUSE_BASE_URL, LANGFUSE_PUBLIC_KEY, and LANGFUSE_SECRET_KEY are required.');
  process.exit(1);
}

const auth = 'Basic ' + Buffer.from(`${publicKey}:${secretKey}`).toString('base64');

async function api<T>(path: string, method: 'GET' | 'POST' | 'DELETE', body?: unknown): Promise<T> {
  const res = await fetch(`${baseUrl}/api/public/unstable${path}`, {
    method,
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${await res.text()}`);
  }

  return res.json() as Promise<T>;
}

interface Widget {
  id: string;
}

interface Dashboard {
  id: string;
}

// The 3 generation names @kairo/intelligence actually emits (KAI-126 Phase 1:
// packages/intelligence/src/classification/classify.ts and
// packages/intelligence/src/embeddings/embed.ts) — dimensions.field: "name"
// groups by these automatically, no filter needed to see them broken out.
const widgetDefs = [
  {
    name: 'Generation count by name',
    view: 'observations' as const,
    dimensions: [{ field: 'name' }],
    metrics: [{ measure: 'count', agg: 'count' }],
    filters: [],
    chartType: 'LINE_TIME_SERIES' as const,
  },
  {
    name: 'Generation p95 latency by name',
    view: 'observations' as const,
    dimensions: [{ field: 'name' }],
    metrics: [{ measure: 'latency', agg: 'p95' }],
    filters: [],
    chartType: 'LINE_TIME_SERIES' as const,
  },
  {
    name: 'Generation cost by name',
    view: 'observations' as const,
    dimensions: [{ field: 'name' }],
    metrics: [{ measure: 'totalCost', agg: 'sum' }],
    filters: [],
    chartType: 'BAR_TIME_SERIES' as const,
  },
  {
    name: 'Generation count by level',
    view: 'observations' as const,
    dimensions: [{ field: 'level' }],
    metrics: [{ measure: 'count', agg: 'count' }],
    filters: [],
    chartType: 'BAR_TIME_SERIES' as const,
  },
];

async function main() {
  console.log(`Provisioning Langfuse dashboard at ${baseUrl}...`);

  const widgets: Widget[] = [];
  for (const def of widgetDefs) {
    const widget = await api<Widget>('/dashboard-widgets', 'POST', def);
    console.log(`  widget "${def.name}" -> ${widget.id}`);
    widgets.push(widget);
  }

  const dashboard = await api<Dashboard>('/dashboards', 'POST', {
    name: 'Kairo — LLM Observability',
    description: 'Auto-provisioned by scripts/observability/langfuse-dashboards.ts (KAI-189)',
  });
  console.log(`  dashboard "Kairo — LLM Observability" -> ${dashboard.id}`);

  for (const [i, widget] of widgets.entries()) {
    const x = (i % 2) * 6;
    const y = Math.floor(i / 2) * 4;
    await api(`/dashboards/${dashboard.id}/placements`, 'POST', {
      type: 'widget',
      widgetId: widget.id,
      x,
      y,
      width: 6,
      height: 4,
    });
  }

  console.log(`Done: ${baseUrl}/project/kairo-local/dashboards/${dashboard.id}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

export {};
