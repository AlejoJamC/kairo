import * as React from "react";
import { JSDOM } from "jsdom";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReplyBar } from "./reply-bar";
import { useTriageStore } from "@/stores/triage-store";
import { renderWithProviders } from "@/test/render-with-providers";

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

vi.mock("./template-picker", () => ({
  TemplatePicker: ({
    children,
  }: {
    onSelect: (content: string) => void;
    children: React.ReactNode;
  }) => <>{children}</>,
}));

describe("ReplyBar", () => {
  beforeEach(() => {
    apiCallMock.mockReset();
    useTriageStore.setState({
      tickets: [],
      selectedTicketId: null,
      aiSuggestedReply: null,
      isScanning: false,
      classifiedCount: 0,
    });
  });

  it("auto-populates draft from aiSuggestedReply and clears store value", async () => {
    renderWithProviders(<ReplyBar />);
    useTriageStore.getState().selectTicket("ticket-1");
    useTriageStore.getState().setSuggestedReply("AI drafted message");

    // When aiSuggestedReply lands, the component swaps the plain composer for
    // the BORRADOR IA card. Query the textarea by its displayed value, which is
    // independent of which branch (placeholder vs banner) is rendered.
    const textbox = await screen.findByDisplayValue("AI drafted message");
    expect(textbox).toBeInTheDocument();
    // The badge identifies the AI card branch — replaces the old aiSuggestionBanner key.
    expect(screen.getByText(/replyBar\.aiBadge/i)).toBeInTheDocument();
    expect(useTriageStore.getState().aiSuggestedReply).toBeNull();
  });

  it("clears the AI banner and the draft after a successful send", async () => {
    apiCallMock.mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    renderWithProviders(<ReplyBar />);
    useTriageStore.getState().selectTicket("ticket-1");
    useTriageStore.getState().setSuggestedReply("Initial AI text");

    // Card branch renders; locate the editable textarea by its current value.
    const textbox = await screen.findByDisplayValue("Initial AI text");

    // Manual edits keep the banner open by design — only an explicit dismiss
    // (X button) or a successful send clears it. Type and confirm the draft updates.
    await userEvent.type(textbox, " updated");
    await waitFor(() => expect(textbox).toHaveValue("Initial AI text updated"));
    expect(screen.getByText(/replyBar\.aiBadge/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "ticketDetail.send" }));

    await waitFor(() => expect(apiCallMock).toHaveBeenCalledTimes(1));
    expect(useTriageStore.getState().aiSuggestedReply).toBeNull();
    // After send the card branch goes away; the composer is the plain placeholder textarea, empty.
    const composer = await screen.findByPlaceholderText("ticketDetail.replyPlaceholder");
    expect(composer).toHaveValue("");
    expect(screen.queryByText(/replyBar\.aiBadge/i)).not.toBeInTheDocument();
    expect(screen.getByText("replyBar.sendSuccess")).toBeInTheDocument();
  });

  it("calls onReplyQueued with the optimistic message from a 202 outbox response", async () => {
    const optimisticMessage = {
      id: "msg-queued-1",
      direction: "outbound",
      sender_external_id: "agent@kairo.dev",
      sender_display_name: "agent@kairo.dev",
      body_plain: "On it, thanks for your patience!",
      body_html: null,
      snippet: "On it, thanks for your patience!",
      received_at: "2026-06-07T12:00:00.000Z",
      delivery_status: "queued",
    };
    apiCallMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, messageId: optimisticMessage.id, deliveryStatus: "queued", message: optimisticMessage }),
    });

    const onReplyQueued = vi.fn();
    renderWithProviders(<ReplyBar onReplyQueued={onReplyQueued} />);
    useTriageStore.getState().selectTicket("ticket-1");

    const composer = await screen.findByPlaceholderText("ticketDetail.replyPlaceholder");
    await userEvent.type(composer, "On it, thanks for your patience!");
    await userEvent.click(screen.getByRole("button", { name: "ticketDetail.send" }));

    await waitFor(() => expect(onReplyQueued).toHaveBeenCalledTimes(1));
    expect(onReplyQueued).toHaveBeenCalledWith(optimisticMessage);
    expect(screen.getByText("replyBar.sendSuccess")).toBeInTheDocument();
  });

  it("shows the no-Gmail-integration error using the response error code", async () => {
    apiCallMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: "No Gmail integration found", code: "NO_GMAIL_INTEGRATION" }),
    });

    renderWithProviders(<ReplyBar />);
    useTriageStore.getState().selectTicket("ticket-1");

    const composer = await screen.findByPlaceholderText("ticketDetail.replyPlaceholder");
    await userEvent.type(composer, "Trying to reply...");
    await userEvent.click(screen.getByRole("button", { name: "ticketDetail.send" }));

    expect(await screen.findByText("replyBar.errorNoGmail")).toBeInTheDocument();
  });
});
