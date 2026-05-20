import { parseEmailHeader, normalizeEmail, inferOrganizationFromEmail } from '@kairo/identity';
import type { TicketCorpus } from './types.js';
import type { Candidate, CandidateSource, EvidenceRole } from './types.js';

/**
 * Parses an RFC 2822 header string into one or more candidates.
 * The string may contain a comma-separated list of addresses.
 *
 * Returns an empty array if no valid email addresses are found.
 */
function parseAddressHeader(
  raw: string,
  source: CandidateSource,
  role: EvidenceRole,
): Candidate[] {
  // Split on commas that are NOT inside quotes or angle brackets
  // Simple approach: split by comma, then try to parse each chunk.
  const chunks = raw.split(/,(?![^<>]*>)/).map((s) => s.trim()).filter(Boolean);

  const candidates: Candidate[] = [];
  for (const chunk of chunks) {
    try {
      const parsed = parseEmailHeader(chunk);
      const email = normalizeEmail(parsed.email);
      if (!email) continue;
      const organization = inferOrganizationFromEmail(email);
      candidates.push({
        email,
        phone: null,
        display_name: parsed.name ?? null,
        organization,
        source,
        evidence_role: role,
      });
    } catch {
      // If parseEmailHeader throws (unparseable chunk), skip it
    }
  }
  return candidates;
}

/**
 * Extracts all contact candidates from the ticket corpus using heuristics only.
 *
 * Pasada A — heuristic rules:
 *  1. For each message, parse `sender_external_id` (the raw `From` header) → role `sender`.
 *  2. From `raw_payload`, extract headers `To` → role `recipient` and `Cc` → role `cc`.
 *  3. Infer `organization` from the email domain.
 *  4. Phone is always null (Pasada B / KAI-238 handles phone extraction).
 *  5. Dedup intra-ticket by normalized email: if the same email appears as both
 *     `sender` and `cc`/`recipient`, the `sender` role wins.
 *
 * @param corpus - Loaded ticket corpus.
 * @returns Array of deduped candidates ordered deterministically.
 */
export function extractCandidatesHeuristic(corpus: TicketCorpus): Candidate[] {
  // Map from normalized email → best candidate (sender wins over recipient/cc)
  const byEmail = new Map<string, Candidate>();

  const addCandidate = (c: Candidate): void => {
    if (!c.email) return;
    const existing = byEmail.get(c.email);
    if (!existing) {
      byEmail.set(c.email, c);
      return;
    }
    // Sender role takes priority
    if (existing.evidence_role !== 'sender' && c.evidence_role === 'sender') {
      byEmail.set(c.email, { ...c });
    }
    // Otherwise keep existing
  };

  // Also include the ticket's own from_email/from_name as a seed
  if (corpus.ticket.from_email) {
    const email = normalizeEmail(corpus.ticket.from_email);
    if (email) {
      addCandidate({
        email,
        phone: null,
        display_name: corpus.ticket.from_name ?? null,
        organization: inferOrganizationFromEmail(email),
        source: 'from_header',
        evidence_role: 'sender',
      });
    }
  }

  for (const message of corpus.messages) {
    // --- From header (sender_external_id) ---
    if (message.sender_external_id) {
      const candidates = parseAddressHeader(
        message.sender_external_id,
        'from_header',
        'sender',
      );
      // Use sender_display_name as fallback if parser returned null name
      for (const c of candidates) {
        if (!c.display_name && message.sender_display_name) {
          c.display_name = message.sender_display_name;
        }
        addCandidate(c);
      }
    }

    // --- Raw payload headers: To and Cc ---
    const rawPayload = message.raw_payload;
    if (rawPayload && typeof rawPayload === 'object') {
      // raw_payload may have a `headers` key (object or array of {name, value})
      // or may be the headers object directly. Handle both shapes.
      const getHeader = (name: string): string | null => {
        const lname = name.toLowerCase();

        // Shape 1: { headers: { To: '...', Cc: '...' } }
        if (rawPayload.headers && typeof rawPayload.headers === 'object' && !Array.isArray(rawPayload.headers)) {
          const hdrs = rawPayload.headers as Record<string, unknown>;
          for (const key of Object.keys(hdrs)) {
            if (key.toLowerCase() === lname) {
              return typeof hdrs[key] === 'string' ? hdrs[key] as string : null;
            }
          }
        }

        // Shape 2: { headers: [ { name: 'To', value: '...' }, ... ] }
        if (Array.isArray(rawPayload.headers)) {
          const arr = rawPayload.headers as Array<{ name?: string; value?: string }>;
          const found = arr.find((h) => (h.name ?? '').toLowerCase() === lname);
          return found?.value ?? null;
        }

        // Shape 3: raw_payload is the headers object directly
        for (const key of Object.keys(rawPayload)) {
          if (key.toLowerCase() === lname) {
            return typeof rawPayload[key] === 'string' ? rawPayload[key] as string : null;
          }
        }

        return null;
      };

      const toHeader = getHeader('To');
      if (toHeader) {
        for (const c of parseAddressHeader(toHeader, 'to_header', 'recipient')) {
          addCandidate(c);
        }
      }

      const ccHeader = getHeader('Cc');
      if (ccHeader) {
        for (const c of parseAddressHeader(ccHeader, 'cc_header', 'cc')) {
          addCandidate(c);
        }
      }
    }
  }

  return Array.from(byEmail.values());
}
