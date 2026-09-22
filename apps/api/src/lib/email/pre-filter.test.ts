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
// Rule 0: spam_filtered — KAI-45 F2, routing policy 1.1.1
//
// Runs ahead of everything, including the urgency / In-Reply-To overrides. On
// the 90 real .eml in scripts/eval/data the header fires on exactly the ten
// messages the sheet labels `spam` and on nothing else.
// ---------------------------------------------------------------------------
describe("Rule: spam_filtered", () => {
  it("believes the receiving server's verdict", () => {
    const result = preFilterEmail({
      ...BASE,
      headers: { "X-Spam-Status": "Yes, score=11.8 required=5.0" },
    });
    expect(result.status).toBe("skip");
    expect(result.skip_reason).toBe("spam_filtered");
  });

  // Email 116 of the coverage corpus: a forged purchase order that three of the
  // seven KAI-93 cells read as `support`, carrying its own verdict in a header
  // nobody was reading.
  it("outranks an urgent subject and an existing thread", () => {
    const result = preFilterEmail({
      ...BASE,
      subject: "URGENT: production order 15458",
      headers: { "X-Spam-Status": "Yes, score=11.8", "In-Reply-To": "<a@b>" },
    });
    expect(result.status).toBe("skip");
    expect(result.skip_reason).toBe("spam_filtered");
  });

  // A negative verdict and a missing header are different states, and neither
  // is a reason to drop the message.
  it("does not skip when the provider scanned and cleared it", () => {
    expect(
      preFilterEmail({ ...BASE, headers: { "X-Spam-Status": "No, score=-2.6" } }).status,
    ).toBe("relevant");
  });

  it("does not skip when the provider never scanned", () => {
    expect(preFilterEmail({ ...BASE, headers: {} }).status).toBe("relevant");
  });
});

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
// REMOVED in KAI-45 (routing policy 1.2.0). This block used to assert that any
// message carrying List-Unsubscribe was skipped. The header is not a marker of
// junk — RFC 8058 asks every sender of recurring mail to set it, and on the
// coverage corpus it fired on exactly two messages, a tender invitation and a
// supplier notice, both of which the ground truth gives a real type. Both were
// dropped before the classifier saw them.
//
// What the rule aimed at is still caught: marketing@ and newsletter@ senders by
// automated_sender, promotional bulk by the Gmail category rule, and
// `Precedence: bulk` by auto_generated.
describe("Rule: mailing_list — removed", () => {
  it("classifies a message carrying List-Unsubscribe instead of dropping it", () => {
    for (const key of ["List-Unsubscribe", "list-unsubscribe"]) {
      const result = preFilterEmail({
        ...BASE,
        headers: { [key]: "<https://example.com/unsub>" },
      });
      expect(result.status).toBe("relevant");
      // Kept as a fact, which is what it always should have been: the model can
      // weigh "this is recurring mail" without the pipeline deciding for it.
      expect(result.facts.hasListUnsubscribe).toBe(true);
    }
  });

  it("still reports the fact as absent when the header did not arrive", () => {
    const result = preFilterEmail({ ...BASE, headers: {} });
    expect(result.status).toBe("relevant");
    expect(result.facts.hasListUnsubscribe).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Rule 3: same-domain mail — REMOVED in KAI-45 F0b (routing policy 1.1.0)
//
// This block used to assert that mail from the tenant's own domain was skipped
// with skip_reason "outbound". The rule never detected outbound: this pipeline
// only reads an inbox, and real outbound is messages.direction='outbound'
// written by the reply flow. What it dropped was the company's own
// correspondence that arrived — and with it 5 of the 10 emails the KAI-93
// coverage corpus labels `internal`.
//
// The cases are kept, inverted, so the removal stays pinned: a future change
// that reintroduces the rule fails here rather than quietly re-emptying the
// class.
// ---------------------------------------------------------------------------
describe("Rule: same-domain mail is classified, not skipped", () => {
  it("classifies mail from a sibling mailbox of the tenant's company", () => {
    const result = preFilterEmail({
      ...BASE,
      from: "colleague@mycompany.com",
      userEmail: "support@mycompany.com",
    });
    expect(result.status).toBe("relevant");
  });

  it("classifies mail from a different domain, as before", () => {
    const result = preFilterEmail({
      ...BASE,
      from: "alice@otherdomain.com",
      userEmail: "support@mycompany.com",
    });
    expect(result.status).toBe("relevant");
  });

  it("classifies a copy of the tenant's own message", () => {
    const result = preFilterEmail({
      ...BASE,
      from: "Support <support@mycompany.com>",
      userEmail: "support@mycompany.com",
    });
    expect(result.status).toBe("relevant");
  });

  // The house's own robot is the house's correspondence. Three of the ten
  // `internal` emails in the coverage corpus are exactly this — the tenant's
  // notifier writing into the tenant's own inbox — and the ground truth gives
  // all three a type, so dropping them made them unreproducible. Narrowed in
  // routing policy 1.2.0; a no-reply@ from outside is still dropped.
  it("classifies an automated sender on the account's own domain", () => {
    const own = preFilterEmail({
      ...BASE,
      from: "noreply@mycompany.com",
      userEmail: "support@mycompany.com",
    });
    expect(own.status).toBe("relevant");
    expect(own.facts.isAutomatedSender).toBe(true);

    const stranger = preFilterEmail({
      ...BASE,
      from: "noreply@somewhere-else.com",
      userEmail: "support@mycompany.com",
    });
    expect(stranger.status).toBe("skip");
    expect(stranger.skip_reason).toBe("automated_sender");
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

  // Used to assert the opposite: the same-domain rule outranked every override,
  // so an urgent subject from a colleague was still dropped. Removed in F0b.
  it("same-domain sender + urgency keyword → classified", () => {
    const result = preFilterEmail({
      ...BASE,
      from: "colleague@mycompany.com",
      subject: "urgent: need help with production",
      userEmail: "support@mycompany.com",
    });
    expect(result.status).toBe("relevant");
    expect(result.relevance_signals).toContain("urgency_keyword");
  });
});

// ---------------------------------------------------------------------------
// Rule: automated_sender — no-reply variants (regression suite for KAI-206)
// ---------------------------------------------------------------------------
describe("Rule: automated_sender — no-reply regex variants", () => {
  const cases = [
    "no-reply@accounts.google.com",
    "no.reply@vendor.com",
    "no_reply@service.io",
    "noreply@someservice.com",
    "donotreply@example.com",
    "do-not-reply@company.com",
    "do_not_reply@platform.io",
    "mailer-daemon@google.com",
    "postmaster@mail.example.com",
    "bounce@amazonses.com",
    "bounces@email.example.com",
  ];

  for (const addr of cases) {
    it(`skips "${addr}"`, () => {
      const result = preFilterEmail({ ...BASE, from: addr });
      expect(result.status).toBe("skip");
      expect(result.skip_reason).toBe("automated_sender");
    });
  }

  it("skips display-name format with no-reply address", () => {
    const result = preFilterEmail({
      ...BASE,
      from: "Google <no-reply@accounts.google.com>",
    });
    expect(result.status).toBe("skip");
    expect(result.skip_reason).toBe("automated_sender");
  });

  it("skips address with prefix before noreply (e.g. bounce-noreply@)", () => {
    const result = preFilterEmail({
      ...BASE,
      from: "antigravity-noreply@google.com",
    });
    expect(result.status).toBe("skip");
    expect(result.skip_reason).toBe("automated_sender");
  });

  it("does NOT skip a real sender whose name contains 'no' and 'reply' separately", () => {
    // "knowreply" is not a no-reply address
    const result = preFilterEmail({ ...BASE, from: "knowreply@partner.com" });
    expect(result.status).toBe("relevant");
  });

  it("no-reply sender with In-Reply-To is still relevant (reply-chain override)", () => {
    const result = preFilterEmail({
      ...BASE,
      from: "no-reply@accounts.google.com",
      headers: { "In-Reply-To": "<thread-123@mail.example.com>" },
    });
    expect(result.status).toBe("relevant");
    expect(result.relevance_signals).toContain("in_reply_to");
  });

  it("no-reply sender with urgency keyword in subject is still relevant (urgency override)", () => {
    const result = preFilterEmail({
      ...BASE,
      from: "no-reply@alerts.myservice.com",
      subject: "CRITICAL: production database is down",
    });
    expect(result.status).toBe("relevant");
    expect(result.relevance_signals).toContain("urgency_keyword");
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
