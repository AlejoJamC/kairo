import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";

// ---------------------------------------------------------------------------
// KAI-202 — dispatchOnboardingClassification unit tests
//
// We mock the `inngest` SDK and the `@/env` module so the helper can be
// tested in isolation, no network, no env validation.
// ---------------------------------------------------------------------------

const sendMock = mock(async (_payload: unknown) => undefined);

mock.module("inngest", () => ({
  Inngest: class {
    send = sendMock;
  },
}));

const envState: {
  INNGEST_EVENT_KEY: string | undefined;
  DISABLE_ONBOARDING_PIPELINE_DISPATCH: string | undefined;
} = {
  INNGEST_EVENT_KEY: "test-key",
  DISABLE_ONBOARDING_PIPELINE_DISPATCH: undefined,
};

mock.module("@/env", () => ({
  env: new Proxy({} as Record<string, unknown>, {
    get: (_t, k: string) => envState[k as keyof typeof envState],
  }),
}));

const { dispatchOnboardingClassification } = await import("./inngest");

const originalNodeEnv = process.env.NODE_ENV;
const originalInngestDev = process.env.INNGEST_DEV;

const errors: string[] = [];
const originalErr = console.error;

beforeEach(() => {
  sendMock.mockClear();
  errors.length = 0;
  console.error = (msg?: unknown) => {
    errors.push(String(msg));
  };
  envState.INNGEST_EVENT_KEY = "test-key";
  envState.DISABLE_ONBOARDING_PIPELINE_DISPATCH = undefined;
});

afterEach(() => {
  console.error = originalErr;
  process.env.NODE_ENV = originalNodeEnv;
  if (originalInngestDev === undefined) delete process.env.INNGEST_DEV;
  else process.env.INNGEST_DEV = originalInngestDev;
});

const SECRET_TOKEN = "ya29.SECRET-GMAIL-TOKEN-DO-NOT-LOG";

describe("dispatchOnboardingClassification — success path", () => {
  it("dispatches a tier1 event with the expected shape", async () => {
    const outcome = await dispatchOnboardingClassification({
      userId: "user-1",
      accountId: "acc-1",
      gmailAccessToken: SECRET_TOKEN,
    });

    expect(outcome).toBe("dispatched");
    expect(sendMock).toHaveBeenCalledTimes(1);

    const payload = sendMock.mock.calls[0]?.[0] as {
      id: string;
      name: string;
      data: {
        userId: string;
        gmailAccessToken: string;
        accountId: string | null;
        since: string;
        source: string;
      };
    };

    expect(payload.name).toBe("pipeline/tier1.triggered");
    expect(payload.data.userId).toBe("user-1");
    expect(payload.data.accountId).toBe("acc-1");
    expect(payload.data.gmailAccessToken).toBe(SECRET_TOKEN);
    expect(payload.data.source).toBe("oauth-callback");
    expect(typeof payload.data.since).toBe("string");
    expect(payload.id.startsWith("tier1-onboard:user-1:")).toBe(true);
  });

  it("uses a stable idempotency key per (user, day) — same key for repeated calls", async () => {
    await dispatchOnboardingClassification({
      userId: "user-2",
      accountId: "acc-2",
      gmailAccessToken: SECRET_TOKEN,
    });
    await dispatchOnboardingClassification({
      userId: "user-2",
      accountId: "acc-2",
      gmailAccessToken: SECRET_TOKEN,
    });

    expect(sendMock).toHaveBeenCalledTimes(2);
    const first = sendMock.mock.calls[0]?.[0] as { id: string };
    const second = sendMock.mock.calls[1]?.[0] as { id: string };
    // Same id → Inngest deduplicates server-side
    expect(first.id).toBe(second.id);
  });
});

describe("dispatchOnboardingClassification — kill switch & config", () => {
  it("returns 'disabled' and does not call send when kill-switch is true", async () => {
    envState.DISABLE_ONBOARDING_PIPELINE_DISPATCH = "true";

    const outcome = await dispatchOnboardingClassification({
      userId: "user-3",
      accountId: "acc-3",
      gmailAccessToken: SECRET_TOKEN,
    });

    expect(outcome).toBe("disabled");
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("returns 'missing-config' when INNGEST_EVENT_KEY is unset in production", async () => {
    envState.INNGEST_EVENT_KEY = undefined;
    process.env.NODE_ENV = "production";
    delete process.env.INNGEST_DEV;

    const outcome = await dispatchOnboardingClassification({
      userId: "user-4",
      accountId: "acc-4",
      gmailAccessToken: SECRET_TOKEN,
    });

    expect(outcome).toBe("missing-config");
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("dispatches in local dev even without INNGEST_EVENT_KEY (Inngest dev server)", async () => {
    envState.INNGEST_EVENT_KEY = undefined;
    process.env.NODE_ENV = "development";

    const outcome = await dispatchOnboardingClassification({
      userId: "user-4b",
      accountId: "acc-4b",
      gmailAccessToken: SECRET_TOKEN,
    });

    expect(outcome).toBe("dispatched");
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it("dispatches when INNGEST_DEV=1 even if NODE_ENV=production (e.g. preview env)", async () => {
    envState.INNGEST_EVENT_KEY = undefined;
    process.env.NODE_ENV = "production";
    process.env.INNGEST_DEV = "1";

    const outcome = await dispatchOnboardingClassification({
      userId: "user-4c",
      accountId: "acc-4c",
      gmailAccessToken: SECRET_TOKEN,
    });

    expect(outcome).toBe("dispatched");
  });
});

describe("dispatchOnboardingClassification — failure isolation", () => {
  it("returns 'send-failed' when Inngest throws and never re-throws", async () => {
    sendMock.mockImplementationOnce(async () => {
      throw new Error("inngest down");
    });

    const outcome = await dispatchOnboardingClassification({
      userId: "user-5",
      accountId: "acc-5",
      gmailAccessToken: SECRET_TOKEN,
    });

    expect(outcome).toBe("send-failed");
    // Error WAS logged
    expect(errors.length).toBeGreaterThan(0);
  });

  it("never writes the access token to logs on failure", async () => {
    sendMock.mockImplementationOnce(async () => {
      throw new Error("inngest down");
    });

    await dispatchOnboardingClassification({
      userId: "user-6",
      accountId: "acc-6",
      gmailAccessToken: SECRET_TOKEN,
    });

    for (const line of errors) {
      expect(line.includes(SECRET_TOKEN)).toBe(false);
    }
  });
});
