import { describe, it, expect } from "bun:test";
import { preFilterEmail, BLOCKED_SENDER_PATTERNS } from "./pre-filter";

const BASE: Parameters<typeof preFilterEmail>[0] = {
  from: "client@external.com",
  subject: "Hello",
  headers: {},
  gmailCategories: [],
  userEmail: "support@mycompany.com",
};

// ---------------------------------------------------------------------------
// Rule 1: automated_sender
// ---------------------------------------------------------------------------
describe("Rule: automated_sender", () => {
  it("skips email from noreply@ address", () => {
    const result = preFilterEmail({
      ...BASE,
      from: "noreply@someservice.com",
    });
    expect(result.status).toBe("skip");
    expect(result.skip_reason).toBe("automated_sender");
  });

  it("skips email from @mailchimp.com domain", () => {
    const result = preFilterEmail({
      ...BASE,
      from: "campaigns@mailchimp.com",
    });
    expect(result.status).toBe("skip");
    expect(result.skip_reason).toBe("automated_sender");
  });

  it("does not skip a normal external sender", () => {
    const result = preFilterEmail({ ...BASE, from: "alice@partner.com" });
    expect(result.status).toBe("relevant");
  });

  it("BLOCKED_SENDER_PATTERNS is exported and non-empty", () => {
    expect(Array.isArray(BLOCKED_SENDER_PATTERNS)).toBe(true);
    expect(BLOCKED_SENDER_PATTERNS.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Rule 2: mailing_list
// ---------------------------------------------------------------------------
describe("Rule: mailing_list", () => {
  it("skips email with List-Unsubscribe header", () => {
    const result = preFilterEmail({
      ...BASE,
      headers: { "List-Unsubscribe": "<https://example.com/unsub>" },
    });
    expect(result.status).toBe("skip");
    expect(result.skip_reason).toBe("mailing_list");
  });

  it("does not skip email without List-Unsubscribe header", () => {
    const result = preFilterEmail({ ...BASE, headers: {} });
    expect(result.status).toBe("relevant");
  });

  it("treats List-Unsubscribe header key as case-insensitive", () => {
    const result = preFilterEmail({
      ...BASE,
      headers: { "list-unsubscribe": "<https://example.com/unsub>" },
    });
    expect(result.status).toBe("skip");
    expect(result.skip_reason).toBe("mailing_list");
  });
});

// ---------------------------------------------------------------------------
// Rule 3: outbound
// ---------------------------------------------------------------------------
describe("Rule: outbound", () => {
  it("skips email where sender domain matches user domain", () => {
    const result = preFilterEmail({
      ...BASE,
      from: "colleague@mycompany.com",
      userEmail: "support@mycompany.com",
    });
    expect(result.status).toBe("skip");
    expect(result.skip_reason).toBe("outbound");
  });

  it("does not skip email from a different domain", () => {
    const result = preFilterEmail({
      ...BASE,
      from: "alice@otherdomain.com",
      userEmail: "support@mycompany.com",
    });
    expect(result.status).toBe("relevant");
  });

  it("handles display-name format in From header", () => {
    const result = preFilterEmail({
      ...BASE,
      from: "Colleague Name <col@mycompany.com>",
      userEmail: "me@mycompany.com",
    });
    expect(result.status).toBe("skip");
    expect(result.skip_reason).toBe("outbound");
  });
});

// ---------------------------------------------------------------------------
// Rule 4: system_notification
// ---------------------------------------------------------------------------
describe("Rule: system_notification", () => {
  it("skips email with mimeType text/calendar", () => {
    const result = preFilterEmail({ ...BASE, mimeType: "text/calendar" });
    expect(result.status).toBe("skip");
    expect(result.skip_reason).toBe("system_notification");
  });

  it("skips email with subject starting with 'Accepted:'", () => {
    const result = preFilterEmail({
      ...BASE,
      subject: "Accepted: Team standup",
    });
    expect(result.status).toBe("skip");
    expect(result.skip_reason).toBe("system_notification");
  });

  it("skips email with subject starting with 'Declined:'", () => {
    const result = preFilterEmail({
      ...BASE,
      subject: "Declined: Project kickoff",
    });
    expect(result.status).toBe("skip");
    expect(result.skip_reason).toBe("system_notification");
  });

  it("does not skip a regular email with no calendar signals", () => {
    const result = preFilterEmail({ ...BASE, subject: "Question about billing" });
    expect(result.status).toBe("relevant");
  });
});

// ---------------------------------------------------------------------------
// Rule 5: gmail_category_filter
// ---------------------------------------------------------------------------
describe("Rule: gmail_category_filter", () => {
  it("skips email in CATEGORY_PROMOTIONS", () => {
    const result = preFilterEmail({
      ...BASE,
      gmailCategories: ["CATEGORY_PROMOTIONS"],
    });
    expect(result.status).toBe("skip");
    expect(result.skip_reason).toBe("gmail_category_filter");
  });

  it("skips email in CATEGORY_SOCIAL", () => {
    const result = preFilterEmail({
      ...BASE,
      gmailCategories: ["CATEGORY_SOCIAL"],
    });
    expect(result.status).toBe("skip");
    expect(result.skip_reason).toBe("gmail_category_filter");
  });

  it("does not skip email in CATEGORY_PRIMARY", () => {
    const result = preFilterEmail({
      ...BASE,
      gmailCategories: ["CATEGORY_PRIMARY"],
    });
    expect(result.status).toBe("relevant");
    expect(result.relevance_signals).toContain("gmail_primary");
  });
});

// ---------------------------------------------------------------------------
// Rule 6: auto_generated
// ---------------------------------------------------------------------------
describe("Rule: auto_generated", () => {
  it("skips email with X-Auto-Response-Suppress header", () => {
    const result = preFilterEmail({
      ...BASE,
      headers: { "X-Auto-Response-Suppress": "All" },
    });
    expect(result.status).toBe("skip");
    expect(result.skip_reason).toBe("auto_generated");
  });

  it("skips email with Precedence: bulk", () => {
    const result = preFilterEmail({
      ...BASE,
      headers: { Precedence: "bulk" },
    });
    expect(result.status).toBe("skip");
    expect(result.skip_reason).toBe("auto_generated");
  });

  it("skips email with Precedence: list", () => {
    const result = preFilterEmail({
      ...BASE,
      headers: { Precedence: "list" },
    });
    expect(result.status).toBe("skip");
    expect(result.skip_reason).toBe("auto_generated");
  });

  it("does not skip email with no auto-generated signals", () => {
    const result = preFilterEmail({ ...BASE, headers: {} });
    expect(result.status).toBe("relevant");
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------
describe("Edge cases", () => {
  it("noreply@ sender with urgency keyword in subject is relevant (urgency overrides automated_sender)", () => {
    const result = preFilterEmail({
      ...BASE,
      from: "noreply@alerts.myservice.com",
      subject: "CRITICAL: production database is down",
    });
    expect(result.status).toBe("relevant");
    expect(result.relevance_signals).toContain("urgency_keyword");
  });

  it("List-Unsubscribe + In-Reply-To → relevance wins over mailing_list", () => {
    const result = preFilterEmail({
      ...BASE,
      headers: {
        "List-Unsubscribe": "<https://example.com/unsub>",
        "In-Reply-To": "<thread-id-123@mail.example.com>",
      },
    });
    expect(result.status).toBe("relevant");
    expect(result.relevance_signals).toContain("in_reply_to");
  });

  it("outbound sender domain + urgency keyword → outbound wins (skip)", () => {
    const result = preFilterEmail({
      ...BASE,
      from: "colleague@mycompany.com",
      subject: "urgent: need help with production",
      userEmail: "support@mycompany.com",
    });
    expect(result.status).toBe("skip");
    expect(result.skip_reason).toBe("outbound");
  });
});

// ---------------------------------------------------------------------------
// Pass-through signals
// ---------------------------------------------------------------------------
describe("Pass-through signals", () => {
  it("includes external_sender signal for external email", () => {
    const result = preFilterEmail({ ...BASE });
    expect(result.status).toBe("relevant");
    expect(result.relevance_signals).toContain("external_sender");
  });

  it("includes gmail_updates signal for CATEGORY_UPDATES", () => {
    const result = preFilterEmail({
      ...BASE,
      gmailCategories: ["CATEGORY_UPDATES"],
    });
    expect(result.status).toBe("relevant");
    expect(result.relevance_signals).toContain("gmail_updates");
  });

  it("includes in_reply_to signal when In-Reply-To header present", () => {
    const result = preFilterEmail({
      ...BASE,
      headers: { "In-Reply-To": "<ref-123@mail.example.com>" },
    });
    expect(result.status).toBe("relevant");
    expect(result.relevance_signals).toContain("in_reply_to");
  });
});
