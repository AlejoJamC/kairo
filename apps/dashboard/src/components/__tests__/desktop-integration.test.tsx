import * as React from "react";
import { act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render-with-providers";
import { DesktopIntegration } from "@/components/desktop-integration";
import { useTriageStore } from "@kairo/client-core/stores/triage-store";
import { useAppCommands } from "@/lib/app-commands";

const host = {
  os: "macos" as const,
  setBadge: vi.fn(),
  setMenu: vi.fn(),
  setWindowSize: vi.fn(),
  setMinWindowSize: vi.fn(),
  startSignInListener: vi.fn(),
  onMenuAction: vi.fn(),
  notify: vi.fn(),
};
let menuListener: ((id: string) => void) | null = null;
let feedListener: ((rows: unknown[]) => void) | null = null;

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string>) => `${key}${options ? JSON.stringify(options) : ""}`,
    i18n: { language: "es", getResourceBundle: () => ({ desktop: { menu: { resolve: "Resolver", "go-resolved": "Resuelto" } } }) },
  }),
}));
vi.mock("@kairo/client-core/config", () => ({
  getPlatform: () => ({ host, appFocus: { subscribe: () => () => {} } }),
}));
vi.mock("@kairo/client-core/auth", () => ({ useAuth: () => ({ signOut: vi.fn() }) }));
vi.mock("@/hooks/useLocale", () => ({ useLocale: () => ({ language: "es", setLanguage: vi.fn(), supportedLanguages: ["es", "en"] }) }));
vi.mock("@/lib/notification-feed", () => ({
  subscribeNotifications: (listener: (rows: unknown[]) => void) => {
    feedListener = listener;
    return () => {};
  },
}));

const mention = (id: string, readAt: string | null = null) => ({
  id,
  kind: "mention",
  ticket_id: "t1",
  ticket_event_id: "e1",
  ticket_short_id: "KAI-783",
  title: "Dana Acme",
  body: "please check",
  read_at: readAt,
  created_at: "2030-01-01T00:00:00Z",
});

function setup(onViewChange = vi.fn()) {
  renderWithProviders(<DesktopIntegration view="triage" onViewChange={onViewChange} sidebarCollapsed={false} />);
  return { onViewChange };
}

describe("DesktopIntegration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    menuListener = null;
    feedListener = null;
    host.onMenuAction.mockImplementation((listener: (id: string) => void) => {
      menuListener = listener;
      return () => {};
    });
    useAppCommands.setState({ presence: "online", paletteRequests: 0, paletteScope: "all" });
  });

  it("sends the native menu with the app language and no dead items", () => {
    setup();
    const groups = JSON.parse(host.setMenu.mock.calls.at(-1)?.[0] as string) as { id: string; items: { id?: string; label?: string; disabled?: boolean }[] }[];
    const go = groups.find((group) => group.id === "go")?.items ?? [];
    expect(go.find((item) => item.id === "go-resolved")?.label).toBe("Resuelto");
    const ticket = groups.find((group) => group.id === "ticket")?.items ?? [];
    expect(ticket.find((item) => item.id === "send")?.disabled).toBe(true);
    expect(groups.find((group) => group.id === "edit")?.items.find((item) => item.id === "copy")?.disabled).not.toBe(true);
  });

  it("runs the app action of the menu item the person picks", () => {
    const { onViewChange } = setup();
    act(() => menuListener?.("go-resolved"));
    expect(onViewChange).toHaveBeenCalledWith("resolved");
    act(() => menuListener?.("search"));
    expect(useAppCommands.getState().paletteRequests).toBe(1);
    expect(useAppCommands.getState().paletteScope).toBe("all");
    act(() => menuListener?.("all-commands"));
    expect(useAppCommands.getState().paletteRequests).toBe(2);
    expect(useAppCommands.getState().paletteScope).toBe("commands");
  });

  it("opens the Assistant tab with Ask Kairo Assistant once a ticket is open", () => {
    useTriageStore.setState({ tickets: [{ id: "t1", status: "open", ticket_number: 1 } as never], selectedTicketId: "t1", panelTabRequest: null });
    setup();
    const groups = JSON.parse(host.setMenu.mock.calls.at(-1)?.[0] as string) as { id: string; items: { id?: string; disabled?: boolean; accelerator?: string }[] }[];
    const ask = groups.find((group) => group.id === "ticket")?.items.find((item) => item.id === "ask-assistant");
    expect(ask?.disabled).not.toBe(true);
    expect(ask?.accelerator).toBe("CmdOrCtrl+J");
    act(() => menuListener?.("ask-assistant"));
    expect(useTriageStore.getState().panelTabRequest?.tab).toBe("assistant");
    useTriageStore.setState({ tickets: [], selectedTicketId: null, panelTabRequest: null });
  });

  it("enables Send once the composer has text and sets priority and status from the Ticket menu", () => {
    useTriageStore.setState({ tickets: [{ id: "t1", status: "open", priority: "P2", ticket_number: 1 } as never], selectedTicketId: "t1", ticketChangeRequest: null });
    useAppCommands.setState({ composerEmpty: false });
    setup();
    const groups = JSON.parse(host.setMenu.mock.calls.at(-1)?.[0] as string) as { id: string; items: { id?: string; disabled?: boolean; items?: { id?: string; checked?: boolean }[] }[] }[];
    const ticket = groups.find((group) => group.id === "ticket")?.items ?? [];
    expect(ticket.find((item) => item.id === "send")?.disabled).not.toBe(true);
    expect(ticket.find((item) => item.id === "priority")?.items?.find((item) => item.id === "priority-p2")?.checked).toBe(true);
    expect(ticket.find((item) => item.id === "status")?.items?.map((item) => item.id)).toEqual(["status-open", "status-in_progress", "status-awaiting_customer", "status-resolved"]);
    act(() => menuListener?.("priority-p1"));
    expect(useTriageStore.getState().ticketChangeRequest).toMatchObject({ kind: "priority", value: "P1" });
    act(() => menuListener?.("status-resolved"));
    expect(useTriageStore.getState().ticketChangeRequest).toMatchObject({ kind: "status", value: "resolved" });
    useTriageStore.setState({ tickets: [], selectedTicketId: null, ticketChangeRequest: null });
    useAppCommands.setState({ composerEmpty: true });
  });

  it("shows the unread count on the app icon, and clears it at zero", () => {
    setup();
    act(() => feedListener?.([mention("a"), mention("b"), mention("c", "2030-01-01T00:00:00Z")]));
    expect(host.setBadge).toHaveBeenLastCalledWith(2);
    act(() => feedListener?.([mention("a", "2030-01-02T00:00:00Z")]));
    expect(host.setBadge).toHaveBeenLastCalledWith(null);
  });

  it("notifies a new mention once, never the ones already there, and nothing while away", () => {
    setup();
    act(() => feedListener?.([mention("a")]));
    expect(host.notify).not.toHaveBeenCalled();
    act(() => feedListener?.([mention("a"), mention("b")]));
    expect(host.notify).toHaveBeenCalledTimes(1);
    expect(host.notify.mock.calls[0]?.[0]).toContain("desktop.notify.mention");
    act(() => feedListener?.([mention("a"), mention("b")]));
    expect(host.notify).toHaveBeenCalledTimes(1);
    act(() => useAppCommands.getState().setPresence("away"));
    act(() => feedListener?.([mention("a"), mention("b"), mention("c")]));
    expect(host.notify).toHaveBeenCalledTimes(1);
  });
});
