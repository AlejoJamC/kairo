import { expect, it } from 'bun:test';
import { getFlag } from './flags';

it('keeps the assistant open chat off unless its variable is exactly true', () => {
  const saved = process.env['FEATURE_FLAG_ENABLE_ASSISTANT_OPEN_CHAT'];
  try {
    delete process.env['FEATURE_FLAG_ENABLE_ASSISTANT_OPEN_CHAT'];
    expect(getFlag('enable_assistant_open_chat')).toBe(false);
    process.env['FEATURE_FLAG_ENABLE_ASSISTANT_OPEN_CHAT'] = 'true';
    expect(getFlag('enable_assistant_open_chat')).toBe(true);
  } finally {
    if (saved === undefined) delete process.env['FEATURE_FLAG_ENABLE_ASSISTANT_OPEN_CHAT'];
    else process.env['FEATURE_FLAG_ENABLE_ASSISTANT_OPEN_CHAT'] = saved;
  }
});
