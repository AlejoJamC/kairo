import { describe, it, expect } from "bun:test";
import { z } from "zod";

// ---------------------------------------------------------------------------
// KAI-171: Invitation flow — schema and business rule unit tests
// (No Supabase dependency — pure logic only)
// ---------------------------------------------------------------------------

const CreateInvitationSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "supervisor", "agent"]),
});

describe("CreateInvitationSchema — role guard", () => {
  it("accepts admin", () => {
    expect(CreateInvitationSchema.safeParse({ email: "a@b.com", role: "admin" }).success).toBe(true);
  });

  it("accepts supervisor", () => {
    expect(CreateInvitationSchema.safeParse({ email: "a@b.com", role: "supervisor" }).success).toBe(true);
  });

  it("accepts agent", () => {
    expect(CreateInvitationSchema.safeParse({ email: "a@b.com", role: "agent" }).success).toBe(true);
  });

  it("rejects owner — owner is never assignable via invitation", () => {
    expect(CreateInvitationSchema.safeParse({ email: "a@b.com", role: "owner" }).success).toBe(false);
  });

  it("rejects unknown role", () => {
    expect(CreateInvitationSchema.safeParse({ email: "a@b.com", role: "superuser" }).success).toBe(false);
  });

  it("rejects invalid email", () => {
    expect(CreateInvitationSchema.safeParse({ email: "not-an-email", role: "agent" }).success).toBe(false);
  });

  it("rejects missing role", () => {
    expect(CreateInvitationSchema.safeParse({ email: "a@b.com" }).success).toBe(false);
  });
});

describe("Seat limit logic", () => {
  function isSeatAvailable(seatLimit: number, activeCount: number, pendingCount: number) {
    return activeCount + pendingCount < seatLimit;
  }

  it("allows invite when under limit", () => {
    expect(isSeatAvailable(5, 2, 1)).toBe(true);
  });

  it("blocks invite when active+pending equals limit", () => {
    expect(isSeatAvailable(5, 3, 2)).toBe(false);
  });

  it("blocks invite when over limit", () => {
    expect(isSeatAvailable(5, 5, 0)).toBe(false);
  });

  it("pending invitations count against seat limit", () => {
    // A seat is reserved as soon as the invitation is sent,
    // not only when the user accepts.
    expect(isSeatAvailable(3, 1, 2)).toBe(false);
  });
});

describe("Token expiry logic", () => {
  function isExpired(expiresAt: string) {
    return new Date(expiresAt) <= new Date();
  }

  it("future date is not expired", () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    expect(isExpired(future)).toBe(false);
  });

  it("past date is expired", () => {
    const past = new Date(Date.now() - 1000).toISOString();
    expect(isExpired(past)).toBe(true);
  });
});
