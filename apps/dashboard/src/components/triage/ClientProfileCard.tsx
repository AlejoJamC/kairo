import { useEffect, useState } from "react";
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
import { apiCall } from "@/lib/api-client";
import type { ClientProfile } from "@/stores/triage-store";

// ---------------------------------------------------------------------------
// Plan badge
// ---------------------------------------------------------------------------

const PLAN_BADGE: Record<string, string> = {
  enterprise: "bg-violet-100 text-violet-700 border border-violet-200",
  pro:        "bg-blue-100 text-blue-700 border border-blue-200",
  starter:    "bg-emerald-100 text-emerald-700 border border-emerald-200",
  unknown:    "bg-zinc-100 text-zinc-500 border border-zinc-200",
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
    case "in_progress": return <Clock      className="h-3 w-3 text-blue-500 shrink-0" />;
    case "waiting":     return <PauseCircle className="h-3 w-3 text-orange-400 shrink-0" />;
    case "resolved":    return <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />;
    case "closed":      return <XCircle    className="h-3 w-3 text-zinc-400 shrink-0" />;
    default:            return <Circle     className="h-3 w-3 text-zinc-400 shrink-0" />;
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
// Skeleton
// ---------------------------------------------------------------------------

function Skeleton() {
  return (
    <div className="animate-pulse space-y-3 px-3 py-3">
      {/* Avatar + name row */}
      <div className="flex items-center gap-2.5">
        <div className="h-9 w-9 rounded-full bg-zinc-200" />
        <div className="space-y-1.5 flex-1">
          <div className="h-3 w-28 rounded bg-zinc-200" />
          <div className="h-2.5 w-16 rounded bg-zinc-200" />
        </div>
      </div>
      {/* Badges row */}
      <div className="flex gap-1.5">
        <div className="h-4 w-14 rounded-full bg-zinc-200" />
        <div className="h-4 w-20 rounded-full bg-zinc-200" />
      </div>
      {/* Stats row */}
      <div className="h-2.5 w-36 rounded bg-zinc-200" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// ClientProfileCard
// ---------------------------------------------------------------------------

export function ClientProfileCard() {
  const { t, i18n } = useTranslation("dashboard");
  const { selectedTicketId, clientProfile, setClientProfile } = useTriageStore();

  const [loading,  setLoading]  = useState(false);
  const [copied,   setCopied]   = useState(false);

  useEffect(() => {
    if (!selectedTicketId) {
      setClientProfile(null);
      return;
    }

    setClientProfile(null);
    setLoading(true);

    apiCall(`/api/v1/tickets/${selectedTicketId}/client-profile`)
      .then(async (res) => {
        if (!res.ok) return;
        const data: ClientProfile = await res.json();
        setClientProfile(data);
      })
      .catch(() => { /* no client linked — silent empty state */ })
      .finally(() => setLoading(false));
  }, [selectedTicketId]);

  if (!selectedTicketId) return null;

  if (loading) return <Skeleton />;

  if (!clientProfile) {
    return (
      <p className="px-3 py-3 text-xs text-zinc-400 italic">
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

  const lang        = i18n.language === "en" ? "en" : "es";
  const planLabel   = PLAN_LABEL[clientType]?.[lang] ?? PLAN_LABEL.unknown[lang];
  const planClass   = PLAN_BADGE[clientType]  ?? PLAN_BADGE.unknown;

  function handleCopyPhone() {
    if (!phone) return;
    navigator.clipboard.writeText(phone).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="px-3 py-3 space-y-2.5">

      {/* ── Avatar + name ───────────────────────────────────────────────── */}
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-100 text-sm font-semibold text-violet-700">
          {initials(name)}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-zinc-900 leading-tight">
            {name ?? t("clientProfile.unknown")}
          </p>
          {clientId && (
            <p className="truncate text-[10px] text-zinc-400 font-mono leading-tight">
              {clientId}
            </p>
          )}
        </div>
      </div>

      {/* ── Badges row ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${planClass}`}>
          {planLabel}
        </span>

        {isNewClient && (
          <span className="inline-flex items-center rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-600 border border-sky-200">
            {t("clientProfile.newClient")}
          </span>
        )}

        {isRecurrent && (
          <span
            className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 border border-amber-200 cursor-default"
            title={t("clientProfile.recurrentTooltip", { count: ticketsLast30Days })}
          >
            {t("clientProfile.recurrent")} 🔁
          </span>
        )}
      </div>

      {/* ── Phone ───────────────────────────────────────────────────────── */}
      {phone && (
        <button
          onClick={handleCopyPhone}
          className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-zinc-600 hover:bg-zinc-50 transition-colors duration-100 group"
        >
          <Phone className="h-3 w-3 text-zinc-400 shrink-0" />
          <span className="flex-1 text-left font-mono">{phone}</span>
          {copied
            ? <Check className="h-3 w-3 text-green-500 shrink-0" />
            : <Copy className="h-3 w-3 text-zinc-300 group-hover:text-zinc-400 shrink-0 transition-colors" />
          }
        </button>
      )}

      {/* ── Stats row ───────────────────────────────────────────────────── */}
      <p className="px-1 text-[11px] text-zinc-500">
        <span className="font-medium text-zinc-700">{totalTickets}</span>
        {" "}{t("clientProfile.ticketsTotal")}
        {" · "}
        <span className="font-medium text-zinc-700">{ticketsLast30Days}</span>
        {" "}{t("clientProfile.ticketsThisMonth")}
      </p>

      {/* ── Recent tickets ──────────────────────────────────────────────── */}
      {recentTickets.length > 0 && (
        <div className="space-y-1">
          <p className="px-1 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
            {t("clientProfile.recentTickets")}
          </p>
          {recentTickets.map((rt) => (
            <div
              key={rt.id}
              className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] text-zinc-700 hover:bg-zinc-50 transition-colors duration-100"
            >
              <StatusIcon status={rt.status} />
              <span className="shrink-0 text-zinc-400 font-mono">#{rt.ticket_number}</span>
              <span className="min-w-0 truncate">{rt.subject ?? "—"}</span>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}
