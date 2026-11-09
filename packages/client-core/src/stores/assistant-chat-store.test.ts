import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StoragePort } from "../platform";

const data = new Map<string, string>();
const storage: StoragePort = {
  getItem: (key) => data.get(key) ?? null,
  setItem: (key, value) => { data.set(key, value); },
  removeItem: (key) => { data.delete(key); },
};
vi.mock("../config", () => ({ getPlatform: () => ({ storage }) }));

const { CHAT_MAX_CHATS, CHAT_MAX_TURNS, CHAT_TTL_MS, EMPTY_CHAT, readChat, useAssistantChats, writeChat } = await import("./assistant-chat-store");

const answer = { steps: [], prose: [{ type: "p" as const, text: "Answer" }] };
const question = (id: number) => ({ id, role: "u" as const, text: `Question ${id}` });
const DAY = 24 * 60 * 60 * 1000;

beforeEach(() => {
  data.clear();
  useAssistantChats.setState({ chats: {} });
});

describe("assistant chat archive", () => {
  it("returns what was saved while the conversation is recent", () => {
    writeChat(storage, "acme:t-1", [question(1)], 1_000);
    expect(readChat(storage, "acme:t-1", 1_000 + CHAT_TTL_MS)).toEqual([question(1)]);
  });

  it("drops a conversation that was idle longer than the expiry, and renews it with every message", () => {
    writeChat(storage, "acme:t-1", [question(1)], 0);
    writeChat(storage, "acme:t-2", [question(1)], 0);
    writeChat(storage, "acme:t-2", [question(1), question(2)], 6 * DAY);
    expect(readChat(storage, "acme:t-1", 8 * DAY)).toEqual([]);
    expect(data.has("assistant-chat:acme:t-1")).toBe(false);
    expect(readChat(storage, "acme:t-2", 8 * DAY)).toHaveLength(2);
  });

  it("keeps only the latest turns and the most recent conversations", () => {
    writeChat(storage, "acme:long", Array.from({ length: CHAT_MAX_TURNS + 10 }, (_, index) => question(index + 1)), 1);
    expect(readChat(storage, "acme:long", 2)).toHaveLength(CHAT_MAX_TURNS);
    for (let index = 0; index < CHAT_MAX_CHATS + 2; index++) writeChat(storage, `acme:t-${index}`, [question(1)], 10 + index);
    expect(readChat(storage, "acme:long", 100)).toEqual([]);
    expect(readChat(storage, `acme:t-${CHAT_MAX_CHATS + 1}`, 100)).toHaveLength(1);
  });

  it("ignores damaged or unrecognised stored data", () => {
    data.set("assistant-chat:acme:t-1", "{not json");
    data.set("assistant-chat:acme:t-2", JSON.stringify({ updatedAt: 1, turns: [{ id: 1, role: "x" }] }));
    expect(readChat(storage, "acme:t-1", 2)).toEqual([]);
    expect(readChat(storage, "acme:t-2", 2)).toEqual([]);
  });
});

describe("assistant chat store", () => {
  it("keeps one conversation per key and restores it after the memory is gone", () => {
    const chats = useAssistantChats.getState();
    chats.open("acme:t-1");
    chats.addQuestion("acme:t-1", "First");
    chats.addAnswer("acme:t-1", answer);
    chats.addQuestion("acme:t-2", "Other ticket");
    expect(useAssistantChats.getState().chats["acme:t-1"]!.turns).toHaveLength(2);
    expect(useAssistantChats.getState().chats["acme:t-2"]!.turns).toHaveLength(1);

    useAssistantChats.setState({ chats: {} });
    useAssistantChats.getState().open("acme:t-1");
    expect(useAssistantChats.getState().chats["acme:t-1"]!.turns.map((turn) => turn.role)).toEqual(["u", "a"]);
  });

  it("lands an answer in the conversation it was asked in, whichever one is open", () => {
    const chats = useAssistantChats.getState();
    chats.addQuestion("acme:t-1", "Slow question");
    chats.setBusy("acme:t-1", true);
    chats.addQuestion("acme:t-2", "Meanwhile");
    chats.addAnswer("acme:t-1", answer);
    chats.setBusy("acme:t-1", false);
    expect(useAssistantChats.getState().chats["acme:t-1"]!.turns.map((turn) => turn.role)).toEqual(["u", "a"]);
    expect(useAssistantChats.getState().chats["acme:t-2"]!.turns.map((turn) => turn.role)).toEqual(["u"]);
  });

  it("keeps the unsent text of each conversation and starts a ticket with no history empty", () => {
    const chats = useAssistantChats.getState();
    chats.setDraft("acme:t-1", "half written");
    expect(useAssistantChats.getState().chats["acme:t-1"]!.draft).toBe("half written");
    expect(useAssistantChats.getState().chats["acme:t-2"] ?? EMPTY_CHAT).toEqual(EMPTY_CHAT);
  });
});
