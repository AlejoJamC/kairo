import { TicketDecisions } from './ticket-decisions';
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ReplyBar } from "./reply-bar";
import { TicketHeader, TicketHeadingBlock } from "./ticket-header";
import { isTriageActive, isTicketReadOnly } from "@kairo/client-core/triage-status";
import { useTriageStore } from "@kairo/client-core/stores/triage-store";
import { useTicketThread, type ThreadMessage } from "@kairo/client-core/hooks/use-ticket-thread";
import { INTERNAL_NOTES_ENABLED } from "@/lib/internal-notes-flags";
import { NoteBody } from "./triage/note-body";
import { TeamOnlyChip } from "./triage/note-primitives";
import { Avatar, Box, Chip, Icon, Pressable, ReadOnlyBar, SlaIndicator, Text, ThreadMessage as ThreadMessageView } from "@kairo/ui";
import { startGmailConnect } from "@kairo/client-core/endpoints";
import type { Ticket } from "@kairo/types";
import { computeTicketOperationalSla } from "@kairo/types";
import { formatDuration, slaDisplay } from "@/lib/sla-display";
import { useActiveView } from "@/hooks/useActiveView";

// Delay before clearing the selection once the open ticket leaves the active queue.
const CLEAR_AFTER_LEAVING_ACTIVE_MS = 2500;

// KAI-232 — how long a message stays ring-highlighted after being scrolled to.
const HIGHLIGHT_DURATION_MS = 2000;

// ---------------------------------------------------------------------------
// KAI-168 — operational SLA (by ticket priority). Shown under the subject while
// there is no first response. Own domain — computed client-side from the
// ticket's own priority/received_at/first_response_at plus the account's SLA
// config (tickets arrive raw from Supabase, so this can't be a pre-computed
// field on the wire — see computeTicketOperationalSla).
// ---------------------------------------------------------------------------

// Smallest comfortable width for this column — same constant already used as
// `centerMin` by useResizablePanel (apps/dashboard/src/hooks/use-resizable-panel.ts)
// to keep this exact column readable when the right panel is dragged wider.
const CENTER_PANEL_MIN_WIDTH = 520;

// Name of the queue the open ticket belongs to, for the breadcrumb of the ticket bar.
const VIEW_LABEL_KEY = {
  triage: "ticketList.header",
  awaiting: "sidebar.pendingClient",
  resolved: "sidebar.resolved",
  escalated: "sidebar.escalation",
  "ai-review": "sidebar.aiReview",
} as const;

function PrioritySlaBar({ ticket }: { ticket: Ticket }) {
  const { t } = useTranslation("dashboard");
  const config = useTriageStore((s) => s.operationalSlaConfig);
  const sla = useMemo(() => computeTicketOperationalSla(ticket, config), [ticket, config]);
  if (!sla || ticket.first_response_at) return null;

  const { status, seconds, progress } = slaDisplay(sla);

  return (
    <SlaIndicator
      variant="full"
      status={status}
      label={t(`sla.full.${status}`, { time: formatDuration(seconds) })}
      note={t("sla.noResponse")}
      progress={status === "overdue" ? 1 : progress}
    />
  );
}

// ---------------------------------------------------------------------------
// Sender avatar (initials circle)
// ---------------------------------------------------------------------------

function SenderAvatar({ name, email }: { name: string | null; email: string | null }) {
  return <Avatar soft size={36} name={name} email={email} />;
}

// ---------------------------------------------------------------------------
// MessageCard — renders a single thread message
// ---------------------------------------------------------------------------

// sender_external_id stores the raw `From:` header (e.g. "Name <email>"), not
// a bare email — extract the address before displaying it next to the name.
function extractEmailAddress(raw: string): string {
  const angleMatch = raw.match(/<([^>]+)>/);
  if (angleMatch?.[1]) return angleMatch[1].trim();
  return raw.trim();
}

