import { create } from "zustand";
import { getPlatform } from "../config";
import type { StoragePort } from "../platform";

// One conversation per ticket (and one for the account), kept in memory while the app runs and in
// the platform storage for a few days, so switching ticket or view never loses a chat.

export interface AssistantAnswer {
  steps: { label: string; detail: string }[];
  prose: ({ type: "p"; text: string } | { type: "bullets"; items: string[] })[];
  quote?: { text: string; source: string };
  draft?: { subject: string; body: string };
  citations?: { kind: "kb" | "ticket"; id: string; title: string; meta: string }[];
  followups?: string[];
}
export type AssistantTurn =
  | { id: number; role: "u"; text: string }
  | { id: number; role: "a"; answer: AssistantAnswer };

/** A conversation expires this long after its last message; every message renews it. */
export const CHAT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Only the latest turns are kept, so a long conversation cannot grow the storage without bound. */
export const CHAT_MAX_TURNS = 40;
/** Only the most recently used conversations are kept. */
export const CHAT_MAX_CHATS = 30;

const ITEM_PREFIX = "assistant-chat:";
const INDEX_KEY = "assistant-chat-index";

type Index = Record<string, number>;

function isTurn(value: unknown): value is AssistantTurn {
  if (typeof value !== "object" || value === null) return false;
  const turn = value as Record<string, unknown>;
  if (typeof turn["id"] !== "number") return false;
  if (turn["role"] === "u") return typeof turn["text"] === "string";
  const answer = turn["answer"] as Record<string, unknown> | undefined;
  return turn["role"] === "a" && typeof answer === "object" && answer !== null
    && Array.isArray(answer["steps"]) && Array.isArray(answer["prose"]);
}

function readIndex(storage: StoragePort): Index {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(INDEX_KEY) ?? "{}");
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, number] => typeof entry[1] === "number"));
  } catch { return {}; }
}

function writeIndex(storage: StoragePort, index: Index): void {
  try { storage.setItem(INDEX_KEY, JSON.stringify(index)); } catch { /* storage unavailable */ }
}

/** The stored turns of a conversation, or none when it expired, is damaged or was never saved. */
export function readChat(storage: StoragePort, key: string, now = Date.now()): AssistantTurn[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(ITEM_PREFIX + key) ?? "null");
    const saved = parsed as { updatedAt?: unknown; turns?: unknown } | null;
    if (!saved || typeof saved.updatedAt !== "number" || !Array.isArray(saved.turns)) return [];
    if (now - saved.updatedAt > CHAT_TTL_MS) { removeChat(storage, key); return []; }
    return saved.turns.every(isTurn) ? saved.turns : [];
  } catch { return []; }
}

export function removeChat(storage: StoragePort, key: string): void {
  try { storage.removeItem(ITEM_PREFIX + key); } catch { /* storage unavailable */ }
  const index = readIndex(storage);
  if (key in index) { delete index[key]; writeIndex(storage, index); }
}

/** Saves the latest turns of a conversation, renews its expiry and drops expired or surplus conversations. */
export function writeChat(storage: StoragePort, key: string, turns: AssistantTurn[], now = Date.now()): void {
  try { storage.setItem(ITEM_PREFIX + key, JSON.stringify({ updatedAt: now, turns: turns.slice(-CHAT_MAX_TURNS) })); }
  catch { return; }
  const index = { ...readIndex(storage), [key]: now };
  const ordered = Object.entries(index).sort((a, b) => b[1] - a[1]);
  const dropped = ordered.filter(([, updatedAt], position) => now - updatedAt > CHAT_TTL_MS || position >= CHAT_MAX_CHATS).map(([name]) => name);
  for (const name of dropped) {
    try { storage.removeItem(ITEM_PREFIX + name); } catch { /* storage unavailable */ }
    delete index[name];
  }
  writeIndex(storage, index);
}

export interface AssistantChat {
  turns: AssistantTurn[];
  /** A request for this conversation is in flight. */
  busy: boolean;
  failed: boolean;
  /** What the person has typed and not yet sent. */
  draft: string;
  lastQuestion: string;
}
export const EMPTY_CHAT: AssistantChat = { turns: [], busy: false, failed: false, draft: "", lastQuestion: "" };

interface AssistantChatState {
  chats: Record<string, AssistantChat>;
  /** Loads a conversation from the storage the first time it is opened. */
  open: (key: string) => void;
  addQuestion: (key: string, text: string) => void;
  addAnswer: (key: string, answer: AssistantAnswer) => void;
  setBusy: (key: string, busy: boolean) => void;
  setFailed: (key: string, failed: boolean) => void;
  setDraft: (key: string, draft: string) => void;
}

function storage(): StoragePort | null {
  try { return getPlatform().storage; } catch { return null; }
}

export const useAssistantChats = create<AssistantChatState>((set, get) => {
  const update = (key: string, change: (chat: AssistantChat) => AssistantChat, persist = false) => {
    const next = change(get().chats[key] ?? EMPTY_CHAT);
    set((state) => ({ chats: { ...state.chats, [key]: next } }));
    const port = storage();
    if (persist && port) writeChat(port, key, next.turns);
  };
  const nextId = (chat: AssistantChat) => (chat.turns.at(-1)?.id ?? 0) + 1;
  return {
    chats: {},
    open: (key) => {
      if (get().chats[key]) return;
      const port = storage();
      update(key, (chat) => ({ ...chat, turns: port ? readChat(port, key) : [] }));
    },
    addQuestion: (key, text) => update(key, (chat) => ({ ...chat, lastQuestion: text, failed: false,
      turns: [...chat.turns, { id: nextId(chat), role: "u", text }] }), true),
    addAnswer: (key, answer) => update(key, (chat) => ({ ...chat, turns: [...chat.turns, { id: nextId(chat), role: "a", answer }] }), true),
    setBusy: (key, busy) => update(key, (chat) => ({ ...chat, busy })),
    setFailed: (key, failed) => update(key, (chat) => ({ ...chat, failed })),
    setDraft: (key, draft) => update(key, (chat) => ({ ...chat, draft })),
  };
});
