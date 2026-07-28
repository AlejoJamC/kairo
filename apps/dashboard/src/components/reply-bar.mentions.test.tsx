import * as React from "react";
import { JSDOM } from "jsdom";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render-with-providers";

// ---------------------------------------------------------------------------
// KAI-232 — the @mention flow with VITE_FF_ENABLE_INTERNAL_NOTES ON.
//
// INTERNAL_NOTES_ENABLED is a module-level const evaluated at import time, so
// the flag is stubbed and ReplyBar is imported dynamically inside each test.
// The flag-OFF counterpart lives in reply-bar.test.tsx.
// ---------------------------------------------------------------------------

const apiCallMock = vi.fn();

if (typeof document === "undefined") {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  globalThis.window = dom.window as unknown as Window & typeof globalThis;
  globalThis.document = dom.window.document;
}

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en" },
  }),
}));

vi.mock("@/lib/api-client", () => ({
  apiCall: (...args: unknown[]) => apiCallMock(...args),
}));

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: { id: "author-1" } }),
}));

vi.mock("./template-picker", () => ({
  TemplatePicker: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const DIANA_ID = "6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f";

const MEMBERS = [
  { user_id: DIANA_ID, name: "Diana Ruiz", email: "diana@acme.io", role: "agent" },
  { user_id: "11111111-2222-4333-8444-555555555555", name: "Luis Pena", email: "luis@acme.io", role: "agent" },
  // The author must never suggest themselves.
  { user_id: "author-1", name: "Author Self", email: "self@acme.io", role: "agent" },
];

async function renderNoteComposer() {
  vi.stubEnv("VITE_FF_ENABLE_INTERNAL_NOTES", "true");
  vi.resetModules();
  // resetModules gives ReplyBar a fresh module graph, so the triage store must
  // be re-imported from that same graph — the top-level import is a different
  // instance and setting state on it would not reach the component.
  const [{ ReplyBar }, { useTriageStore: store }] = await Promise.all([
    import("./reply-bar"),
    import("@/stores/triage-store"),
  ]);

  renderWithProviders(<ReplyBar />);
  store.getState().selectTicket("ticket-1");

  const user = userEvent.setup({ document });
  // Switch to note mode — this is also what triggers the member fetch.
  await user.click(await screen.findByText(/replyBar\.modeNote/i));
  return user;
}

describe("ReplyBar — @mentions (flag ON)", () => {
  beforeEach(() => {
    apiCallMock.mockReset();
    apiCallMock.mockImplementation((path: string) => {
      if (String(path).includes("/api/v1/members")) {
        return Promise.resolve({ ok: true, json: async () => ({ data: MEMBERS }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    // No store reset needed: vi.resetModules() in the helper gives each test a
    // freshly-initialized triage store.
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("exposes note mode and its internal-only affordances", async () => {
    await renderNoteComposer();
    expect(screen.getByText(/replyBar\.noteVisibilityHint/i)).toBeInTheDocument();
    expect(screen.getByText(/replyBar\.sendNote/i)).toBeInTheDocument();
  });

  it("opens the member dropdown on @ and filters as you type, excluding the author", async () => {
    const user = await renderNoteComposer();
    const textarea = screen.getByPlaceholderText(/replyBar\.notePlaceholder/i);

    await user.click(textarea);
    await user.type(textarea, "please check @");

    const dropdown = await screen.findByTestId("mention-dropdown");
    expect(dropdown).toBeInTheDocument();
    expect(screen.getByText("Diana Ruiz")).toBeInTheDocument();
    expect(screen.getByText("Luis Pena")).toBeInTheDocument();
    // The note's own author is never a suggestion.
    expect(screen.queryByText("Author Self")).not.toBeInTheDocument();

    await user.type(textarea, "dia");
    await waitFor(() => {
      expect(screen.queryByText("Luis Pena")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Diana Ruiz")).toBeInTheDocument();
  });

  it("inserts an id token (never the display name) and shows a mention chip", async () => {
    const user = await renderNoteComposer();
    const textarea = screen.getByPlaceholderText(/replyBar\.notePlaceholder/i) as HTMLTextAreaElement;

    await user.click(textarea);
    await user.type(textarea, "ping @dia");
    await screen.findByTestId("mention-dropdown");
    await user.click(screen.getByText("Diana Ruiz"));

    await waitFor(() => {
      expect(textarea.value).toBe(`ping @[user:${DIANA_ID}] `);
    });
    // The persisted body carries the id, not the name.
    expect(textarea.value).not.toContain("Diana Ruiz");
    // ...but the composer confirms who will be notified.
    expect(screen.getByText("@Diana Ruiz")).toBeInTheDocument();
    // Dropdown closes after a pick.
    expect(screen.queryByTestId("mention-dropdown")).not.toBeInTheDocument();
  });

  it("posts the note body with the raw token — the API resolves mentions", async () => {
    const user = await renderNoteComposer();
    const textarea = screen.getByPlaceholderText(/replyBar\.notePlaceholder/i);

    await user.click(textarea);
    await user.type(textarea, "ping @dia");
    await screen.findByTestId("mention-dropdown");
    await user.click(screen.getByText("Diana Ruiz"));

    apiCallMock.mockClear();
    await user.click(screen.getByText(/replyBar\.sendNote/i));

    await waitFor(() => {
      const call = apiCallMock.mock.calls.find(([path]) => String(path).includes("/notes"));
      expect(call).toBeDefined();
      expect(call?.[0]).toBe("/api/v1/tickets/ticket-1/notes");
      expect(JSON.parse(String(call?.[1]?.body))).toEqual({
        body: `ping @[user:${DIANA_ID}] `,
      });
    });
  });
});