function MessageCard({ message, jumped = false }: { message: ThreadMessage; jumped?: boolean }) {
  const { t } = useTranslation("dashboard");
  const isOutbound = message.direction === "outbound";
  const isInternal = message.direction === "internal";

  const senderLabel = isInternal || isOutbound
    ? (message.sender_display_name ?? message.sender_external_id ?? t("ticketDetail.agent", "Agent"))
    : (message.sender_display_name ?? message.sender_external_id ?? t("ticketDetail.unknownSender", "Unknown sender"));

  const senderEmail = !isOutbound && !isInternal && message.sender_display_name && message.sender_external_id
    ? `<${extractEmailAddress(message.sender_external_id)}>`
    : "";

  const timestamp = message.received_at
    ? new Date(message.received_at).toLocaleString()
    : "";

  const bodyText = message.body_plain ?? message.snippet ?? null;

  const body = bodyText ? (
    <Text tag="pre" display="block" fontSize={13} lineHeightRatio={1.65} whiteSpace="pre-wrap" wordBreak="break-word" overflowX="hidden" margin={0}>
      {bodyText}
    </Text>
  ) : null;

  if (isInternal) {
    return (
      <ThreadMessageView
        variant="note"
        avatar={<Avatar name={message.sender_display_name} email={message.sender_external_id} seed={message.author_id ?? message.sender_external_id} size={22} />}
        name={message.is_own_note ? t("notes.you", "You") : senderLabel}
        tag={
          <>
            <TeamOnlyChip />
            {/* Only exists while the jump highlight is running. */}
            {jumped && (
              <Text font="mono" fontSize={9.5} color="var(--k-note-label)" backgroundColor="color-mix(in srgb, var(--kairo-color-warn) 16%, transparent)" paddingVertical={2} paddingHorizontal={6} borderRadius={3} letterSpacing={0.38}>
                ↳ {t("notes.jumpedFromNotes", "JUMPED FROM NOTES")}
              </Text>
            )}
          </>
        }
        meta={timestamp}
        missingBody={t("ticketDetail.noBody", "No email body available.")}
      >
        {/* Mention tokens render as chips, never as raw @[user:…]. */}
        {bodyText ? <NoteBody body={bodyText} mentions={message.mentions} fontSize={13.5} lineHeightRatio={1.6} /> : null}
      </ThreadMessageView>
    );
  }

  const tag = (
    <>
      {message.is_origin && <Chip tone="accent" size="sm">{t("ticketDetail.originMessage", "Initial message")}</Chip>}
      {isOutbound && <Chip size="sm">{t("ticketDetail.outbound", "Reply sent")}</Chip>}
      {isOutbound && message.delivery_status && message.delivery_status !== "sent" && (
        <Chip size="sm" tone={message.delivery_status === "failed" ? "neutral" : "note"}>
          {message.delivery_status === "failed" ? t("ticketDetail.deliveryFailed", "Failed to send") : t("ticketDetail.deliverySending", "Sending…")}
        </Chip>
      )}
      {isOutbound && message.delivery_status === "failed" && message.send_error?.code === "INSUFFICIENT_SCOPE" && (
        <Pressable type="button" onClick={() => { startGmailConnect(); }} fontSize={10} fontWeight={600} color="var(--k-accent)" textDecoration="underline">
          {t("ticketDetail.reconnectGmail", "Reconnect Gmail to retry")}
        </Pressable>
      )}
    </>
  );

  return (
    <ThreadMessageView
      variant={isOutbound ? "reply" : "initial"}
      avatar={
        isOutbound ? (
          <Avatar name={message.sender_display_name} email={message.sender_external_id} size={36} />
        ) : (
          <SenderAvatar name={message.sender_display_name} email={message.sender_external_id} />
        )
      }
      name={senderLabel}
      tag={tag}
      meta={`${senderEmail}${timestamp ? (senderEmail ? ` · ${timestamp}` : timestamp) : ""}`}
      missingBody={t("ticketDetail.noBody", "No email body available.")}
    >
      {body}
    </ThreadMessageView>
  );
}

// ---------------------------------------------------------------------------
// TicketDetail
// ---------------------------------------------------------------------------

