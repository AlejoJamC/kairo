import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Ticket } from "@kairo/types";
import { renderWithProviders } from "@/test/render-with-providers";
import { CorrectionDialog } from "./correction-dialog";

const correctClassification = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@kairo/client-core/endpoints", () => ({
  correctClassification: (...args: unknown[]) => correctClassification(...args),
}));

const ticket = { id: "t-1", priority: "P2", ticket_type: "support", category: "billing", sentiment: "neutral" } as Ticket;

function setup() {
  const onOpenChange = vi.fn();
  const onCorrected = vi.fn();
  renderWithProviders(
    <CorrectionDialog ticket={ticket} open onOpenChange={onOpenChange} onCorrected={onCorrected} />,
  );
  return { onOpenChange, onCorrected };
}

describe("CorrectionDialog", () => {
  beforeEach(() => {
    correctClassification.mockReset();
    correctClassification.mockResolvedValue({ ok: true });
  });

  it("is a labelled modal dialog", () => {
    setup();
    expect(screen.getByRole("dialog", { name: "correction.dialogTitle" })).toBeInTheDocument();
  });

  it("shows every allowed value as a chip and marks the chosen one as pressed", async () => {
    setup();
    const p1 = screen.getByRole("button", { name: "P1" });
    expect(p1).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(p1);
    expect(p1).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(p1);
    expect(p1).toHaveAttribute("aria-pressed", "false");
    expect(screen.getAllByRole("button", { name: /^ticketTypes\./ })).toHaveLength(5);
    expect(screen.getAllByRole("button", { name: /^ticketCategories\./ })).toHaveLength(5);
    expect(screen.getAllByRole("button", { name: /^correction\.tones\./ })).toHaveLength(4);
  });

  it("refuses to save an empty correction", async () => {
    const { onCorrected } = setup();
    await userEvent.click(screen.getByRole("button", { name: "correction.submit" }));
    expect(screen.getByRole("alert")).toHaveTextContent("correction.errorEmpty");
    expect(correctClassification).not.toHaveBeenCalled();
    expect(onCorrected).not.toHaveBeenCalled();
  });

  it("sends only the changed fields and reports them", async () => {
    const { onCorrected } = setup();
    await userEvent.click(screen.getByRole("button", { name: "P1" }));
    await userEvent.click(screen.getByRole("button", { name: "ticketTypes.prospect" }));
    await userEvent.click(screen.getByRole("button", { name: "correction.submit" }));
    await waitFor(() => expect(onCorrected).toHaveBeenCalled());
    expect(correctClassification).toHaveBeenCalledWith("t-1", {
      correct_priority: "P1",
      correct_ticket_type: "prospect",
    });
    expect(onCorrected).toHaveBeenCalledWith({ correct_priority: "P1", correct_ticket_type: "prospect" });
  });

  it("shows a failure and keeps the dialog open when the request is rejected", async () => {
    correctClassification.mockResolvedValue({ ok: false });
    const { onCorrected } = setup();
    await userEvent.click(screen.getByRole("button", { name: "P3" }));
    await userEvent.click(screen.getByRole("button", { name: "correction.submit" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("correction.errorGeneric"));
    expect(onCorrected).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("does not close from the scrim once something was chosen", async () => {
    const { onOpenChange } = setup();
    await userEvent.click(screen.getByRole("button", { name: "P1" }));
    await userEvent.click(screen.getByRole("dialog").parentElement!);
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
