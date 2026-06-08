import * as React from "react";
import { Paperclip, Send, X, Zap, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { TemplatePicker, type TemplatePreviewVars } from "./template-picker";
import { useTriageStore } from "@/stores/triage-store";
import { apiCall } from "@/lib/api-client";
import type { ThreadMessage } from "@/hooks/use-ticket-thread";

// ---------------------------------------------------------------------------
// Action button types
// ---------------------------------------------------------------------------

type TicketAction = "reconocer" | "resolver" | "escalar";

const ACTION_CONFIG: Record<
  TicketAction,
  { labelKey: string; defaultLabel: string; status: string; style: React.CSSProperties }
> = {
  reconocer: {
    labelKey: "replyBar.actionReconocer",
    defaultLabel: "Reconocer",
    status: "in_progress",
    style: {
      background: "#EEF2FF",
      color: "#2B5BFF",
      border: "1px solid #C7D2FE",
    },
  },
  resolver: {
    labelKey: "replyBar.actionResolver",
    defaultLabel: "Resolver",
    status: "resolved",
    style: {
      background: "#ECFDF5",
      color: "#047857",
      border: "1px solid #A7F3D0",
    },
  },
  escalar: {
    labelKey: "replyBar.actionEscalar",
    defaultLabel: "Escalar",
    status: "escalated",
    style: {
      background: "#FFF7ED",
      color: "#C2410C",
      border: "1px solid #FED7AA",
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

  const [draft, setDraft] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [sendError, setSendError] = React.useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = React.useState(false);
  const [showAiBanner, setShowAiBanner] = React.useState(false);
  const [actionLoading, setActionLoading] = React.useState<TicketAction | null>(null);
  const [textareaHeight, setTextareaHeight] = React.useState(80);
  const dragRef = React.useRef<{ startY: number; startHeight: number } | null>(null);

  React.useEffect(() => {
    if (!aiSuggestedReply?.trim()) return;
    setDraft(aiSuggestedReply);
    setShowAiBanner(true);
    setSendError(null);
    setSendSuccess(false);
    clearSuggestedReply();
  }, [aiSuggestedReply, clearSuggestedReply]);

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

      const body = await res.json().catch(() => null) as { message?: ThreadMessage } | null;
      if (body?.message) onReplyQueued?.(body.message);

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

  async function handleAction(action: TicketAction) {
    if (!selectedTicketId || actionLoading) return;
    setActionLoading(action);
    await patchStatus(ACTION_CONFIG[action].status);
    setActionLoading(null);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSend(false);
    }
  }

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

  const canSend = !!draft.trim() && !!selectedTicketId && !sending;

  // Which action buttons to show based on current status
  const visibleActions: TicketAction[] = currentStatus === "open"
    ? ["reconocer", "resolver", "escalar"]
    : currentStatus === "in_progress"
      ? ["resolver", "escalar"]
      : [];

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
      {/* Left accent stripe */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 2,
          background: "linear-gradient(180deg, var(--k-accent), #6E8BFF)",
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

      {/* Tool buttons — above textarea */}
      <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
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

      {/* BORRADOR IA card */}
      {showAiBanner ? (
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
                ✦ {t("replyBar.aiBadge", "BORRADOR IA")}
              </span>
              <span style={{ fontSize: 11, color: "var(--k-text-tertiary)" }}>
                {t("replyBar.aiDraftSource", "generado a partir de casos similares + KB")}
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
                {t("replyBar.regenerate", "Regenerar")}
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
          placeholder={t("ticketDetail.replyPlaceholder")}
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
            border: "1px solid var(--k-border)",
            background: "var(--k-surface)",
            padding: "10px 12px",
            fontSize: 14,
            lineHeight: 1.6,
            color: "var(--k-text-primary)",
            outline: "none",
            fontFamily: "inherit",
            boxSizing: "border-box",
            marginBottom: 8,
            transition: "border-color 0.1s ease",
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = "var(--k-accent)";
            e.currentTarget.style.boxShadow = "0 0 0 2px #EEF2FF";
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = "var(--k-border)";
            e.currentTarget.style.boxShadow = "none";
          }}
        />
      )}

      {/* Action buttons row — Reconocer / Resolver / Escalar */}
      {visibleActions.length > 0 && (
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
        {/* Send CTA */}
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {/* Plain send (when reply doesn't auto-resolve) */}
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

          {/* Enviar y resolver */}
          <button
            type="button"
            disabled={!canSend}
            onClick={() => handleSend(true)}
            aria-label={t("replyBar.sendAndResolve", "Enviar y resolver")}
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
            {sending ? t("replyBar.sending") : t("replyBar.sendAndResolve", "Enviar y resolver")}
          </button>
        </div>
      </div>

      {/* Status messages */}
      {sendError ? (
        <p style={{ marginTop: 6, fontSize: 12, color: "#EF4444" }}>{sendError}</p>
      ) : sendSuccess ? (
        <p style={{ marginTop: 6, fontSize: 12, color: "#10B981" }}>{t("replyBar.sendSuccess")}</p>
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
