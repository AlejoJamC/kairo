import { describe, it, expect } from 'vitest';
import { inferOrganizationFromEmail, GENERIC_EMAIL_PROVIDERS } from '../organization.js';

describe('inferOrganizationFromEmail', () => {
  it('returns null for generic providers', () => {
    expect(inferOrganizationFromEmail('alguien@gmail.com')).toBeNull();
    expect(inferOrganizationFromEmail('user@outlook.com')).toBeNull();
    expect(inferOrganizationFromEmail('user@hotmail.com')).toBeNull();
    expect(inferOrganizationFromEmail('user@icloud.com')).toBeNull();
    expect(inferOrganizationFromEmail('user@proton.me')).toBeNull();
    expect(inferOrganizationFromEmail('user@yahoo.com')).toBeNull();
  });

  it('infers company name from corporate domain (simple)', () => {
    expect(inferOrganizationFromEmail('alguien@disfarma.com.co')).toBe('Disfarma');
  });

  it('infers company name from corporate domain (single TLD)', () => {
    expect(inferOrganizationFromEmail('dev@acme.com')).toBe('Acme');
  });

  it('capitalizes the first segment', () => {
    expect(inferOrganizationFromEmail('user@kairo.io')).toBe('Kairo');
  });

  it('returns null when email has no @', () => {
    expect(inferOrganizationFromEmail('foo')).toBeNull();
    expect(inferOrganizationFromEmail('')).toBeNull();
  });

  it('is case-insensitive for the domain', () => {
    expect(inferOrganizationFromEmail('user@DISFARMA.com.co')).toBe('Disfarma');
  });

  it('returns null for email with @ but empty domain segment', () => {
    // edge: "@.com" → first segment is ""
    expect(inferOrganizationFromEmail('user@.com')).toBeNull();
  });
});

describe('GENERIC_EMAIL_PROVIDERS', () => {
  it('is a ReadonlySet with the expected providers', () => {
    expect(GENERIC_EMAIL_PROVIDERS.has('gmail.com')).toBe(true);
    expect(GENERIC_EMAIL_PROVIDERS.has('protonmail.com')).toBe(true);
    expect(GENERIC_EMAIL_PROVIDERS.has('fastmail.com')).toBe(true);
    expect(GENERIC_EMAIL_PROVIDERS.has('acme.com')).toBe(false);
  });
});
