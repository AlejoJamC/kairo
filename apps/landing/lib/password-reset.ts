const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The address as stored in `profiles.email`: trimmed and lowercased, or null when it is not an email. */
export function normalizeResetEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  return email.length <= 254 && EMAIL_SHAPE.test(email) ? email : null;
}
