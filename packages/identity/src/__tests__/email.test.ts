import { describe, it, expect } from 'vitest';
import { normalizeEmail, parseEmailHeader } from '../email.js';

describe('normalizeEmail', () => {
  it('returns null for null input', () => {
    expect(normalizeEmail(null)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(normalizeEmail('')).toBeNull();
    expect(normalizeEmail('   ')).toBeNull();
  });

  it('returns null for invalid emails', () => {
    expect(normalizeEmail('not an email')).toBeNull();
    expect(normalizeEmail('no-at-sign')).toBeNull();
    expect(normalizeEmail('@nodomain')).toBeNull();
    expect(normalizeEmail('noat.com')).toBeNull();
  });

  it('lowercases and trims', () => {
    expect(normalizeEmail('FOO@BAR.COM')).toBe('foo@bar.com');
    expect(normalizeEmail('  FOO@BAR.COM  ')).toBe('foo@bar.com');
  });

  it('case-insensitivity: same result for upper and lower', () => {
    expect(normalizeEmail('FOO@BAR.com')).toBe(normalizeEmail('foo@bar.com'));
  });

  it('does NOT collapse alias tags (+ preserved)', () => {
    expect(normalizeEmail('foo+tag@bar.com')).toBe('foo+tag@bar.com');
    expect(normalizeEmail('FOO+TAG@BAR.COM')).toBe('foo+tag@bar.com');
  });

  it('extracts email from RFC 2822 header', () => {
    expect(normalizeEmail('"Foo Bar" <A@B.com>')).toBe('a@b.com');
    expect(normalizeEmail('Foo Bar <A@B.com>')).toBe('a@b.com');
  });

  it('idempotence: normalizeEmail(normalizeEmail(x)) === normalizeEmail(x)', () => {
    const fixtures = [
      'foo@bar.com',
      'FOO@BAR.COM',
      'foo+tag@bar.com',
      '"Foo Bar" <foo@bar.com>',
      'user@sub.domain.com',
      'user.name+tag@example.org',
      'another@example.co.uk',
      'test123@test.io',
      'CAPS@EXAMPLE.COM',
      '  spaced@example.com  ',
    ];

    for (const fixture of fixtures) {
      const once = normalizeEmail(fixture);
      const twice = normalizeEmail(once);
      expect(twice).toBe(once);
    }
  });

  it('handles subdomain emails', () => {
    expect(normalizeEmail('user@sub.domain.com')).toBe('user@sub.domain.com');
  });
});

describe('parseEmailHeader', () => {
  it('parses a quoted name + address', () => {
    const result = parseEmailHeader('"Johan Hurtua" <a@b.co>');
    expect(result).toEqual({ name: 'Johan Hurtua', email: 'a@b.co' });
  });

  it('parses an unquoted name + address', () => {
    const result = parseEmailHeader('Johan Hurtado <j@example.com>');
    expect(result.email).toBe('j@example.com');
    expect(result.name).toBe('Johan Hurtado');
  });

  it('plain email → name is null', () => {
    const result = parseEmailHeader('a@b.co');
    expect(result).toEqual({ name: null, email: 'a@b.co' });
  });

  it('lowercases the address', () => {
    const result = parseEmailHeader('"Foo" <FOO@BAR.COM>');
    expect(result.email).toBe('foo@bar.com');
  });

  it('throws for completely unparseable input', () => {
    expect(() => parseEmailHeader('not-an-email-at-all')).toThrow();
  });
});

describe('normalizeEmail — catch branch', () => {
  it('falls back to null when header-looking string is invalid', () => {
    // "<" triggers the parse attempt but the address is not valid
    expect(normalizeEmail('"Bad" <not-valid>')).toBeNull();
  });
});
