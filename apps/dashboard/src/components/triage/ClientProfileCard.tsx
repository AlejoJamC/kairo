import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Circle,
  Clock,
  PauseCircle,
  CheckCircle2,
  XCircle,
  Phone,
  Copy,
  Check,
} from "lucide-react";
import { useTriageStore } from "@/stores/triage-store";

// ---------------------------------------------------------------------------
// Plan badge styles
// ---------------------------------------------------------------------------

const PLAN_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  enterprise: { bg: "#F3F0FF", color: "#6D28D9", border: "#DDD6FE" },
  pro:        { bg: "#EEF2FF", color: "#2B5BFF", border: "#C7D2FE" },
  starter:    { bg: "#ECFDF5", color: "#047857", border: "#A7F3D0" },
  unknown:    { bg: "var(--k-surface-2)", color: "var(--k-text-tertiary)", border: "var(--k-border)" },
};

const PLAN_LABEL: Record<string, { en: string; es: string }> = {
  enterprise: { en: "Enterprise", es: "Enterprise" },
  pro:        { en: "Pro",        es: "Pro"        },
  starter:    { en: "Starter",    es: "Starter"    },
  unknown:    { en: "No plan",    es: "Sin plan"   },
};

// ---------------------------------------------------------------------------
// Status icon
// ---------------------------------------------------------------------------

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "in_progress": return <Clock       style={{ width: 11, height: 11, color: "var(--k-accent)", flexShrink: 0 }} />;
    case "waiting":     return <PauseCircle style={{ width: 11, height: 11, color: "#F59E0B", flexShrink: 0 }} />;
    case "resolved":    return <CheckCircle2 style={{ width: 11, height: 11, color: "#10B981", flexShrink: 0 }} />;
    case "closed":      return <XCircle     style={{ width: 11, height: 11, color: "var(--k-text-tertiary)", flexShrink: 0 }} />;
    default:            return <Circle      style={{ width: 11, height: 11, color: "var(--k-text-tertiary)", flexShrink: 0 }} />;
  }
}

// ---------------------------------------------------------------------------
// Avatar initials
// ---------------------------------------------------------------------------

function initials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ---------------------------------------------------------------------------
// Skeleton — exported so parent can compose it
// ---------------------------------------------------------------------------

