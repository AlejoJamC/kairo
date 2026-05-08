import { describe, it, expect, mock } from "bun:test";
import { buildKbEmbeddingText, maybeGenerateKbEmbedding } from "./kb-embedding.js";

describe("buildKbEmbeddingText", () => {
  it("returns null on empty inputs", () => {
    expect(buildKbEmbeddingText("", "")).toBeNull();
  });
  it("joins title + content", () => {
    expect(buildKbEmbeddingText("How to ssh", "Step 1...")).toBe("How to ssh\n\nStep 1...");
  });
});

function makeStub() {
  const updates: Array<Record<string, unknown>> = [];
  const client = {
    from(_table: string) {
      const ctx: Record<string, unknown> = {};
      const builder: any = {
        update(payload: Record<string, unknown>) { ctx.payload = payload; return builder; },
        eq(_c: string, _v: unknown) { return builder; },
        then(resolve: any) { updates.push(ctx); resolve({ error: null }); },
      };
      return builder;
    },
  };
  return { client, updates };
}

describe("maybeGenerateKbEmbedding", () => {
  it("skips empty text", async () => {
    const embedFn = mock(async () => Array(512).fill(0.2));
    const { client } = makeStub();
    const r = await maybeGenerateKbEmbedding({
      supabase: client as any, articleId: "a-1", title: "", content: "",
      embedFn,
    });
    expect(r).toEqual({ status: "skipped", reason: "empty_text" });
    expect(embedFn).not.toHaveBeenCalled();
  });

  it("persists 512-dim vector + updated_at on success", async () => {
    const embedFn = mock(async (_text: string) => Array(512).fill(0.2));
    const { client, updates } = makeStub();
    const r = await maybeGenerateKbEmbedding({
      supabase: client as any, articleId: "a-1", title: "T", content: "C",
      embedFn,
    });
    expect(r).toEqual({ status: "ok" });
    expect(embedFn).toHaveBeenCalledWith("T\n\nC");
    const payload = updates[0].payload as Record<string, unknown>;
    expect((payload.embedding as number[]).length).toBe(512);
    expect(typeof payload.updated_at).toBe("string");
  });
});
