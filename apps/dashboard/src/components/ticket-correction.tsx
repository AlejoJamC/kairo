// Correction of the AI classification from the ticket heading: a new priority
// from its menu and the type and category from the reclassify popover. Both
// post to the correction endpoint and update the ticket in the store.

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { correctClassification } from "@kairo/client-core/endpoints";
import { useTriageStore } from "@kairo/client-core/stores/triage-store";
import { TICKET_CATEGORIES, TICKET_TYPES, type Ticket } from "@kairo/types";
import { normalizeTicketCategory, normalizeTicketType } from "@/lib/ticket-labels";
import type { ReclassifyOption, ReclassifyPopoverProps } from "@kairo/ui";

type Patch = Partial<Pick<Ticket, "priority" | "ticket_type" | "category">>;

const typeId = (value: string) => `type:${value}`;
const categoryId = (value: string) => `category:${value}`;

export function useTicketCorrection(ticket: Ticket) {
  const { t } = useTranslation("dashboard");
  const applyCorrection = useTriageStore((state) => state.applyCorrection);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<{ type: string | null; category: string | null } | null>(null);

  const current = useMemo(
    () => ({
      type: ticket.ticket_type ? normalizeTicketType(ticket.ticket_type) : null,
      category: ticket.category ? normalizeTicketCategory(ticket.category) : null,
    }),
    [ticket.ticket_type, ticket.category],
  );
  const selection = picked ?? current;

  const options: ReclassifyOption[] = useMemo(
    () => [
      ...TICKET_TYPES.map((value) => ({ id: typeId(value), scale: "ticketType" as const, value, label: t(`ticketTypes.${normalizeTicketType(value)}`) })),
      ...TICKET_CATEGORIES.map((value) => ({ id: categoryId(value), scale: "category" as const, value, label: t(`ticketCategories.${normalizeTicketCategory(value) ?? value}`) })),
    ],
    [t],
  );

  const selected = [selection.type ? typeId(selection.type) : null, selection.category ? categoryId(selection.category) : null].filter((id): id is string => id !== null);
  const changed = selection.type !== current.type || selection.category !== current.category;

  async function post(body: Record<string, string>, patch: Patch): Promise<boolean> {
    try {
      const response = await correctClassification(ticket.id, body);
      if (!response.ok) return false;
      applyCorrection(ticket.id, patch);
      return true;
    } catch {
      return false;
    }
  }

  const reclassify: Omit<ReclassifyPopoverProps, "trigger"> = {
    open,
    onOpenChange: (next) => {
      setOpen(next);
      if (!next) {
        setPicked(null);
        setError(null);
      }
    },
    options,
    selected,
    onToggle: (id) => {
      const [scale, value] = id.split(":") as ["type" | "category", string];
      setPicked({ ...selection, [scale]: selection[scale] === value ? null : value });
    },
    onSave: async () => {
      setSaving(true);
      setError(null);
      const body: Record<string, string> = {};
      const patch: Patch = {};
      if (selection.type && selection.type !== current.type) {
        body.correct_ticket_type = selection.type;
        patch.ticket_type = selection.type as Ticket["ticket_type"];
      }
      if (selection.category && selection.category !== current.category) {
        body.correct_category = selection.category;
        patch.category = selection.category as Ticket["category"];
      }
      const ok = await post(body, patch);
      setSaving(false);
      if (ok) {
        setOpen(false);
        setPicked(null);
      } else {
        setError(t("correction.errorGeneric"));
      }
    },
    canSave: changed && selected.length > 0,
    saving,
    error: error ?? undefined,
    labels: {
      title: t("correction.dialogTitle"),
      explanation: t("correction.explanation"),
      categories: t("correction.categories"),
      cancel: t("correction.cancel"),
      save: t("correction.save"),
    },
  };

  return {
    reclassify,
    changePriority: (priority: "P1" | "P2" | "P3") => post({ correct_priority: priority }, { priority }),
  };
}
