import { describe, it, expect } from "bun:test";
import { resolveRunLabel, slugify } from "./run-label";

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

  it("keeps provider and model unchanged by the ablation flag", () => {
    const b = resolveRunLabel(env({ EVAL_NO_CONTEXT: "1" }));

    expect(b.provider).toBe("ollama");
    expect(b.model).toBe("granite4.1:3b");
  });
});

describe("slugify", () => {
  it("makes a model name safe as a directory", () => {
    expect(slugify("ollama-granite4.1:3b")).toBe("ollama-granite4.1-3b");
    expect(slugify("ollama-mistral-small3.2:24b")).toBe("ollama-mistral-small3.2-24b");
  });
});
