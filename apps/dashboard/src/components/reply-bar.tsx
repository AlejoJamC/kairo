import * as React from "react";
import { useTranslation } from "react-i18next";
import { TemplatePicker, type TemplatePreviewVars } from "./template-picker";
import { useTriageStore } from "@kairo/client-core/stores/triage-store";
import { replyToTicket, addTicketNote, setTicketStatus, escalateTicket } from "@kairo/client-core/endpoints";
import { isFlagEnabled } from "@/lib/feature-flags";
import { INTERNAL_NOTES_ENABLED } from "@/lib/internal-notes-flags";
import { useAccountMembers, filterMembers, type AccountMember } from "@kairo/client-core/hooks/use-account-members";
import {
  findActiveMentionQuery,
  insertMentionToken,
  extractMentionUserIds,
  removeMentionToken,
} from "@kairo/client-core/note-mentions";
import { TeamOnlyChip } from "./triage/note-primitives";
import { Avatar, Box, Composer, ComposerPill, Icon, MentionList, PlainTextarea, Pressable, Text, type PressableProps, type SendOption } from "@kairo/ui";
import { useAuth } from "@kairo/client-core/auth";
import type { ThreadMessage } from "@kairo/client-core/hooks/use-ticket-thread";
import type { TicketStatus } from "@kairo/types";

// KAI-232 — how many member suggestions the @mention dropdown shows at once.
const MENTION_SUGGESTION_LIMIT = 6;

// KAI-232 — note length cap, mirroring the API's InternalNoteSchema. The
// counter only appears near the limit so it isn't noise while writing.
const NOTE_MAX_LENGTH = 2000;
const NOTE_COUNTER_THRESHOLD = 1800;

// Same flag that gates the right-panel Escalation tab (ai-assistant.tsx).
const escalateTabEnabled = isFlagEnabled(import.meta.env.VITE_FF_ENABLE_ESCALATE_TAB);

// ---------------------------------------------------------------------------
// Compose mode — "reply" sends to customer; "note" = internal-only
// ---------------------------------------------------------------------------

type ComposeMode = "reply" | "note";

// ---------------------------------------------------------------------------
// Lifecycle action buttons
// ---------------------------------------------------------------------------

type TicketAction = "reconocer" | "resolver";

const ACTION_CONFIG: Record<
  TicketAction,
  { labelKey: string; defaultLabel: string; status: TicketStatus; style: PressableProps }
> = {
  reconocer: {
    labelKey: "replyBar.actionReconocer",
    defaultLabel: "Acknowledge",
    status: "in_progress",
    style: {
      backgroundColor: "var(--kairo-color-accent-soft)",
      color: "var(--kairo-color-accent)",
      borderWidth: 1,
      borderStyle: "solid",
      borderColor: "var(--kairo-color-accent-line)",
    },
  },
  resolver: {
    labelKey: "replyBar.actionResolver",
    defaultLabel: "Resolve",
    status: "resolved",
    style: {
      backgroundColor: "color-mix(in srgb, var(--kairo-color-ok) 8%, transparent)",
      color: "var(--kairo-color-ok-ink)",
      borderWidth: 1,
      borderStyle: "solid",
      borderColor: "color-mix(in srgb, var(--kairo-color-ok) 24%, transparent)",
    },
  },
};

// KAI-191 — statuses in which the Escalate action is offered. Exhaustive
// over TicketStatus so a new status forces an explicit decision here.
const IS_ESCALATABLE_STATUS: Record<TicketStatus, boolean> = {
  open: true,
  in_progress: true,
  reopened: true,
  awaiting_customer: true,
  resolved: false,
  ai_resolved: false,
  escalated: false,
  closed: false,
};

const ESCALATABLE_STATUSES: TicketStatus[] = (
  Object.entries(IS_ESCALATABLE_STATUS) as [TicketStatus, boolean][]
)
  .filter(([, escalatable]) => escalatable)
  .map(([status]) => status);

