import { describe, it, expect } from "bun:test";

import { checkSource, checkTestCopies, run } from "./check-llm-feature";

const ROUTE = "apps/api/src/routes/v1/example.ts";

// The shape of the reply-suggestion route before it moved onto runLlmFeature:
// every defect the Skill's steps exist to prevent, in one handler.
const LEGACY_ROUTE = `
function loadPromptTemplate(lang) {
  return readFileSync(join(PROMPT_DIR, \`\${lang}.md\`), "utf-8");
}
const PROMPT_DIR = join(__dirname, "../../packages/intelligence/prompts/reply-suggestion");
function detectLanguage(texts) { return "es"; }
const generation = startObservation("suggest-reply", {}, { asType: "generation" });
meta = await provider.completeWithMeta(prompt, { maxTokens: 1500 });
const jsonMatch = meta.rawText.match(/\\{[\\s\\S]*\\}/);
await supabase.from("llm_calls").insert({ feature: "reply_suggestion" });
await supabase.from("ticket_proposals").insert({ model_version: resolveModelVersion(), status: "pending" });
`;

describe("checkSource", () => {
  it("flags every defect of the legacy reply-suggestion handler", () => {
    const rules = new Set(checkSource(ROUTE, LEGACY_ROUTE).map((v) => v.rule));
    expect([...rules].sort()).toEqual([
      "direct-llm-calls-insert",
      "hardcoded-model",
      "language-guess",
      "raw-langfuse",
      "raw-provider-call",
      "regex-json",
    ]);
  });

  it("flags a hardcoded model passed to a history row or hoisted into a constant", () => {
    expect(checkSource(ROUTE, "emit({ modelVersion: resolveModelVersion() });").map((v) => v.rule)).toEqual(["hardcoded-model"]);
    expect(checkSource(ROUTE, "const modelVersion = resolveModelVersion();").map((v) => v.rule)).toEqual(["hardcoded-model"]);
  });

  it("allows the configured model on a failure row, where no provider answered", () => {
    expect(checkSource(ROUTE, `logLlmCall({ model: resolveModelVersion(), errorCode: "LLM_ERROR" });`)).toEqual([]);
  });

  it("flags the inline prompt read when the path is on the same line", () => {
    const v = checkSource(ROUTE, `const t = readFileSync(join(__dirname, "../prompts/x/es.md"), "utf-8");`);
    expect(v.map((x) => x.rule)).toEqual(["inline-prompt-load"]);
  });

  it("passes code that goes through the harness", () => {
    const clean = `
const result = await runLlmFeature({ feature: "reply_suggestion", promptId: "reply-suggestion", lang, vars, schema });
await supabase.from("ticket_proposals").insert({ model_version: result.model });
`;
    expect(checkSource(ROUTE, clean)).toEqual([]);
  });

  it("leaves packages/intelligence free to call providers and open generations", () => {
    const harness = `provider.completeJSONWithMeta(prompt, schema); startObservation("x", {}, { asType: "generation" });`;
    expect(checkSource("packages/intelligence/src/harness/run-llm-feature.ts", harness)).toEqual([]);
  });

  it("reports the line of each violation", () => {
    const v = checkSource(ROUTE, "ok\nconst m = raw.match(/\\{[\\s\\S]*\\}/);\n");
    expect(v[0]).toMatchObject({ line: 2, rule: "regex-json" });
  });
});

describe("checkTestCopies", () => {
  const sibling = { "reply.ts": "export function fillTemplate(t, v) { return t; }\nexport const Schema = z.object({});" };

  it("flags a test that redefines a function its sibling exports", () => {
    const test = `function fillTemplate(t, v) { return t; }\nit("fills", () => {});`;
    const v = checkTestCopies("apps/api/src/lib/reply.test.ts", test, sibling);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ rule: "test-copy", line: 1 });
  });

  it("accepts a test that imports the real function", () => {
    const test = `import { fillTemplate } from "./reply.js";\nit("fills", () => fillTemplate("a", {}));`;
    expect(checkTestCopies("apps/api/src/lib/reply.test.ts", test, sibling)).toEqual([]);
  });

  it("ignores a local value that shares a name with a non-function export", () => {
    const test = `const Schema = makeFixture();`;
    expect(checkTestCopies("apps/api/src/lib/reply.test.ts", test, sibling)).toEqual([]);
  });
});

describe("the repository", () => {
  it("has no violations", () => {
    expect(run(["--all"])).toEqual([]);
  });
});
