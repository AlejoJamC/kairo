import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, RotateCcw } from "lucide-react";
import { useTriageStore } from "@/stores/triage-store";

// ---------------------------------------------------------------------------
// AssistantPanel — "Assistant" tab (KAI-249)
//
// AI copilot for the Triage right panel. Lets the agent generate a draft
// reply and insert it into the composer via the existing
// `aiSuggestedReply` / `setSuggestedReply` plumbing (see triage-store.ts +
// reply-bar.tsx) — no new props/callbacks needed.
//
// STUB: replace simulated generation with POST /api/v1/tickets/:id/assistant/draft (KAI-250)
// ---------------------------------------------------------------------------

const GENERATION_DELAY_MS = 900;

type PanelState = "idle" | "generating" | "inserted";

export function AssistantPanel() {
  const { t } = useTranslation("dashboard");
  const { selectedTicketId, tickets, setSuggestedReply } = useTriageStore();
  const selectedTicket = tickets.find((tk) => tk.id === selectedTicketId) ?? null;

  const [panelState, setPanelState] = useState<PanelState>("idle");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset internal state whenever the selected ticket changes, and clear any
  // in-flight simulated generation so it can't resolve against a stale ticket.
  useEffect(() => {
    setPanelState("idle");
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [selectedTicketId]);

  function handleGenerate() {
    if (!selectedTicket || panelState === "generating") return;
    setPanelState("generating");

    // STUB: replace simulated generation with POST /api/v1/tickets/:id/assistant/draft (KAI-250)
    timeoutRef.current = setTimeout(() => {
      const customer = selectedTicket.from_name ?? selectedTicket.from_email ?? "—";
      const subject = selectedTicket.subject ?? "—";
      const mockDraft = t("ai.assistantMockDraftBody", { customer, subject });
      setSuggestedReply(mockDraft);
      setPanelState("inserted");
      timeoutRef.current = null;
    }, GENERATION_DELAY_MS);
  }

  // -------------------------------------------------------------------------
  // Empty state — no ticket selected
  // -------------------------------------------------------------------------
  if (!selectedTicketId || !selectedTicket) {
    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: 6, padding: "32px 16px", textAlign: "center",
      }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: "var(--k-text-secondary)", margin: 0 }}>
          {t("ai.assistantEmptyTitle")}
        </p>
        <p style={{ fontSize: 11, color: "var(--k-text-tertiary)", margin: 0, lineHeight: 1.5 }}>
          {t("ai.assistantEmptyBody")}
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* AI badge — ✦ RESPONSE */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 999,
          background: "var(--k-accent-subtle)", color: "var(--k-accent)",
          letterSpacing: "0.04em",
        }}>
          ✦ {t("ai.assistantResponseBadge")}
        </span>
      </div>

      {/* Intro copy */}
      <p style={{ fontSize: 12, color: "var(--k-text-secondary)", lineHeight: 1.55, margin: 0 }}>
        {t("ai.assistantIntro")}
      </p>

      {panelState === "inserted" ? (
        <div style={{
          display: "flex", flexDirection: "column", gap: 10,
          padding: 12, borderRadius: 8,
          border: "1px solid var(--k-border)", background: "var(--k-surface)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{
              width: 5, height: 5, borderRadius: 999, flexShrink: 0,
              background: "var(--k-gradient-ai)",
            }} />
            <p style={{ fontSize: 12, fontWeight: 600, color: "var(--k-text-primary)", margin: 0 }}>
              {t("ai.assistantInsertedTitle")}
            </p>
          </div>
          <p style={{ fontSize: 11, color: "var(--k-text-tertiary)", lineHeight: 1.5, margin: 0 }}>
            {t("ai.assistantInsertedBody")}
          </p>
          <button
            type="button"
            className="k-btn-secondary"
            style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 6, alignSelf: "flex-start" }}
            onClick={handleGenerate}
          >
            <RotateCcw style={{ width: 12, height: 12 }} />
            {t("ai.assistantRegenerate")}
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="k-btn-primary"
          disabled={panelState === "generating"}
          onClick={handleGenerate}
          style={{ fontSize: 12, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}
        >
          {panelState === "generating" && (
            <Loader2 style={{ width: 12, height: 12 }} className="animate-spin" />
          )}
          {panelState === "generating" ? t("ai.assistantGenerating") : t("ai.assistantGenerate")}
        </button>
      )}
    </div>
  );
}
