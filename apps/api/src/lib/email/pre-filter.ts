export const BLOCKED_SENDER_PATTERNS: string[] = [
  "noreply@",
  "marketing@",
  "newsletter@",
  "@mailchimp.com",
  "@sendgrid.net",
  "@constantcontact.com",
];

const URGENCY_KEYWORDS = [
  "urgent",
  "error",
  "down",
  "broken",
  "help",
  "asap",
  "production",
  "critical",
];

const SYSTEM_SUBJECT_PREFIXES = [
  "Accepted:",
  "Declined:",
  "Delivery Status",
  "Read Receipt",
];

export interface EmailMetadata {
  from: string;
  subject: string;
  headers: Record<string, string>;
  gmailCategories?: string[];
  mimeType?: string;
  userEmail: string;
}

export interface PreFilterResult {
  status: "skip" | "relevant";
  skip_reason?: string;
  relevance_signals?: string[];
}

function extractDomain(email: string): string {
  const match = email.match(/@([^>\s]+)/);
  return match ? match[1].toLowerCase() : "";
}

function normalizeHeaders(
  headers: Record<string, string>
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    result[key.toLowerCase()] = value;
  }
  return result;
}

export function preFilterEmail(metadata: EmailMetadata): PreFilterResult {
  const { from, subject, headers, gmailCategories = [], mimeType, userEmail } =
    metadata;

  const fromLower = from.toLowerCase();
  const subjectLower = subject.toLowerCase();
  const h = normalizeHeaders(headers);

  // Rule: Outbound — highest priority skip, not overridable by any pass-through signal
  const senderDomain = extractDomain(fromLower);
  const userDomain = extractDomain(userEmail.toLowerCase());
  if (senderDomain && userDomain && senderDomain === userDomain) {
    return { status: "skip", skip_reason: "outbound" };
  }

  // Pass-through override signals — urgency keyword and In-Reply-To beat all
  // remaining skip rules (automated_sender, mailing_list, etc.)
  const overrideSignals: string[] = [];

  if (URGENCY_KEYWORDS.some((kw) => subjectLower.includes(kw))) {
    overrideSignals.push("urgency_keyword");
  }
  if ("in-reply-to" in h) {
    overrideSignals.push("in_reply_to");
  }

  if (overrideSignals.length > 0) {
    const signals = [...overrideSignals];
    if (gmailCategories.includes("CATEGORY_PRIMARY")) signals.push("gmail_primary");
    if (gmailCategories.includes("CATEGORY_UPDATES")) signals.push("gmail_updates");
    signals.push("external_sender");
    return { status: "relevant", relevance_signals: signals };
  }

  // Rule: Known newsletter / automated sender
  if (BLOCKED_SENDER_PATTERNS.some((p) => fromLower.includes(p))) {
    return { status: "skip", skip_reason: "automated_sender" };
  }

  // Rule: Mailing list header
  if ("list-unsubscribe" in h) {
    return { status: "skip", skip_reason: "mailing_list" };
  }

  // Rule: Calendar invite or system receipt
  if (
    mimeType === "text/calendar" ||
    SYSTEM_SUBJECT_PREFIXES.some((prefix) => subject.startsWith(prefix))
  ) {
    return { status: "skip", skip_reason: "system_notification" };
  }

  // Rule: Gmail Promotions or Social category
  if (
    gmailCategories.includes("CATEGORY_PROMOTIONS") ||
    gmailCategories.includes("CATEGORY_SOCIAL")
  ) {
    return { status: "skip", skip_reason: "gmail_category_filter" };
  }

  // Rule: Auto-generated headers
  const precedence = h["precedence"] ?? "";
  if (
    "x-auto-response-suppress" in h ||
    precedence === "bulk" ||
    precedence === "list"
  ) {
    return { status: "skip", skip_reason: "auto_generated" };
  }

  // Relevant — collect all applicable signals
  const signals: string[] = ["external_sender"];
  if (gmailCategories.includes("CATEGORY_PRIMARY")) signals.push("gmail_primary");
  if (gmailCategories.includes("CATEGORY_UPDATES")) signals.push("gmail_updates");

  return { status: "relevant", relevance_signals: signals };
}
