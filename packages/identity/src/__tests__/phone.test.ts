import { describe, it, expect } from 'vitest';
import { normalizePhone } from '../phone.js';

describe('normalizePhone', () => {
  it('returns null for null input', () => {
    expect(normalizePhone(null, 'CO')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(normalizePhone('', 'CO')).toBeNull();
    expect(normalizePhone('   ', 'CO')).toBeNull();
  });

  it('returns null for invalid number', () => {
    expect(normalizePhone('123', 'CO')).toBeNull();
  });

  it('normalizes Colombian mobile number (CO)', () => {
    const result = normalizePhone('300 123 4567', 'CO');
    expect(result).toEqual({ e164: '+573001234567', extension: null });
  });

  it('normalizes Spanish mobile with international prefix (ES)', () => {
    const result = normalizePhone('+34 600 12 34 56', 'ES');
    expect(result).toEqual({ e164: '+34600123456', extension: null });
  });

  it('normalizes Dutch mobile number (NL)', () => {
    const result = normalizePhone('06 12345678', 'NL');
    expect(result).toEqual({ e164: '+31612345678', extension: null });
  });

  it('extracts extension from "ext NNN" suffix', () => {
    // +57 601 is the modern Bogotá area code (area code "1" was replaced by "601" in 2020)
    const result = normalizePhone('+57 601 2345678 ext 100', 'CO');
    expect(result).not.toBeNull();
    expect(result!.extension).toBe('100');
    // E.164 should NOT contain the extension
    expect(result!.e164).not.toContain('100');
  });

  it('extracts extension with "x" shorthand', () => {
    const result = normalizePhone('+57 601 2345678 x200', 'CO');
    expect(result).not.toBeNull();
    expect(result!.extension).toBe('200');
  });

  it('idempotence: normalizing an already-E.164 number yields same e164', () => {
    const first = normalizePhone('+573001234567', 'CO');
    expect(first).not.toBeNull();
    const second = normalizePhone(first!.e164, 'CO');
    expect(second).not.toBeNull();
    expect(second!.e164).toBe(first!.e164);
  });

  it('handles numbers with dashes and parentheses', () => {
    const result = normalizePhone('(300) 123-4567', 'CO');
    expect(result).not.toBeNull();
    expect(result!.e164).toBe('+573001234567');
  });
});
