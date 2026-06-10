import * as React from "react";
import { Paperclip, Send, X, Zap, RefreshCw, Lock, AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { TemplatePicker, type TemplatePreviewVars } from "./template-picker";
import { useTriageStore } from "@/stores/triage-store";
import { apiCall } from "@/lib/api-client";
import type { ThreadMessage } from "@/hooks/use-ticket-thread";

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
  { labelKey: string; defaultLabel: string; status: string; style: React.CSSProperties }
> = {
  reconocer: {
    labelKey: "replyBar.actionReconocer",
    defaultLabel: "Acknowledge",
    status: "in_progress",
    style: {
      background: "#EEF2FF",
      color: "#2B5BFF",
      border: "1px solid #C7D2FE",
    },
  },
  resolver: {
    labelKey: "replyBar.actionResolver",
    defaultLabel: "Resolve",
    status: "resolved",
    style: {
      background: "#ECFDF5",
      color: "#047857",
      border: "1px solid #A7F3D0",
    },
  },
};

// ---------------------------------------------------------------------------
// ReplyBar
// ---------------------------------------------------------------------------

interface ReplyBarProps {
  /** Called with the optimistic message returned by POST /reply (202, KAI-114 outbox). */
  onReplyQueued?: (message: ThreadMessage) => void;
}

export function ReplyBar({ onReplyQueued }: ReplyBarProps) {
  const { t } = useTranslation("dashboard");
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
      const res = await apiCall(`/api/v1/tickets/${selectedTicketId}/reply`, {
        method: "POST",
        body: JSON.stringify({ body: draft }),
      });

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

      if (resolveAfter) {
        await patchStatus("resolved");
      }
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
      const res = await apiCall(`/api/v1/tickets/${selectedTicketId}/notes`, {
        method: "POST",
        body: JSON.stringify({ body: draft }),
      });

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
    try {
      const res = await apiCall(`/api/v1/tickets/${selectedTicketId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        const body = await res.json() as { ticket?: { status?: string } };
        if (body.ticket?.status) updateClassification(selectedTicketId, body.ticket as never);
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

  // ---------------------------------------------------------------------------
  // Escalation flow (KAI-221: reason dialog → POST /escalate)
  // ---------------------------------------------------------------------------
  async function handleEscalateConfirm() {
    if (!selectedTicketId || escalating) return;
    setEscalating(true);
    try {
      const res = await apiCall(`/api/v1/tickets/${selectedTicketId}/escalate`, {
        method: "POST",
        body: JSON.stringify({ reason: escalateReason.trim() || undefined }),
      });
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
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      if (mode === "note") {
        handleSendNote();
      } else {
        handleSend(false);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Drag handle
  // ---------------------------------------------------------------------------
  function handleDragStart(e: React.MouseEvent) {
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
  const isNote = mode === "note";

  // Lifecycle action buttons (only in reply mode, based on current status)
  const visibleActions: TicketAction[] = !isNote
    ? (currentStatus === "open" || currentStatus === "reopened"
      ? ["reconocer", "resolver"]
      : currentStatus === "in_progress"
        ? ["resolver"]
        : [])
    : [];

  // Show escalate button only for statuses where escalation is valid
  const canEscalate = !isNote && ["open", "in_progress", "reopened", "awaiting_customer"].includes(currentStatus);

  // Accent / left stripe based on mode
  const modeAccentGradient = isNote
    ? "linear-gradient(180deg, #F59E0B, #D97706)"
    : "linear-gradient(180deg, var(--k-accent), #6E8BFF)";

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div
      style={{
        position: "relative",
        borderTop: "1px solid var(--k-border)",
        background: "white",
        padding: "0 16px 10px",
        flexShrink: 0,
      }}
    >
      {/* Left accent stripe — changes color per mode */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 2,
          background: modeAccentGradient,
          transition: "background 0.2s ease",
        }}
      />

      {/* Drag handle */}
      <div
        onMouseDown={handleDragStart}
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          padding: "6px 0 4px",
          cursor: "ns-resize",
          userSelect: "none",
        }}
      >
        <div
          style={{
            width: 32,
            height: 4,
            borderRadius: 999,
            background: "var(--k-border)",
            transition: "background 0.15s ease",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--k-text-tertiary)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "var(--k-border)"; }}
        />
      </div>

      {/* ── DIMENSION 1: Mode selector ─────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          gap: 2,
          marginBottom: 8,
          background: "var(--k-surface)",
          borderRadius: 8,
          padding: 3,
          border: "1px solid var(--k-border-subtle)",
          width: "fit-content",
        }}
      >
        <button
          type="button"
          onClick={() => { setMode("reply"); setSendError(null); setSendSuccess(false); }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: 11,
            fontWeight: mode === "reply" ? 600 : 400,
            padding: "4px 10px",
            borderRadius: 6,
            border: "none",
            background: mode === "reply" ? "white" : "transparent",
            color: mode === "reply" ? "var(--k-text-primary)" : "var(--k-text-tertiary)",
            cursor: "pointer",
            boxShadow: mode === "reply" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
            transition: "all 0.1s ease",
          }}
        >
          <Send style={{ width: 10, height: 10 }} />
          {t("replyBar.modeReply", "Reply")}
        </button>
        <button
          type="button"
          onClick={() => { setMode("note"); setShowAiBanner(false); setSendError(null); setSendSuccess(false); setShowEscalatePanel(false); }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: 11,
            fontWeight: mode === "note" ? 600 : 400,
            padding: "4px 10px",
            borderRadius: 6,
            border: "none",
            background: mode === "note" ? "#FFFBEB" : "transparent",
            color: mode === "note" ? "#92400E" : "var(--k-text-tertiary)",
            cursor: "pointer",
            boxShadow: mode === "note" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
            transition: "all 0.1s ease",
          }}
        >
          <Lock style={{ width: 10, height: 10 }} />
          {t("replyBar.modeNote", "Internal note")}
        </button>
      </div>

      {/* Tool buttons row */}
      <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
        {!isNote && (
          <TemplatePicker onSelect={handleTemplateSelect} previewVars={templatePreviewVars}>
            <button
              type="button"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontSize: 11,
                padding: "4px 9px",
                border: "1px solid var(--k-border)",
                borderRadius: 999,
                color: "var(--k-text-secondary)",
                background: "white",
                cursor: "pointer",
              }}
            >
              <Zap style={{ width: 11, height: 11 }} />
              {t("ticketDetail.quickReply")}
            </button>
          </TemplatePicker>
        )}
        {isNote && (
          <span
            style={{
              fontSize: 11,
              color: "#92400E",
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "4px 9px",
              background: "#FEF3C7",
              borderRadius: 999,
              border: "1px solid #FDE68A",
            }}
          >
            <Lock style={{ width: 10, height: 10 }} />
            {t("replyBar.noteVisibilityHint", "Visible only to your team")}
          </span>
        )}
        <button
          type="button"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: 11,
            padding: "4px 9px",
            border: "1px solid var(--k-border)",
            borderRadius: 999,
            color: "var(--k-text-secondary)",
            background: "white",
            cursor: "pointer",
          }}
        >
          <Paperclip style={{ width: 11, height: 11 }} />
          {t("ticketDetail.attach")}
        </button>
      </div>

      {/* ── DIMENSION 2: Composer ──────────────────────────────────────── */}

      {/* BORRADOR IA card (reply mode only) */}
      {showAiBanner && !isNote ? (
        <div
          style={{
            marginBottom: 10,
            border: "1px solid #C7D2FE",
            borderRadius: 10,
            overflow: "hidden",
            background: "var(--k-accent-subtle)",
          }}
        >
          {/* Card header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "7px 10px 6px",
              borderBottom: "1px solid #DBE3FF",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "2px 7px",
                  borderRadius: 999,
                  background: "var(--k-accent)",
                  color: "white",
                  letterSpacing: "0.05em",
                }}
              >
                ✦ {t("replyBar.aiBadge", "AI DRAFT")}
              </span>
              <span style={{ fontSize: 11, color: "var(--k-text-tertiary)" }}>
                {t("replyBar.aiDraftSource", "generated from similar cases + KB")}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <button
                type="button"
                onClick={() => {
                  setDraft("");
                  clearSuggestedReply();
                  setShowAiBanner(false);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 3,
                  fontSize: 11,
                  color: "var(--k-accent)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "2px 4px",
                  borderRadius: 4,
                }}
              >
                <RefreshCw style={{ width: 10, height: 10 }} />
                {t("replyBar.regenerate", "Regenerate")}
              </button>
              <button
                type="button"
                onClick={() => setShowAiBanner(false)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 2,
                  color: "var(--k-text-tertiary)",
                  display: "flex",
                  alignItems: "center",
                  borderRadius: 3,
                }}
                aria-label={t("replyBar.dismissSuggestion")}
              >
                <X style={{ width: 13, height: 13 }} />
              </button>
            </div>
          </div>

          {/* Editable draft text */}
          <textarea
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              if (sendError) setSendError(null);
              if (sendSuccess) setSendSuccess(false);
            }}
            onKeyDown={handleKeyDown}
            style={{
              width: "100%",
              height: textareaHeight,
              resize: "none",
              border: "none",
              background: "transparent",
              padding: "10px 12px",
              fontSize: 13,
              lineHeight: 1.6,
              color: "var(--k-text-primary)",
              outline: "none",
              fontFamily: "inherit",
              boxSizing: "border-box",
            }}
          />
        </div>
      ) : (
        /* Standard composer textarea */
        <textarea
          placeholder={
            isNote
              ? t("replyBar.notePlaceholder", "Write an internal note… (only visible to your team)")
              : t("ticketDetail.replyPlaceholder")
          }
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (sendError) setSendError(null);
            if (sendSuccess) setSendSuccess(false);
          }}
          onKeyDown={handleKeyDown}
          style={{
            width: "100%",
            height: textareaHeight,
            resize: "none",
            borderRadius: 8,
            border: isNote ? "1px solid #FDE68A" : "1px solid var(--k-border)",
            background: isNote ? "#FFFBEB" : "var(--k-surface)",
            padding: "10px 12px",
            fontSize: 14,
            lineHeight: 1.6,
            color: isNote ? "#78350F" : "var(--k-text-primary)",
            outline: "none",
            fontFamily: "inherit",
            boxSizing: "border-box",
            marginBottom: 8,
            transition: "border-color 0.1s ease, background 0.1s ease",
          }}
          onFocus={(e) => {
            if (isNote) {
              e.currentTarget.style.borderColor = "#F59E0B";
              e.currentTarget.style.boxShadow = "0 0 0 2px #FEF3C7";
            } else {
              e.currentTarget.style.borderColor = "var(--k-accent)";
              e.currentTarget.style.boxShadow = "0 0 0 2px #EEF2FF";
            }
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = isNote ? "#FDE68A" : "var(--k-border)";
            e.currentTarget.style.boxShadow = "none";
          }}
        />
      )}

      {/* ── DIMENSION 3: Lifecycle actions ────────────────────────────── */}

      {/* Escalation inline panel (KAI-221) */}
      {showEscalatePanel && (
        <div
          style={{
            marginBottom: 8,
            border: "1px solid #FED7AA",
            borderRadius: 8,
            background: "#FFF7ED",
            padding: "10px 12px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <AlertTriangle style={{ width: 12, height: 12, color: "#C2410C", flexShrink: 0 }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: "#C2410C" }}>
              {t("replyBar.escalateTitle", "Escalate ticket")}
            </span>
            <button
              type="button"
              onClick={() => { setShowEscalatePanel(false); setEscalateReason(""); }}
              style={{
                marginLeft: "auto",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 2,
                color: "var(--k-text-tertiary)",
                display: "flex",
                alignItems: "center",
              }}
              aria-label={t("replyBar.escalateCancel", "Cancel")}
            >
              <X style={{ width: 12, height: 12 }} />
            </button>
          </div>
          <textarea
            placeholder={t("replyBar.escalateReasonPlaceholder", "Reason for escalation (optional)…")}
            value={escalateReason}
            onChange={(e) => setEscalateReason(e.target.value)}
            rows={2}
            style={{
              width: "100%",
              resize: "none",
              borderRadius: 6,
              border: "1px solid #FED7AA",
              background: "white",
              padding: "7px 10px",
              fontSize: 12,
              lineHeight: 1.55,
              color: "var(--k-text-primary)",
              outline: "none",
              fontFamily: "inherit",
              boxSizing: "border-box",
              marginBottom: 8,
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "#F97316"; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "#FED7AA"; }}
          />
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={() => { setShowEscalatePanel(false); setEscalateReason(""); }}
              style={{
                fontSize: 11,
                fontWeight: 500,
                padding: "4px 10px",
                borderRadius: 6,
                border: "1px solid var(--k-border)",
                background: "white",
                color: "var(--k-text-secondary)",
                cursor: "pointer",
              }}
            >
              {t("replyBar.escalateCancel", "Cancel")}
            </button>
            <button
              type="button"
              disabled={escalating}
              onClick={handleEscalateConfirm}
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: "4px 12px",
                borderRadius: 6,
                border: "none",
                background: escalating ? "var(--k-border)" : "#C2410C",
                color: escalating ? "var(--k-text-tertiary)" : "white",
                cursor: escalating ? "wait" : "pointer",
                transition: "background 0.1s ease",
              }}
            >
              {escalating
                ? t("replyBar.escalating", "Escalating…")
                : t("replyBar.escalateConfirm", "Confirm escalation")}
            </button>
          </div>
        </div>
      )}

      {/* Lifecycle buttons row: Reconocer, Resolver, Escalar */}
      {(visibleActions.length > 0 || canEscalate) && !showEscalatePanel && (
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          {visibleActions.map((action) => {
            const cfg = ACTION_CONFIG[action];
            const loading = actionLoading === action;
            return (
              <button
                key={action}
                type="button"
                disabled={!!actionLoading}
                onClick={() => handleAction(action)}
                style={{
                  ...cfg.style,
                  fontSize: 11,
                  fontWeight: 500,
                  padding: "4px 11px",
                  borderRadius: 999,
                  cursor: actionLoading ? "wait" : "pointer",
                  opacity: actionLoading && !loading ? 0.5 : 1,
                  transition: "opacity 0.1s ease",
                }}
              >
                {loading ? "…" : t(cfg.labelKey, cfg.defaultLabel)}
              </button>
            );
          })}
          {canEscalate && (
            <button
              type="button"
              disabled={showEscalatePanel}
              onClick={() => setShowEscalatePanel(true)}
              style={{
                fontSize: 11,
                fontWeight: 500,
                padding: "4px 11px",
                borderRadius: 999,
                cursor: "pointer",
                background: "#FFF7ED",
                color: "#C2410C",
                border: "1px solid #FED7AA",
                transition: "opacity 0.1s ease",
              }}
            >
              {t("replyBar.actionEscalar", "Escalate")}
            </button>
          )}
        </div>
      )}

      {/* Send buttons row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 8,
        }}
      >
        {isNote ? (
          /* Note mode: single "Add note" button */
          <button
            type="button"
            disabled={!canSend}
            onClick={handleSendNote}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              fontSize: 12,
              fontWeight: 600,
              padding: "6px 14px",
              borderRadius: 6,
              border: "none",
              background: canSend ? "#F59E0B" : "var(--k-border)",
              color: canSend ? "white" : "var(--k-text-tertiary)",
              cursor: canSend ? "pointer" : "not-allowed",
              transition: "background 0.1s ease",
            }}
          >
            <Lock style={{ width: 11, height: 11 }} />
            {sending ? t("replyBar.sendingNote", "Saving…") : t("replyBar.sendNote", "Add note")}
          </button>
        ) : (
          /* Reply mode: plain send + send & resolve */
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button
              type="button"
              disabled={!canSend}
              onClick={() => handleSend(false)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                fontSize: 12,
                fontWeight: 500,
                padding: "6px 12px",
                borderRadius: 6,
                border: "1px solid var(--k-border)",
                background: "white",
                color: canSend ? "var(--k-text-secondary)" : "var(--k-text-tertiary)",
                cursor: canSend ? "pointer" : "not-allowed",
              }}
            >
              <Send style={{ width: 12, height: 12 }} />
              {sending ? t("replyBar.sending") : t("ticketDetail.send")}
            </button>

            <button
              type="button"
              disabled={!canSend}
              onClick={() => handleSend(true)}
              aria-label={t("replyBar.sendAndResolve", "Send & Resolve")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                fontSize: 12,
                fontWeight: 500,
                padding: "6px 14px",
                borderRadius: 6,
                border: "none",
                background: canSend ? "var(--k-accent)" : "var(--k-border)",
                color: canSend ? "white" : "var(--k-text-tertiary)",
                cursor: canSend ? "pointer" : "not-allowed",
                transition: "background 0.1s ease",
              }}
            >
              {sending ? t("replyBar.sending") : t("replyBar.sendAndResolve", "Send & Resolve")}
            </button>
          </div>
        )}
      </div>

      {/* Status messages */}
      {sendError ? (
        <p style={{ marginTop: 6, fontSize: 12, color: "#EF4444" }}>{sendError}</p>
      ) : sendSuccess ? (
        <p style={{ marginTop: 6, fontSize: 12, color: isNote ? "#D97706" : "#10B981" }}>
          {isNote ? t("replyBar.noteSuccess", "Note added.") : t("replyBar.sendSuccess")}
        </p>
      ) : (
        <p
          style={{
            marginTop: 6,
            fontSize: 11,
            fontFamily: "var(--k-font-mono)",
            color: "var(--k-text-tertiary)",
          }}
        >
          {t("ticketDetail.sendHint")}
        </p>
      )}
    </div>
  );
}
