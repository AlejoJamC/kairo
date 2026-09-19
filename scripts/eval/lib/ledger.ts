import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { dirname } from 'path';

/**
 * Execution bookkeeping, kept strictly apart from the eval's own output.
 *
 * A thousand classifications cannot be redone because a run was interrupted,
 * so the runner has to know exactly which cells are already on disk. That
 * knowledge is control data, not measurement: it never enters the CSVs the
 * metrics are computed from, and the CSVs never carry run-control columns.
 *
 * The ordering rule is what makes resume trustworthy: the eval row is written
 * and flushed first, and only then is the cell recorded here. A crash between
 * the two costs one repeated classification. The reverse order would cost a
 * silently missing row that resume would never revisit -- a hole in the data
 * that no later step could detect.
 */
export interface LedgerEntry {
  key: string;
  ok: boolean;
  ms: number;
  at: string;
}

export class Ledger {
  private done = new Set<string>();
  private path: string;

  constructor(path: string) {
    this.path = path;
    mkdirSync(dirname(path), { recursive: true });
    if (!existsSync(path)) return;

    // A partially written final line (killed mid-append) is skipped rather
    // than fatal: that cell simply gets classified again.
    for (const line of readFileSync(path, 'utf-8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line) as LedgerEntry;
        if (entry.ok) this.done.add(entry.key);
      } catch {
        continue;
      }
    }
  }

  /** Cells already completed, so a resumed run only does the delta. */
  has(key: string): boolean {
    return this.done.has(key);
  }

  get completed(): number {
    return this.done.size;
  }

  /** Call only after the eval row for this cell is durably on disk. */
  record(key: string, ok: boolean, ms: number): void {
    if (ok) this.done.add(key);
    const entry: LedgerEntry = { key, ok, ms, at: new Date().toISOString() };
    appendFileSync(this.path, JSON.stringify(entry) + '\n', 'utf-8');
  }
}
