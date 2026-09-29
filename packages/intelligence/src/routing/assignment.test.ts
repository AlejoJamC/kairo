import { describe, it, expect } from 'bun:test';

import { resolveRoundRobinAssignee } from './assignment';

describe('resolveRoundRobinAssignee', () => {
  it('assigns to the one active agent an account has', () => {
    expect(resolveRoundRobinAssignee([{ userId: 'user-1', lastAssignedAt: null }])).toBe('user-1');
  });

  it('assigns nothing when there is no active agent', () => {
    expect(resolveRoundRobinAssignee([])).toBeNull();
  });

  it('an agent who has never had a ticket goes ahead of one who has', () => {
    const result = resolveRoundRobinAssignee([
      { userId: 'has-history', lastAssignedAt: '2026-09-01T00:00:00Z' },
      { userId: 'never-assigned', lastAssignedAt: null },
    ]);
    expect(result).toBe('never-assigned');
  });

  it('among agents with history, the one whose last ticket is oldest goes next', () => {
    const result = resolveRoundRobinAssignee([
      { userId: 'assigned-recently', lastAssignedAt: '2026-09-26T12:00:00Z' },
      { userId: 'assigned-longest-ago', lastAssignedAt: '2026-09-20T08:00:00Z' },
      { userId: 'assigned-yesterday', lastAssignedAt: '2026-09-25T09:00:00Z' },
    ]);
    expect(result).toBe('assigned-longest-ago');
  });

  it('a tie between two never-assigned agents keeps the first, deterministically', () => {
    const result = resolveRoundRobinAssignee([
      { userId: 'first', lastAssignedAt: null },
      { userId: 'second', lastAssignedAt: null },
    ]);
    expect(result).toBe('first');
  });

  it('rotates fairly over successive tickets — three agents, three tickets, three different winners', () => {
    const agents = [
      { userId: 'a', lastAssignedAt: null },
      { userId: 'b', lastAssignedAt: null },
      { userId: 'c', lastAssignedAt: null },
    ];
    const winners = new Set<string>();
    let clock = 0;
    for (let i = 0; i < 3; i++) {
      const winner = resolveRoundRobinAssignee(agents)!;
      winners.add(winner);
      const agent = agents.find((a) => a.userId === winner)!;
      agent.lastAssignedAt = new Date(++clock).toISOString();
    }
    expect(winners.size).toBe(3);
  });
});
