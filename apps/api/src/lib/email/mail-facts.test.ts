// ---------------------------------------------------------------------------
// KAI-45 F0 — the envelope reader.
//
// routing-equivalence.test.ts pins the *decisions* against 90 real .eml, but it
// can only exercise the facts the inherited rules happen to read. The ones this
// module adds — spam verdict, authentication result, recipient count, tenant
// presence in To/Cc, thread depth from References — are not consulted by any
// rule yet: they exist so the classifier prompt can be told what the envelope
// says instead of being asked to guess it (KAI-45 E7). Untested, they would
// reach the model as quiet wrong answers.
//
// Follows the house pattern from pre-filter.test.ts: one typed BASE, spread per
// case, no filesystem and no network.
// ---------------------------------------------------------------------------

import { describe, it, expect } from "bun:test";

import { extractMailFacts, extractDomain, extractEmailAddress } from "./mail-facts";

const BASE: Parameters<typeof extractMailFacts>[0] = {
  from: "client@external.com",
  subject: "Hello",
  headers: {},
  gmailCategories: [],
  tenantMailbox: "support@mycompany.com",
};

const facts = (over: Partial<typeof BASE> = {}) => extractMailFacts({ ...BASE, ...over });

describe("address parsing", () => {
  it("reads the address out of a display-name header", () => {
    expect(extractEmailAddress('"Acme Logistics" <Servicio@Acme.com>')).toBe(
      "servicio@acme.com",
    );
  });

  it("reads a bare address", () => {
    expect(extractEmailAddress("ventas@asia-startrans.com")).toBe("ventas@asia-startrans.com");
  });

  it("does not carry a trailing separator into the domain", () => {
    expect(extractDomain("a@b.com,")).toBe("b.com");
    expect(extractDomain("no-domain-here")).toBe("");
  });
});

describe("tenant identity", () => {
  it("separates the tenant's own mailbox from a sibling mailbox of the same company", () => {
    const sibling = facts({ from: "operaciones@mycompany.com" });
    expect(sibling.senderIsTenantAddress).toBe(false);
    expect(sibling.senderIsTenantDomain).toBe(true);

    const self = facts({ from: "Support <support@mycompany.com>" });
    expect(self.senderIsTenantAddress).toBe(true);
    expect(self.senderIsTenantDomain).toBe(true);
  });

  // A public provider hands the same domain to millions of unrelated people, so
  // "same domain" carries no information and must not be reported as a fact.
  it("reports no domain match when the tenant inbox is on a public provider", () => {
    const f = facts({ from: "someone.else@gmail.com", tenantMailbox: "acme.support@gmail.com" });
    expect(f.tenantDomainIsPublic).toBe(true);
    expect(f.senderIsTenantDomain).toBe(false);
    expect(f.senderIsTenantAddress).toBe(false);
  });

  it("still matches the exact address on a public provider", () => {
    const f = facts({ from: "acme.support@gmail.com", tenantMailbox: "acme.support@gmail.com" });
    expect(f.senderIsTenantAddress).toBe(true);
  });

  it("claims no match when the sender has no parseable address", () => {
    const f = facts({ from: "undisclosed-recipients:;" });
    expect(f.senderDomain).toBe("");
    expect(f.senderIsTenantDomain).toBe(false);
    expect(f.senderIsTenantAddress).toBe(false);
  });
});

describe("recipients", () => {
  it("counts To and Cc together, deduplicated", () => {
    const f = facts({
      headers: {
        To: "a@x.com, b@x.com, a@x.com",
        Cc: '"Name" <c@y.com>',
      },
    });
    expect(f.recipientCount).toBe(3);
  });

  it("finds the tenant among the recipients regardless of case", () => {
    expect(facts({ headers: { To: "Support@MyCompany.com" } }).tenantInRecipients).toBe(true);
    expect(facts({ headers: { To: "someone@else.com" } }).tenantInRecipients).toBe(false);
  });

  // The 130.eml case in the coverage corpus: a Bcc blast where the tenant is
  // nowhere in To or Cc.
  it("reports zero recipients when neither header arrived", () => {
    const f = facts();
    expect(f.recipientCount).toBe(0);
    expect(f.tenantInRecipients).toBe(false);
  });
});

describe("provider spam verdict", () => {
  // 116.eml carries exactly this. On the coverage corpus the header separates
  // all ten spam emails from the other thirty with no error either way, while
  // the models asked the same question took up to 145 s to answer it worse.
  it("reads the verdict and the score", () => {
    const f = facts({ headers: { "X-Spam-Status": "Yes, score=11.8 required=5.0" } });
    expect(f.spamFiltered).toBe(true);
    expect(f.spamScore).toBe(11.8);
  });

  it("reads a negative verdict as false, not as absent", () => {
    const f = facts({ headers: { "X-Spam-Status": "No, score=-2.6" } });
    expect(f.spamFiltered).toBe(false);
    expect(f.spamScore).toBe(-2.6);
  });

  // "the provider says it is clean" and "the provider did not say" are different
  // states. Collapsing them is how a rule ends up trusting a header nobody fetched.
  it("is null when the header did not arrive", () => {
    expect(facts().spamFiltered).toBeNull();
    expect(facts().spamScore).toBeNull();
  });
});

