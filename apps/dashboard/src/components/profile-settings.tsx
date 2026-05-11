import { useState, useEffect } from "react";
import { useTranslation, type TFunction } from "react-i18next";
import {
  Check,
  AlertCircle,
  Loader2,
  LayoutPanelLeft,
  Users,
  Layers,
  Sparkles,
  BookOpen,
  Tag,
  Lock,
  Code,
  Globe,
  Plus,
  X,
  MoreHorizontal,
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { createClient } from "@/lib/supabase/client";
import type { AppView } from "@/types";

interface Props {
  onViewChange: (view: AppView) => void;
}

type SettingsSection =
  | "workspace"
  | "team"
  | "integrations"
  | "triage"
  | "kb"
  | "billing"
  | "security"
  | "api";

function buildNavItems(t: TFunction): { id: SettingsSection; label: string; Icon: React.ElementType }[] {
  return [
    { id: "workspace",    label: t("dashboard:settings.nav.workspace"),    Icon: LayoutPanelLeft },
    { id: "team",         label: t("dashboard:settings.nav.team"),         Icon: Users },
    { id: "integrations", label: t("dashboard:settings.nav.integrations"), Icon: Layers },
    { id: "triage",       label: t("dashboard:settings.nav.triage"),       Icon: Sparkles },
    { id: "kb",           label: t("dashboard:settings.nav.kb"),           Icon: BookOpen },
    { id: "billing",      label: t("dashboard:settings.nav.billing"),      Icon: Tag },
    { id: "security",     label: t("dashboard:settings.nav.security"),     Icon: Lock },
    { id: "api",          label: t("dashboard:settings.nav.api"),          Icon: Code },
  ];
}

// ── Workspace ────────────────────────────────────────────────────────────────

function WorkspaceSection() {
  const { t } = useTranslation(["dashboard"]);
  const { profile, refreshProfile } = useAuth();
  const [name, setName] = useState(profile?.company_name ?? "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (profile) setName(profile.company_name ?? "");
  }, [profile]);

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const sb = createClient();
      const { error } = await sb
        .from("profiles")
        .update({ name: name.trim(), company_name: name.trim() })
        .eq("id", profile!.id);
      if (error) { setMsg({ type: "error", text: t("dashboard:settings.savedError") }); return; }
      await refreshProfile();
      setMsg({ type: "success", text: t("dashboard:settings.savedSuccess") });
    } catch {
      setMsg({ type: "error", text: t("dashboard:settings.savedError") });
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(null), 3000);
    }
  };

  return (
    <div>
      <h1 style={styles.pageTitle}>{t("dashboard:settings.workspace.title")}</h1>

      <div style={{ ...styles.card, marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 20 }}>
          <div style={styles.wsLogo}>
            {(name || "W")[0].toUpperCase()}
          </div>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>{t("dashboard:settings.workspace.nameLabel")}</label>
            <input
              style={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("dashboard:settings.companyPlaceholder")}
            />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <label style={styles.label}>{t("dashboard:settings.workspace.urlLabel")}</label>
            <input style={{ ...styles.input, color: "var(--k-text-tertiary)" }} placeholder={t("dashboard:settings.workspace.urlPlaceholder")} readOnly />
          </div>
          <div>
            <label style={styles.label}>{t("dashboard:settings.workspace.timezoneLabel")}</label>
            <input style={{ ...styles.input, color: "var(--k-text-tertiary)" }} placeholder={t("dashboard:settings.workspace.timezonePlaceholder")} readOnly />
          </div>
        </div>
      </div>

      <div style={{ ...styles.card, display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
        <Globe size={16} style={{ color: "var(--k-text-tertiary)", flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: "var(--k-text-primary)" }}>{t("dashboard:settings.workspace.langTitle")}</div>
          <div style={{ fontSize: 13, color: "var(--k-text-tertiary)" }}>{t("dashboard:settings.workspace.langDesc")}</div>
        </div>
        <select style={styles.select}>
          <option>{t("dashboard:settings.workspace.langLatam")}</option>
          <option>{t("dashboard:settings.workspace.langSpain")}</option>
          <option>{t("dashboard:settings.workspace.langEnglish")}</option>
        </select>
      </div>

      {msg && (
        <div style={{ ...styles.msgBanner, background: msg.type === "success" ? "#ECFDF5" : "#FEF2F2", color: msg.type === "success" ? "#065F46" : "#991B1B", border: `1px solid ${msg.type === "success" ? "#A7F3D0" : "#FECACA"}`, marginBottom: 16 }}>
          {msg.type === "success" ? <Check size={14} /> : <AlertCircle size={14} />}
          {msg.text}
        </div>
      )}

      <div style={styles.formFooter}>
        <button style={styles.btnGhost}>{t("dashboard:settings.discard")}</button>
        <button style={styles.btnPrimary} onClick={save} disabled={saving}>
          {saving && <Loader2 size={13} className="animate-spin" />}
          {saving ? t("dashboard:settings.savingState") : t("dashboard:settings.saveChanges")}
        </button>
      </div>
    </div>
  );
}

// ── Team ──────────────────────────────────────────────────────────────────────

const TEAM_MEMBERS = [
  { name: "Valentina Castro", email: "valentina@empresa.io", role: "Owner", status: "online", initials: "VC", gradient: "linear-gradient(135deg,#FFB199,#FF6E7F)" },
  { name: "Mateo Ríos", email: "mateo@empresa.io", role: "Admin", status: "online", initials: "MR", gradient: "linear-gradient(135deg,#93C5FD,#60A5FA)" },
  { name: "Lucía Bermúdez", email: "lucia@empresa.io", role: "Agente", status: "away", initials: "LB", gradient: "linear-gradient(135deg,#C4B5FD,#A855F7)" },
];

function TeamSection() {
  const { t } = useTranslation(["dashboard"]);
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
        <h1 style={{ ...styles.pageTitle, margin: 0 }}>{t("dashboard:settings.team.title")}</h1>
        <button style={styles.btnPrimary}>
          <Plus size={13} /> {t("dashboard:settings.team.invite")}
        </button>
      </div>
      <p style={{ fontSize: 14, color: "var(--k-text-tertiary)", margin: "8px 0 24px" }}>
        {t("dashboard:settings.team.seats", { used: 3, total: 5, plan: "Pro" })}
      </p>
      <div style={{ border: "1px solid var(--k-border)", borderRadius: 12, overflow: "hidden" }}>
        {TEAM_MEMBERS.map((m, i) => (
          <div
            key={m.email}
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr 1fr 30px",
              padding: "14px 18px",
              alignItems: "center",
              borderBottom: i < TEAM_MEMBERS.length - 1 ? "1px solid var(--k-border)" : "none",
              background: "var(--k-bg)",
            }}
          >
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <div style={{ position: "relative" }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: m.gradient, color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: 12 }}>
                  {m.initials}
                </div>
                <span style={{ position: "absolute", bottom: -1, right: -1, width: 9, height: 9, borderRadius: "50%", background: m.status === "online" ? "#10B981" : "#F59E0B", border: "2px solid var(--k-bg)" }} />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, color: "var(--k-text-primary)" }}>{m.name}</div>
                <div style={{ fontSize: 12, color: "var(--k-text-tertiary)" }}>{m.email}</div>
              </div>
            </div>
            <span style={{ fontSize: 13, color: "var(--k-text-primary)" }}>{m.role}</span>
            <span style={{ fontSize: 12, color: "var(--k-text-tertiary)", fontFamily: "var(--k-font-mono)" }}>
              {m.status === "online" ? t("dashboard:settings.team.statusActive") : t("dashboard:settings.team.statusAway")}
            </span>
            <button style={{ color: "var(--k-text-tertiary)", background: "none", border: "none", cursor: "pointer", padding: 4 }}>
              <MoreHorizontal size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Integrations ──────────────────────────────────────────────────────────────

