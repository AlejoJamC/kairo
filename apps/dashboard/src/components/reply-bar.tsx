import * as React from "react";
import { Paperclip, Send, X, Zap, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { TemplatePicker } from "./template-picker";
import { useTriageStore } from "@/stores/triage-store";
import { apiCall } from "@/lib/api-client";

export function ReplyBar() {
  const { t } = useTranslation("dashboard");
  const selectedTicketId = useTriageStore((s) => s.selectedTicketId);
  const aiSuggestedReply = useTriageStore((s) => s.aiSuggestedReply);
  const clearSuggestedReply = useTriageStore((s) => s.clearSuggestedReply);

  const [draft, setDraft] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [sendError, setSendError] = React.useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = React.useState(false);
  const [showAiBanner, setShowAiBanner] = React.useState(false);

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
    setDraft(content);
    setSendError(null);
    setSendSuccess(false);
    setShowAiBanner(false);
  }

  async function handleSend() {
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
        const code = (body as { error?: string }).error ?? "";
        const msg =
          code === "GMAIL_TOKEN_EXPIRED"
            ? t("replyBar.errorTokenExpired")
            : code === "NO_GMAIL_INTEGRATION"
              ? t("replyBar.errorNoGmail")
              : t("replyBar.errorGeneric");
        setSendError(msg);
        console.error("[ReplyBar] send failed", body);
        return;
      }

      setDraft("");
      setSendSuccess(true);
      setShowAiBanner(false);
      clearSuggestedReply();
    } catch (err) {
      console.error("[ReplyBar] send error", err);
      setSendError(t("replyBar.errorGeneric"));
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSend();
    }
  }

  const canSend = !!draft.trim() && !!selectedTicketId && !sending;

  return (
    <div
      style={{
        position: "relative",
        borderTop: "1px solid var(--k-border)",
        background: "white",
        padding: "10px 16px",
        flexShrink: 0,
      }}
    >
      {/* Left accent stripe (cockpit composer signature) */}
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

      {/* AI draft banner */}
      {showAiBanner && (
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 8,
            marginBottom: 8,
            padding: "6px 10px",
            background: "var(--k-accent-subtle)",
            borderRadius: 6,
            border: "1px solid #DBE3FF",
          }}
        >
          <div
            style={{ display: "flex", alignItems: "center", gap: 6, flex: 1 }}
          >
            <Sparkles
              style={{ width: 12, height: 12, color: "var(--k-accent)", flexShrink: 0 }}
            />
            <p
              style={{ fontSize: 12, color: "var(--k-text-secondary)", margin: 0 }}
            >
              {t("replyBar.aiSuggestionBanner")}
            </p>
          </div>
          <button
            type="button"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 2,
              color: "var(--k-accent)",
              display: "flex",
              alignItems: "center",
              borderRadius: 3,
            }}
            onClick={() => setShowAiBanner(false)}
            aria-label={t("replyBar.dismissSuggestion")}
          >
            <X style={{ width: 14, height: 14 }} />
          </button>
        </div>
      )}

      {/* Composer area */}
      <textarea
        rows={3}
        placeholder={t("ticketDetail.replyPlaceholder")}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          if (sendError) setSendError(null);
          if (sendSuccess) setSendSuccess(false);
          if (showAiBanner) setShowAiBanner(false);
        }}
        onKeyDown={handleKeyDown}
        style={{
          width: "100%",
          resize: "vertical",
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

      {/* Action row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: 8,
          gap: 8,
        }}
      >
        {/* Secondary actions */}
        <div style={{ display: "flex", gap: 4 }}>
          <TemplatePicker onSelect={handleTemplateSelect}>
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

        {/* Send CTA */}
        <button
          type="button"
          disabled={!canSend}
          onClick={handleSend}
          aria-label={sending ? t("replyBar.sending") : t("ticketDetail.send")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
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
          <Send style={{ width: 13, height: 13 }} />
          {sending ? t("replyBar.sending") : t("ticketDetail.send")}
        </button>
      </div>

      {/* Status messages */}
      {sendError ? (
        <p
          style={{
            marginTop: 6,
            fontSize: 12,
            color: "#EF4444",
          }}
        >
          {sendError}
        </p>
      ) : sendSuccess ? (
        <p
          style={{
            marginTop: 6,
            fontSize: 12,
            color: "#10B981",
          }}
        >
          {t("replyBar.sendSuccess")}
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