describe("sender authentication", () => {
  it("reports a pass when every mechanism passed", () => {
    const f = facts({
      headers: { "Authentication-Results": "mx.google.com; spf=pass; dkim=pass; dmarc=pass" },
    });
    expect(f.authResult).toBe("pass");
  });

  // A forged sender that clears SPF but fails DMARC is still a sender nobody
  // confirmed, so any explicit failure wins.
  it("reports a failure even when another mechanism passed", () => {
    const f = facts({
      headers: { "Authentication-Results": "mx.google.com; spf=pass; dmarc=fail" },
    });
    expect(f.authResult).toBe("fail");
  });

  it("distinguishes a header with no verdict from no header at all", () => {
    expect(facts({ headers: { "Authentication-Results": "mx.google.com; none" } }).authResult).toBe("none");
    expect(facts().authResult).toBeNull();
  });
});

describe("automation and bulk", () => {
  it("matches no-reply local-part variants", () => {
    for (const from of ["noreply@x.com", "no-reply@x.com", "orders+noreply@x.com", "do_not_reply@x.com"]) {
      expect(facts({ from }).isAutomatedSender).toBe(true);
    }
    expect(facts({ from: "replies@x.com" }).isAutomatedSender).toBe(false);
  });

  // The three bulk signals stay separate because the inherited rules give each
  // its own stated skip_reason, and Auto-Submitted was never part of either.
  it("keeps the three bulk signals distinguishable", () => {
    const list = facts({ headers: { "List-Unsubscribe": "<mailto:x@y.com>" } });
    expect([list.hasListUnsubscribe, list.isAutoGenerated, list.isAutoSubmitted]).toEqual([true, false, false]);

    const auto = facts({ headers: { Precedence: "bulk" } });
    expect([auto.hasListUnsubscribe, auto.isAutoGenerated, auto.isAutoSubmitted]).toEqual([false, true, false]);

    const submitted = facts({ headers: { "Auto-Submitted": "auto-generated" } });
    expect([submitted.hasListUnsubscribe, submitted.isAutoGenerated, submitted.isAutoSubmitted]).toEqual([false, false, true]);
  });

  it("treats Auto-Submitted: no as a human message", () => {
    expect(facts({ headers: { "Auto-Submitted": "no" } }).isAutoSubmitted).toBe(false);
  });

  it("unions the three into isBulk", () => {
    expect(facts().isBulk).toBe(false);
    expect(facts({ headers: { Precedence: "list" } }).isBulk).toBe(true);
  });
});

describe("thread position", () => {
  it("counts the ids in References", () => {
    const f = facts({ headers: { References: "<a@x> <b@x>  <c@x>", "In-Reply-To": "<c@x>" } });
    expect(f.referencesCount).toBe(3);
    expect(f.isReply).toBe(true);
  });

  it("opens a thread when neither header is present", () => {
    expect(facts().referencesCount).toBe(0);
    expect(facts().isReply).toBe(false);
  });
});

describe("header lookup", () => {
  // headersToRecord preserves the sender's original casing, so every read here
  // has to be case-insensitive or a fact silently goes missing.
  it("is case-insensitive on the header name", () => {
    expect(facts({ headers: { "x-spam-status": "Yes" } }).spamFiltered).toBe(true);
    expect(facts({ headers: { "X-SPAM-STATUS": "Yes" } }).spamFiltered).toBe(true);
  });
});

describe("Gmail category", () => {
  it("reads the first CATEGORY_ label", () => {
    expect(facts({ gmailCategories: ["CATEGORY_PROMOTIONS"] }).gmailCategory).toBe("PROMOTIONS");
    expect(facts({ gmailCategories: [] }).gmailCategory).toBeNull();
  });
});

describe("content heuristics inherited from the pre-filter", () => {
  it("matches the English urgency vocabulary", () => {
    expect(facts({ subject: "URGENT: package missing" }).hasUrgencyKeyword).toBe(true);
  });

  // KAI-45 E11: the list is English-only while the pilot runs in Spanish. Two of
  // the eight words survive the language change, and neither by design —
  // "error" happens to be spelled the same, and "urgente" matches only because
  // the test is a substring one, so "urgent" is found inside it.
  it("matches the two Spanish subjects it does by accident, not by design", () => {
    expect(facts({ subject: "URGENTE: falta un paquete" }).hasUrgencyKeyword).toBe(true);
    expect(facts({ subject: "Error al ingresar" }).hasUrgencyKeyword).toBe(true);
  });

  // The other six have no Spanish coverage at all, so the override this list
  // feeds does not fire on most of the corpus it serves. Pinned as a fact, not
  // endorsed: fixing the vocabulary is a policy change with its own
  // measurement, and this is what will flag the day it happens.
  it("misses the Spanish for help, down, broken and critical", () => {
    for (const subject of [
      "Necesito ayuda",
      "El servicio está caído",
      "El sello viene roto",
      "Caso crítico sin resolver",
    ]) {
      expect(facts({ subject }).hasUrgencyKeyword).toBe(false);
    }
  });

  // The same substring test that rescues "urgente" also fires on words that
  // carry no urgency whatever — the signal is noisy in both directions.
  it("fires on unrelated words that happen to contain a keyword", () => {
    expect(facts({ subject: "Reunión en downtown Bogotá" }).hasUrgencyKeyword).toBe(true);
    expect(facts({ subject: "Helpdesk ticket #42" }).hasUrgencyKeyword).toBe(true);
  });

  it("recognises system subject prefixes and calendar invites", () => {
    expect(facts({ subject: "Accepted: Weekly sync" }).hasSystemSubjectPrefix).toBe(true);
    expect(facts({ mimeType: "text/calendar" }).isCalendarInvite).toBe(true);
  });
});
