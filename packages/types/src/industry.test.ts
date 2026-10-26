import { describe, expect, it } from 'bun:test';
import { DEFAULT_INDUSTRY, INDUSTRIES, INDUSTRY_CHOICES, INDUSTRY_EXAMPLES, INDUSTRY_NAMES, TICKET_GROUPS, isIndustryChoice, resolveIndustry } from './industry';

describe('industry catalog', () => {
  it('names and describes every industry in both languages', () => {
    for (const industry of INDUSTRIES) {
      expect(INDUSTRY_NAMES[industry].es.length).toBeGreaterThan(0);
      expect(INDUSTRY_NAMES[industry].en.length).toBeGreaterThan(0);
      for (const [group, examples] of Object.entries(INDUSTRY_EXAMPLES[industry])) {
        expect(TICKET_GROUPS as readonly string[]).toContain(group);
        for (const example of examples ?? []) {
          expect(example.es.length).toBeGreaterThan(0);
          expect(example.en.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('gives examples only where the approved catalog has them', () => {
    expect(Object.keys(INDUSTRY_EXAMPLES.customer_service)).toEqual(['support', 'prospect']);
    expect(Object.keys(INDUSTRY_EXAMPLES.legal)).toEqual(['support', 'prospect']);
    expect(Object.keys(INDUSTRY_EXAMPLES.accounting)).toEqual(['support', 'prospect']);
    expect(Object.keys(INDUSTRY_EXAMPLES.financial)).toEqual(['support', 'prospect', 'internal', 'other']);
    expect(Object.keys(INDUSTRY_EXAMPLES.technology)).toEqual(['support', 'prospect', 'internal', 'other']);
    expect(INDUSTRY_EXAMPLES.customer_service.support).toHaveLength(6);
    expect(INDUSTRY_EXAMPLES.technology.other).toHaveLength(3);
  });

  it('resolves every stored value to an industry, falling back to customer service', () => {
    for (const industry of INDUSTRIES) expect(resolveIndustry(industry)).toBe(industry);
    for (const value of ['other', null, undefined, '', 'unknown']) expect(resolveIndustry(value)).toBe(DEFAULT_INDUSTRY);
    expect(DEFAULT_INDUSTRY).toBe('customer_service');
  });

  it('accepts exactly the choices the account column allows', () => {
    for (const choice of INDUSTRY_CHOICES) expect(isIndustryChoice(choice)).toBe(true);
    for (const value of ['', 'Legal', null, 3]) expect(isIndustryChoice(value)).toBe(false);
    expect([...INDUSTRY_CHOICES].sort()).toEqual(['accounting', 'customer_service', 'financial', 'legal', 'other', 'technology']);
  });
});
