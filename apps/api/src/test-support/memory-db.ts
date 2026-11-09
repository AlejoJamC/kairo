type Row = Record<string, unknown>;

/** A small in-memory stand-in for the Supabase query builder: filters, ordering, limits and single rows. */
export function memoryDb(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      let rows = [...(tables[table] ?? [])];
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => { rows = rows.filter((row) => row[column] === value); return query; },
        neq: (column: string, value: unknown) => { rows = rows.filter((row) => row[column] !== value); return query; },
        in: (column: string, values: unknown[]) => { rows = rows.filter((row) => values.includes(row[column])); return query; },
        is: (column: string, value: unknown) => { rows = rows.filter((row) => (row[column] ?? null) === value); return query; },
        gte: (column: string, value: string) => { rows = rows.filter((row) => String(row[column] ?? '') >= value); return query; },
        order: (column: string, options?: { ascending?: boolean }) => {
          const direction = options?.ascending === false ? -1 : 1;
          rows = [...rows].sort((a, b) => String(a[column] ?? '').localeCompare(String(b[column] ?? '')) * direction);
          return query;
        },
        limit: (count: number) => { rows = rows.slice(0, count); return query; },
        maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
        single: async () => ({ data: rows[0] ?? null, error: null }),
        then: <T>(resolve: (value: { data: Row[]; error: null }) => T) => Promise.resolve({ data: rows, error: null }).then(resolve),
      };
      return query;
    },
  };
}
