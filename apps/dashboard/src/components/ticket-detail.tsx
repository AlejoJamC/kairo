import { TicketDecisions } from './ticket-decisions';
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ReplyBar } from "./reply-bar";
import { TicketHeader } from "./ticket-header";
import { isTriageActive, isTicketReadOnly } from "@kairo/client-core/triage-status";
import { useTriageStore } from "@kairo/client-core/stores/triage-store";
import { useTicketThread, type ThreadMessage } from "@kairo/client-core/hooks/use-ticket-thread";
import { INTERNAL_NOTES_ENABLED } from "@/lib/internal-notes-flags";
import { NoteBody } from "./triage/note-body";
import { TeamOnlyChip } from "./triage/note-primitives";
import { Avatar, Box, Icon, Pressable, Text } from "@kairo/ui";
import { startGmailConnect } from "@kairo/client-core/endpoints";
import type { Ticket } from "@kairo/types";
import { computeTicketOperationalSla } from "@kairo/types";

// Delay before clearing the selection once the open ticket leaves the active queue.
const CLEAR_AFTER_LEAVING_ACTIVE_MS = 2500;

// KAI-232 — how long a message stays ring-highlighted after being scrolled to.
const HIGHLIGHT_DURATION_MS = 2000;

// ---------------------------------------------------------------------------
// KAI-168 — operational SLA (by ticket priority) progress bar. Shown below
// the subject, above the AI reasoning banner. Own domain — computed
// client-side from the ticket's own priority/received_at/first_response_at
// plus the account's SLA config (tickets arrive raw from Supabase, so this
// can't be a pre-computed field on the wire — see computeTicketOperationalSla).
// ---------------------------------------------------------------------------

// Smallest comfortable width for this column — same constant already used as
// `centerMin` by useResizablePanel (apps/dashboard/src/hooks/use-resizable-panel.ts)
// to keep this exact column readable when the right panel is dragged wider.
// That value was only ever enforced against the right panel's own max width;
// this applies it as a real min-width on the center column itself, so it no
// longer collapses when the window is narrowed (unlike the ticket-list
// column, fixed at 360px, and the right panel, floored at 340px).
const CENTER_PANEL_MIN_WIDTH = 520;

const PRIORITY_SLA_BAR_COLOR: Record<"ok" | "at_risk" | "breached", string> = {
  ok: "var(--kairo-color-ok)",
  at_risk: "var(--kairo-color-mood)",
  breached: "var(--kairo-color-bad)",
};

