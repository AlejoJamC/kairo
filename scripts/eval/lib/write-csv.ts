function escapeCsvField(value: string | number): string {
  const str = String(value);
  // Fields containing comma, double-quote, or newline must be quoted
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function writeCsv<T extends object>(
  rows: T[],
  columns: (keyof T)[]
): string {
  const header = columns.map((c) => escapeCsvField(String(c))).join(',');
  const lines = rows.map((row) =>
    columns.map((c) => {
      const val = row[c];
      return escapeCsvField(val == null ? '' : (val as string | number));
    }).join(',')
  );
  return [header, ...lines].join('\n') + '\n';
}
