import * as React from "react";
import { JSDOM } from "jsdom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReplyBar } from "./reply-bar";
import { useTriageStore } from "@/stores/triage-store";

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
    render(<ReplyBar />);
    useTriageStore.getState().selectTicket("ticket-1");
    useTriageStore.getState().setSuggestedReply("AI drafted message");

    const textbox = await screen.findByPlaceholderText("ticketDetail.replyPlaceholder");
    await waitFor(() => expect(textbox).toHaveValue("AI drafted message"));
    expect(screen.getByText("replyBar.aiSuggestionBanner")).toBeInTheDocument();
    expect(useTriageStore.getState().aiSuggestedReply).toBeNull();
  });

  it("hides AI banner on manual edit and clears suggestion after successful send", async () => {
    apiCallMock.mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    render(<ReplyBar />);
    useTriageStore.getState().selectTicket("ticket-1");
    useTriageStore.getState().setSuggestedReply("Initial AI text");

    const textbox = await screen.findByPlaceholderText("ticketDetail.replyPlaceholder");
    await waitFor(() => expect(textbox).toHaveValue("Initial AI text"));

    await userEvent.type(textbox, " updated");
    expect(screen.queryByText("replyBar.aiSuggestionBanner")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "ticketDetail.send" }));

    await waitFor(() => expect(apiCallMock).toHaveBeenCalledTimes(1));
    expect(useTriageStore.getState().aiSuggestedReply).toBeNull();
    expect(textbox).toHaveValue("");
    expect(screen.getByText("replyBar.sendSuccess")).toBeInTheDocument();
  });
});
