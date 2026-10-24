import { randomUUID } from 'node:crypto';
import { expect } from 'bun:test';
import { initNodeTelemetry } from '../packages/observability/src/node';

async function docker(args: string[], input?: string): Promise<string> {
  const child = Bun.spawn(['docker', ...args], { stdin: input === undefined ? 'ignore' : 'pipe', stdout: 'pipe', stderr: 'pipe' });
  if (input !== undefined && typeof child.stdin !== 'number' && child.stdin) { child.stdin.write(input); child.stdin.end(); }
  const [output, , code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  if (code !== 0) throw new Error('Existing local observability service is unavailable');
  return output.trim();
}

export async function startSemanticObservability() {
  const service = `acme-semantic-eval-${randomUUID()}`;
  const key = await docker(['exec', 'kairo-clickstack-mongo-1', 'mongo', 'hyperdx', '--quiet', '--eval',
    'if (db.teams.countDocuments({}) !== 1) quit(1); var team = db.teams.findOne({}, {apiKey: 1}); if (!team.apiKey) quit(1); print(team.apiKey)']);
  if (!key) throw new Error('Existing local collector ingestion credential is unavailable');
  const sdk = initNodeTelemetry({ serviceName: service, otlpEndpoint: 'http://127.0.0.1:4318', ingestionApiKey: key });
  if (!sdk) throw new Error('Real telemetry SDK did not start');
  let stopped = false;
  async function stop() { if (!stopped) { stopped = true; await sdk!.shutdown(); } }
  async function query(sql: string): Promise<Array<Record<string, unknown>>> {
    const output = await docker(['exec', '-i', 'kairo-clickhouse-1', 'sh', '-c',
      'clickhouse-client --user "$CLICKHOUSE_USER" --password "$CLICKHOUSE_PASSWORD"'],
    sql + ' SETTINGS output_format_json_quote_64bit_integers=0 FORMAT JSONEachRow');
    return output.split('\n').filter(Boolean).map(line => JSON.parse(line) as Record<string, unknown>);
  }
  async function verify(privateValues: string[]) {
    await stop();
    const selection = `ServiceName = '${service}' AND SpanName IN ('embeddings.operation', 'embeddings.coverage')`;
    let rows: Array<Record<string, unknown>> = [];
    for (let attempt = 0; attempt < 60; attempt++) {
      rows = await query(`SELECT TraceId, SpanName, SpanAttributes FROM default.otel_traces WHERE ${selection}`);
      const coverage = rows.filter(row => row['SpanName'] === 'embeddings.coverage')
        .map(row => row['SpanAttributes'] as Record<string, string>);
      if (coverage.some(row => row['kairo.embeddings.coverage.basis'] === 'unknown') &&
        ['ticket', 'knowledge_version'].every(source => coverage.some(row => row['kairo.embeddings.source'] === source &&
          row['kairo.embeddings.coverage.basis'] === 'authorized_references' && row['kairo.embeddings.coverage.ready'] === '1'))) break;
      await Bun.sleep(500);
    }
    expect(rows.length).toBeGreaterThan(0);
    const serialized = JSON.stringify(rows);
    for (const value of privateValues) expect(serialized).not.toContain(value);
    const operations = rows.filter(row => row['SpanName'] === 'embeddings.operation');
    const attributes = operations.map(row => row['SpanAttributes'] as Record<string, string>);
    const prefix = 'kairo.embeddings.';
    expect(attributes.some(row => row[prefix + 'operation'] === 'index' && row[prefix + 'outcome'] === 'indexed')).toBe(true);
    expect(attributes.some(row => row[prefix + 'operation'] === 'retrieve' && row[prefix + 'outcome'] === 'ok')).toBe(true);
    expect(attributes.some(row => row[prefix + 'generation'] === 'reused')).toBe(true);
    expect(rows.every(row => /^[0-9a-f]{32}$/.test(String(row['TraceId'])))).toBe(true);
    const document = await Bun.file(new URL('../docs/observability.md', import.meta.url)).text();
    const section = document.split('## Embeddings operations and coverage')[1]?.split('## `packages/observability`')[0] ?? '';
    const queries = [...section.matchAll(/```sql\n([\s\S]*?)```/g)].map(match => match[1]!.trim().replace(/;$/, '')
      .replace('WHERE Timestamp', `WHERE ServiceName = '${service}' AND Timestamp`));
    expect(queries).toHaveLength(2);
    const rates = await query(queries[0]!);
    const coverage = await query(queries[1]!);
    const publicRows = attributes.filter(row => ['index','retrieve','read_indexes','group'].includes(row[prefix + 'operation']!));
    expect(rates.reduce((sum, row) => sum + Number(row['operations']), 0)).toBe(publicRows.length);
    for (const rate of rates) {
      const matching = publicRows.filter(row => ['operation','source','provider','model','dimensions'].every(key => row[prefix + key] === rate[key]));
      const degraded = matching.filter(row => ['failed','unavailable','partial'].includes(row[prefix + 'outcome']!)).length;
      const enabled = matching.filter(row => row[prefix + 'outcome'] !== 'disabled').length;
      expect(rate['degraded']).toBe(degraded);
      expect(rate['enabled_operations']).toBe(enabled);
      expect(rate['degraded_ratio']).toBe(enabled ? degraded / enabled : null);
      expect(rate['reused']).toBe(matching.filter(row => row[prefix + 'generation'] === 'reused').length);
      expect(rate['generation_attempts']).toBe(matching.filter(row => row[prefix + 'generation'] === 'attempted').length);
      expect(rate['successful_empty']).toBe(matching.filter(row => row[prefix + 'operation'] === 'retrieve' &&
        row[prefix + 'outcome'] === 'ok' && row[prefix + 'matches'] === '0').length);
    }
    for (const source of ['ticket', 'knowledge_version']) {
      expect(coverage.some(row => row['source'] === source && row['basis'] === 'authorized_references'
        && row['denominator'] === 1 && row['ready'] === 1 && row['coverage_ratio'] === 1)).toBe(true);
    }
    expect(coverage.some(row => row['denominator'] === null && row['coverage_ratio'] === null)).toBe(true);
    return { passed: true, transport: 'real_local_otlp', storage: 'real_local_clickhouse',
      operationSpans: operations.length, coverageSpans: rows.length - operations.length,
      diagnosticQueries: queries.length, rates, coverage };
  }
  return { stop, verify };
}
