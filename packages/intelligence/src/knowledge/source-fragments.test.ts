import { expect, test } from 'bun:test';
import { sourceFragments, resolveSourceReferences, ReferencedKnowledgeDraftSchema } from './source-fragments';

test('source references recover exact Unicode and multiline text without model-generated quotations', () => {
  const source = '\r\n[inbound] Acceso restaurado.\r\n\n[outbound] Confirmación: contraseña válida.\n' + 'a'.repeat(1250);
  const fragments = sourceFragments(source);
  expect(fragments).toHaveLength(5);
  expect(fragments.every(fragment => fragment.text === source.slice(fragment.start, fragment.end))).toBe(true);
  expect(sourceFragments(source)).toEqual(fragments);
  const resolved = resolveSourceReferences({ proposals: [{ kind: 'business_fact', title: 'Account access',
    content: 'A reported restoration of access.', evidenceIds: ['e1', 'e1'] }] }, fragments);
  expect(resolved.proposals[0]?.evidence).toEqual(['[inbound] Acceso restaurado.']);
  expect(resolved.blocked).toEqual([]);
});

test('an unknown source reference blocks only that proposal and never substitutes another source', () => {
  const proposal = { kind: 'article' as const, title: 'Account access', content: 'A proposed account procedure.' };
  const draft = ReferencedKnowledgeDraftSchema.parse({ proposals: [
    { ...proposal, evidenceIds: ['e1-e3'] }, { ...proposal, evidenceIds: ['e1'] },
  ] });
  const result = resolveSourceReferences(draft, sourceFragments('Access is restored.'));
  expect(result.proposals).toHaveLength(1);
  expect(result.blocked).toEqual([{ kind: 'article', status: 'blocked', reasons: ['invalid_source_reference'] }]);
});
