import * as React from "react";
import { act, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render-with-providers";

const note = (id: string, body: string) => ({
  id,
  direction: "internal",
  sender_external_id: "agent@acme.com",
  sender_display_name: "Agent",
  body_plain: body,
  body_html: null,
  snippet: body,
  received_at: "2026-06-01T10:00:00Z",
  is_origin: false,
});

let serverNotes = [note("n1", "First note")];
const getTicketMessages = vi.fn(async () => ({ ok: true, json: async () => ({ messages: serverNotes }) }));

const markMentionsRead = vi.fn<(ids: string[]) => Promise<{ ok: boolean }>>(async () => ({ ok: true }));

vi.mock("@kairo/client-core/endpoints", () => ({
  getTicketMessages: (...args: unknown[]) => getTicketMessages(...(args as [])),
  markMentionsRead: (ids: string[]) => markMentionsRead(ids),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>) => (typeof fallback === "string" ? fallback : key),
    i18n: { language: "en" },
  }),
}));

const { NotesPanel } = await import("./NotesPanel");
const { useTriageStore } = await import("@kairo/client-core/stores/triage-store");

describe("NotesPanel", () => {
  beforeEach(() => {
    getTicketMessages.mockClear();
    markMentionsRead.mockClear();
    serverNotes = [note("n1", "First note")];
  });

  it("reloads the list when a note is added to the open ticket, without the skeleton", async () => {
    renderWithProviders(React.createElement(NotesPanel, { ticketId: "t-1" }));
    await waitFor(() => expect(screen.getByText("First note")).toBeInTheDocument());
    expect(getTicketMessages).toHaveBeenCalledTimes(1);

    serverNotes = [note("n1", "First note"), note("n2", "Second note")];
    act(() => useTriageStore.getState().bumpThreadRevision());

    await waitFor(() => expect(screen.getByText("Second note")).toBeInTheDocument());
    expect(getTicketMessages).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("loading notes…")).not.toBeInTheDocument();
  });

  it("clears the unread counter of the ticket and reads the counters again once a mention counts as read", async () => {
    serverNotes = [{ ...note("n1", "Mentioned note"), mention_unread: true } as never];
    useTriageStore.setState({ noteCounts: { "t-1": { notes: 1, unread_mentions: 1 } }, noteCountsRevision: 0 });

    renderWithProviders(React.createElement(NotesPanel, { ticketId: "t-1" }));
    await waitFor(() => expect(screen.getByText("Mentioned note")).toBeInTheDocument());

    await waitFor(() => expect(markMentionsRead).toHaveBeenCalledWith(["n1"]), { timeout: 3000 });
    expect(useTriageStore.getState().noteCounts["t-1"]).toEqual({ notes: 1, unread_mentions: 0 });
    await waitFor(() => expect(useTriageStore.getState().noteCountsRevision).toBe(1));
  });
});
