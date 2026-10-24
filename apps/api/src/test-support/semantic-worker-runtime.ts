import { Hono } from 'hono';
import { serve } from 'inngest/hono';
import { inngest } from '../lib/inngest';
import { semanticIndexing } from '../functions/semantic-indexing';

// Register only the domain under test; unrelated product cron jobs must not run.
const app = new Hono();
app.on(['GET', 'POST', 'PUT'], '/api/inngest', serve({ client: inngest, functions: [semanticIndexing] }));
app.get('/health', c => c.json({ ready: true, runtime: 'semantic-indexing-eval' }));
if (import.meta.main) Bun.serve({ hostname: '127.0.0.1', port: 3001, fetch: app.fetch });
