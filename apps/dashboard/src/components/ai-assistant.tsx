import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp, CheckCircle2, Loader2 } from "lucide-react";
import { useTriageStore } from "@/stores/triage-store";
import { apiCall } from "@/lib/api-client";
import { KnowledgePanel } from "@/components/knowledge-panel";
import { ClientProfileCard } from "@/components/triage/ClientProfileCard";

// ---------------------------------------------------------------------------
// Types — aligned with KAI-41 API response shape
// ---------------------------------------------------------------------------

interface EscalationReason {
  id:        string;
  label_es:  string;
  label_en:  string;
  severity:  "high" | "medium" | "low";
}

interface EscalationResult {
  reasons:          EscalationReason[];
  recommendedLevel: 1 | 2 | 3;
  confidence:       number;
}

// ---------------------------------------------------------------------------
// Severity styles (inline — no Tailwind palette classes)
// ---------------------------------------------------------------------------

const SEVERITY_CHIP: Record<string, { bg: string; color: string; border: string }> = {
  high:   { bg: "#FEE2E2", color: "#DC2626", border: "#FECACA" },
  medium: { bg: "#FFEDD5", color: "#C2410C", border: "#FED7AA" },
  low:    { bg: "#FEF9C3", color: "#B45309", border: "#FEF08A" },
};

const SEVERITY_BORDER: Record<string, string> = {
  high:   "#EF4444",
  medium: "#FB923C",
  low:    "#FBBF24",
  none:   "var(--k-border)",
};

const SEVERITY_BG: Record<string, string> = {
  high:   "rgba(254,242,242,0.5)",
  medium: "rgba(255,237,213,0.5)",
  low:    "rgba(254,249,195,0.5)",
  none:   "white",
};

function topSeverity(reasons: EscalationReason[]): string {
  if (reasons.some((r) => r.severity === "high"))   return "high";
  if (reasons.some((r) => r.severity === "medium")) return "medium";
  if (reasons.some((r) => r.severity === "low"))    return "low";
  return "none";
}

// ---------------------------------------------------------------------------
// SectionPanel
// ---------------------------------------------------------------------------

