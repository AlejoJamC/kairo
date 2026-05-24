import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Phone, Copy, Check } from "lucide-react";
import { useTriageStore } from "@/stores/triage-store";

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

  const { name, phone, clientId, email, organization } = clientProfile;
  const isDraft = clientProfile.source === "draft";
  const draftStatus = clientProfile.draftStatus;

  function handleCopyPhone() {
    if (!phone) return;
    navigator.clipboard.writeText(phone).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

      {/* Avatar + name + draft badge */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 999, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "var(--k-accent-subtle)", color: "var(--k-accent)",
          fontSize: 13, fontWeight: 600,
        }}>
          {initials(name)}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: "var(--k-text-primary)", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", margin: 0 }}>
              {name ?? email ?? t("clientProfile.unknown")}
            </p>
            {/* KAI-227 — surface draft origin so the agent knows this profile came from
                the contact-extraction worker (KAI-225) and not from the CRM. */}
            {isDraft && draftStatus && <DraftStatusBadge status={draftStatus} />}
          </div>
          {organization && (
            <p style={{ fontSize: 11, color: "var(--k-text-tertiary)", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", margin: 0 }}>
              {organization}
            </p>
          )}
          {!isDraft && clientId && (
            <p style={{ fontSize: 10, fontFamily: "var(--k-font-mono)", color: "var(--k-text-tertiary)", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", margin: 0 }}>
              {clientId}
            </p>
          )}
        </div>
      </div>

      {/* Email row (only for drafts — for CRM clients, email lives in the KPI/details below) */}
      {isDraft && email && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--k-text-secondary)", padding: "0 8px", fontFamily: "var(--k-font-mono)", wordBreak: "break-all" }}>
          {email}
        </div>
      )}

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

      {/* KAI-228 placeholder — confirm / reject / edit actions for drafts go here.
          Rendered only for drafts so the CRM card UI is untouched. */}
      {isDraft && (
        <div
          data-kai228-action-slot
          style={{
            marginTop: 4, padding: "8px 10px", fontSize: 11,
            color: "var(--k-text-tertiary)", background: "var(--k-surface-2)",
            border: "1px dashed var(--k-border)", borderRadius: 6, lineHeight: 1.4,
          }}
        >
          {t("clientProfile.draftActionsPending")}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Draft status badge — proposed / confirmed / rejected
// ---------------------------------------------------------------------------

const DRAFT_BADGE_STYLE: Record<"proposed" | "confirmed" | "rejected", { bg: string; color: string; border: string }> = {
  proposed:  { bg: "#EFF6FF", color: "#2563EB", border: "#BFDBFE" },
  confirmed: { bg: "#F0FDF4", color: "#16A34A", border: "#BBF7D0" },
  rejected:  { bg: "#F4F4F5", color: "#71717A", border: "#E4E4E7" },
};

function DraftStatusBadge({ status }: { status: "proposed" | "confirmed" | "rejected" }) {
  const { t } = useTranslation("dashboard");
  const s = DRAFT_BADGE_STYLE[status];
  const labelKey =
    status === "proposed"  ? "clientProfile.badgeDraft" :
    status === "confirmed" ? "clientProfile.badgeConfirmed" :
                             "clientProfile.badgeRejected";
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 999,
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
      letterSpacing: "0.03em", flexShrink: 0,
    }}>
      {t(labelKey)}
    </span>
  );
}
