export * from './database.js';
export * from './admin.js';

import type { Tables } from './database.js';
export type Ticket = Tables<'tickets'>;