function SectionPanel({
  title,
  open,
  onToggle,
  accent,
  children,
}: {
  title: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  accent?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{
      borderRadius: 10,
      border: "1px solid var(--k-border)",
      borderLeft: `3px solid ${accent ?? "var(--k-border)"}`,
      background: "white",
      overflow: "hidden",
    }}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between",
          padding: "9px 12px", background: "none", border: "none", cursor: "pointer", gap: 6,
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 500, color: "var(--k-text-secondary)" }}>{title}</span>
        {open
          ? <ChevronUp style={{ width: 14, height: 14, color: "var(--k-text-tertiary)", flexShrink: 0 }} />
          : <ChevronDown style={{ width: 14, height: 14, color: "var(--k-text-tertiary)", flexShrink: 0 }} />}
      </button>
      {open && (
        <div style={{ borderTop: "1px solid var(--k-border-subtle)", padding: "10px 12px" }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AiAssistant
// ---------------------------------------------------------------------------

interface AiAssistantProps {
  customer: string;
}

export function AiAssistant({ customer }: AiAssistantProps) {
  const { t, i18n } = useTranslation("dashboard");
  const { selectedTicketId, setPendingEscalation, tickets } = useTriageStore();
  const selectedTicket = tickets.find((t) => t.id === selectedTicketId) ?? null;

  const [escalationOpen, setEscalationOpen] = useState(true);
  const [packetOpen,     setPacketOpen]      = useState(true);

  const [escalation,     setEscalation]     = useState<EscalationResult | null>(null);
  const [reasonsLoading, setReasonsLoading] = useState(false);

  const [editMode,         setEditMode]         = useState(false);
  const [escalationReason, setEscalationReason] = useState("");
  const [escalating,       setEscalating]       = useState(false);
  const [escalatedAt,      setEscalatedAt]      = useState<string | null>(null);

  useEffect(() => {
    if (!selectedTicketId) {
      setEscalation(null);
      setEscalatedAt(null);
      setEditMode(false);
      return;
    }

    setEscalation(null);
    setEscalatedAt(null);
    setEditMode(false);
    setReasonsLoading(true);

    apiCall(`/api/v1/tickets/${selectedTicketId}/escalation-reasons`, { method: "POST" })
      .then(async (res) => {
        if (!res.ok) return;
        const data: EscalationResult = await res.json();
        setEscalation(data);
        if (data.reasons.length > 0) setEscalationOpen(true);
      })
      .catch(() => { /* degrade silently */ })
      .finally(() => setReasonsLoading(false));
  }, [selectedTicketId]);

  async function handleEscalate() {
    if (!selectedTicketId || escalating) return;
    setEscalating(true);
    try {
      await apiCall(`/api/v1/tickets/${selectedTicketId}/escalate`, {
        method: "POST",
        body: JSON.stringify({ reason: escalationReason || undefined }),
      });
      const ts = new Date().toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" });
      setEscalatedAt(ts);
      setPendingEscalation(selectedTicketId);
      setEditMode(false);
    } catch {
      const ts = new Date().toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" });
      setEscalatedAt(ts);
      setPendingEscalation(selectedTicketId);
      setEditMode(false);
    } finally {
      setEscalating(false);
    }
  }

  const reasons          = escalation?.reasons ?? [];
  const recommendedLevel = escalation?.recommendedLevel ?? 2;
  const confidence       = escalation?.confidence ?? 0;
  const sev              = topSeverity(reasons);
  const ctaLabel = t("ai.escalateToLevel", { level: recommendedLevel });

  return (
    <div style={{ width: 340, flexShrink: 0, display: "flex", flexDirection: "column", height: "100%", borderLeft: "1px solid var(--k-border)", background: "white" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--k-border)", padding: "12px 14px", flexShrink: 0 }}>
        <h2 style={{ fontSize: 13, fontWeight: 600, color: "var(--k-text-primary)", margin: 0 }}>
          {t("ai.title")}
        </h2>
        <ChevronDown style={{ width: 16, height: 16, color: "var(--k-text-tertiary)" }} />
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>

        {/* ── Client Profile ─────────────────────────────────────────────── */}
        <div style={{ borderRadius: 8, border: "1px solid var(--k-border)", background: "white", boxShadow: "0 1px 2px rgba(9,9,11,0.04)" }}>
          <ClientProfileCard />
        </div>

        {/* ── Escalation Suggested ───────────────────────────────────────── */}
        <SectionPanel
          title={
            <span style={{ color: reasons.length > 0 ? "#DC2626" : "var(--k-text-secondary)" }}>
              {t("ai.escalationSuggested")}
            </span>
          }
          open={escalationOpen}
          onToggle={() => setEscalationOpen((v) => !v)}
          accent={SEVERITY_BORDER[sev]}
        >
          <div style={{ background: SEVERITY_BG[sev], borderRadius: 6, padding: reasons.length > 0 ? 2 : 0 }}>
            {reasonsLoading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div className="shimmer" style={{ height: 10, width: "80%" }} />
                <div className="shimmer" style={{ height: 10, width: "60%" }} />
              </div>
            ) : reasons.length === 0 ? (
              <p style={{ fontSize: 12, color: "var(--k-text-tertiary)", fontStyle: "italic", margin: 0 }}>
                {t("ai.noEscalationSignals")}
              </p>
            ) : (
              <>
                {confidence > 0.80 && (
                  <p style={{ marginBottom: 8, fontSize: 10, fontWeight: 600, color: "#10B981", textTransform: "uppercase", letterSpacing: "0.04em", margin: "0 0 8px" }}>
                    {t("ai.highConfidence")}
                  </p>
                )}

                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                  {reasons.map((reason) => {
                    const chip = SEVERITY_CHIP[reason.severity] ?? SEVERITY_CHIP.low;
                    return (
                      <span
                        key={reason.id}
                        style={{
                          display: "inline-flex", alignItems: "center",
                          borderRadius: 999, padding: "2px 8px",
                          fontSize: 11, fontWeight: 500,
                          background: chip.bg, color: chip.color,
                          border: `1px solid ${chip.border}`,
                        }}
                      >
                        {i18n.language === "en" ? reason.label_en : reason.label_es}
                      </span>
                    );
                  })}
                </div>

                {escalatedAt ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#10B981", fontWeight: 500 }}>
                    <CheckCircle2 style={{ width: 13, height: 13 }} />
                    <span>{t("ai.escalatedSuccess")} {escalatedAt}</span>
                  </div>
                ) : (
                  <button
                    className="k-btn-primary"
                    style={{ width: "100%", marginTop: 4 }}
                    disabled={escalating}
                    onClick={handleEscalate}
                  >
                    {escalating && <Loader2 style={{ width: 12, height: 12 }} className="animate-spin" />}
                    {escalating ? t("ai.escalating") : ctaLabel}
                  </button>
                )}
              </>
            )}
          </div>
        </SectionPanel>

        {/* ── KB + Similar Cases ─────────────────────────────────────────── */}
        <KnowledgePanel ticketId={selectedTicketId} />

        {/* ── Escalation Packet ──────────────────────────────────────────── */}
        <SectionPanel
          title={t("ai.escalationPacket")}
          open={packetOpen}
          onToggle={() => setPacketOpen((v) => !v)}
        >
          {escalatedAt ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#10B981", fontWeight: 500, padding: "4px 0" }}>
              <CheckCircle2 style={{ width: 13, height: 13 }} />
              <span>{t("ai.escalatedSuccess")} {escalatedAt}</span>
            </div>
          ) : (
            <>
              {/* Context summary */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
                {[
                  { label: t("ai.customer"), value: customer },
                  { label: t("ai.workflow"), value: selectedTicket?.category ?? "—" },
                  { label: t("ai.status"),   value: selectedTicket?.status ?? "—" },
                ].map(({ label, value }) => (
                  <div key={label} style={{ borderRadius: 6, padding: "6px 8px", textAlign: "center", background: "var(--k-surface)" }}>
                    <p style={{ fontSize: 10, color: "var(--k-text-tertiary)", margin: "0 0 2px" }}>{label}</p>
                    <p style={{ fontSize: 11, fontWeight: 500, color: "var(--k-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", margin: 0 }}>{value}</p>
                  </div>
                ))}
              </div>

              {/* Inline edit form */}
              {editMode && (
                <div style={{ marginBottom: 10 }}>
                  <label className="k-label" style={{ textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    {t("ai.escalationReason")}
                  </label>
                  <textarea
                    value={escalationReason}
                    onChange={(e) => setEscalationReason(e.target.value)}
                    placeholder={t("ai.escalationReasonPlaceholder")}
                    rows={3}
                    className="k-textarea"
                    style={{ fontSize: 12 }}
                  />
                </div>
              )}

              <div style={{ display: "flex", gap: 6 }}>
                {editMode ? (
                  <>
                    <button
                      className="k-btn-secondary"
                      style={{ flex: 1, fontSize: 12 }}
                      onClick={() => setEditMode(false)}
                    >
                      {t("ai.cancelEdit")}
                    </button>
                    <button
                      className="k-btn-primary"
                      style={{ flex: 1, fontSize: 12 }}
                      disabled={escalating}
                      onClick={handleEscalate}
                    >
                      {escalating && <Loader2 style={{ width: 12, height: 12 }} className="animate-spin" />}
                      {escalating ? t("ai.escalating") : t("ai.confirmEscalation")}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="k-btn-secondary"
                      style={{ fontSize: 12 }}
                      onClick={() => setEditMode(true)}
                    >
                      {t("ai.editDetails")}
                    </button>
                    <button
                      className="k-btn-primary"
                      style={{ flex: 1, fontSize: 12 }}
                      disabled={escalating}
                      onClick={handleEscalate}
                    >
                      {escalating && <Loader2 style={{ width: 12, height: 12 }} className="animate-spin" />}
                      {escalating ? t("ai.escalating") : ctaLabel}
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </SectionPanel>

      </div>
    </div>
  );
}
