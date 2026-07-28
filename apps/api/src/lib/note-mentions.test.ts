import { describe, it, expect } from "bun:test";
import {
  extractMentionUserIds,
  buildMentionToken,
  renderMentionsAsPlainText,
} from "./note-mentions.js";

const UID_A = "6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f";
const UID_B = "11111111-2222-4333-8444-555555555555";

describe("extractMentionUserIds", () => {
  it("returns an empty array for a body with no mentions", () => {
    expect(extractMentionUserIds("just a plain note")).toEqual([]);
  });

  it("returns an empty array for empty input", () => {
    expect(extractMentionUserIds("")).toEqual([]);
  });

  it("extracts a single mention token", () => {
    expect(extractMentionUserIds(`ping ${buildMentionToken(UID_A)} please`)).toEqual([UID_A]);
  });

  it("extracts multiple mentions in order of first appearance", () => {
    const body = `${buildMentionToken(UID_B)} and ${buildMentionToken(UID_A)}`;
    expect(extractMentionUserIds(body)).toEqual([UID_B, UID_A]);
  });

  it("deduplicates repeated mentions of the same user", () => {
    const body = `${buildMentionToken(UID_A)} ... ${buildMentionToken(UID_A)}`;
    expect(extractMentionUserIds(body)).toEqual([UID_A]);
  });

  it("normalizes uppercase UUIDs to lowercase", () => {
    expect(extractMentionUserIds(`@[user:${UID_A.toUpperCase()}]`)).toEqual([UID_A]);
  });

  it("ignores plain @name text (no token)", () => {
    expect(extractMentionUserIds("hey @diana take a look")).toEqual([]);
  });

  it("ignores malformed tokens", () => {
    const body = [
      "@[user:not-a-uuid]",
      "@[user:6f1c2d3e4a5b4c6d8e9f0a1b2c3d4e5f]", // no dashes
      "@[usr:6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f]",
      "@[user:------------------------------------]", // right length, wrong shape
    ].join(" ");
    expect(extractMentionUserIds(body)).toEqual([]);
  });

  it("is stateless across calls (regex lastIndex is not shared)", () => {
    const body = `${buildMentionToken(UID_A)} ${buildMentionToken(UID_B)}`;
    expect(extractMentionUserIds(body)).toEqual(extractMentionUserIds(body));
  });
});

describe("renderMentionsAsPlainText", () => {
  it("replaces tokens with @Name when resolvable", () => {
    const names = new Map([[UID_A, "Diana"]]);
    expect(renderMentionsAsPlainText(`ping ${buildMentionToken(UID_A)}`, names)).toBe("ping @Diana");
  });

  it("falls back to @member for unknown ids", () => {
    expect(renderMentionsAsPlainText(buildMentionToken(UID_B), new Map())).toBe("@member");
  });

  it("leaves bodies without tokens untouched", () => {
    expect(renderMentionsAsPlainText("no mentions here", new Map())).toBe("no mentions here");
  });
});
