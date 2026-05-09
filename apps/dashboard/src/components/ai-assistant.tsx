import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp, CheckCircle2 } from "lucide-react";
import {
  Card, CardContent, CardHeader, CardTitle,
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@kairo/ui";
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
// Helpers
// ---------------------------------------------------------------------------

const SEVERITY_CHIP: Record<string, string> = {
  high:   "bg-red-100 text-red-700 border border-red-200",
  medium: "bg-orange-100 text-orange-700 border border-orange-200",
  low:    "bg-yellow-100 text-yellow-700 border border-yellow-200",
};

const SEVERITY_ACCENT: Record<string, string> = {
  high:   "border-l-red-500 bg-red-50/40",
  medium: "border-l-orange-400 bg-orange-50/40",
  low:    "border-l-yellow-400 bg-yellow-50/40",
  none:   "border-l-zinc-200 bg-zinc-50/40",
};

function topSeverity(reasons: EscalationReason[]): string {
  if (reasons.some((r) => r.severity === "high"))   return "high";
  if (reasons.some((r) => r.severity === "medium")) return "medium";
  if (reasons.some((r) => r.severity === "low"))    return "low";
  return "none";
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

  // Section open/close state
  const [escalationOpen, setEscalationOpen] = useState(true);
  const [packetOpen,     setPacketOpen]      = useState(true);

  // Escalation reasons state
  const [escalation,        setEscalation]        = useState<EscalationResult | null>(null);
  const [reasonsLoading,    setReasonsLoading]     = useState(false);

  // Escalation packet form state
  const [editMode,          setEditMode]           = useState(false);
  const [escalationReason,  setEscalationReason]   = useState("");
  const [escalating,        setEscalating]         = useState(false);
  const [escalatedAt,       setEscalatedAt]        = useState<string | null>(null);

  // Fetch escalation reasons when selected ticket changes
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
        // Auto-open section if reasons exist
        if (data.reasons.length > 0) setEscalationOpen(true);
      })
      .catch(() => {
        // Service not available yet — degrade silently, show empty state
      })
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
      // Success — notification delivery is handled async by another service
      const ts = new Date().toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" });
      setEscalatedAt(ts);
      setPendingEscalation(selectedTicketId);
      setEditMode(false);
    } catch {
      // Fire-and-forget: even if notification fails the escalation is recorded
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
  const accent           = SEVERITY_ACCENT[topSeverity(reasons)];

  const ctaLabel = t("ai.escalateToLevel", { level: recommendedLevel });

  return (
    <div className="flex h-full w-[300px] flex-col border-l bg-white">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-sm font-semibold text-zinc-900">{t("ai.title")}</h2>
        <ChevronDown className="h-4 w-4 text-zinc-400" />
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">

        {/* ── Section 0: Client Profile ───────────────────────────────────── */}
        <div className="rounded-lg border border-zinc-200 bg-white shadow-sm">
          <ClientProfileCard />
        </div>

        {/* ── Section 1: Escalación Sugerida ─────────────────────────────── */}
        <Collapsible open={escalationOpen} onOpenChange={setEscalationOpen}>
          <Card className={`gap-0 py-0 border-l-4 shadow-sm hover:shadow-md transition-shadow duration-150 ${accent}`}>
            <CollapsibleTrigger>
              <CardHeader className="cursor-pointer px-3 py-2.5 rounded-tr-md">
                <CardTitle className="flex items-center justify-between text-sm font-medium">
                  <span className={reasons.length > 0 ? "text-red-600" : "text-zinc-700"}>
                    {t("ai.escalationSuggested")}
                  </span>
                  {escalationOpen
                    ? <ChevronUp className="h-4 w-4 text-zinc-400" />
                    : <ChevronDown className="h-4 w-4 text-zinc-400" />}
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>

            <CollapsibleContent>
              <CardContent className="px-3 pb-3 pt-0">
                {reasonsLoading ? (
                  <p className="text-xs text-zinc-400 animate-pulse">
                    {t("ai.escalationReasons")}...
                  </p>
                ) : reasons.length === 0 ? (
                  <p className="text-xs text-zinc-400 italic">
                    {t("ai.noEscalationSignals")}
                  </p>
                ) : (
                  <>
                    {/* Confidence indicator */}
                    {confidence > 0.80 && (
                      <p className="mb-2 text-[10px] font-medium text-green-600 uppercase tracking-wide">
                        {t("ai.highConfidence")}
                      </p>
                    )}

                    {/* Reason chips */}
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {reasons.map((reason) => (
                        <span
                          key={reason.id}
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${SEVERITY_CHIP[reason.severity]}`}
                        >
                          {i18n.language === "en" ? reason.label_en : reason.label_es}
                        </span>
                      ))}
                    </div>

                    {escalatedAt ? (
                      <div className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>{t("ai.escalatedSuccess")} {escalatedAt}</span>
                      </div>
                    ) : (
                      <Button
                        className="mt-1 w-full"
                        size="sm"
                        disabled={escalating}
                        onPress={handleEscalate}
                      >
                        {escalating ? t("ai.escalating") : ctaLabel}
                      </Button>
                    )}
                  </>
                )}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* ── Section 2: KB + Similar Cases ──────────────────────────────── */}
        <KnowledgePanel ticketId={selectedTicketId} />

        {/* ── Section 3: Paquete de Escalación ───────────────────────────── */}
        <Collapsible open={packetOpen} onOpenChange={setPacketOpen}>
          <Card className="gap-0 py-0 shadow-sm hover:shadow-md transition-shadow duration-150">
            <CollapsibleTrigger>
              <CardHeader className="cursor-pointer px-3 py-2.5">
                <CardTitle className="flex items-center justify-between text-sm font-medium">
                  {t("ai.escalationPacket")}
                  {packetOpen
                    ? <ChevronUp className="h-4 w-4 text-zinc-400" />
                    : <ChevronDown className="h-4 w-4 text-zinc-400" />}
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="px-3 pb-3 pt-0">
                {escalatedAt ? (
                  /* Success state */
                  <div className="flex items-center gap-1.5 text-xs text-green-600 font-medium py-2">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>{t("ai.escalatedSuccess")} {escalatedAt}</span>
                  </div>
                ) : (
                  <>
                    {/* Context summary */}
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      <div className="rounded-md bg-zinc-50 p-2 text-center">
                        <p className="text-[10px] text-zinc-500">{t("ai.customer")}</p>
                        <p className="truncate text-xs font-medium text-zinc-800">{customer}</p>
                      </div>
                      <div className="rounded-md bg-zinc-50 p-2 text-center">
                        <p className="text-[10px] text-zinc-500">{t("ai.workflow")}</p>
                        <p className="truncate text-xs font-medium text-zinc-800">
                          {selectedTicket?.category ?? "—"}
                        </p>
                      </div>
                      <div className="rounded-md bg-zinc-50 p-2 text-center">
                        <p className="text-[10px] text-zinc-500">{t("ai.status")}</p>
                        <p className="truncate text-xs font-medium text-zinc-800">
                          {selectedTicket?.status ?? "—"}
                        </p>
                      </div>
                    </div>

                    {/* Inline edit form */}
                    {editMode && (
                      <div className="mb-3">
                        <label className="mb-1 block text-[10px] font-medium text-zinc-500 uppercase tracking-wide">
                          {t("ai.escalationReason")}
                        </label>
                        <textarea
                          value={escalationReason}
                          onChange={(e) => setEscalationReason(e.target.value)}
                          placeholder={t("ai.escalationReasonPlaceholder")}
                          rows={3}
                          className="w-full resize-none rounded-md border border-zinc-200 bg-white px-2.5 py-2 text-xs text-zinc-800 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none"
                        />
                      </div>
                    )}

                    <div className="flex gap-2">
                      {editMode ? (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 text-xs"
                            onPress={() => setEditMode(false)}
                          >
                            {t("ai.cancelEdit")}
                          </Button>
                          <Button
                            size="sm"
                            className="flex-1 text-xs"
                            disabled={escalating}
                            onPress={handleEscalate}
                          >
                            {escalating ? t("ai.escalating") : t("ai.confirmEscalation")}
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs"
                            onPress={() => setEditMode(true)}
                          >
                            {t("ai.editDetails")}
                          </Button>
                          <Button
                            size="sm"
                            className="flex-1 text-xs"
                            disabled={escalating}
                            onPress={handleEscalate}
                          >
                            {escalating ? t("ai.escalating") : ctaLabel}
                          </Button>
                        </>
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

      </div>
    </div>
  );
}