export function TicketDetail() {
  const { t } = useTranslation("dashboard");
  const { tickets, selectedTicketId, selectTicket } = useTriageStore();
  const requestPanelTab = useTriageStore((state) => state.requestPanelTab);
  const [view] = useActiveView();
  const labelKey = (VIEW_LABEL_KEY as Record<string, (typeof VIEW_LABEL_KEY)[keyof typeof VIEW_LABEL_KEY]>)[view ?? "triage"] ?? VIEW_LABEL_KEY.triage;
  const queueName = t(labelKey);
  const ticket = tickets.find((t) => t.id === selectedTicketId) ?? null;

  const { messages: allMessages, loading: threadLoading, appendOptimisticMessage } = useTicketThread(ticket?.id ?? null);

  // KAI-232: with the internal-notes flag OFF the thread is customer-only —
  // notes are never rendered, restoring the pre-KAI-221 surface.
  const messages = useMemo(
    () => (INTERNAL_NOTES_ENABLED ? allMessages : allMessages.filter((m) => m.direction !== "internal")),
    [allMessages],
  );

  // KAI-232 — cross-panel scroll target (ADR-011): the Notes tab and mention
  // notifications ask the thread to reveal one specific message.
  const scrollToMessageId = useTriageStore((s) => s.scrollToMessageId);
  const clearScrollToMessage = useTriageStore((s) => s.clearScrollToMessage);
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);

  useEffect(() => {
    if (!scrollToMessageId) return;
    const el = messageRefs.current.get(scrollToMessageId);
    // The thread may still be loading when the request arrives; the effect
    // re-runs once `messages` lands and the ref exists.
    if (!el) return;

    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedMessageId(scrollToMessageId);
    clearScrollToMessage();

    const timer = setTimeout(() => setHighlightedMessageId(null), HIGHLIGHT_DURATION_MS);
    return () => clearTimeout(timer);
  }, [scrollToMessageId, messages, clearScrollToMessage]);

  // KAI-25 — resolved/ai_resolved tickets render read-only (no reply/note input).
  const isReadOnly = ticket ? isTicketReadOnly(ticket.status) : false;

  // Auto-clear the selection on an active->inactive transition for this same
  // ticket (not on tickets already inactive when opened, e.g. browsing Resuelto).
  // Lives here, not in ReplyBar, because ReplyBar unmounts the instant isReadOnly
  // flips true, which would cancel a timer scheduled from inside it.
  const prevActiveRef = useRef<{ ticketId: string | null; active: boolean }>({ ticketId: null, active: false });
  const deselectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const prev = prevActiveRef.current;
    const active = ticket ? isTriageActive(ticket.status) : false;
    const justLeftActiveView = ticket !== null && prev.ticketId === ticket.id && prev.active && !active;

    if (justLeftActiveView && ticket) {
      const ticketId = ticket.id;
      if (deselectTimerRef.current) clearTimeout(deselectTimerRef.current);
      deselectTimerRef.current = setTimeout(() => {
        if (useTriageStore.getState().selectedTicketId === ticketId) {
          selectTicket(null);
        }
      }, CLEAR_AFTER_LEAVING_ACTIVE_MS);
    }

    prevActiveRef.current = { ticketId: ticket?.id ?? null, active };
  }, [ticket, selectTicket]);

  // Cancel a pending auto-clear when navigating away from this ticket, or on unmount.
  useEffect(() => {
    return () => {
      if (deselectTimerRef.current) clearTimeout(deselectTimerRef.current);
    };
  }, [ticket?.id]);

  if (!ticket) {
    return (
      <Box flexGrow={1} flexShrink={1} flexBasis="0%" minWidth={CENTER_PANEL_MIN_WIDTH} display="flex" flexDirection="column" alignItems="center" justifyContent="center" backgroundColor="var(--k-surface)" gap={8}>
        <Icon name="mail" size={40} color="var(--k-border)" />
        <Text tag="p" fontSize={13} color="var(--k-text-tertiary)" display="block">
          {t("ticketDetail.selectPrompt", "Select a ticket to view details")}
        </Text>
      </Box>
    );
  }

  const receivedDate = ticket.received_at
    ? new Date(ticket.received_at).toLocaleString()
    : null;

  return (
    <Box flexGrow={1} flexShrink={1} flexBasis="0%" minWidth={CENTER_PANEL_MIN_WIDTH} display="flex" flexDirection="column" overflow="hidden" backgroundColor="var(--k-surface)">
      <TicketHeader ticket={ticket} queueName={queueName} readOnly={isReadOnly} onOpenNotes={() => requestPanelTab("notes")} />

      {/* Scrollable body */}
      <Box flexGrow={1} flexShrink={1} flexBasis="0%" minHeight={0} scroll>
        <Box maxWidth={780} display="flex" flexDirection="column" gap={22} paddingTop={28} paddingHorizontal={32} paddingBottom={32}>
          <TicketHeadingBlock ticket={ticket} readOnly={isReadOnly} sla={<PrioritySlaBar ticket={ticket} />} />

          <TicketDecisions ticketId={ticket.id} />

          {/* Thread: render message cards if available, fallback to legacy body_plain */}
          {threadLoading ? (
            /* Skeleton while loading */
            <Box backgroundColor="white" borderWidth={1} borderColor="var(--k-border)" borderRadius={12} paddingVertical={18} paddingHorizontal={20} opacity={0.5} borderStyle="solid">
              <Box height={14} backgroundColor="var(--k-border)" borderRadius={4} marginBottom={8} width="60%" />
              <Box height={14} backgroundColor="var(--k-border)" borderRadius={4} width="90%" />
            </Box>
          ) : messages.length > 0 ? (
            /* Thread view — N message cards in chronological order */
            <Box display="flex" flexDirection="column" gap={16}>
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  ref={(el) => {
                    if (el) messageRefs.current.set(msg.id, el);
                    else messageRefs.current.delete(msg.id);
                  }}
                  // KAI-232 spec B5: outline + amber halo fading out over 1.6s.
                  // Driven by a CSS class so the animation cannot drift from the
                  // token values (see .note-jump-highlight in index.css).
                  className={highlightedMessageId === msg.id ? "note-jump-highlight" : undefined}
                >
                  <MessageCard message={msg} jumped={highlightedMessageId === msg.id} />
                </div>
              ))}
            </Box>
          ) : (
            /* Fallback — pre-backfill safety net: render legacy body_plain */
            <>
              {/* Sender row (legacy) */}
              <Box display="flex" alignItems="flex-start" gap={10}>
                <SenderAvatar name={ticket.from_name} email={ticket.from_email} />
                <Box flexGrow={1} flexShrink={1} flexBasis="0%" minWidth={0}>
                  <Text tag="p" fontSize={13} fontWeight={600} color="var(--k-text-primary)" marginTop={0} marginHorizontal={0} marginBottom={2} overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap" display="block">
                    {ticket.from_name ?? ticket.from_email ?? t("ticketDetail.unknownSender", "Unknown sender")}
                  </Text>
                  <Text tag="p" fontSize={12} color="var(--k-text-tertiary)" margin={0} overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap" display="block">
                    {ticket.from_email && ticket.from_name ? `<${ticket.from_email}>` : ""}
                    {receivedDate ? ` · ${receivedDate}` : ""}
                  </Text>
                </Box>
              </Box>

              {/* Email body card (legacy) */}
              <Box backgroundColor="white" borderWidth={1} borderColor="var(--k-border)" borderRadius={12} overflow="hidden" borderStyle="solid">
                <Text tag="div" paddingTop={18} paddingHorizontal={20} paddingBottom={22} fontSize={14} color="var(--k-text-primary)" lineHeight={23.1} display="block">
                  {ticket.body_plain ? (
                    <Text tag="pre" display="block" fontSize={14} lineHeightRatio={1.65} whiteSpace="pre-wrap" wordBreak="break-word" overflowX="hidden" color="var(--k-text-primary)" margin={0}>
                      {ticket.body_plain}
                    </Text>
                  ) : ticket.snippet ? (
                    <Text tag="p" margin={0} lineHeightRatio={1.65} display="block">{ticket.snippet}</Text>
                  ) : (
                    <Text tag="p" margin={0} fontStyle="italic" color="var(--k-text-tertiary)" display="block">
                      {t("ticketDetail.noBody", "No email body available.")}
                    </Text>
                  )}
                </Text>
              </Box>
            </>
          )}
        </Box>
      </Box>

      {/* Fixed bottom reply bar — hidden for read-only historical tickets */}
      {isReadOnly ? (
        <ReadOnlyBar>{t("ticketDetail.readOnlyBanner")}</ReadOnlyBar>
      ) : (
        <ReplyBar onReplyQueued={appendOptimisticMessage} />
      )}
    </Box>
  );
}
