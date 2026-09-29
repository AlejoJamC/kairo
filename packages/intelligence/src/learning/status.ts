// ---------------------------------------------------------------------------
// KAI-55 — the one rule this phase decides: which lane starts approved.
//
// Everything else about operational learning (what counts as a pattern, how
// a system-derived candidate gets identified, where it surfaces for review)
// is later work. This is the part that was actually decided: a human
// correction is its own approval; a system-derived candidate is not.
// ---------------------------------------------------------------------------

import type { LearningOrigin, LearningStatus } from '@kairo/types';

export function initialLearningStatus(origin: LearningOrigin): LearningStatus {
  return origin === 'human_correction' ? 'approved' : 'pending_review';
}
