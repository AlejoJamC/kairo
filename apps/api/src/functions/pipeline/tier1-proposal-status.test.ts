import { describe, it, expect } from "bun:test";
import { TICKET_TYPE } from "@kairo/intelligence";
import { tier1ProposalStatus } from "./tier1-proposal-status";

describe("tier1ProposalStatus", () => {
  it("lets a `support` classification stand on its own", () => {
    expect(tier1ProposalStatus("support")).toBe("auto_approved");
  });

  // Keeping an email OUT of the queue is the call the bench measured at
  // 32-83%, and the one whose error buries a real customer request.
  it("holds every call to keep an email out of the queue", () => {
    for (const type of TICKET_TYPE) {
      if (type === "support") continue;
      expect(tier1ProposalStatus(type)).toBe("pending");
    }
  });

  // A new class added to the contract must not be auto-approved by default:
  // nothing has measured it yet.
  it("defaults a class it has never seen to pending", () => {
    expect(tier1ProposalStatus("prospect")).toBe("pending");
    expect(tier1ProposalStatus("other")).toBe("pending");
  });
});