// ---------------------------------------------------------------------------
// KAI-232 · design spec C7/C8 — a selected mention, removable.
// Removing the chip also removes the token from the note body: the chip row is
// a view of the text, never a second source of truth.
// ---------------------------------------------------------------------------

function SelectedMentionChip({
  member,
  onRemove,
}: {
  member: AccountMember;
  onRemove: (userId: string) => void;
}) {
  const { t } = useTranslation("dashboard");
  const [hovered, setHovered] = React.useState(false);
  const label = member.name ?? member.email ?? member.user_id;

  return (
    <Text onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} title={member.email ?? undefined} display="inline-flex" alignItems="center" gap={5} paddingTop={2} paddingRight={5} paddingBottom={2} paddingLeft={3} borderRadius={999} backgroundColor={hovered ? "var(--kairo-color-accent-soft)" : "var(--k-mention-bg)"} borderWidth={1} borderColor={hovered ? "var(--k-accent-border)" : "var(--k-mention-border)"} color="var(--k-accent)" fontSize={11} fontWeight={500} borderStyle="solid">
      <Avatar name={member.name} email={member.email} seed={member.user_id} size={15} />
      @{label}
      <Pressable type="button" onClick={() => onRemove(member.user_id)} aria-label={t("mention.removeChip", { name: label, defaultValue: "Remove mention of {{name}}" })} width={13} height={13} borderRadius={999} display="flex" alignItems="center" justifyContent="center" borderWidth={0} padding={0} cursor="pointer" backgroundColor={hovered ? "var(--k-mention-solid)" : "transparent"} color={hovered ? "white" : "var(--kairo-color-inverse-link)"}>
        <Icon name="x" size={8} strokeWidth={3} />
      </Pressable>
    </Text>
  );
}

// ---------------------------------------------------------------------------
// ReplyBar
// ---------------------------------------------------------------------------

interface ReplyBarProps {
  /** Called with the optimistic message returned by POST /reply (202, KAI-114 outbox). */
  onReplyQueued?: (message: ThreadMessage) => void;
}

