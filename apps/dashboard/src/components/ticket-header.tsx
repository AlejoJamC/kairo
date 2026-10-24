// Ticket bar and ticket heading: where the agent is in the queue and the
// subject, classification and SLA of the open ticket.

import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Ticket, TicketStatus } from "@kairo/types";
import { useTriageStore } from "@kairo/client-core/stores/triage-store";
import { assignTicket, setTicketStatus } from "@kairo/client-core/endpoints";
import { useTicketMenuRequest } from "@/hooks/use-ticket-menu-request";
import { useTicketListVisibility } from "@/hooks/use-ticket-list-visibility";
import { formatRelativeTime } from "@/lib/relative-time";
import { Button, Icon, StatusChip, TicketBar, TicketHeading, type PriorityLevel, type StatusKey } from "@kairo/ui";
import { normalizeTicketCategory, normalizeTicketType } from "@/lib/ticket-labels";
import { INTERNAL_NOTES_ENABLED } from "@/lib/internal-notes-flags";
import { useTicketCorrection } from "@/components/ticket-correction";

// VITE_FF_ENABLE_ASSIGN_TO_ME — OFF unless exactly "true"; safe unset.
function isFlagEnabled(value: string | undefined): boolean {
  return value === "true";
}

const assignToMeEnabled = isFlagEnabled(import.meta.env.VITE_FF_ENABLE_ASSIGN_TO_ME);

// Statuses an agent can move an open ticket to from the bar. Escalation has its
// own flow in the context panel.
const STATUS_OPTIONS: TicketStatus[] = ["open", "in_progress", "awaiting_customer", "resolved"];

interface TicketHeaderProps {
  ticket: Ticket;
  /** Name of the queue the ticket was opened from ("Triage"). */
  queueName: string;
  // KAI-25 — true for historical tickets opened from the related-history
  // drawer (resolved/ai_resolved). Hides mutation actions so the bar matches
  // the read-only detail view.
  readOnly?: boolean;
  /** Opens the Notes tab of the context panel. */
  onOpenNotes?: () => void;
}

export function TicketHeader({ ticket, queueName, readOnly = false, onOpenNotes }: TicketHeaderProps) {
  const { t } = useTranslation("dashboard");
  const updateClassification = useTriageStore((s) => s.updateClassification);
  const selectRelativeTicket = useTriageStore((s) => s.selectRelativeTicket);
  const queueIds = useTriageStore((s) => s.queueIds);
  const allTickets = useTriageStore((s) => s.tickets);
  const selectTicket = useTriageStore((s) => s.selectTicket);
  const { hidden: listHidden, showList } = useTicketListVisibility();
  const [assigning, setAssigning] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  useTicketMenuRequest("status", () => setStatusOpen(true));

  const isAssigned = !!ticket.assigned_to;

  // KAI-232 — note count for this ticket, from the shared store.
  const noteCount = useTriageStore((s) => s.noteCounts[ticket.id]?.notes) ?? 0;

  const index = queueIds.indexOf(ticket.id);
  const position = index >= 0 ? { index: index + 1, total: queueIds.length } : undefined;

  async function handleAssign() {
    if (assigning || isAssigned) return;
    setAssigning(true);
    try {
      const res = await assignTicket(ticket.id);
      if (res.ok) {
        const body = await res.json() as { ticket?: Partial<Ticket> };
        if (body.ticket) updateClassification(ticket.id, body.ticket);
      }
    } catch {
      // silent fail — user can retry
    } finally {
      setAssigning(false);
    }
  }

  async function handleStatus(status: StatusKey) {
    if (updating || status === ticket.status) return;
    setUpdating(true);
    try {
      const res = await setTicketStatus(ticket.id, status);
      if (res.ok) {
        const body = await res.json() as { ticket?: Partial<Ticket> };
        if (body.ticket) updateClassification(ticket.id, body.ticket);
      }
    } catch {
      // silent — the chip keeps the previous value
    } finally {
      setUpdating(false);
    }
  }

  const ticketId = ticket.ticket_number ? `KAI-${ticket.ticket_number}` : "";
  const statusOptions = STATUS_OPTIONS.map((status) => ({ status, label: t(`ticketStatus.${status}`) }));

  const status: ReactNode = (
    <>
      {!readOnly && (isAssigned || assignToMeEnabled) && (
        <Button
          variant={isAssigned ? "secondary" : "primary"}
          disabled={isAssigned}
          loading={assigning}
          loadingLabel={t("ticketHeader.assigning", "Asignando…")}
          icon={isAssigned ? <Icon name="check" size={12} color="var(--kairo-color-ok)" /> : undefined}
          onPress={handleAssign}
        >
          {isAssigned ? t("ticketHeader.assigned", "Asignado") : t("ticketHeader.assignToMe", "Asignar a mí")}
        </Button>
      )}
      <StatusChip
        status={ticket.status as StatusKey}
        options={statusOptions}
        onChange={handleStatus}
        readOnly={readOnly}
        readOnlyLabel={t("ticketHeader.readOnlyBadge")}
        updating={updating}
        menuLabel={t("ticketHeader.statusMenu")}
        menu={{ open: statusOpen, onOpenChange: setStatusOpen }}
      />
    </>
  );

  return (
    <TicketBar
      queueName={queueName}
      ticketId={ticketId}
      position={position}
      // KAI-232 spec A1 — how many internal notes this ticket carries.
      notes={
        INTERNAL_NOTES_ENABLED && noteCount > 0 && onOpenNotes
          ? { count: noteCount, label: t("notes.headerCount", { count: noteCount, defaultValue: "{{count}} notes" }), ariaLabel: t("ticketHeader.viewNotes", { count: noteCount }), onOpen: onOpenNotes }
          : undefined
      }
      escalatedLabel={ticket.status === "escalated" ? t("ticketHeader.escalated") : undefined}
      status={status}
      listHidden={
        listHidden
          ? {
              showLabel: showList.label,
              shortcut: showList.shortcut,
              keyshortcuts: showList.keyshortcuts,
              controls: showList.controls,
              onShow: showList.onShow,
              switcher: {
                label: t("ticketList.switcherLabel", { queue: queueName }),
                count: String(queueIds.length),
                items: queueIds.flatMap((id) => {
                  const entry = allTickets.find((candidate) => candidate.id === id);
                  if (!entry) return [];
                  return [{
                    id,
                    priority: entry.priority,
                    code: entry.ticket_number ? `KAI-${entry.ticket_number}` : "",
                    subject: entry.subject ?? "—",
                    age: formatRelativeTime(entry.received_at ?? entry.created_at, t),
                    current: id === ticket.id,
                  }];
                }),
                onSelect: selectTicket,
                pinLabel: t("ticketList.pin"),
                footer: t("ticketList.switcherFooter"),
              },
            }
          : undefined
      }
      hasPrevious={index > 0}
      hasNext={index >= 0 && index < queueIds.length - 1}
      onPrevious={() => selectRelativeTicket(-1)}
      onNext={() => selectRelativeTicket(1)}
      labels={{
        path: t("ticketHeader.path"),
        position: position ? t("ticketHeader.position", { index: position.index, total: position.total }) : "",
        previous: t("ticketHeader.previous"),
        next: t("ticketHeader.next"),
      }}
    />
  );
}

