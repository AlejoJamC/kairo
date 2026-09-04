/**
 * KAI-189 (Phase 3) — provisions a HyperDX dashboard for Kairo's app
 * observability, via the /api/v2/dashboards REST API. Field names (sourceId,
 * select[].aggFn enum, select[].level for quantiles) were verified against a
 * live local ClickStack instance — the v2 API has no public reference docs,
 * only server-side validation errors to iterate against.
 *
 * Usage: bun scripts/observability/hyperdx-dashboard.ts
 * Requires HYPERDX_API_URL (the API port, :8000 locally — not the UI's :8080)
 * and HYPERDX_PERSONAL_API_KEY (Team Settings -> API & Agents -> "Personal
 * API access key" — NOT the Ingestion API key / HYPERDX_API_KEY env var used
 * by docker-compose.observability.yml, that one only authenticates telemetry
 * ingestion, not the dashboards management API).
 *
 * Not idempotent — re-running creates a duplicate dashboard.
 *
 * Known gap: couldn't get a per-metric filter (error-rate-style tile) to
 * persist through either `select[].where` or `select[].aggCondition` — both
 * are silently dropped by this HyperDX version. Left out rather than
 * shipping a tile that looks configured but isn't. Revisit once the v2 tile
 * filter field is confirmed (undocumented — needs a source read or a newer
 * HyperDX version).
 */

if (!process.env.HYPERDX_API_URL || !process.env.HYPERDX_PERSONAL_API_KEY) {
  console.error('HYPERDX_API_URL and HYPERDX_PERSONAL_API_KEY are required.');
  process.exit(1);
}

const apiUrl = process.env.HYPERDX_API_URL;
const apiKey = process.env.HYPERDX_PERSONAL_API_KEY;

async function api<T>(path: string, method: 'GET' | 'POST', body?: unknown): Promise<T> {
  const res = await fetch(`${apiUrl}${path}`, {
    method,
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${await res.text()}`);
  }

  return res.json() as Promise<T>;
}

interface Source {
  id: string;
  name: string;
  kind: string;
}

interface Dashboard {
  data: { id: string };
}

async function main() {
  console.log(`Provisioning HyperDX dashboard at ${apiUrl}...`);

  const { data: sources } = await api<{ data: Source[] }>('/api/v2/sources', 'GET');
  const tracesSource = sources.find((s) => s.kind === 'trace');
  if (!tracesSource) {
    throw new Error('No trace-kind source found — is the ClickStack collector seeded yet?');
  }

  const dashboard = await api<Dashboard>('/api/v2/dashboards', 'POST', {
    name: 'Kairo — App Observability',
    tiles: [
      {
        id: 'request-count',
        name: 'Request count over time',
        x: 0,
        y: 0,
        w: 6,
        h: 4,
        config: {
          sourceId: tracesSource.id,
          select: [{ aggFn: 'count', aggCondition: '', valueExpression: '' }],
          where: '',
          displayType: 'line',
          granularity: 'auto',
        },
      },
      {
        id: 'p95-duration',
        name: 'p95 request duration',
        x: 6,
        y: 0,
        w: 6,
        h: 4,
        config: {
          sourceId: tracesSource.id,
          select: [{ aggFn: 'quantile', level: 0.95, aggCondition: '', valueExpression: 'Duration' }],
          where: '',
          displayType: 'line',
          granularity: 'auto',
        },
      },
    ],
  });

  console.log(`  dashboard "Kairo — App Observability" -> ${dashboard.data.id}`);
  console.log(`Done: ${apiUrl.replace(':8000', ':8080')}/dashboards/${dashboard.data.id}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

export {};
