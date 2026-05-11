import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Phone, Copy, Check } from "lucide-react";
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
  const { t } = useTranslation("dashboard");
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

  const { name, phone, clientId } = clientProfile;

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


    </div>
  );
}