const INTEGRATIONS = [
  { name: "Gmail", status: "connected", meta: "soporte@empresa.io · 2,341 mensajes", color: "#EA4335", letter: "G" },
  { name: "Slack", status: "available", meta: "Notificaciones + crear tickets desde DM", color: "#4A154B", letter: "S" },
  { name: "WhatsApp Business", status: "beta", meta: "Twilio + Meta WABA", color: "#25D366", letter: "W" },
  { name: "Telegram", status: "soon", meta: "Q4 2026", color: "#26A5E4", letter: "T" },
  { name: "Instagram DM", status: "soon", meta: "Q4 2026", color: "#E1306C", letter: "I" },
  { name: "Zendesk", status: "available", meta: "Importar tickets históricos", color: "#03363D", letter: "Z" },
];

function IntegrationsSection() {
  const { t } = useTranslation(["dashboard"]);
  return (
    <div>
      <h1 style={styles.pageTitle}>{t("dashboard:settings.integrations.title")}</h1>
      <p style={{ fontSize: 14, color: "var(--k-text-tertiary)", margin: "-16px 0 24px" }}>
        {t("dashboard:settings.integrations.subtitle")}
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {INTEGRATIONS.map((int) => (
          <div
            key={int.name}
            style={{ padding: 16, border: "1px solid var(--k-border)", borderRadius: 10, display: "flex", gap: 12, alignItems: "center", background: "var(--k-bg)" }}
          >
            <div style={{ width: 38, height: 38, borderRadius: 8, background: int.color, color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 600, flexShrink: 0 }}>
              {int.letter}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 500, color: "var(--k-text-primary)" }}>
                {int.name}
                {int.status === "connected" && (
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10B981", flexShrink: 0 }} />
                )}
                {int.status === "beta" && (
                  <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 5px", borderRadius: 4, background: "rgba(43,91,255,.12)", color: "#2B5BFF" }}>BETA</span>
                )}
              </div>
              <div style={{ fontSize: 12, color: "var(--k-text-tertiary)", marginTop: 2 }}>{int.meta}</div>
            </div>
            {int.status === "connected" && (
              <button style={{ fontSize: 12, color: "var(--k-text-tertiary)", background: "none", border: "none", cursor: "pointer" }}>{t("dashboard:settings.integrations.configure")}</button>
            )}
            {int.status === "available" && (
              <button style={{ ...styles.btnGhost, fontSize: 12, padding: "4px 10px" }}>{t("dashboard:settings.integrations.connect")}</button>
            )}
            {int.status === "beta" && (
              <button style={{ ...styles.btnGhost, fontSize: 12, padding: "4px 10px" }}>{t("dashboard:settings.integrations.requestAccess")}</button>
            )}
            {int.status === "soon" && (
              <span style={{ fontSize: 11, color: "var(--k-text-tertiary)", fontFamily: "var(--k-font-mono)", whiteSpace: "nowrap" }}>{t("dashboard:settings.integrations.comingSoon")}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Triage Engine ─────────────────────────────────────────────────────────────

const TIER_COLORS = ["#71717A", "#EF4444", "#F59E0B", "#10B981"];

// Default category keys — stored in i18n so they switch language automatically
const DEFAULT_CATEGORY_KEYS = ["billing", "apiBugs", "configuration", "sales", "product", "onboarding", "account"] as const;

function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      style={{
        width: 36, height: 20, borderRadius: 10, padding: 2,
        background: on ? "#2B5BFF" : "var(--k-border)",
        border: "none", cursor: "pointer", flexShrink: 0,
        display: "flex", alignItems: "center",
        justifyContent: on ? "flex-end" : "flex-start",
        transition: "background 0.15s",
      }}
    >
      <span style={{ width: 16, height: 16, borderRadius: "50%", background: "white", display: "block" }} />
    </button>
  );
}

function TriageSection() {
  const { t } = useTranslation(["dashboard"]);
  const [confidence, setConfidence] = useState(0.85);
  const [tiers, setTiers] = useState([true, true, true, true]);
  const [categories, setCategories] = useState(() =>
    DEFAULT_CATEGORY_KEYS.map((k) => t(`dashboard:settings.triage.cat_${k}`))
  );
  const [newCat, setNewCat] = useState("");

  const addCat = () => {
    const v = newCat.trim();
    if (v && !categories.includes(v)) { setCategories((p) => [...p, v]); }
    setNewCat("");
  };

  const TIER_DATA = [
    { tier: 0, nameKey: "tier0Name", descKey: "tier0Desc" },
    { tier: 1, nameKey: "tier1Name", descKey: "tier1Desc" },
    { tier: 2, nameKey: "tier2Name", descKey: "tier2Desc" },
    { tier: 3, nameKey: "tier3Name", descKey: "tier3Desc" },
  ] as const;

  return (
    <div>
      <h1 style={styles.pageTitle}>{t("dashboard:settings.triage.title")}</h1>
      <p style={{ fontSize: 14, color: "var(--k-text-tertiary)", margin: "-16px 0 28px" }}>
        {t("dashboard:settings.triage.subtitle")}
      </p>

      {/* Tier toggles */}
      <div style={{ marginBottom: 32 }}>
        <div style={styles.sectionLabel}>{t("dashboard:settings.triage.tiersLabel")}</div>
        {TIER_DATA.map((tier, i) => {
          const col = TIER_COLORS[tier.tier];
          return (
            <div key={tier.tier} style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 16px", border: "1px solid var(--k-border)", borderRadius: 10, marginBottom: 8, background: "var(--k-bg)" }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: col + "20", color: col, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--k-font-mono)", fontSize: 12, fontWeight: 600, flexShrink: 0 }}>
                T{tier.tier}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: "var(--k-text-primary)" }}>{t(`dashboard:settings.triage.${tier.nameKey}`)}</div>
                <div style={{ fontSize: 13, color: "var(--k-text-tertiary)" }}>{t(`dashboard:settings.triage.${tier.descKey}`)}</div>
              </div>
              <Toggle on={tiers[i]} onChange={() => setTiers((p) => p.map((v, j) => j === i ? !v : v))} />
            </div>
          );
        })}
      </div>

      {/* Confidence slider */}
      <div style={{ marginBottom: 32, padding: 18, border: "1px solid var(--k-border)", borderRadius: 10, background: "var(--k-bg)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: "var(--k-text-primary)" }}>{t("dashboard:settings.triage.confidenceTitle")}</div>
          <span style={{ fontFamily: "var(--k-font-mono)", fontSize: 16, color: "var(--k-accent)", fontWeight: 500 }}>{confidence.toFixed(2)}</span>
        </div>
        <p style={{ fontSize: 13, color: "var(--k-text-tertiary)", margin: "0 0 14px" }}>
          {t("dashboard:settings.triage.confidenceDesc", { threshold: confidence.toFixed(2) })}
        </p>
        <input
          type="range" min={0.5} max={1} step={0.01}
          value={confidence}
          onChange={(e) => setConfidence(parseFloat(e.target.value))}
          style={{ width: "100%", accentColor: "var(--k-accent)" }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontFamily: "var(--k-font-mono)", color: "var(--k-text-tertiary)", marginTop: 6 }}>
          <span>{t("dashboard:settings.triage.confidenceLow")}</span>
          <span>{t("dashboard:settings.triage.confidenceHigh")}</span>
        </div>
      </div>

      {/* Custom categories */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={styles.sectionLabel}>{t("dashboard:settings.triage.categoriesLabel")}</div>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              style={{ ...styles.input, width: 140, padding: "4px 10px", fontSize: 12 }}
              placeholder={t("dashboard:settings.triage.categoryPlaceholder")}
              value={newCat}
              onChange={(e) => setNewCat(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addCat()}
            />
            <button style={{ ...styles.btnGhost, fontSize: 12, padding: "4px 10px", display: "flex", alignItems: "center", gap: 4 }} onClick={addCat}>
              <Plus size={12} /> {t("dashboard:settings.triage.addCategory")}
            </button>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {categories.map((c) => (
            <span key={c} style={{ padding: "5px 10px", fontSize: 12, borderRadius: 6, border: "1px solid var(--k-border)", display: "flex", alignItems: "center", gap: 6, color: "var(--k-text-primary)", background: "var(--k-bg)" }}>
              {c}
              <button style={{ color: "var(--k-text-tertiary)", background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex" }} onClick={() => setCategories((p) => p.filter((x) => x !== c))}>
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      </div>

      <div style={styles.formFooter}>
        <button style={styles.btnGhost}>{t("dashboard:settings.discard")}</button>
        <button style={styles.btnPrimary}>{t("dashboard:settings.saveChanges")}</button>
      </div>
    </div>
  );
}

// ── Security ──────────────────────────────────────────────────────────────────

function SecuritySection({ onViewChange }: { onViewChange: (view: AppView) => void }) {
  const { t } = useTranslation(["dashboard"]);
  const { user } = useAuth();
  const hasPassword = user?.identities?.some((id) => id.provider === "email") ?? false;

  return (
    <div>
      <h1 style={styles.pageTitle}>{t("dashboard:settings.security.title")}</h1>

      <div style={{ border: "1px solid var(--k-border)", borderRadius: 12, overflow: "hidden", background: "var(--k-bg)" }}>
        <div style={{ padding: "18px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--k-border)" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: "var(--k-text-primary)" }}>{t("dashboard:settings.security.passwordLabel")}</div>
            <div style={{ fontSize: 12, color: "var(--k-text-tertiary)", marginTop: 2 }}>
              {hasPassword
                ? t("dashboard:settings.security.passwordActiveDesc")
                : t("dashboard:settings.security.passwordNoneDesc")}
            </div>
          </div>
          <button
            onClick={() => onViewChange("change-password")}
            style={{ fontSize: 13, fontWeight: 500, color: "var(--k-accent)", background: "none", border: "none", cursor: "pointer" }}
          >
            {hasPassword
              ? t("dashboard:settings.security.changePassword")
              : t("dashboard:settings.security.setPassword")}
          </button>
        </div>

        <div style={{ padding: "18px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: "var(--k-text-primary)" }}>{t("dashboard:settings.security.twoFaLabel")}</div>
            <div style={{ fontSize: 12, color: "var(--k-text-tertiary)", marginTop: 2 }}>{t("dashboard:settings.security.twoFaDesc")}</div>
          </div>
          <span style={{ fontSize: 11, color: "var(--k-text-tertiary)", fontFamily: "var(--k-font-mono)" }}>{t("dashboard:settings.security.comingSoon")}</span>
        </div>
      </div>
    </div>
  );
}

// ── Coming soon stub ──────────────────────────────────────────────────────────

function ComingSoonSection({ title }: { title: string }) {
  const { t } = useTranslation(["dashboard"]);
  return (
    <div>
      <h1 style={styles.pageTitle}>{title}</h1>
      <div style={{ padding: 40, border: "1px dashed var(--k-border)", borderRadius: 12, color: "var(--k-text-tertiary)", fontSize: 14, textAlign: "center" }}>
        {t("dashboard:settings.comingSoon")}
      </div>
    </div>
  );
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const styles = {
  pageTitle: {
    fontSize: 26,
    fontWeight: 600,
    letterSpacing: "-0.02em",
    margin: "0 0 24px",
    fontFamily: "var(--k-font-display)",
    color: "var(--k-text-primary)",
  } as React.CSSProperties,
  card: {
    padding: 24,
    border: "1px solid var(--k-border)",
    borderRadius: 12,
    background: "var(--k-bg)",
  } as React.CSSProperties,
  label: {
    display: "block",
    fontSize: 12,
    fontWeight: 500,
    color: "var(--k-text-secondary)",
    marginBottom: 6,
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
  } as React.CSSProperties,
  sectionLabel: {
    fontSize: 12,
    fontWeight: 500,
    color: "var(--k-text-secondary)",
    fontFamily: "var(--k-font-mono)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    marginBottom: 12,
  } as React.CSSProperties,
  input: {
    width: "100%",
    height: 36,
    padding: "0 10px",
    borderRadius: 8,
    border: "1px solid var(--k-border)",
    background: "var(--k-surface)",
    color: "var(--k-text-primary)",
    fontSize: 13,
    outline: "none",
    boxSizing: "border-box" as const,
  } as React.CSSProperties,
  select: {
    padding: "6px 10px",
    border: "1px solid var(--k-border)",
    borderRadius: 6,
    fontSize: 13,
    background: "var(--k-surface)",
    color: "var(--k-text-primary)",
  } as React.CSSProperties,
  wsLogo: {
    width: 56,
    height: 56,
    borderRadius: 12,
    background: "#09090B",
    color: "white",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 20,
    fontWeight: 600,
    flexShrink: 0,
  } as React.CSSProperties,
  btnPrimary: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "7px 16px",
    borderRadius: 8,
    background: "var(--k-accent)",
    color: "white",
    fontSize: 13,
    fontWeight: 500,
    border: "none",
    cursor: "pointer",
  } as React.CSSProperties,
  btnGhost: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "7px 14px",
    borderRadius: 8,
    background: "transparent",
    color: "var(--k-text-secondary)",
    fontSize: 13,
    fontWeight: 500,
    border: "1px solid var(--k-border)",
    cursor: "pointer",
  } as React.CSSProperties,
  formFooter: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 8,
    paddingTop: 20,
    borderTop: "1px solid var(--k-border)",
  } as React.CSSProperties,
  msgBanner: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    borderRadius: 6,
    padding: "8px 12px",
    fontSize: 13,
  } as React.CSSProperties,
};

// ── Root component ────────────────────────────────────────────────────────────

export function ProfileSettings({ onViewChange }: Props) {
  const { profile } = useAuth();
  const { t } = useTranslation(["dashboard"]);
  const [section, setSection] = useState<SettingsSection>("workspace");
  const navItems = buildNavItems(t);

  if (!profile) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Loader2 style={{ width: 28, height: 28, color: "var(--k-text-tertiary)" }} className="animate-spin" />
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", height: "100%", overflow: "hidden", background: "var(--k-surface)" }}>
      {/* Left nav */}
      <div style={{ width: 220, borderRight: "1px solid var(--k-border)", padding: "24px 12px", flexShrink: 0, overflowY: "auto" }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--k-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.08em", padding: "0 10px", marginBottom: 12 }}>
          {t("dashboard:settings.navHeading")}
        </div>
        {navItems.map((item) => {
          const active = section === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setSection(item.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "7px 10px",
                borderRadius: 6,
                width: "100%",
                textAlign: "left",
                background: active ? "var(--k-surface-raised, rgba(0,0,0,0.06))" : "transparent",
                color: active ? "var(--k-text-primary)" : "var(--k-text-secondary)",
                fontSize: 13,
                fontWeight: active ? 500 : 400,
                marginBottom: 1,
                border: "none",
                cursor: "pointer",
              }}
            >
              <item.Icon size={14} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div style={{ flex: 1, padding: "32px 40px 56px", maxWidth: 880, overflowY: "auto" }}>
        {section === "workspace" && <WorkspaceSection />}
        {section === "team" && <TeamSection />}
        {section === "integrations" && <IntegrationsSection />}
        {section === "triage" && <TriageSection />}
        {section === "security" && <SecuritySection onViewChange={onViewChange} />}
        {section === "kb" && <ComingSoonSection title={t("dashboard:settings.nav.kb")} />}
        {section === "billing" && <ComingSoonSection title={t("dashboard:settings.nav.billing")} />}
        {section === "api" && <ComingSoonSection title={t("dashboard:settings.nav.api")} />}
      </div>
    </div>
  );
}
