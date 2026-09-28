/** Returns the model identifier used for classification, for audit storage in ticket_proposals. */
export function resolveModelVersion(): string {
  const provider = process.env['INTELLIGENCE_PROVIDER'] ?? 'ollama';
  if (provider === 'jev') return process.env['JEV_MODEL'] ?? 'jev-latest';
  return provider === 'anthropic' ? 'claude-sonnet-4-20250514' : 'ollama';
}
