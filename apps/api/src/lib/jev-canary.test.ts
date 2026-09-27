import { describe, it, expect, mock, afterEach } from "bun:test";
import type { classifyEmailWithJev, DecisionProvider, EmailMessage } from "@kairo/intelligence";
import { isJevCanaryAccount, jevCanaryUpgrade } from "./jev-canary.js";

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

describe("jevCanaryUpgrade", () => {
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

  it("never upgrades a type the account has not earned, even at perfect JEV confidence", async () => {
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

describe("isJevCanaryAccount", () => {
  const ENV_ENABLE = "FEATURE_FLAG_ENABLE_JEV_CANARY";
  const ENV_ACCOUNTS = "FEATURE_FLAG_JEV_CANARY_ACCOUNT_IDS";

  afterEach(() => {
    delete process.env[ENV_ENABLE];
    delete process.env[ENV_ACCOUNTS];
  });

  it("is false when the flag is off, even for a listed account", () => {
    process.env[ENV_ENABLE] = "false";
    process.env[ENV_ACCOUNTS] = "acct-1";
    expect(isJevCanaryAccount("acct-1")).toBe(false);
  });

  it("is false for an account not on the allowlist, even with the flag on", () => {
    process.env[ENV_ENABLE] = "true";
    process.env[ENV_ACCOUNTS] = "acct-1,acct-2";
    expect(isJevCanaryAccount("acct-3")).toBe(false);
  });

  it("is true for a listed account with the flag on", () => {
    process.env[ENV_ENABLE] = "true";
    process.env[ENV_ACCOUNTS] = "acct-1, acct-2";
    expect(isJevCanaryAccount("acct-2")).toBe(true);
  });

  it("defaults off with no env vars set at all", () => {
    expect(isJevCanaryAccount("acct-1")).toBe(false);
  });
});
