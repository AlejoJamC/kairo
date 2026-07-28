import { describe, it, expect } from "vitest";
import {
  parseNoteBody,
  buildMentionToken,
  extractMentionUserIds,
  findActiveMentionQuery,
  insertMentionToken,
} from "../note-mentions";

// ---------------------------------------------------------------------------
// KAI-232 — mention tokens are the only thing persisted in a note body; every
// display name is resolved at read time. These tests pin the parsing and the
// composer's caret handling, which the whole @mention UX rests on.
// ---------------------------------------------------------------------------

const UID_A = "6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f";
const UID_B = "11111111-2222-4333-8444-555555555555";

describe("parseNoteBody", () => {
  it("returns an empty list for an empty body", () => {
    expect(parseNoteBody(null)).toEqual([]);
    expect(parseNoteBody("")).toEqual([]);
  });

  it("returns a single text segment when there are no mentions", () => {
    expect(parseNoteBody("plain note")).toEqual([{ type: "text", value: "plain note" }]);
  });

  it("splits text around a mention and resolves its name", () => {
    const body = `ping ${buildMentionToken(UID_A)} please`;
    expect(parseNoteBody(body, [{ user_id: UID_A, name: "Diana" }])).toEqual([
      { type: "text", value: "ping " },
      { type: "mention", userId: UID_A, name: "Diana" },
      { type: "text", value: " please" },
    ]);
  });

  it("emits a mention segment with a null name for an unresolved id", () => {
    expect(parseNoteBody(buildMentionToken(UID_B), [])).toEqual([
      { type: "mention", userId: UID_B, name: null },
    ]);
  });

  it("handles consecutive mentions with no text between them", () => {
    const body = `${buildMentionToken(UID_A)}${buildMentionToken(UID_B)}`;
    const segments = parseNoteBody(body, [
      { user_id: UID_A, name: "Diana" },
      { user_id: UID_B, name: "Luis" },
    ]);
    expect(segments).toHaveLength(2);
    expect(segments.every((s) => s.type === "mention")).toBe(true);
  });
});

describe("extractMentionUserIds", () => {
  it("deduplicates and preserves first-appearance order", () => {
    const body = `${buildMentionToken(UID_B)} ${buildMentionToken(UID_A)} ${buildMentionToken(UID_B)}`;
    expect(extractMentionUserIds(body)).toEqual([UID_B, UID_A]);
  });

  it("ignores plain @text", () => {
    expect(extractMentionUserIds("hey @diana")).toEqual([]);
  });
});

describe("findActiveMentionQuery", () => {
  it("detects a bare @ at the caret", () => {
    expect(findActiveMentionQuery("hello @", 7)).toEqual({ query: "", start: 6 });
  });

  it("captures the partial query typed after @", () => {
    expect(findActiveMentionQuery("hello @dia", 10)).toEqual({ query: "dia", start: 6 });
  });

  it("returns null when the caret is not after an @ run", () => {
    expect(findActiveMentionQuery("hello @dia there", 16)).toBeNull();
  });

  it("ignores an @ inside an email address", () => {
    expect(findActiveMentionQuery("write to diana@acme", 19)).toBeNull();
  });

  it("only considers text before the caret", () => {
    expect(findActiveMentionQuery("hi @dia rest", 7)).toEqual({ query: "dia", start: 3 });
  });
});

describe("insertMentionToken", () => {
  it("replaces the active query with a token and trailing space", () => {
    const { value, caret } = insertMentionToken("hello @dia", 6, 10, UID_A);
    expect(value).toBe(`hello ${buildMentionToken(UID_A)} `);
    expect(caret).toBe(value.length);
  });

  it("keeps text that follows the caret intact", () => {
    const { value } = insertMentionToken("hi @dia rest", 3, 7, UID_A);
    expect(value).toBe(`hi ${buildMentionToken(UID_A)}  rest`);
  });

  it("produces a body the extractor can read back", () => {
    const { value } = insertMentionToken("hello @d", 6, 8, UID_A);
    expect(extractMentionUserIds(value)).toEqual([UID_A]);
  });
});
