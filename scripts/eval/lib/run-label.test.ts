import { describe, it, expect } from "bun:test";
import { resolveRunLabel, slugify, STAGE_BODY_RULES } from "./run-label";

const env = (over: Record<string, string> = {}) =>
  ({ INTELLIGENCE_PROVIDER: "ollama", OLLAMA_MODEL: "granite4.1:3b", ...over }) as NodeJS.ProcessEnv;

describe("resolveRunLabel", () => {
  it("names the run after provider and model", () => {
    const r = resolveRunLabel(env());

    expect(r.slug).toBe("ollama-granite4.1-3b");
    expect(r.withoutContext).toBe(false);
  });

  it("reads the Anthropic model from its own variable", () => {
    const r = resolveRunLabel(env({
      INTELLIGENCE_PROVIDER: "anthropic",
      ANTHROPIC_MODEL: "claude-haiku-4-5-20251001",
    }));

    expect(r.slug).toBe("anthropic-claude-haiku-4-5-20251001");
  });

  // The ablation run must never land on top of the run it is compared against
  it("gives the ablation run its own directory", () => {
    const a = resolveRunLabel(env());
    const b = resolveRunLabel(env({ EVAL_NO_CONTEXT: "1" }));

    expect(b.withoutContext).toBe(true);
    expect(b.slug).toBe(`${a.slug}-nocontext`);
    expect(b.slug).not.toBe(a.slug);
  });

  it("treats any value other than 1 as a normal run", () => {
    for (const v of ["0", "", "true", "yes"]) {
      expect(resolveRunLabel(env({ EVAL_NO_CONTEXT: v })).withoutContext).toBe(false);
    }
  });

  it("starts with an unresolved prompt version, filled by the runner", () => {
    // The rubric lives on disk, not in the environment; the runner reads it at
    // start and stamps it on every row so a stored run can be tied to it
    expect(resolveRunLabel(env()).promptVersion).toBe("unknown");
  });

  // The two production paths feed the classifier differently, so a run has to
  // declare which one it reproduces — otherwise its numbers answer no question
  it("defaults to the backfill stage, where most of an account's mail lands", () => {
    const r = resolveRunLabel(env());

    expect(r.stage).toBe("backfill");
    expect(r.slug).toBe("ollama-granite4.1-3b");
  });

  it("gives the onboarding stage its own directory", () => {
    const a = resolveRunLabel(env());
    const b = resolveRunLabel(env({ EVAL_STAGE: "onboarding" }));

    expect(b.stage).toBe("onboarding");
    expect(b.slug).toBe(`${a.slug}-onboarding`);
  });

  it("treats an unrecognised stage as backfill rather than inventing one", () => {
    for (const v of ["tier1", "TIER1", "", "onboarding "]) {
      expect(resolveRunLabel(env({ EVAL_STAGE: v })).stage).toBe("backfill");
    }
  });

  it("keeps stage and ablation independent in the slug", () => {
    const r = resolveRunLabel(env({ EVAL_STAGE: "onboarding", EVAL_NO_CONTEXT: "1" }));

    expect(r.stage).toBe("onboarding");
    expect(r.withoutContext).toBe(true);
    expect(r.slug).toBe("ollama-granite4.1-3b-onboarding-nocontext");
  });

  it("keeps provider and model unchanged by the ablation flag", () => {
    const b = resolveRunLabel(env({ EVAL_NO_CONTEXT: "1" }));

    expect(b.provider).toBe("ollama");
    expect(b.model).toBe("granite4.1:3b");
  });
});

describe("STAGE_BODY_RULES", () => {
  // These must mirror the production call sites: tier1-fast-path sends the raw
  // body capped at 20,000; tier2/tier3/incremental-sync strip the quoted
  // thread first and cap at 2,000
  it("reproduces tier1 for onboarding: raw body, high cap", () => {
    expect(STAGE_BODY_RULES.onboarding).toEqual({ maxChars: 20_000, stripQuotes: false });
  });

  it("reproduces tier2/tier3 for backfill: quotes stripped, low cap", () => {
    expect(STAGE_BODY_RULES.backfill).toEqual({ maxChars: 2_000, stripQuotes: true });
  });
});

describe("slugify", () => {
  it("makes a model name safe as a directory", () => {
    expect(slugify("ollama-granite4.1:3b")).toBe("ollama-granite4.1-3b");
    expect(slugify("ollama-mistral-small3.2:24b")).toBe("ollama-mistral-small3.2-24b");
  });
});
