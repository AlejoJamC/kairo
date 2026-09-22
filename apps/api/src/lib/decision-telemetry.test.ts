import { describe, it, expect } from "bun:test";

import {
  classifierContextAttributes,
  correctionAttributes,
  proposalStatusAttributes,
  routeAttributes,
} from "./decision-telemetry";
import { extractMailFacts } from "./email/mail-facts";
import { ROUTING_POLICY_VERSION, resolveRoute } from "./email/routing-policy";

const facts = extractMailFacts({
  from: "Client <client@outside.com>",
  subject: "Hello",
  headers: { "X-Spam-Status": "No, score=-1.0", To: "support@acme.com" },
  tenantMailbox: "support@acme.com",
});

describe("routeAttributes", () => {
  it("records the decision, the policy and the facts it read", () => {
    const attrs = routeAttributes(facts, resolveRoute(facts));

    expect(attrs["kairo.routing.policy_version"]).toBe(ROUTING_POLICY_VERSION);
    expect(attrs["kairo.routing.route"]).toBe("classify");
    expect(attrs["kairo.mail.provenance"]).toBe("external");
    expect(attrs["kairo.mail.spam_filtered"]).toBe(false);
    expect(attrs["kairo.mail.tenant_in_recipients"]).toBe(true);
    expect(attrs).not.toHaveProperty("kairo.routing.skip_reason");
  });

  it("records why a message was kept out of the queue", () => {
    const spam = extractMailFacts({
      from: "x@outside.com",
      subject: "Win",
      headers: { "X-Spam-Status": "Yes, score=11.8" },
      tenantMailbox: "support@acme.com",
    });
    const attrs = routeAttributes(spam, resolveRoute(spam));

    expect(attrs["kairo.routing.route"]).toBe("skip");
    expect(attrs["kairo.routing.skip_reason"]).toBe("spam_filtered");
  });

  // A provider that gave no spam verdict did not say the message is clean.
  it("leaves out a verdict the provider never gave", () => {
    const bare = extractMailFacts({
      from: "x@outside.com",
      subject: "Hi",
      headers: {},
      tenantMailbox: "support@acme.com",
    });

    expect(routeAttributes(bare, resolveRoute(bare))).not.toHaveProperty("kairo.mail.spam_filtered");
  });

  // Attributes are indexed and kept; an address or a domain there is a tenant
  // identifier in a store nobody reviews.
  it("carries no address and no domain", () => {
    const values = Object.values(routeAttributes(facts, resolveRoute(facts))).flat().map(String);

    for (const v of values) {
      expect(v).not.toContain("@");
      expect(v).not.toContain("outside.com");
      expect(v).not.toContain("acme.com");
    }
  });
});

describe("classifierContextAttributes", () => {
  it("records what the classifier is handed, not the mailboxes themselves", () => {
    const attrs = classifierContextAttributes("backfill", "acc-1", {
      tenantMailbox: "support@acme.com",
      tenantMailboxes: ["support@acme.com", "sales@acme.com"],
      language: "en",
      businessContext: "Acme sells anvils.",
    });

    expect(attrs).toEqual({
      "kairo.account_id": "acc-1",
      "kairo.classifier.stage": "backfill",
      "kairo.classifier.language": "en",
      "kairo.classifier.mailbox_count": 2,
      "kairo.classifier.has_business_context": true,
    });
  });
});

describe("proposalStatusAttributes", () => {
  it("records the status and the rule that decided it", () => {
    expect(
      proposalStatusAttributes({ stage: "onboarding", type: "support", status: "pending", reason: "abstain" }),
    ).toEqual({
      "kairo.proposal.stage": "onboarding",
      "kairo.proposal.type": "support",
      "kairo.proposal.status": "pending",
      "kairo.proposal.reason": "abstain",
    });
  });
});

describe("correctionAttributes", () => {
  it("records the change and the versions that produced the corrected type", () => {
    expect(
      correctionAttributes({
        ticketId: "t-1",
        accountId: "acc-1",
        from: "support",
        to: "prospect",
        derivationVersion: "1.1.0",
        promptVersion: "1.5.1",
        routingPolicyVersion: null,
      }),
    ).toEqual({
      "kairo.ticket_id": "t-1",
      "kairo.account_id": "acc-1",
      "kairo.correction.from_type": "support",
      "kairo.correction.to_type": "prospect",
      "kairo.correction.derivation_version": "1.1.0",
      "kairo.correction.prompt_version": "1.5.1",
    });
  });
});
