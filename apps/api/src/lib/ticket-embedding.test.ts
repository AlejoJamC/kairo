import { describe, it, expect, mock } from "bun:test";
import {
  buildEmbeddingText,
  maybeGenerateTicketEmbedding,
} from "./ticket-embedding.js";

describe("buildEmbeddingText", () => {
  it("joins subject + body with two newlines", () => {
    expect(buildEmbeddingText("Subject", "Body")).toBe("Subject\n\nBody");
  });

  it("returns null when both inputs are empty", () => {
    expect(buildEmbeddingText("", "")).toBeNull();
    expect(buildEmbeddingText("   ", "\t\n")).toBeNull();
  });

  it("preserves single non-empty input", () => {
    expect(buildEmbeddingText("Only subject", "")).toBe("Only subject");
    expect(buildEmbeddingText("", "Only body")).toBe("Only body");
  });
});

interface SupabaseUpdateRecord {
  table: string;
  payload: Record<string, unknown>;
  filterId: string | null;
}

function makeSupabaseStub(opts: { updateError?: { message: string } } = {}): {
  client: any;
  updates: SupabaseUpdateRecord[];
} {
  const updates: SupabaseUpdateRecord[] = [];
  const client = {
    from(table: string) {
      const ctx: SupabaseUpdateRecord = { table, payload: {}, filterId: null };
      const builder: any = {
        update(payload: Record<string, unknown>) {
          ctx.payload = payload;
          return builder;
        },
        eq(col: string, val: unknown) {
          if (col === "id") ctx.filterId = String(val);
          return builder;
        },
        then(resolve: any) {
          updates.push(ctx);
          resolve({ error: opts.updateError ?? null });
        },
      };
      return builder;
    },
  };
  return { client, updates };
}

describe("maybeGenerateTicketEmbedding", () => {
  it("skips when text is empty", async () => {
    const embedFn = mock(async () => Array(512).fill(0.1));
    const { client, updates } = makeSupabaseStub();
    const result = await maybeGenerateTicketEmbedding({
      supabase: client, ticketId: "tk-1", subject: "", bodyPreview: "",
      embedFn,
    });
    expect(result).toEqual({ status: "skipped", reason: "empty_text" });
    expect(embedFn).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });

  it("persists embedding + timestamp on success", async () => {
    const embedFn = mock(async (_text: string) => Array(512).fill(0.1));
    const { client, updates } = makeSupabaseStub();
    const result = await maybeGenerateTicketEmbedding({
      supabase: client, ticketId: "tk-1", subject: "Hi", bodyPreview: "Body",
      embedFn,
    });
    expect(result).toEqual({ status: "ok" });
    expect(embedFn).toHaveBeenCalledWith("Hi\n\nBody");
    expect(updates).toHaveLength(1);
    expect(updates[0].filterId).toBe("tk-1");
    expect(Array.isArray(updates[0].payload.embedding)).toBe(true);
    expect((updates[0].payload.embedding as number[]).length).toBe(512);
    expect(typeof updates[0].payload.embedding_updated_at).toBe("string");
  });

  it("returns embed_error when Voyage throws", async () => {
    const embedFn = mock(async () => { throw new Error("Voyage 500"); });
    const { client, updates } = makeSupabaseStub();
    const result = await maybeGenerateTicketEmbedding({
      supabase: client, ticketId: "tk-1", subject: "Hi", bodyPreview: "Body",
      embedFn,
    });
    expect(result).toEqual({ status: "failed", reason: "embed_error" });
    expect(updates).toHaveLength(0);
  });

  it("returns persist_error when supabase update fails", async () => {
    const embedFn = mock(async () => Array(512).fill(0.1));
    const { client } = makeSupabaseStub({ updateError: { message: "DB down" } });
    const result = await maybeGenerateTicketEmbedding({
      supabase: client, ticketId: "tk-1", subject: "Hi", bodyPreview: "Body",
      embedFn,
    });
    expect(result).toEqual({ status: "failed", reason: "persist_error" });
  });
});