export function ClientProfileSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div className="shimmer" style={{ width: 36, height: 36, borderRadius: 999, flexShrink: 0 }} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
          <div className="shimmer" style={{ height: 11, width: 112 }} />
          <div className="shimmer" style={{ height: 9, width: 64 }} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <div className="shimmer" style={{ height: 16, width: 56, borderRadius: 999 }} />
        <div className="shimmer" style={{ height: 16, width: 80, borderRadius: 999 }} />
      </div>
      <div className="shimmer" style={{ height: 10, width: 144 }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// ClientProfileCard — pure display, reads from store.
// Fetch is owned by the parent (AiAssistant) so it runs regardless of
// which tab is active.
// ---------------------------------------------------------------------------

interface ClientProfileCardProps {
  /** When true the parent is still loading — show skeleton */
  loading?: boolean;
}

export function ClientProfileCard({ loading = false }: ClientProfileCardProps) {
  const { t, i18n } = useTranslation("dashboard");
  const { selectedTicketId, clientProfile } = useTriageStore();

  const [copied, setCopied] = useState(false);

  if (!selectedTicketId) return null;

  if (loading) return <ClientProfileSkeleton />;

  if (!clientProfile) {
    return (
      <p style={{ fontSize: 12, color: "var(--k-text-tertiary)", fontStyle: "italic", margin: 0 }}>
        {t("clientProfile.noData")}
      </p>
    );
  }

  const {
    name,
    phone,
    clientId,
    clientType,
    isNewClient,
    isRecurrent,
    totalTickets,
    ticketsLast30Days,
    recentTickets,
  } = clientProfile;

  const lang      = i18n.language === "en" ? "en" : "es";
  const planLabel = PLAN_LABEL[clientType]?.[lang] ?? PLAN_LABEL.unknown[lang];
  const planStyle = PLAN_STYLE[clientType]  ?? PLAN_STYLE.unknown;

  function handleCopyPhone() {
    if (!phone) return;
    navigator.clipboard.writeText(phone).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

      {/* Avatar + name */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 999, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "var(--k-accent-subtle)", color: "var(--k-accent)",
          fontSize: 13, fontWeight: 600,
        }}>
          {initials(name)}
        </div>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: "var(--k-text-primary)", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", margin: 0 }}>
            {name ?? t("clientProfile.unknown")}
          </p>
          {clientId && (
            <p style={{ fontSize: 10, fontFamily: "var(--k-font-mono)", color: "var(--k-text-tertiary)", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", margin: 0 }}>
              {clientId}
            </p>
          )}
        </div>
      </div>

      {/* Badges */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
        <span style={{
          display: "inline-flex", alignItems: "center", borderRadius: 999,
          padding: "2px 8px", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em",
          background: planStyle.bg, color: planStyle.color, border: `1px solid ${planStyle.border}`,
        }}>
          {planLabel}
        </span>
        {isNewClient && (
          <span style={{ display: "inline-flex", alignItems: "center", borderRadius: 999, padding: "2px 8px", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", background: "#E0F2FE", color: "#0369A1", border: "1px solid #BAE6FD" }}>
            {t("clientProfile.newClient")}
          </span>
        )}
        {isRecurrent && (
          <span
            style={{ display: "inline-flex", alignItems: "center", borderRadius: 999, padding: "2px 8px", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", background: "#FFFBEB", color: "#B45309", border: "1px solid #FDE68A", cursor: "default" }}
            title={t("clientProfile.recurrentTooltip", { count: ticketsLast30Days })}
          >
            {t("clientProfile.recurrent")} 🔁
          </span>
        )}
      </div>

      {/* Phone copy */}
      {phone && (
        <button
          onClick={handleCopyPhone}
          style={{ display: "flex", width: "100%", alignItems: "center", gap: 6, borderRadius: 6, padding: "5px 8px", fontSize: 12, color: "var(--k-text-secondary)", background: "none", border: "none", cursor: "pointer", transition: "background 0.1s" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--k-surface-2)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
        >
          <Phone style={{ width: 11, height: 11, color: "var(--k-text-tertiary)", flexShrink: 0 }} />
          <span style={{ flex: 1, textAlign: "left", fontFamily: "var(--k-font-mono)" }}>{phone}</span>
          {copied
            ? <Check style={{ width: 11, height: 11, color: "#10B981", flexShrink: 0 }} />
            : <Copy  style={{ width: 11, height: 11, color: "var(--k-text-tertiary)", flexShrink: 0 }} />}
        </button>
      )}

      {/* Stats row */}
      <p style={{ padding: "0 4px", fontSize: 11, color: "var(--k-text-secondary)", margin: 0 }}>
        <span style={{ fontWeight: 600, color: "var(--k-text-primary)" }}>{totalTickets}</span>
        {" "}{t("clientProfile.ticketsTotal")}
        {" · "}
        <span style={{ fontWeight: 600, color: "var(--k-text-primary)" }}>{ticketsLast30Days}</span>
        {" "}{t("clientProfile.ticketsThisMonth")}
      </p>

      {/* Recent tickets */}
      {recentTickets.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <p style={{ padding: "0 4px", fontSize: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--k-text-tertiary)", margin: 0 }}>
            {t("clientProfile.recentTickets")}
          </p>
          {recentTickets.map((rt) => (
            <div
              key={rt.id}
              style={{ display: "flex", alignItems: "center", gap: 6, borderRadius: 6, padding: "5px 8px", fontSize: 11, color: "var(--k-text-secondary)", transition: "background 0.1s" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--k-surface-2)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
            >
              <StatusIcon status={rt.status} />
              <span style={{ flexShrink: 0, color: "var(--k-text-tertiary)", fontFamily: "var(--k-font-mono)" }}>#{rt.ticket_number}</span>
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rt.subject ?? "—"}</span>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}
