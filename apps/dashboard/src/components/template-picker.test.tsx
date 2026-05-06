import { JSDOM } from "jsdom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TemplatePicker } from "./template-picker";

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

describe("TemplatePicker", () => {
  it("shows dummy template when /v1/templates fails", async () => {
    apiCallMock.mockRejectedValueOnce(new Error("network error"));

    render(
      <TemplatePicker onSelect={() => {}}>
        <button type="button">Open templates</button>
      </TemplatePicker>
    );

    await userEvent.click(screen.getByRole("button", { name: "Open templates" }));

    await waitFor(() => {
      expect(screen.getByText("templatePicker.dummyFormalGreetingTitle")).toBeInTheDocument();
    });
  });
});