// "Xd Xh Xm" — always shows the largest unit down to minutes so nothing
// renders as an unreadable "1171h 25m"; drops leading zero units instead of
// always printing all three (e.g. "19h 25m" under a day, "25m" under an hour).
function formatDurationParts(totalSeconds: number): string {
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function PrioritySlaBar({ ticket }: { ticket: Ticket }) {
  const { t } = useTranslation("dashboard");
  const config = useTriageStore((s) => s.operationalSlaConfig);
  const sla = useMemo(() => computeTicketOperationalSla(ticket, config), [ticket, config]);
  if (!sla) return null;

  const duration = formatDurationParts(sla.status === "breached" ? sla.overdueSeconds : sla.remainingSeconds);

  const detail =
    sla.status === "ok"
      ? t("prioritySla.detailRemaining", { duration })
      : sla.status === "at_risk"
        ? t("prioritySla.detailDueSoon", { duration })
        : t("prioritySla.detailOverdue", { duration });

  const barWidth = Math.min(100, sla.percentUsed);

  return (
    <Box display="flex" flexDirection="column" gap={4}>
      <Box height={6} borderRadius={3} backgroundColor="var(--k-border-subtle)" overflow="hidden">
        <Box height="100%" width={`${barWidth}%`} backgroundColor={PRIORITY_SLA_BAR_COLOR[sla.status]} borderRadius={3} transition="width 0.2s ease" />
      </Box>
      <Text fontSize={12} color={PRIORITY_SLA_BAR_COLOR[sla.status]} fontWeight={500}>{detail}</Text>
    </Box>
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

  // Internal note: amber card, full-width, no avatar offset (KAI-232 spec B5)
  if (isInternal) {
    return (
      <Box display="flex" flexDirection="column" gap={0} borderLeftWidth={3} borderLeftColor="var(--k-note-rail)" backgroundColor="var(--k-note-bg)" borderWidth={1} borderColor="var(--k-note-border)" borderRadius={12} overflow="hidden" borderStyle="solid">
        <Box display="flex" alignItems="center" gap={9} paddingVertical={10} paddingHorizontal={14} borderBottomWidth={1} borderBottomColor="var(--k-note-border)" borderStyle="solid">
          <Avatar
            name={message.sender_display_name}
            email={message.sender_external_id}
            seed={message.author_id ?? message.sender_external_id}
            size={22}
          />
          <Text fontSize={13} fontWeight={500} color="var(--k-note-text-strong)">
            {message.is_own_note ? t("notes.you", "You") : senderLabel}
          </Text>
          <TeamOnlyChip />
          {/* Only exists while the jump highlight is running (spec B5). */}
          {jumped && (
            <Text font="mono" fontSize={9.5} color="var(--k-note-label)" backgroundColor="rgba(245,158,11,0.16)" paddingVertical={2} paddingHorizontal={6} borderRadius={3} letterSpacing={0.38}>
              ↳ {t("notes.jumpedFromNotes", "JUMPED FROM NOTES")}
            </Text>
          )}
          <Text marginLeft="auto" font="mono" fontSize={10.5} color="var(--k-note-label)" flexShrink={0}>
            {timestamp}
          </Text>
        </Box>
        <Box paddingVertical={12} paddingHorizontal={14}>
          {/* KAI-232: mention tokens render as chips, never as raw @[user:…]. */}
          <NoteBody
            body={bodyText}
            mentions={message.mentions}
            fontSize={13.5} lineHeightRatio={1.6} color="var(--k-note-text-strong)"
          />
        </Box>
      </Box>
    );
  }

  return (
    <Box display="flex" flexDirection="column" gap={8} marginLeft={isOutbound ? 48 : 0} marginRight={isOutbound ? 0 : 48}>
      {/* Message header row */}
      <Box display="flex" alignItems="flex-start" gap={10}>
        <SenderAvatar
          name={message.sender_display_name}
          email={message.sender_external_id}
        />
        <Box flexGrow={1} flexShrink={1} flexBasis="0%" minWidth={0}>
          <Box display="flex" alignItems="center" gap={6} flexWrap="wrap">
            <Text tag="p" fontSize={13} fontWeight={600} color="var(--k-text-primary)" margin={0} overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap" display="block">
              {senderLabel}
            </Text>
            {message.is_origin && (
              <Text fontSize={10} fontWeight={600} color="var(--k-accent)" backgroundColor="var(--k-accent-subtle)" borderWidth={1} borderColor="var(--kairo-color-accent-line)" borderRadius={4} paddingVertical={1} paddingHorizontal={5} flexShrink={0} borderStyle="solid">
                {t("ticketDetail.originMessage", "Initial message")}
              </Text>
            )}
            {isOutbound && (
              <Text fontSize={10} fontWeight={600} color="var(--kairo-color-faint)" backgroundColor="var(--kairo-color-hover)" borderWidth={1} borderColor="var(--kairo-color-line)" borderRadius={4} paddingVertical={1} paddingHorizontal={5} flexShrink={0} borderStyle="solid">
                {t("ticketDetail.outbound", "Reply sent")}
              </Text>
            )}
            {isOutbound && message.delivery_status && message.delivery_status !== "sent" && (
              <Text fontSize={10} fontWeight={600} color={message.delivery_status === "failed" ? "var(--kairo-color-bad-ink)" : "var(--kairo-color-note-ink)"} backgroundColor={message.delivery_status === "failed" ? "var(--kairo-color-bad-soft)" : "var(--kairo-color-note-soft)"} borderWidth={1} borderColor={message.delivery_status === "failed" ? "var(--kairo-color-bad-line)" : "var(--kairo-color-note-line)"} borderRadius={4} paddingVertical={1} paddingHorizontal={5} flexShrink={0} borderStyle="solid">
                {message.delivery_status === "failed"
                  ? t("ticketDetail.deliveryFailed", "Failed to send")
                  : t("ticketDetail.deliverySending", "Sending…")}
              </Text>
            )}
            {isOutbound
              && message.delivery_status === "failed"
              && message.send_error?.code === "INSUFFICIENT_SCOPE" && (
              <Pressable type="button" onClick={() => { startGmailConnect(); }} fontSize={10} fontWeight={600} color="var(--k-accent)" backgroundColor="transparent" borderWidth={0} padding={0} cursor="pointer" textDecoration="underline" flexShrink={0}>
                {t("ticketDetail.reconnectGmail", "Reconnect Gmail to retry")}
              </Pressable>
            )}
          </Box>
          <Text tag="p" fontSize={12} color="var(--k-text-tertiary)" margin={0} overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap" display="block">
            {senderEmail}
            {timestamp ? (senderEmail ? ` · ${timestamp}` : timestamp) : ""}
          </Text>
        </Box>
      </Box>

      {/* Message body */}
      <Box backgroundColor={isOutbound ? "var(--k-accent-subtle)" : "white"} borderWidth={1} borderColor={isOutbound ? "var(--kairo-color-accent-line)" : "var(--k-border)"} borderRadius={10} overflow="hidden" paddingVertical={14} paddingHorizontal={16} borderStyle="solid">
        {bodyText ? (
          <Text tag="pre" display="block" fontSize={13} lineHeightRatio={1.65} whiteSpace="pre-wrap" wordBreak="break-word" overflowX="hidden" color="var(--k-text-primary)" margin={0}>
            {bodyText}
          </Text>
        ) : (
          <Text tag="p" margin={0} fontStyle="italic" color="var(--k-text-tertiary)" fontSize={13} display="block">
            {t("ticketDetail.noBody", "No email body available.")}
          </Text>
        )}
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// TicketDetail
// ---------------------------------------------------------------------------

export function TicketDetail() {
  const { t } = useTranslation("dashboard");
  const { tickets, selectedTicketId, selectTicket } = useTriageStore();
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
      <TicketHeader ticket={ticket} readOnly={isReadOnly} />

      {/* Scrollable body */}
      <Box flexGrow={1} flexShrink={1} flexBasis="0%" minHeight={0} scroll paddingVertical={20} paddingHorizontal={28} display="flex" flexDirection="column" gap={14}>
        {/* Subject h1 */}
        <Text tag="h1" fontSize={18} fontWeight={700} color="var(--k-text-primary)" margin={0} lineHeight={23.4} letterSpacing={-0.36} display="block">
          {ticket.subject ?? t("ticketDetail.noSubject", "(Sin asunto)")}
        </Text>

        <PrioritySlaBar ticket={ticket} />
        <TicketDecisions ticketId={ticket.id} />

        {/* AI reasoning banner */}
        {ticket.ai_reasoning && (
          <Box display="flex" gap={8} alignItems="flex-start" paddingVertical={8} paddingHorizontal={10} backgroundColor="var(--k-accent-subtle)" borderRadius={6} borderWidth={1} borderColor="var(--kairo-color-accent-line)" borderStyle="solid">
            <Icon name="spark" size={13} color="var(--k-accent)" marginTop={1} />
            <Text tag="div" fontSize={12} color="var(--k-text-secondary)" flexGrow={1} flexShrink={1} flexBasis="0%" lineHeight={18} display="block">
              <Text color="var(--k-accent)" fontWeight={500}>
                Triage Intelligence
              </Text>{" "}
              {ticket.ai_reasoning}
            </Text>
          </Box>
        )}

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

      {/* Fixed bottom reply bar — hidden for read-only historical tickets */}
      {isReadOnly ? (
        <Text tag="div" borderTopWidth={1} borderTopColor="var(--k-border)" paddingVertical={10} paddingHorizontal={16} fontSize={12} color="var(--k-text-tertiary)" backgroundColor="var(--k-surface)" textAlign="center" flexShrink={0} display="block" borderStyle="solid">
          {t("ticketDetail.readOnlyBanner")}
        </Text>
      ) : (
        <ReplyBar onReplyQueued={appendOptimisticMessage} />
      )}
    </Box>
  );
}
