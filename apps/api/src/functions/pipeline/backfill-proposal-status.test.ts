import { describe, it, expect } from "bun:test";
import { TICKET_TYPE } from "@kairo/intelligence";
import { backfillProposalStatus } from "./backfill-proposal-status";

const WITH_CONTEXT = "Acme Logistics moves medicine for pharmacy chains.";

describe("backfillProposalStatus", () => {
  // The standing rule: a classification made without knowing what the company
  // does is not trusted, whatever the class and whatever the account earned.
  it("holds everything when there is no business context", () => {
    for (const type of TICKET_TYPE) {
      expect(backfillProposalStatus({ type, autoApprovalEnabled: true })).toBe("pending");
      expect(backfillProposalStatus({ type, businessContext: "", autoApprovalEnabled: true }))
        .toBe("pending");
    }
  });

  it("lets a class through once the account has earned it", () => {
    expect(backfillProposalStatus({
      type: "support", businessContext: WITH_CONTEXT, autoApprovalEnabled: true,
    })).toBe("auto_approved");
  });

  it("holds a class that has not earned it, context or no context", () => {
    expect(backfillProposalStatus({
      type: "support", businessContext: WITH_CONTEXT, autoApprovalEnabled: false,
    })).toBe("pending");
  });

  // KAI-45 F3 — ahead of both gates. An earned permission is a statement about
  // a class on average; two models disagreeing is a statement about this email.
  it("holds a disputed classification even where the class has earned it", () => {
    for (const type of TICKET_TYPE) {
      expect(backfillProposalStatus({
        type, businessContext: WITH_CONTEXT, autoApprovalEnabled: true, abstain: true,
      })).toBe("pending");
    }
  });

  it("treats an absent ensemble as agreement", () => {
    expect(backfillProposalStatus({
      type: "support", businessContext: WITH_CONTEXT, autoApprovalEnabled: true, abstain: false,
    })).toBe("auto_approved");
  });

  // Tier 1 names `support` because a human is watching it. These tiers run with
  // nobody there, so no class is privileged in the code — the permission is
  // measured per account and per class.
  it("privileges no class of its own", () => {
    for (const type of TICKET_TYPE) {
      expect(backfillProposalStatus({ type, businessContext: WITH_CONTEXT, autoApprovalEnabled: true }))
        .toBe("auto_approved");
      expect(backfillProposalStatus({ type, businessContext: WITH_CONTEXT, autoApprovalEnabled: false }))
        .toBe("pending");
    }
  });
});