interface TicketHeadingBlockProps {
  ticket: Ticket;
  readOnly?: boolean;
  /** The SLA indicator of the ticket (full variant), or nothing. */
  sla?: ReactNode;
}

export function TicketHeadingBlock({ ticket, readOnly = false, sla }: TicketHeadingBlockProps) {
  const { t } = useTranslation("dashboard");
  const { reclassify, changePriority } = useTicketCorrection(ticket);
  const [priorityOpen, setPriorityOpen] = useState(false);
  useTicketMenuRequest("priority", () => setPriorityOpen(true));
  useTicketMenuRequest("reclassify", () => reclassify.onOpenChange(true));
  const categoryKey = normalizeTicketCategory(ticket.category);
  const typeKey = ticket.ticket_type ? normalizeTicketType(ticket.ticket_type) : null;

  return (
    <TicketHeading
      subject={ticket.subject ?? t("ticketDetail.noSubject", "(Sin asunto)")}
      classifying={!ticket.classified_at && !ticket.priority && !typeKey && !categoryKey}
      priority={ticket.priority as PriorityLevel | null}
      priorityOptions={["P1", "P2", "P3"]}
      onPriorityChange={(level) => void changePriority(level)}
      priorityMenu={{ open: priorityOpen, onOpenChange: setPriorityOpen }}
      categories={[
        ...(typeKey ? [{ id: "type", scale: "ticketType" as const, value: typeKey, label: t(`ticketTypes.${typeKey}`) }] : []),
        ...(categoryKey ? [{ id: "category", scale: "category" as const, value: categoryKey, label: t(`ticketCategories.${categoryKey}`) }] : []),
      ]}
      reclassify={ticket.classified_at ? reclassify : undefined}
      sla={sla}
      readOnly={readOnly}
      labels={{
        priorityChip: (priority) => t("ticketHeading.priorityChip", { priority }),
        priorityMenu: t("ticketHeading.priorityMenu"),
        wrongClassification: t("correction.triggerLabel"),
        classifying: t("ticketHeading.classifying"),
      }}
    />
  );
}
