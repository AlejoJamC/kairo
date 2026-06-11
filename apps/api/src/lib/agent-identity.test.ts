import { describe, it, expect, mock, beforeEach } from "bun:test";

// ---------------------------------------------------------------------------
// KAI-247: resolveAgentIdentity tests
// AC: agent_name -> profiles.name, falling back to profiles.email, falling
// back to the tenant mailbox; agent_role is a constant; agent_initials is
// derived from agent_name.
// ---------------------------------------------------------------------------

let profileRow: Record<string, unknown> | null = null;

const maybeSingleMock = mock(() => Promise.resolve({ data: profileRow, error: null }));
const eqMock = mock(() => ({ maybeSingle: maybeSingleMock }));
const selectMock = mock(() => ({ eq: eqMock }));
const fromMock = mock(() => ({ select: selectMock }));

const client = { from: fromMock } as unknown as Parameters<typeof resolveAgentIdentity>[0];

const { resolveAgentIdentity } = await import("./agent-identity.js");

describe("resolveAgentIdentity", () => {
  beforeEach(() => {
    profileRow = null;
    maybeSingleMock.mockClear();
    eqMock.mockClear();
    selectMock.mockClear();
    fromMock.mockClear();
  });

  it("uses profiles.name when set", async () => {
    profileRow = { name: "Bea Castro", email: "bea@acme.com" };

    const identity = await resolveAgentIdentity(client, "user-1", "support@acme.com");

    expect(identity.agent_name).toBe("Bea Castro");
    expect(identity.agent_role).toBe("Equipo de Soporte");
    expect(identity.agent_initials).toBe("BC");
    expect(fromMock).toHaveBeenCalledWith("profiles");
  });

  it("falls back to profiles.email when name is null", async () => {
    profileRow = { name: null, email: "bea@acme.com" };

    const identity = await resolveAgentIdentity(client, "user-1", "support@acme.com");

    expect(identity.agent_name).toBe("bea@acme.com");
  });

  it("falls back to the tenant mailbox when no profile row exists", async () => {
    profileRow = null;

    const identity = await resolveAgentIdentity(client, "user-1", "support@acme.com");

    expect(identity.agent_name).toBe("support@acme.com");
  });

  it("derives 2-char initials from a single-word name", async () => {
    profileRow = { name: "Bea", email: "bea@acme.com" };

    const identity = await resolveAgentIdentity(client, "user-1", "support@acme.com");

    expect(identity.agent_initials).toBe("BE");
  });
});
