import { describe, it, expect, mock, afterEach } from "bun:test";
import type { classifyEmailWithJev, DecisionProvider, EmailMessage } from "@kairo/intelligence";
import { isJevCanaryTenant, jevCanaryUpgrade, jevCanaryUpgradeTier1 } from "./jev-canary.js";

const message: EmailMessage = { subject: "Cannot log in", body: "help", from: "client@outside.com" };

function fakeProvider(): DecisionProvider {
  return {
    provider: "jev",
    model: "jev-latest",
    decide: mock(async () => ({ value: {}, confidence: null, provider: "jev", modelVersion: "jev-latest", latencyMs: 5 })) as DecisionProvider["decide"],
  };
}

function fakeClassify(answers: { type: string; actionabilityConf: number; subjectMatterConf: number }) {
  return mock(async () => ({
    result: { type: answers.type },
    verdict: {},
    decision: {
      value: {
        actionability: { confidence: answers.actionabilityConf },
        subject_matter: { confidence: answers.subjectMatterConf },
      },
      confidence: null,
      provider: "jev",
      modelVersion: "jev-latest",
      latencyMs: 5,
    },
  })) as unknown as typeof classifyEmailWithJev;
}

describe("jevCanaryUpgrade (backfill — requires earned account trust)", () => {
  it("upgrades when JEV agrees, is confident, and the account earned auto-approval", async () => {
    const upgraded = await jevCanaryUpgrade(
      { accountId: "acct-1", message, primaryType: "support", autoApprovalEnabled: true, hasBusinessContext: true },
      { createProvider: fakeProvider, classify: fakeClassify({ type: "support", actionabilityConf: 0.9, subjectMatterConf: 0.85 }) },
    );
    expect(upgraded).toBe(true);
  });

  it("never upgrades when JEV disagrees with the primary type", async () => {
    const upgraded = await jevCanaryUpgrade(
      { accountId: "acct-1", message, primaryType: "support", autoApprovalEnabled: true, hasBusinessContext: true },
      { createProvider: fakeProvider, classify: fakeClassify({ type: "internal", actionabilityConf: 0.99, subjectMatterConf: 0.99 }) },
    );
    expect(upgraded).toBe(false);
  });

  it("never upgrades when JEV's confidence is below the authorization threshold", async () => {
    const upgraded = await jevCanaryUpgrade(
      { accountId: "acct-1", message, primaryType: "support", autoApprovalEnabled: true, hasBusinessContext: true },
      { createProvider: fakeProvider, classify: fakeClassify({ type: "support", actionabilityConf: 0.9, subjectMatterConf: 0.4 }) },
    );
    expect(upgraded).toBe(false);
  });

  it("never upgrades a type the account has not earned, even at perfect JEV confidence — a fresh account with zero review history included", async () => {
    const upgraded = await jevCanaryUpgrade(
      { accountId: "acct-1", message, primaryType: "support", autoApprovalEnabled: false, hasBusinessContext: true },
      { createProvider: fakeProvider, classify: fakeClassify({ type: "support", actionabilityConf: 1, subjectMatterConf: 1 }) },
    );
    expect(upgraded).toBe(false);
  });

  it("fails closed — a thrown provider error never upgrades and never throws", async () => {
    const throwingClassify = mock(async () => {
      throw new Error("TYPESAFE_API_KEY required to use the jev decision provider");
    }) as unknown as typeof classifyEmailWithJev;

    const upgraded = await jevCanaryUpgrade(
      { accountId: "acct-1", message, primaryType: "support", autoApprovalEnabled: true, hasBusinessContext: true },
      { createProvider: fakeProvider, classify: throwingClassify },
    );
    expect(upgraded).toBe(false);
  });
});

describe("jevCanaryUpgradeTier1 (onboarding — no earned-history requirement)", () => {
  it("upgrades on agreement and confidence alone, with no auto-approval history at all — a freshly created account's very first message", async () => {
    const upgraded = await jevCanaryUpgradeTier1(
      { accountId: "acct-1", message, primaryType: "internal" },
      { createProvider: fakeProvider, classify: fakeClassify({ type: "internal", actionabilityConf: 0.9, subjectMatterConf: 0.8 }) },
    );
    expect(upgraded).toBe(true);
  });

  it("never upgrades on disagreement", async () => {
    const upgraded = await jevCanaryUpgradeTier1(
      { accountId: "acct-1", message, primaryType: "support" },
      { createProvider: fakeProvider, classify: fakeClassify({ type: "internal", actionabilityConf: 0.99, subjectMatterConf: 0.99 }) },
    );
    expect(upgraded).toBe(false);
  });

  it("never upgrades below the default confidence threshold", async () => {
    const upgraded = await jevCanaryUpgradeTier1(
      { accountId: "acct-1", message, primaryType: "support" },
      { createProvider: fakeProvider, classify: fakeClassify({ type: "support", actionabilityConf: 0.9, subjectMatterConf: 0.5 }) },
    );
    expect(upgraded).toBe(false);
  });

  it("honors a custom confidenceThreshold", async () => {
    const upgraded = await jevCanaryUpgradeTier1(
      { accountId: "acct-1", message, primaryType: "support", confidenceThreshold: 0.4 },
      { createProvider: fakeProvider, classify: fakeClassify({ type: "support", actionabilityConf: 0.9, subjectMatterConf: 0.5 }) },
    );
    expect(upgraded).toBe(true);
  });

  it("fails closed on a thrown provider error", async () => {
    const throwingClassify = mock(async () => {
      throw new Error("network error");
    }) as unknown as typeof classifyEmailWithJev;

    const upgraded = await jevCanaryUpgradeTier1(
      { accountId: "acct-1", message, primaryType: "support" },
      { createProvider: fakeProvider, classify: throwingClassify },
    );
    expect(upgraded).toBe(false);
  });
});

describe("isJevCanaryTenant", () => {
  const ENV_ENABLE = "FEATURE_FLAG_ENABLE_JEV_CANARY";
  const ENV_MAILBOXES = "FEATURE_FLAG_JEV_CANARY_MAILBOXES";

  afterEach(() => {
    delete process.env[ENV_ENABLE];
    delete process.env[ENV_MAILBOXES];
  });

  it("is false when the flag is off, even for a listed mailbox", () => {
    process.env[ENV_ENABLE] = "false";
    process.env[ENV_MAILBOXES] = "test@kairo.dev";
    expect(isJevCanaryTenant("test@kairo.dev")).toBe(false);
  });

  it("is false for a mailbox not on the allowlist, even with the flag on", () => {
    process.env[ENV_ENABLE] = "true";
    process.env[ENV_MAILBOXES] = "test@kairo.dev";
    expect(isJevCanaryTenant("someone-else@kairo.dev")).toBe(false);
  });

  it("is true for a listed mailbox with the flag on, case- and whitespace-insensitive", () => {
    process.env[ENV_ENABLE] = "true";
    process.env[ENV_MAILBOXES] = "test@kairo.dev, other@kairo.dev";
    expect(isJevCanaryTenant(" Test@Kairo.dev ")).toBe(true);
  });

  it("defaults off with no env vars set at all", () => {
    expect(isJevCanaryTenant("test@kairo.dev")).toBe(false);
  });
});
