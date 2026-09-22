import { describe, it, expect } from "bun:test";
import { DERIVATION_VERSION } from "@kairo/intelligence";

import { classificationAudit, feedbackAudit, routingAudit } from "./classification-audit";
import { extractMailFacts } from "./email/mail-facts";
import { ROUTING_POLICY_VERSION } from "./email/routing-policy";

const facts = extractMailFacts({
  from: "client@outside.com",
  subject: "Hello",
  headers: { "X-Spam-Status": "No, score=-1.0" },
  tenantMailbox: "support@acme.com",
});

const verdict = {
  actionability: "needs_action" as const,
  subject_matter: "service" as const,
  priority: "P2" as const,
  category: "general" as const,
  tone: "neutral" as const,
  urgency: "medium" as const,
  reasoning: "r",
  confidence: 0.8,
};

describe("routingAudit", () => {
  it("records the facts and the policy that read them", () => {
    expect(routingAudit(facts)).toEqual({
      mail_facts: facts,
      routing_policy_version: ROUTING_POLICY_VERSION,
    });
  });
});

describe("classificationAudit", () => {
  it("records the axes, the table and the rubric behind a stored type", () => {
    const audit = classificationAudit({ verdict, ensemble: null, abstain: false, promptVersion: "1.5.1" });

    expect(audit.derivation_version).toBe(DERIVATION_VERSION);
    expect(audit.prompt_version).toBe("1.5.1");
    expect(audit.abstain).toBe(false);
    expect(audit.model_verdict).toEqual({ ...verdict, ensemble: null });
  });

  // The second answer is only meaningful next to the first, so it travels
  // inside the verdict; the part anyone filters on is its own column.
  it("keeps the ensemble's answer beside the primary's", () => {
    const audit = classificationAudit({
      verdict,
      ensemble: { model: "second", type: "other" },
      abstain: true,
      promptVersion: "1.5.1",
    });

    expect(audit.model_verdict.ensemble).toEqual({ model: "second", type: "other" });
    expect(audit.abstain).toBe(true);
  });
});

describe("feedbackAudit", () => {
  it("copies what produced the corrected classification", () => {
    const stored = classificationAudit({ verdict, ensemble: null, abstain: false, promptVersion: "1.5.1" });

    const snapshot = feedbackAudit({
      ticket: stored,
      originMessage: routingAudit(facts),
    });

    expect(snapshot).toEqual({
      ai_model_verdict: stored.model_verdict,
      ai_derivation_version: DERIVATION_VERSION,
      ai_prompt_version: "1.5.1",
      ai_mail_facts: facts,
      ai_routing_policy_version: ROUTING_POLICY_VERSION,
    });
  });

  // A ticket classified before the audit columns existed, or one with no origin
  // message, has nothing to copy. Nulls are the truth about it; a guessed
  // version would poison the dataset this table exists to build.
  it("yields nulls where there is nothing to copy, and never a guess", () => {
    expect(
      feedbackAudit({
        ticket: { model_verdict: null, derivation_version: null, prompt_version: null },
        originMessage: null,
      }),
    ).toEqual({
      ai_model_verdict: null,
      ai_derivation_version: null,
      ai_prompt_version: null,
      ai_mail_facts: null,
      ai_routing_policy_version: null,
    });
  });
});
