import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — must come before importing the module under test
// ---------------------------------------------------------------------------

const rpcMock = vi.fn();
const createClientMock = vi.fn(() => ({
  rpc: rpcMock,
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => createClientMock(),
}));

vi.mock("@kairo/identity", () => ({
  normalizeEmail: (raw: string | null) => {
    if (!raw) return null;
    const lower = raw.toLowerCase().trim();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lower)) return lower;
    return null;
  },
  normalizePhone: (raw: string | null, _country: string) => { // eslint-disable-line @typescript-eslint/no-unused-vars
    if (!raw) return null;
    // Simplified mock: accept numbers starting with + or digits, return e164-like
    const cleaned = raw.replace(/[\s\-().]/g, "");
    if (/^\+?\d{7,15}$/.test(cleaned)) {
      return { e164: cleaned.startsWith("+") ? cleaned : `+${cleaned}`, extension: null };
    }
    return null;
  },
}));

// ---------------------------------------------------------------------------
// Imports — after mocks
// ---------------------------------------------------------------------------

import {
  confirmDraft,
  rejectDraft,
  unrejectDraft,
  editDraft,
  bulkConfirmByOrganization,
} from "@/lib/draft-actions";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockRpcSuccess(data: unknown) {
  rpcMock.mockResolvedValue({ data, error: null });
}

function mockRpcError(code: string, message: string) {
  rpcMock.mockResolvedValue({ data: null, error: { code, message } });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("confirmDraft", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("calls confirm_draft_contact RPC with the correct draft id", async () => {
    mockRpcSuccess({ id: "draft-1", status: "confirmed" });
    await confirmDraft("draft-1", null);
    expect(rpcMock).toHaveBeenCalledWith("confirm_draft_contact", { p_draft_id: "draft-1" });
  });

  it("returns the updated draft row", async () => {
    const row = { id: "draft-1", status: "confirmed" };
    mockRpcSuccess(row);
    const result = await confirmDraft("draft-1", null);
    expect(result).toEqual(row);
  });

  it("throws when the RPC returns an error", async () => {
    mockRpcError("invalid_parameter_value", "invalid_state: draft is not proposed");
    await expect(confirmDraft("draft-1", null)).rejects.toThrow("invalid_state: draft is not proposed");
  });
});

describe("rejectDraft", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("calls reject_draft_contact RPC with the correct draft id", async () => {
    mockRpcSuccess({ id: "draft-1", status: "rejected" });
    await rejectDraft("draft-1");
    expect(rpcMock).toHaveBeenCalledWith("reject_draft_contact", { p_draft_id: "draft-1" });
  });

  it("throws when the RPC returns an error", async () => {
    mockRpcError("invalid_parameter_value", "invalid_state");
    await expect(rejectDraft("draft-1")).rejects.toThrow("invalid_state");
  });
});

describe("unrejectDraft", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("calls unreject_draft_contact RPC with the correct draft id", async () => {
    mockRpcSuccess({ id: "draft-1", status: "proposed" });
    await unrejectDraft("draft-1");
    expect(rpcMock).toHaveBeenCalledWith("unreject_draft_contact", { p_draft_id: "draft-1" });
  });
});

describe("editDraft", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("calls edit_draft_contact RPC with the correct draft id and patch", async () => {
    mockRpcSuccess({ id: "draft-1", status: "proposed" });
    await editDraft("draft-1", { email: "user@example.com" });
    expect(rpcMock).toHaveBeenCalledWith(
      "edit_draft_contact",
      expect.objectContaining({ p_draft_id: "draft-1" }),
    );
  });

  it("normalizes email to lowercase before calling the RPC", async () => {
    mockRpcSuccess({ id: "draft-1" });
    await editDraft("draft-1", { email: "User@EXAMPLE.COM" });
    const [, args] = rpcMock.mock.calls[0];
    expect(args.p_patch.email).toBe("user@example.com");
  });

  it("normalizes phone to e164 before calling the RPC", async () => {
    mockRpcSuccess({ id: "draft-1" });
    await editDraft("draft-1", { phone: "3001234567" });
    const [, args] = rpcMock.mock.calls[0];
    expect(args.p_patch.phone).toMatch(/^\+/);
  });

  it("throws invalid_email_format when email cannot be normalized", async () => {
    await expect(
      editDraft("draft-1", { email: "not-an-email" }),
    ).rejects.toThrow("invalid_email_format");
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("throws invalid_phone_format when phone cannot be normalized", async () => {
    await expect(
      editDraft("draft-1", { phone: "abc" }),
    ).rejects.toThrow("invalid_phone_format");
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("re-throws duplicate-key error as code=merge_candidate", async () => {
    mockRpcError("23505", "duplicate key value violates unique constraint");
    const err = await editDraft("draft-1", { email: "user@example.com" }).catch((e) => e);
    expect(err.message).toBe("merge_candidate");
    expect(err.code).toBe("merge_candidate");
  });

  it("re-throws generic RPC errors as plain Error", async () => {
    mockRpcError("invalid_parameter_value", "insufficient_privilege");
    await expect(editDraft("draft-1", { email: "user@example.com" })).rejects.toThrow("insufficient_privilege");
  });
});

describe("bulkConfirmByOrganization", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("calls bulk_confirm_drafts_by_organization RPC with the organization", async () => {
    mockRpcSuccess(3);
    await bulkConfirmByOrganization("Acme Corp");
    expect(rpcMock).toHaveBeenCalledWith("bulk_confirm_drafts_by_organization", { p_organization: "Acme Corp" });
  });

  it("returns the count of confirmed drafts", async () => {
    mockRpcSuccess(5);
    const count = await bulkConfirmByOrganization("Acme Corp");
    expect(count).toBe(5);
  });

  it("throws when the RPC returns an error", async () => {
    mockRpcError("insufficient_privilege", "forbidden: no active account");
    await expect(bulkConfirmByOrganization("Acme Corp")).rejects.toThrow("forbidden: no active account");
  });
});