export function ReplyBar({ onReplyQueued }: ReplyBarProps) {
  const { t } = useTranslation("dashboard");
  const { user } = useAuth();
  const selectedTicketId = useTriageStore((s) => s.selectedTicketId);
  const tickets = useTriageStore((s) => s.tickets);
  const aiSuggestedReply = useTriageStore((s) => s.aiSuggestedReply);
  const clearSuggestedReply = useTriageStore((s) => s.clearSuggestedReply);
  const updateClassification = useTriageStore((s) => s.updateClassification);

  const ticket = tickets.find((t) => t.id === selectedTicketId) ?? null;
  const currentStatus = ticket?.status ?? "open";

  // KAI-115: client-side template variable context (best-effort; server does authoritative render)
  const templatePreviewVars: TemplatePreviewVars = React.useMemo(() => ({
    "ticket.id": selectedTicketId?.substring(0, 8) ?? "",
    "ticket.asunto": (ticket as { subject?: string } | null)?.subject ?? "",
    "cliente.email": (ticket as { from_email?: string } | null)?.from_email ?? "",
  }), [selectedTicketId, ticket]);

  // ---------------------------------------------------------------------------
  // Core state
  // ---------------------------------------------------------------------------
  const [mode, setMode] = React.useState<ComposeMode>("reply");
  const [draft, setDraft] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [sendError, setSendError] = React.useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = React.useState(false);
  const [showAiBanner, setShowAiBanner] = React.useState(false);
  const [actionLoading, setActionLoading] = React.useState<TicketAction | null>(null);
  const [textareaHeight, setTextareaHeight] = React.useState(80);
  const dragRef = React.useRef<{ startY: number; startHeight: number } | null>(null);
  const [resolving, setResolving] = React.useState(false);

  // ---------------------------------------------------------------------------
  // KAI-232 — @mention autocomplete (note mode only)
  // ---------------------------------------------------------------------------
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const [mentionQuery, setMentionQuery] = React.useState<{ query: string; start: number } | null>(null);
  const [mentionIndex, setMentionIndex] = React.useState(0);

  // Members load lazily — only once the agent actually opens note mode.
  const noteMode = INTERNAL_NOTES_ENABLED && mode === "note";
  const { members, loading: membersLoading } = useAccountMembers(noteMode);

  // "New note" in the right-panel Notes tab: switch to note mode and focus.
  const composeNoteRequests = useTriageStore((s) => s.composeNoteRequests);
  React.useEffect(() => {
    if (composeNoteRequests === 0 || !INTERNAL_NOTES_ENABLED) return;
    setMode("note");
    setShowAiBanner(false);
    setShowEscalatePanel(false);
    textareaRef.current?.focus();
  }, [composeNoteRequests]);

  // Pool = everyone but the author; matches = the visible slice of it. Both are
  // needed so the dropdown can show an honest "n of N".
  const mentionPool = React.useMemo(
    () =>
      mentionQuery
        ? filterMembers(members, mentionQuery.query, Number.MAX_SAFE_INTEGER, user?.id ?? null)
        : [],
    [members, mentionQuery, user?.id],
  );
  const mentionMatches = React.useMemo(
    () => mentionPool.slice(0, MENTION_SUGGESTION_LIMIT),
    [mentionPool],
  );

  // Stays open with no matches so the "no members found" state can show the
  // query back (spec C6); only Enter is inert in that state.
  const mentionOpen = noteMode && mentionQuery !== null;

  // Chips for members already mentioned in the draft — the raw token is not
  // readable in a plain textarea, so this is what confirms who was tagged.
  const draftMentions: AccountMember[] = React.useMemo(() => {
    if (!noteMode) return [];
    const ids = extractMentionUserIds(draft);
    return ids
      .map((id) => members.find((m) => m.user_id === id))
      .filter((m): m is AccountMember => Boolean(m));
  }, [draft, members, noteMode]);

  function removeMention(userId: string) {
    setDraft((current) => removeMentionToken(current, userId));
    textareaRef.current?.focus();
  }

  // Re-evaluate the mention context after any draft/caret change.
  function syncMentionQuery(value: string, caret: number) {
    if (!noteMode) {
      setMentionQuery(null);
      return;
    }
    const active = findActiveMentionQuery(value, caret);
    setMentionQuery(active);
    setMentionIndex(0);
  }

  function applyMention(member: AccountMember) {
    if (!mentionQuery) return;
    const el = textareaRef.current;
    const caret = el?.selectionStart ?? draft.length;
    const { value, caret: nextCaret } = insertMentionToken(
      draft,
      mentionQuery.start,
      caret,
      member.user_id,
    );
    setDraft(value);
    setMentionQuery(null);
    setMentionIndex(0);
    // Restore focus and put the caret right after the inserted token.
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(nextCaret, nextCaret);
    });
  }

  // ---------------------------------------------------------------------------
  // Escalation inline flow (KAI-221)
  // ---------------------------------------------------------------------------
  const [showEscalatePanel, setShowEscalatePanel] = React.useState(false);
  const [escalateReason, setEscalateReason] = React.useState("");
  const [escalating, setEscalating] = React.useState(false);

  // ---------------------------------------------------------------------------
  // AI banner
  // ---------------------------------------------------------------------------
  React.useEffect(() => {
    if (!aiSuggestedReply?.trim()) return;
    setDraft(aiSuggestedReply);
    setShowAiBanner(true);
    setSendError(null);
    setSendSuccess(false);
    clearSuggestedReply();
    // AI drafts are always for reply mode
    setMode("reply");
  }, [aiSuggestedReply, clearSuggestedReply]);

  // Reset draft + error when switching between different tickets.
  // Uses a ref to compare previous vs current so we only reset on actual ticket
  // transitions (not on initial mount, and not when an AI suggestion lands in
  // the same render batch as a ticket selection).
  const prevTicketIdRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    const prev = prevTicketIdRef.current;
    prevTicketIdRef.current = selectedTicketId;
    // Only reset when genuinely switching away from a ticket that was open
    if (prev !== null && prev !== selectedTicketId) {
      setDraft("");
      setSendError(null);
      setSendSuccess(false);
      setShowAiBanner(false);
      setShowEscalatePanel(false);
      setEscalateReason("");
      setMode("reply");
    }
  }, [selectedTicketId]);

  // ---------------------------------------------------------------------------
  // Template select
  // ---------------------------------------------------------------------------
  function handleTemplateSelect(content: string) {
    if (draft.trim()) {
      if (!window.confirm(t("templatePicker.confirmOverwrite"))) return;
    }
    // KAI-115: apply known variables client-side so the agent sees a realistic draft
    const resolved = content.replace(/\{\{([^}]+)\}\}/g, (match, key: string) => {
      const k = key.trim().toLowerCase() as keyof TemplatePreviewVars;
      return templatePreviewVars[k] ?? match;
    });
    setDraft(resolved);
    setSendError(null);
    setSendSuccess(false);
    setShowAiBanner(false);
  }

  // ---------------------------------------------------------------------------
  // Send reply
  // ---------------------------------------------------------------------------
  async function handleSend(resolveAfter = false) {
    if (!draft.trim() || !selectedTicketId || sending) return;
    setSending(true);
    setSendError(null);
    setSendSuccess(false);

    try {
      const res = await replyToTicket(selectedTicketId, draft, resolveAfter ? "resolve" : "reply");

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const code = (body as { code?: string }).code ?? "";
        const msg =
          code === "GMAIL_TOKEN_EXPIRED"
            ? t("replyBar.errorTokenExpired")
            : code === "NO_GMAIL_INTEGRATION"
              ? t("replyBar.errorNoGmail")
              : t("replyBar.errorGeneric");
        setSendError(msg);
        return;
      }

      const body = await res.json().catch(() => null) as { message?: ThreadMessage; status?: string } | null;
      if (body?.message) onReplyQueued?.(body.message);

      // Reflect the server's auto-transition (open/in_progress → awaiting_customer)
      // so the ticket leaves the main triage list and moves to "awaiting customer".
      if (body?.status) updateClassification(selectedTicketId, { status: body.status } as never);

      setDraft("");
      setSendSuccess(true);
      setShowAiBanner(false);
      clearSuggestedReply();
      // The ticket has left the triage queue (awaiting_customer / resolved);
      // TicketDetail clears the selection after a short delay once it notices.
    } catch {
      setSendError(t("replyBar.errorGeneric"));
    } finally {
      setSending(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Send internal note
  // ---------------------------------------------------------------------------
  async function handleSendNote() {
    if (!draft.trim() || !selectedTicketId || sending) return;
    setSending(true);
    setSendError(null);
    setSendSuccess(false);

    try {
      const res = await addTicketNote(selectedTicketId, draft);

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setSendError((body as { error?: string }).error ?? t("replyBar.errorGeneric"));
        return;
      }

      const body = await res.json().catch(() => null) as { note?: ThreadMessage } | null;
      if (body?.note) onReplyQueued?.(body.note);

      setDraft("");
      setSendSuccess(true);
    } catch {
      setSendError(t("replyBar.errorGeneric"));
    } finally {
      setSending(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Patch status helper
  // ---------------------------------------------------------------------------
  async function patchStatus(status: string) {
    if (!selectedTicketId) return;
    const ticketId = selectedTicketId;
    try {
      const res = await setTicketStatus(ticketId, status);
      if (res.ok) {
        // Deselect-after-delay lives in TicketDetail, not here — this
        // component unmounts the instant status goes read-only.
        const body = await res.json() as { ticket?: { status?: string } };
        if (body.ticket?.status) updateClassification(ticketId, body.ticket as never);
      }
    } catch {
      // silent — status is best-effort
    }
  }

  // ---------------------------------------------------------------------------
  // Lifecycle actions (Reconocer / Resolver)
  // ---------------------------------------------------------------------------
  async function handleAction(action: TicketAction) {
    if (!selectedTicketId || actionLoading) return;
    setActionLoading(action);
    await patchStatus(ACTION_CONFIG[action].status);
    setActionLoading(null);
  }

  // "Resolver" option in the send split-button — same status-only resolve as
  // the Resolver lifecycle action (patchStatus), just reached from the send
  // menu instead of the row above the composer. Never sends an email.
  async function handleResolveOnly() {
    if (!selectedTicketId || resolving) return;
    setResolving(true);
    await patchStatus("resolved");
    setResolving(false);
  }

  // ---------------------------------------------------------------------------
  // Escalation flow (KAI-221: reason dialog → POST /escalate)
  // ---------------------------------------------------------------------------
  async function handleEscalateConfirm() {
    if (!selectedTicketId || escalating) return;
    setEscalating(true);
    try {
      const res = await escalateTicket(selectedTicketId, escalateReason.trim() || undefined);
      if (res.ok) {
        const body = await res.json() as { ticket?: { status?: string } };
        if (body.ticket?.status) updateClassification(selectedTicketId, body.ticket as never);
      }
    } catch {
      // silent — best-effort
    } finally {
      setEscalating(false);
      setShowEscalatePanel(false);
      setEscalateReason("");
    }
  }

  // ---------------------------------------------------------------------------
  // Keyboard
  // ---------------------------------------------------------------------------
  function handleKeyDown(e: { key: string; preventDefault: () => void }) {
    // KAI-232: while the mention dropdown is open it owns the arrow keys,
    // Enter/Tab (select) and Escape (dismiss) — send shortcuts still work.
    if (mentionOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((i) => (i + 1) % mentionMatches.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((i) => (i - 1 + mentionMatches.length) % mentionMatches.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const picked = mentionMatches[mentionIndex];
        if (picked) applyMention(picked);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMentionQuery(null);
        return;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Drag handle
  // ---------------------------------------------------------------------------
  function handleDragStart(e: { clientY: number; preventDefault: () => void }) {
    e.preventDefault();
    dragRef.current = { startY: e.clientY, startHeight: textareaHeight };
    function onMove(ev: MouseEvent) {
      if (!dragRef.current) return;
      const delta = dragRef.current.startY - ev.clientY;
      setTextareaHeight(Math.min(300, Math.max(60, dragRef.current.startHeight + delta)));
    }
    function onUp() {
      dragRef.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  // ---------------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------------
  const canSend = !!draft.trim() && !!selectedTicketId && !sending;
  // KAI-232: with the internal-notes flag OFF the composer is reply-only —
  // the mode selector is not rendered, and note mode can never be reached.
  const isNote = INTERNAL_NOTES_ENABLED && mode === "note";

  // Lifecycle action buttons (only in reply mode, based on current status)
  const visibleActions: TicketAction[] = !isNote
    ? (currentStatus === "open" || currentStatus === "reopened"
      ? ["reconocer", "resolver"]
      : currentStatus === "in_progress"
        ? ["resolver"]
        : [])
    : [];

  // Show escalate button only for statuses where escalation is valid
  const canEscalate =
    escalateTabEnabled &&
    !isNote &&
    ESCALATABLE_STATUSES.includes(currentStatus as (typeof ESCALATABLE_STATUSES)[number]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  const sendOptions: SendOption[] = [
    { id: "send-resolve", label: t("replyBar.sendAndResolve", "Send & Resolve"), disabled: !canSend, onSelect: () => handleSend(true) },
    { id: "resolve", label: resolving ? "…" : t(ACTION_CONFIG.resolver.labelKey, ACTION_CONFIG.resolver.defaultLabel), disabled: resolving, onSelect: handleResolveOnly },
  ];

  const aiBanner = showAiBanner && !isNote ? (
    <Box marginBottom={10} borderWidth={1} borderColor="var(--kairo-color-accent-line)" borderRadius={10} overflow="hidden" backgroundColor="var(--k-accent-subtle)" borderStyle="solid">
      {/* Card header */}
      <Box display="flex" alignItems="center" justifyContent="space-between" paddingTop={7} paddingHorizontal={10} paddingBottom={6} borderBottomWidth={1} borderBottomColor="var(--kairo-color-accent-line)" borderStyle="solid">
        <Box display="flex" alignItems="center" gap={8}>
          <Text fontSize={10} fontWeight={700} paddingVertical={2} paddingHorizontal={7} borderRadius={999} backgroundColor="var(--k-accent)" color="white" letterSpacing={0.5}>
            ✦ {t("replyBar.aiBadge", "AI DRAFT")}
          </Text>
          <Text fontSize={11} color="var(--k-text-tertiary)">
            {t("replyBar.aiDraftSource", "generated from similar cases + KB")}
          </Text>
        </Box>
        <Box display="flex" alignItems="center" gap={4}>
          <Pressable type="button" onClick={() => {
              setDraft("");
              clearSuggestedReply();
              setShowAiBanner(false);
            }} display="flex" alignItems="center" gap={3} fontSize={11} color="var(--k-accent)" backgroundColor="transparent" borderWidth={0} cursor="pointer" paddingVertical={2} paddingHorizontal={4} borderRadius={4}>
            <Icon name="refresh" size={10} />
            {t("replyBar.regenerate", "Regenerate")}
          </Pressable>
          <Pressable type="button" onClick={() => setShowAiBanner(false)} aria-label={t("replyBar.dismissSuggestion")} backgroundColor="transparent" borderWidth={0} cursor="pointer" padding={2} color="var(--k-text-tertiary)" display="flex" alignItems="center" borderRadius={3}>
            <Icon name="x" size={13} />
          </Pressable>
        </Box>
      </Box>

      {/* Editable draft text */}
      <PlainTextarea value={draft} onChange={(e) => {
          setDraft(e.target.value);
          if (sendError) setSendError(null);
          if (sendSuccess) setSendSuccess(false);
        }} onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); void handleSend(false); }
        }} width="100%" height={textareaHeight} resize="none" borderWidth={0} backgroundColor="transparent" paddingVertical={10} paddingHorizontal={12} fontSize={13} lineHeight={20.8} color="var(--k-text-primary)" outlineWidth={0} />
    </Box>
  ) : undefined;

  const escalatePanel = showEscalatePanel ? (
    <Box marginBottom={8} borderWidth={1} borderColor="color-mix(in srgb, var(--kairo-color-mood) 24%, transparent)" borderRadius={8} backgroundColor="color-mix(in srgb, var(--kairo-color-mood) 8%, transparent)" paddingVertical={10} paddingHorizontal={12} borderStyle="solid">
      <Box display="flex" alignItems="center" gap={6} marginBottom={8}>
        <Icon name="warning" size={12} color="var(--kairo-color-sla-escalate-ink)" />
        <Text fontSize={12} fontWeight={600} color="var(--kairo-color-sla-escalate-ink)">
          {t("replyBar.escalateTitle", "Escalate ticket")}
        </Text>
        <Pressable type="button" onClick={() => { setShowEscalatePanel(false); setEscalateReason(""); }} aria-label={t("replyBar.escalateCancel", "Cancel")} marginLeft="auto" backgroundColor="transparent" borderWidth={0} cursor="pointer" padding={2} color="var(--k-text-tertiary)" display="flex" alignItems="center">
          <Icon name="x" size={12} />
        </Pressable>
      </Box>
      <PlainTextarea placeholder={t("replyBar.escalateReasonPlaceholder", "Reason for escalation (optional)…")} value={escalateReason} onChange={(e) => setEscalateReason(e.target.value)} rows={2} width="100%" resize="none" borderRadius={6} borderWidth={1} borderColor="color-mix(in srgb, var(--kairo-color-mood) 24%, transparent)" focusStyle={{ borderColor: "var(--kairo-color-mood)" }} backgroundColor="var(--kairo-color-surface)" paddingVertical={7} paddingHorizontal={10} fontSize={12} lineHeight={18.6} color="var(--k-text-primary)" outlineWidth={0} marginBottom={8} borderStyle="solid" />
      <Box display="flex" gap={6} justifyContent="flex-end">
        <Pressable type="button" onClick={() => { setShowEscalatePanel(false); setEscalateReason(""); }} fontSize={11} fontWeight={500} paddingVertical={4} paddingHorizontal={10} borderRadius={6} borderWidth={1} borderColor="var(--k-border)" backgroundColor="var(--kairo-color-surface)" color="var(--k-text-secondary)" cursor="pointer" borderStyle="solid">
          {t("replyBar.escalateCancel", "Cancel")}
        </Pressable>
        <Pressable type="button" disabled={escalating} onClick={handleEscalateConfirm} fontSize={11} fontWeight={600} paddingVertical={4} paddingHorizontal={12} borderRadius={6} borderWidth={0} backgroundColor={escalating ? "var(--k-border)" : "var(--kairo-color-sla-escalate-ink)"} color={escalating ? "var(--k-text-tertiary)" : "white"} cursor={escalating ? "wait" : "pointer"} transition="background 0.1s ease">
          {escalating
            ? t("replyBar.escalating", "Escalating…")
            : t("replyBar.escalateConfirm", "Confirm escalation")}
        </Pressable>
      </Box>
    </Box>
  ) : undefined;

  const lifecycleActions = (visibleActions.length > 0 || canEscalate) && !showEscalatePanel ? (
    <>
      {visibleActions.map((action) => {
        const cfg = ACTION_CONFIG[action];
        const loading = actionLoading === action;
        return (
          <Pressable key={action} type="button" disabled={!!actionLoading} onClick={() => handleAction(action)} {...cfg.style} fontSize={11} fontWeight={500} paddingVertical={4} paddingHorizontal={11} borderRadius={999} cursor={actionLoading ? "wait" : "pointer"} opacity={actionLoading && !loading ? 0.5 : 1} transition="opacity 0.1s ease">
            {loading ? "…" : t(cfg.labelKey, cfg.defaultLabel)}
          </Pressable>
        );
      })}
      {canEscalate && (
        <Pressable type="button" disabled={showEscalatePanel} onClick={() => setShowEscalatePanel(true)} fontSize={11} fontWeight={500} paddingVertical={4} paddingHorizontal={11} borderRadius={999} cursor="pointer" backgroundColor="color-mix(in srgb, var(--kairo-color-mood) 8%, transparent)" color="var(--kairo-color-sla-escalate-ink)" borderWidth={1} borderColor="color-mix(in srgb, var(--kairo-color-mood) 24%, transparent)" transition="opacity 0.1s ease" borderStyle="solid">
          {t("replyBar.actionEscalar", "Escalate")}
        </Pressable>
      )}
    </>
  ) : undefined;

  return (
    <Composer
      mode={isNote ? "note" : "reply"}
      onModeChange={INTERNAL_NOTES_ENABLED ? (next) => {
        setMode(next);
        setSendError(null);
        setSendSuccess(false);
        if (next === "note") {
          setShowAiBanner(false);
          setShowEscalatePanel(false);
        }
      } : undefined}
      value={draft}
      onChange={(value, caret) => {
        setDraft(value);
        syncMentionQuery(value, caret);
        if (sendError) setSendError(null);
        if (sendSuccess) setSendSuccess(false);
      }}
      onFieldSelect={syncMentionQuery}
      onFieldKeyDown={handleKeyDown}
      fieldRef={textareaRef}
      onSend={isNote ? handleSendNote : () => handleSend(false)}
      sending={sending}
      error={sendError}
      onRetry={() => void (isNote ? handleSendNote() : handleSend(false))}
      status={sendError ? undefined : sendSuccess
        ? { tone: "success", text: isNote ? t("replyBar.noteSuccess", "Note added.") : t("replyBar.sendSuccess") }
        : { tone: "hint", text: t("ticketDetail.sendHint") }}
      tools={
        <>
          {!isNote && (
            <TemplatePicker onSelect={handleTemplateSelect} previewVars={templatePreviewVars}>
              <ComposerPill icon="zap">{t("ticketDetail.quickReply")}</ComposerPill>
            </TemplatePicker>
          )}
          {isNote && <TeamOnlyChip />}
          {/* KAI-232 spec C7: who this note will notify. The body stores opaque
              tokens, so these chips are the only readable confirmation. */}
          {isNote && draftMentions.map((member) => (
            <SelectedMentionChip key={member.user_id} member={member} onRemove={removeMention} />
          ))}
          {isNote && draftMentions.length > 0 && (
            <Text fontSize={10.5} color="var(--k-note-label)" opacity={0.75} marginLeft={2}>
              {t("mention.willNotify", { count: draftMentions.length, defaultValue: "will be notified" })}
            </Text>
          )}
          <ComposerPill icon="clip">{t("ticketDetail.attach")}</ComposerPill>
        </>
      }
      banner={aiBanner}
      panel={escalatePanel}
      actions={lifecycleActions}
      sendOptions={sendOptions}
      counter={isNote && draft.length >= NOTE_COUNTER_THRESHOLD ? { text: `${draft.length} / ${NOTE_MAX_LENGTH}`, over: draft.length >= NOTE_MAX_LENGTH } : undefined}
      popover={mentionOpen ? (
        <MentionList
          testId="mention-dropdown"
          title={t("mention.header", "Mention")}
          query={mentionQuery?.query ?? ""}
          options={mentionMatches.map((member) => ({ id: member.user_id, name: member.name ?? member.email ?? member.user_id, email: member.email, role: member.role }))}
          activeIndex={mentionIndex}
          // Skeletons only on the very first open of the session (spec C5) —
          // once the list is cached, a refresh must not blank the rows.
          loading={membersLoading && members.length === 0}
          onPick={(id) => { const picked = mentionMatches.find((member) => member.user_id === id); if (picked) applyMention(picked); }}
          onHover={setMentionIndex}
          labels={{
            counter: t("mention.counter", { shown: mentionMatches.length, total: mentionPool.length, defaultValue: "{{shown}} of {{total}}" }),
            empty: t("mention.empty", "No members found"),
            more: t("mention.more", { count: mentionPool.length - mentionMatches.length, defaultValue: "+{{count}} more · keep typing to filter" }),
            keyNavigate: t("mention.keyNavigate", "navigate"),
            keyInsert: t("mention.keyInsert", "insert"),
            keyClose: t("mention.keyClose", "close"),
          }}
        />
      ) : undefined}
      placeholder={isNote
        ? t("replyBar.notePlaceholder", "Write a note for your team… use @ to mention")
        : t("ticketDetail.replyPlaceholder")}
      maxLength={isNote ? NOTE_MAX_LENGTH : undefined}
      height={textareaHeight}
      onResizeStart={handleDragStart}
      labels={{
        modeGroup: t("replyBar.modeLabel", "Composer mode"),
        reply: t("replyBar.modeReply", "Reply"),
        note: t("replyBar.modeNote", "Internal note"),
        textarea: t("replyBar.textareaLabel"),
        placeholder: "",
        send: isNote ? t("replyBar.sendNote", "Add note") : t("ticketDetail.send"),
        sending: isNote ? t("replyBar.sendingNote", "Saving…") : t("replyBar.sending"),
        retry: t("replyBar.retry"),
        sendOptions: t("replyBar.sendOptionsLabel", "More send options"),
        dragHandle: t("replyBar.resize"),
      }}
    />
  );
}
