import { expect, test } from 'bun:test';

const document = await Bun.file(new URL('../../docs/observability.md', import.meta.url)).text();
const section = document.split('## Embeddings operations and coverage')[1]?.split('## `packages/observability`')[0] ?? '';
const queries = [...section.matchAll(/```sql\n([\s\S]*?)```/g)].map(match => match[1]!.trim().replace(/;$/, ''));
const enabled = process.env['RUN_CLICKHOUSE_INTEGRATION'] === '1';
const prefix = 'kairo.embeddings.';
const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
const base = { source: 'ticket', provider: 'synthetic', model: 'acme', dimensions: '2' };

function fixtureTable(rows: Array<{ name: string; attributes: Record<string, string>; ageSeconds?: number }>) {
  const entries = rows.map(row => `tuple(${quote(row.name)}, map(${Object.entries(row.attributes)
    .flatMap(([key, value]) => [quote(prefix + key), quote(value)]).join(',')}), ${row.ageSeconds ?? 1})`);
  return `(SELECT now64(9) - toIntervalSecond(item.3) AS Timestamp, 'synthetic-trace' AS TraceId,
    item.1 AS SpanName, item.2 AS SpanAttributes FROM (SELECT arrayJoin([${entries.join(',')}]) AS item))`;
}

async function execute(query: string): Promise<Array<Record<string, unknown>>> {
  const child = Bun.spawn(['docker', 'exec', '-i', 'kairo-clickhouse-1', 'sh', '-c',
    'clickhouse-client --user "$CLICKHOUSE_USER" --password "$CLICKHOUSE_PASSWORD"'], { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' });
  child.stdin.write(query + ' SETTINGS output_format_json_quote_64bit_integers=0 FORMAT JSONEachRow'); child.stdin.end();
  const [output, , exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  if (exitCode !== 0) throw new Error('Existing local ClickHouse could not execute the diagnostic query');
  return output.trim().split('\n').filter(Boolean).map(line => JSON.parse(line) as Record<string, unknown>);
}

test('documented diagnostics query the existing telemetry table with an explicit window and denominators', () => {
  expect(queries).toHaveLength(2);
  for (const query of queries) {
    expect(query).toContain('FROM default.otel_traces');
    expect(query).toContain('Timestamp >= now() - INTERVAL 1 HOUR AND Timestamp < now()');
    expect(query).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP)\b/i);
  }
});

test.skipIf(!enabled)('operation rates separate disabled, failed, reused and successful empty requests', async () => {
  const attributes: Array<Record<string, string>> = [
    { operation: 'retrieve', outcome: 'ok', matches: '0', generation: 'reused' },
    { operation: 'retrieve', outcome: 'unavailable', reason: 'provider_unavailable', generation: 'attempted' },
    { operation: 'retrieve', outcome: 'disabled', reason: 'disabled', generation: 'none' },
    { operation: 'index', outcome: 'indexed', generation: 'attempted' },
    { operation: 'index', outcome: 'unchanged', generation: 'reused' },
    { operation: 'index_job', outcome: 'indexed', generation: 'none' },
  ];
  const rows = attributes.map(values => ({ name: 'embeddings.operation', attributes: { ...base, ...values } }));
  const outsideWindow = [7200, -10].map(ageSeconds => ({ name: 'embeddings.operation', ageSeconds,
    attributes: { ...base, operation: 'retrieve', outcome: 'failed', reason: 'storage_unavailable', generation: 'none' } }));
  const result = await execute(queries[0]!.replace('default.otel_traces', fixtureTable([...rows, ...outsideWindow])));
  const retrieval = result.find(row => row['operation'] === 'retrieve');
  expect(retrieval).toMatchObject({ operations: 3, disabled: 1, degraded: 1, provider_failures: 1,
    successful_empty: 1, reused: 1, generation_attempts: 1, enabled_operations: 2, degraded_ratio: 0.5 });
  expect(result.find(row => row['operation'] === 'index')).toMatchObject({ operations: 2, degraded: 0, degraded_ratio: 0 });
  expect(result).toHaveLength(2);
}, 30_000);

test.skipIf(!enabled)('coverage snapshots never turn absent inventory, empty selections or unknown references into a percentage', async () => {
  const attributes: Array<Record<string, string>> = [
    { source: 'ticket', 'coverage.denominator': '4', 'coverage.ready': '1', 'coverage.unknown': '0' },
    { source: 'kb_article', 'coverage.denominator': '0', 'coverage.ready': '0', 'coverage.unknown': '0' },
    { source: 'knowledge_version', 'coverage.denominator': '2', 'coverage.ready': '1', 'coverage.unknown': '1' },
    { source: 'synthetic_note', 'coverage.ready': '0' },
  ];
  const entries = attributes.map(values => ({ name: 'embeddings.coverage', attributes: { ...base, 'coverage.basis': 'authorized_references', ...values } }));
  const result = await execute(queries[1]!.replace('default.otel_traces', fixtureTable(entries)));
  expect(result.find(row => row['source'] === 'ticket')).toMatchObject({ denominator: 4, ready: 1, coverage_ratio: 0.25 });
  for (const source of ['kb_article', 'knowledge_version', 'synthetic_note']) {
    expect(result.find(row => row['source'] === source)?.['coverage_ratio']).toBeNull();
  }
  expect(result.find(row => row['source'] === 'synthetic_note')?.['denominator']).toBeNull();
}, 30_000);
