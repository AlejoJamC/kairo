import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@kairo/client-core/auth";
import { updateProfileName } from "@kairo/client-core/queries";
import { getOperationalSlaConfig, saveOperationalSlaConfig } from "@kairo/client-core/endpoints";
import type { AppView } from "@/types";
import { Avatar, Box, Icon, PlainInput, PlainSelect, Pressable, Spinner, Switch, Text, type IconName } from "@kairo/ui";

interface Props {
  onViewChange: (view: AppView) => void;
}

type SettingsSection =
  | "workspace"
  | "team"
  | "integrations"
  | "triage"
  | "sla"
  | "kb"
  | "billing"
  | "security"
  | "api";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildNavItems(t: (...args: any[]) => string): { id: SettingsSection; label: string; icon: IconName }[] {
  return [
    { id: "workspace",    label: t("dashboard:settings.nav.workspace"),    icon: "panel" },
    { id: "team",         label: t("dashboard:settings.nav.team"),         icon: "clients" },
    { id: "integrations", label: t("dashboard:settings.nav.integrations"), icon: "layers" },
    { id: "triage",       label: t("dashboard:settings.nav.triage"),       icon: "spark" },
    { id: "sla",          label: t("dashboard:settings.nav.sla"),          icon: "alarm" },
    { id: "kb",           label: t("dashboard:settings.nav.kb"),           icon: "knowledge" },
    { id: "billing",      label: t("dashboard:settings.nav.billing"),      icon: "tag" },
    { id: "security",     label: t("dashboard:settings.nav.security"),     icon: "lock" },
    { id: "api",          label: t("dashboard:settings.nav.api"),          icon: "code" },
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
      const { error } = await updateProfileName(profile!.id, name);
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
      <Text tag="h1" fontSize={26} fontWeight={600} letterSpacing={-0.52} marginTop={0} marginHorizontal={0} marginBottom={24} font="display" color="var(--k-text-primary)" display="block">{t("dashboard:settings.workspace.title")}</Text>

      <Box padding={24} borderWidth={1} borderColor="var(--k-border)" borderRadius={12} backgroundColor="var(--k-bg)" marginBottom={12} borderStyle="solid">
        <Box display="flex" gap={14} alignItems="center" marginBottom={20}>
          <Text tag="div" width={56} height={56} borderRadius={12} backgroundColor="var(--kairo-color-text)" color="white" display="flex" alignItems="center" justifyContent="center" fontSize={20} fontWeight={600} flexShrink={0}>
            {(name || "W")[0].toUpperCase()}
          </Text>
          <Box flexGrow={1} flexShrink={1} flexBasis="0%">
            <Text tag="label" display="block" fontSize={12} fontWeight={500} color="var(--k-text-secondary)" marginBottom={6} textTransform="uppercase" letterSpacing={0.48}>{t("dashboard:settings.workspace.nameLabel")}</Text>
            <PlainInput value={name} onChange={(e) => setName(e.target.value)} placeholder={t("dashboard:settings.companyPlaceholder")} width="100%" height={36} paddingVertical={0} paddingHorizontal={10} borderRadius={8} borderWidth={1} borderColor="var(--k-border)" backgroundColor="var(--k-surface)" color="var(--k-text-primary)" fontSize={13} outlineWidth={0} borderStyle="solid" />
          </Box>
        </Box>
        <Box grid gridTemplateColumns="1fr 1fr" gap={16}>
          <div>
            <Text tag="label" display="block" fontSize={12} fontWeight={500} color="var(--k-text-secondary)" marginBottom={6} textTransform="uppercase" letterSpacing={0.48}>{t("dashboard:settings.workspace.urlLabel")}</Text>
            <PlainInput placeholder={t("dashboard:settings.workspace.urlPlaceholder")} readOnly width="100%" height={36} paddingVertical={0} paddingHorizontal={10} borderRadius={8} borderWidth={1} borderColor="var(--k-border)" backgroundColor="var(--k-surface)" color="var(--k-text-tertiary)" fontSize={13} outlineWidth={0} borderStyle="solid" />
          </div>
          <div>
            <Text tag="label" display="block" fontSize={12} fontWeight={500} color="var(--k-text-secondary)" marginBottom={6} textTransform="uppercase" letterSpacing={0.48}>{t("dashboard:settings.workspace.timezoneLabel")}</Text>
            <PlainInput placeholder={t("dashboard:settings.workspace.timezonePlaceholder")} readOnly width="100%" height={36} paddingVertical={0} paddingHorizontal={10} borderRadius={8} borderWidth={1} borderColor="var(--k-border)" backgroundColor="var(--k-surface)" color="var(--k-text-tertiary)" fontSize={13} outlineWidth={0} borderStyle="solid" />
          </div>
        </Box>
      </Box>

      <Box padding={24} borderWidth={1} borderColor="var(--k-border)" borderRadius={12} backgroundColor="var(--k-bg)" display="flex" alignItems="center" gap={16} marginBottom={24} borderStyle="solid">
        <Icon name="globe" size={16} color="var(--k-text-tertiary)" />
        <Box flexGrow={1} flexShrink={1} flexBasis="0%">
          <Text tag="div" fontSize={14} fontWeight={500} color="var(--k-text-primary)" display="block">{t("dashboard:settings.workspace.langTitle")}</Text>
          <Text tag="div" fontSize={13} color="var(--k-text-tertiary)" display="block">{t("dashboard:settings.workspace.langDesc")}</Text>
        </Box>
        <PlainSelect paddingVertical={6} paddingHorizontal={10} borderWidth={1} borderColor="var(--k-border)" borderRadius={6} fontSize={13} backgroundColor="var(--k-surface)" color="var(--k-text-primary)" borderStyle="solid">
          <option>{t("dashboard:settings.workspace.langLatam")}</option>
          <option>{t("dashboard:settings.workspace.langSpain")}</option>
          <option>{t("dashboard:settings.workspace.langEnglish")}</option>
        </PlainSelect>
      </Box>

      {msg && (
        <Text tag="div" display="flex" alignItems="center" gap={8} borderRadius={6} paddingVertical={8} paddingHorizontal={12} fontSize={13} backgroundColor={msg.type === "success" ? "color-mix(in srgb, var(--kairo-color-ok) 8%, transparent)" : "var(--kairo-color-bad-soft)"} color={msg.type === "success" ? "var(--kairo-color-ok-ink)" : "var(--kairo-color-bad-ink)"} borderWidth={1} borderColor={msg.type === "success" ? "color-mix(in srgb, var(--kairo-color-ok) 24%, transparent)" : "var(--kairo-color-bad-line)"} marginBottom={16} borderStyle="solid">
          {msg.type === "success" ? <Icon name="check" size={14} /> : <Icon name="alert" size={14} />}
          {msg.text}
        </Text>
      )}

      <Box display="flex" justifyContent="flex-end" gap={8} paddingTop={20} borderTopWidth={1} borderTopColor="var(--k-border)" borderStyle="solid">
        <Pressable display="inline-flex" alignItems="center" gap={6} paddingVertical={7} paddingHorizontal={14} borderRadius={8} backgroundColor="transparent" color="var(--k-text-secondary)" fontSize={13} fontWeight={500} borderWidth={1} borderColor="var(--k-border)" cursor="pointer" borderStyle="solid">{t("dashboard:settings.discard")}</Pressable>
        <Pressable onClick={save} disabled={saving} display="inline-flex" alignItems="center" gap={6} paddingVertical={7} paddingHorizontal={16} borderRadius={8} backgroundColor="var(--k-accent)" color="white" fontSize={13} fontWeight={500} borderWidth={0} cursor="pointer">
          {saving && <Spinner />}
          {saving ? t("dashboard:settings.savingState") : t("dashboard:settings.saveChanges")}
        </Pressable>
      </Box>
    </div>
  );
}

// ── Team ──────────────────────────────────────────────────────────────────────

const TEAM_MEMBERS = [
  { name: "Valentina Castro", email: "valentina@empresa.io", role: "Owner", status: "online", initials: "VC", gradient: "linear-gradient(135deg,#FFB199,var(--kairo-color-bad))" },
  { name: "Mateo Ríos", email: "mateo@empresa.io", role: "Admin", status: "online", initials: "MR", gradient: "linear-gradient(135deg,#93C5FD,#60A5FA)" },
  { name: "Lucía Bermúdez", email: "lucia@empresa.io", role: "Agente", status: "away", initials: "LB", gradient: "linear-gradient(135deg,#C4B5FD,#A855F7)" },
];

function TeamSection() {
  const { t } = useTranslation(["dashboard"]);
  return (
    <div>
      <Box display="flex" alignItems="baseline" justifyContent="space-between" marginBottom={6}>
        <Text tag="h1" fontSize={26} fontWeight={600} letterSpacing={-0.52} margin={0} font="display" color="var(--k-text-primary)" display="block">{t("dashboard:settings.team.title")}</Text>
        <Pressable display="inline-flex" alignItems="center" gap={6} paddingVertical={7} paddingHorizontal={16} borderRadius={8} backgroundColor="var(--k-accent)" color="white" fontSize={13} fontWeight={500} borderWidth={0} cursor="pointer">
          <Icon name="plus" size={13} /> {t("dashboard:settings.team.invite")}
        </Pressable>
      </Box>
      <Text tag="p" fontSize={14} color="var(--k-text-tertiary)" marginTop={8} marginHorizontal={0} marginBottom={24} display="block">
        {t("dashboard:settings.team.seats", { used: 3, total: 5, plan: "Pro" })}
      </Text>
      <Box borderWidth={1} borderColor="var(--k-border)" borderRadius={12} overflow="hidden" borderStyle="solid">
        {TEAM_MEMBERS.map((m, i) => (
          <Box key={m.email} grid gridTemplateColumns="2fr 1fr 1fr 30px" paddingVertical={14} paddingHorizontal={18} alignItems="center" borderBottomWidth={i < TEAM_MEMBERS.length - 1 ? 1 : 0} borderBottomColor="var(--k-border)" backgroundColor="var(--k-bg)" borderStyle="solid">
            <Box display="flex" gap={12} alignItems="center">
              <Box position="relative">
                <Avatar name={m.name} seed={m.name} size={32} />
                <Text position="absolute" bottom={-1} right={-1} width={9} height={9} circle backgroundColor={m.status === "online" ? "var(--kairo-color-ok)" : "var(--kairo-color-warn)"} borderWidth={2} borderColor="var(--k-bg)" borderStyle="solid" />
              </Box>
              <div>
                <Text tag="div" fontSize={14} fontWeight={500} color="var(--k-text-primary)" display="block">{m.name}</Text>
                <Text tag="div" fontSize={12} color="var(--k-text-tertiary)" display="block">{m.email}</Text>
              </div>
            </Box>
            <Text fontSize={13} color="var(--k-text-primary)">{m.role}</Text>
            <Text fontSize={12} color="var(--k-text-tertiary)" font="mono">
              {m.status === "online" ? t("dashboard:settings.team.statusActive") : t("dashboard:settings.team.statusAway")}
            </Text>
            <Pressable color="var(--k-text-tertiary)" backgroundColor="transparent" borderWidth={0} cursor="pointer" padding={4}>
              <Icon name="more" size={14} />
            </Pressable>
          </Box>
        ))}
      </Box>
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

function IntegrationsSection({ onViewChange }: { onViewChange: (view: AppView) => void }) {
  const { t } = useTranslation(["dashboard"]);
  return (
    <div>
      <Text tag="h1" fontSize={26} fontWeight={600} letterSpacing={-0.52} marginTop={0} marginHorizontal={0} marginBottom={24} font="display" color="var(--k-text-primary)" display="block">{t("dashboard:settings.integrations.title")}</Text>
      <Text tag="p" fontSize={14} color="var(--k-text-tertiary)" marginTop={-16} marginHorizontal={0} marginBottom={24} display="block">
        {t("dashboard:settings.integrations.subtitle")}
      </Text>
      <Box grid gridTemplateColumns="1fr 1fr" gap={12}>
        {INTEGRATIONS.map((int) => (
          <Box key={int.name} padding={16} borderWidth={1} borderColor="var(--k-border)" borderRadius={10} display="flex" gap={12} alignItems="center" backgroundColor="var(--k-bg)" borderStyle="solid">
            <Text tag="div" width={38} height={38} borderRadius={8} backgroundColor={int.color} color="white" display="flex" alignItems="center" justifyContent="center" fontSize={16} fontWeight={600} flexShrink={0}>
              {int.letter}
            </Text>
            <Box flexGrow={1} flexShrink={1} flexBasis="0%" minWidth={0}>
              <Text tag="div" display="flex" alignItems="center" gap={6} fontSize={14} fontWeight={500} color="var(--k-text-primary)">
                {int.name}
                {int.status === "connected" && (
                  <Text width={6} height={6} circle backgroundColor="var(--kairo-color-ok)" flexShrink={0} />
                )}
                {int.status === "beta" && (
                  <Text fontSize={10} fontWeight={600} paddingVertical={1} paddingHorizontal={5} borderRadius={4} backgroundColor="rgba(43,91,255,.12)" color="var(--kairo-color-accent)">BETA</Text>
                )}
              </Text>
              <Text tag="div" fontSize={12} color="var(--k-text-tertiary)" marginTop={2} display="block">{int.meta}</Text>
            </Box>
            {int.status === "connected" && (
              <Pressable fontSize={12} color="var(--k-text-tertiary)" backgroundColor="transparent" borderWidth={0} cursor="pointer">{t("dashboard:settings.integrations.configure")}</Pressable>
            )}
            {int.status === "available" && (
              <Pressable display="inline-flex" alignItems="center" gap={6} paddingVertical={4} paddingHorizontal={10} borderRadius={8} backgroundColor="transparent" color="var(--k-text-secondary)" fontSize={12} fontWeight={500} borderWidth={1} borderColor="var(--k-border)" cursor="pointer" borderStyle="solid">{t("dashboard:settings.integrations.connect")}</Pressable>
            )}
            {int.status === "beta" && (
              <Pressable display="inline-flex" alignItems="center" gap={6} paddingVertical={4} paddingHorizontal={10} borderRadius={8} backgroundColor="transparent" color="var(--k-text-secondary)" fontSize={12} fontWeight={500} borderWidth={1} borderColor="var(--k-border)" cursor="pointer" borderStyle="solid">{t("dashboard:settings.integrations.requestAccess")}</Pressable>
            )}
            {int.status === "soon" && (
              <Text fontSize={11} color="var(--k-text-tertiary)" font="mono" whiteSpace="nowrap">{t("dashboard:settings.integrations.comingSoon")}</Text>
            )}
          </Box>
        ))}
      </Box>

      {/* Support Channels */}
      <Box marginTop={28}>
        <Text tag="h2" fontSize={14} fontWeight={600} color="var(--k-text-primary)" marginTop={0} marginHorizontal={0} marginBottom={12} display="block">
          Support Channels
        </Text>
        <Box padding={16} borderWidth={1} borderColor="var(--k-border)" borderRadius={10} display="flex" alignItems="center" justifyContent="space-between" backgroundColor="var(--k-bg)" borderStyle="solid">
          <div>
            <Text tag="div" fontSize={14} fontWeight={500} color="var(--k-text-primary)" display="block">Email inboxes</Text>
            <Text tag="div" fontSize={12} color="var(--k-text-tertiary)" marginTop={2} display="block">Gmail and other email channels connected to this account</Text>
          </div>
          <Pressable onClick={() => onViewChange("channels")} fontSize={12} fontWeight={500} color="var(--k-accent)" backgroundColor="transparent" borderWidth={0} cursor="pointer">
            Manage →
          </Pressable>
        </Box>
      </Box>
    </div>
  );
}

// ── Triage Engine ─────────────────────────────────────────────────────────────

const TIER_COLORS = ["var(--kairo-color-faint)", "var(--kairo-color-bad)", "var(--kairo-color-warn)", "var(--kairo-color-ok)"];

// Default category keys — stored in i18n so they switch language automatically
const DEFAULT_CATEGORY_KEYS = ["billing", "apiBugs", "configuration", "sales", "product", "onboarding", "account"] as const;

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
      <Text tag="h1" fontSize={26} fontWeight={600} letterSpacing={-0.52} marginTop={0} marginHorizontal={0} marginBottom={24} font="display" color="var(--k-text-primary)" display="block">{t("dashboard:settings.triage.title")}</Text>
      <Text tag="p" fontSize={14} color="var(--k-text-tertiary)" marginTop={-16} marginHorizontal={0} marginBottom={28} display="block">
        {t("dashboard:settings.triage.subtitle")}
      </Text>

      {/* Tier toggles */}
      <Box marginBottom={32}>
        <Text tag="div" fontSize={12} fontWeight={500} color="var(--k-text-secondary)" font="mono" textTransform="uppercase" letterSpacing={0.6} marginBottom={12} display="block">{t("dashboard:settings.triage.tiersLabel")}</Text>
        {TIER_DATA.map((tier, i) => {
          const col = TIER_COLORS[tier.tier];
          return (
            <Box key={tier.tier} display="flex" alignItems="center" gap={16} paddingVertical={14} paddingHorizontal={16} borderWidth={1} borderColor="var(--k-border)" borderRadius={10} marginBottom={8} backgroundColor="var(--k-bg)" borderStyle="solid">
              <Text tag="div" width={32} height={32} borderRadius={8} backgroundColor={col + "20"} color={col} display="flex" alignItems="center" justifyContent="center" font="mono" fontSize={12} fontWeight={600} flexShrink={0}>
                T{tier.tier}
              </Text>
              <Box flexGrow={1} flexShrink={1} flexBasis="0%">
                <Text tag="div" fontSize={14} fontWeight={500} color="var(--k-text-primary)" display="block">{t(`dashboard:settings.triage.${tier.nameKey}`)}</Text>
                <Text tag="div" fontSize={13} color="var(--k-text-tertiary)" display="block">{t(`dashboard:settings.triage.${tier.descKey}`)}</Text>
              </Box>
              <Switch
                checked={tiers[i]}
                label={t(`dashboard:settings.triage.${tier.nameKey}`)}
                onCheckedChange={() => setTiers((p) => p.map((v, j) => j === i ? !v : v))}
              />
            </Box>
          );
        })}
      </Box>

      {/* Confidence slider */}
      <Box marginBottom={32} padding={18} borderWidth={1} borderColor="var(--k-border)" borderRadius={10} backgroundColor="var(--k-bg)" borderStyle="solid">
        <Box display="flex" justifyContent="space-between" alignItems="baseline" marginBottom={6}>
          <Text tag="div" fontSize={14} fontWeight={500} color="var(--k-text-primary)" display="block">{t("dashboard:settings.triage.confidenceTitle")}</Text>
          <Text font="mono" fontSize={16} color="var(--k-accent)" fontWeight={500}>{confidence.toFixed(2)}</Text>
        </Box>
        <Text tag="p" fontSize={13} color="var(--k-text-tertiary)" marginTop={0} marginHorizontal={0} marginBottom={14} display="block">
          {t("dashboard:settings.triage.confidenceDesc", { threshold: confidence.toFixed(2) })}
        </Text>
        <PlainInput type="range" min={0.5} max={1} step={0.01} value={confidence} onChange={(e) => setConfidence(parseFloat(e.target.value))} width="100%" accentColor="var(--k-accent)" />
        <Text tag="div" display="flex" justifyContent="space-between" fontSize={11} font="mono" color="var(--k-text-tertiary)" marginTop={6}>
          <span>{t("dashboard:settings.triage.confidenceLow")}</span>
          <span>{t("dashboard:settings.triage.confidenceHigh")}</span>
        </Text>
      </Box>

      {/* Custom categories */}
      <Box marginBottom={32}>
        <Box display="flex" justifyContent="space-between" alignItems="center" marginBottom={12}>
          <Text tag="div" fontSize={12} fontWeight={500} color="var(--k-text-secondary)" font="mono" textTransform="uppercase" letterSpacing={0.6} marginBottom={12} display="block">{t("dashboard:settings.triage.categoriesLabel")}</Text>
          <Box display="flex" gap={6}>
            <PlainInput placeholder={t("dashboard:settings.triage.categoryPlaceholder")} value={newCat} onChange={(e) => setNewCat(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addCat()} width={140} height={36} paddingVertical={4} paddingHorizontal={10} borderRadius={8} borderWidth={1} borderColor="var(--k-border)" backgroundColor="var(--k-surface)" color="var(--k-text-primary)" fontSize={12} outlineWidth={0} borderStyle="solid" />
            <Pressable onClick={addCat} display="flex" alignItems="center" gap={4} paddingVertical={4} paddingHorizontal={10} borderRadius={8} backgroundColor="transparent" color="var(--k-text-secondary)" fontSize={12} fontWeight={500} borderWidth={1} borderColor="var(--k-border)" cursor="pointer" borderStyle="solid">
              <Icon name="plus" size={12} /> {t("dashboard:settings.triage.addCategory")}
            </Pressable>
          </Box>
        </Box>
        <Box display="flex" gap={8} flexWrap="wrap">
          {categories.map((c) => (
            <Text key={c} paddingVertical={5} paddingHorizontal={10} fontSize={12} borderRadius={6} borderWidth={1} borderColor="var(--k-border)" display="flex" alignItems="center" gap={6} color="var(--k-text-primary)" backgroundColor="var(--k-bg)" borderStyle="solid">
              {c}
              <Pressable onClick={() => setCategories((p) => p.filter((x) => x !== c))} color="var(--k-text-tertiary)" backgroundColor="transparent" borderWidth={0} cursor="pointer" padding={0} display="flex">
                <Icon name="x" size={11} />
              </Pressable>
            </Text>
          ))}
        </Box>
      </Box>

      <Box display="flex" justifyContent="flex-end" gap={8} paddingTop={20} borderTopWidth={1} borderTopColor="var(--k-border)" borderStyle="solid">
        <Pressable display="inline-flex" alignItems="center" gap={6} paddingVertical={7} paddingHorizontal={14} borderRadius={8} backgroundColor="transparent" color="var(--k-text-secondary)" fontSize={13} fontWeight={500} borderWidth={1} borderColor="var(--k-border)" cursor="pointer" borderStyle="solid">{t("dashboard:settings.discard")}</Pressable>
        <Pressable display="inline-flex" alignItems="center" gap={6} paddingVertical={7} paddingHorizontal={16} borderRadius={8} backgroundColor="var(--k-accent)" color="white" fontSize={13} fontWeight={500} borderWidth={0} cursor="pointer">{t("dashboard:settings.saveChanges")}</Pressable>
      </Box>
    </div>
  );
}

// ── Operational SLA (KAI-168) ─────────────────────────────────────────────────

type Priority = "P1" | "P2" | "P3";

interface PrioritySlaRow {
  priority: Priority;
  maxResponseSeconds: number;
  minResponseSeconds: number;
  riskAlertSeconds: number;
  escalationSeconds: number;
}

const PRIORITY_ORDER: Priority[] = ["P1", "P2", "P3"];
const SLA_FIELDS = [
  { key: "maxResponseSeconds", labelKey: "dashboard:settings.sla.fieldMax" },
  { key: "minResponseSeconds", labelKey: "dashboard:settings.sla.fieldMin" },
  { key: "riskAlertSeconds",   labelKey: "dashboard:settings.sla.fieldRisk" },
  { key: "escalationSeconds",  labelKey: "dashboard:settings.sla.fieldEscalation" },
] as const satisfies readonly { key: keyof Omit<PrioritySlaRow, "priority">; labelKey: string }[];

function secondsToMinutes(seconds: number): number {
  return Math.round(seconds / 60);
}

function minutesToSeconds(minutes: number): number {
  return Math.round(minutes * 60);
}

function OperationalSlaSection() {
  const { t } = useTranslation(["dashboard"]);
  const [rows, setRows] = useState<PrioritySlaRow[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    getOperationalSlaConfig()
      .then((res) => res.json())
      .then((body: { config: PrioritySlaRow[] }) => {
        if (!cancelled) setRows(body.config);
      })
      .catch(() => {
        if (!cancelled) setMsg({ type: "error", text: t("dashboard:settings.savedError") });
      });
    return () => { cancelled = true; };
  }, [t]);

  function updateField(priority: Priority, key: keyof Omit<PrioritySlaRow, "priority">, minutes: number) {
    setRows((prev) =>
      prev
        ? prev.map((row) => (row.priority === priority ? { ...row, [key]: minutesToSeconds(minutes) } : row))
        : prev
    );
  }

  async function save() {
    if (!rows) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await saveOperationalSlaConfig(rows);
      if (!res.ok) { setMsg({ type: "error", text: t("dashboard:settings.savedError") }); return; }
      setMsg({ type: "success", text: t("dashboard:settings.savedSuccess") });
    } catch {
      setMsg({ type: "error", text: t("dashboard:settings.savedError") });
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(null), 3000);
    }
  }

  if (!rows) {
    return (
      <div>
        <Text tag="h1" fontSize={26} fontWeight={600} letterSpacing={-0.52} marginTop={0} marginHorizontal={0} marginBottom={24} font="display" color="var(--k-text-primary)" display="block">{t("dashboard:settings.nav.sla")}</Text>
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div>
      <Text tag="h1" fontSize={26} fontWeight={600} letterSpacing={-0.52} marginTop={0} marginHorizontal={0} marginBottom={24} font="display" color="var(--k-text-primary)" display="block">{t("dashboard:settings.nav.sla")}</Text>
      <Text tag="p" fontSize={14} color="var(--k-text-tertiary)" marginTop={-16} marginHorizontal={0} marginBottom={24} display="block">
        {t("dashboard:settings.sla.subtitle")}
      </Text>

      {PRIORITY_ORDER.map((priority) => {
        const row = rows.find((r) => r.priority === priority);
        if (!row) return null;
        return (
          <Box key={priority} padding={24} borderWidth={1} borderColor="var(--k-border)" borderRadius={12} backgroundColor="var(--k-bg)" marginBottom={12} borderStyle="solid">
            <Text tag="div" fontSize={14} fontWeight={600} color="var(--k-text-primary)" marginBottom={12} display="block">
              {t(`dashboard:settings.sla.priority${priority}`)}
            </Text>
            <Box grid gridTemplateColumns="1fr 1fr 1fr 1fr" gap={16}>
              {SLA_FIELDS.map((field) => (
                <div key={field.key}>
                  {/* Fixed height (not minHeight) fits 2 lines so every column in the
                      row has the exact same label height regardless of whether its
                      own text wraps to 1 or 2 lines (ES labels are longer than EN) —
                      a minHeight only floors the shortest column, it doesn't force
                      the 1-line and 2-line columns to match each other. */}
                  <Text tag="label" display="flex" fontSize={12} fontWeight={500} color="var(--k-text-secondary)" marginBottom={6} textTransform="uppercase" letterSpacing={0.48} height={32} lineHeight={16} alignItems="flex-end">
                    {t(field.labelKey)}
                  </Text>
                  <Box position="relative">
                    <PlainInput type="number" min={1} value={secondsToMinutes(row[field.key])} onChange={(e) => updateField(priority, field.key, Number(e.target.value))} width="100%" height={36} paddingVertical={0} paddingHorizontal={10} borderRadius={8} borderWidth={1} borderColor="var(--k-border)" backgroundColor="var(--k-surface)" color="var(--k-text-primary)" fontSize={13} outlineWidth={0} paddingRight={40} borderStyle="solid" />
                    <Text position="absolute" right={10} top="50%" transform="translateY(-50%)" fontSize={12} color="var(--k-text-tertiary)" pointerEvents="none">
                      {t("dashboard:settings.sla.unitMinutes")}
                    </Text>
                  </Box>
                </div>
              ))}
            </Box>
          </Box>
        );
      })}

      {msg && (
        <Text tag="div" display="flex" alignItems="center" gap={8} borderRadius={6} paddingVertical={8} paddingHorizontal={12} fontSize={13} backgroundColor={msg.type === "success" ? "color-mix(in srgb, var(--kairo-color-ok) 8%, transparent)" : "var(--kairo-color-bad-soft)"} color={msg.type === "success" ? "var(--kairo-color-ok-ink)" : "var(--kairo-color-bad-ink)"} borderWidth={1} borderColor={msg.type === "success" ? "color-mix(in srgb, var(--kairo-color-ok) 24%, transparent)" : "var(--kairo-color-bad-line)"} marginBottom={16} borderStyle="solid">
          {msg.type === "success" ? <Icon name="check" size={14} /> : <Icon name="alert" size={14} />}
          {msg.text}
        </Text>
      )}

      <Box display="flex" justifyContent="flex-end" gap={8} paddingTop={20} borderTopWidth={1} borderTopColor="var(--k-border)" borderStyle="solid">
        <Pressable onClick={save} disabled={saving} display="inline-flex" alignItems="center" gap={6} paddingVertical={7} paddingHorizontal={16} borderRadius={8} backgroundColor="var(--k-accent)" color="white" fontSize={13} fontWeight={500} borderWidth={0} cursor="pointer">
          {saving && <Spinner />}
          {saving ? t("dashboard:settings.savingState") : t("dashboard:settings.saveChanges")}
        </Pressable>
      </Box>
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
      <Text tag="h1" fontSize={26} fontWeight={600} letterSpacing={-0.52} marginTop={0} marginHorizontal={0} marginBottom={24} font="display" color="var(--k-text-primary)" display="block">{t("dashboard:settings.security.title")}</Text>

      <Box borderWidth={1} borderColor="var(--k-border)" borderRadius={12} overflow="hidden" backgroundColor="var(--k-bg)" borderStyle="solid">
        <Box paddingVertical={18} paddingHorizontal={20} display="flex" alignItems="center" justifyContent="space-between" borderBottomWidth={1} borderBottomColor="var(--k-border)" borderStyle="solid">
          <div>
            <Text tag="div" fontSize={14} fontWeight={500} color="var(--k-text-primary)" display="block">{t("dashboard:settings.security.passwordLabel")}</Text>
            <Text tag="div" fontSize={12} color="var(--k-text-tertiary)" marginTop={2} display="block">
              {hasPassword
                ? t("dashboard:settings.security.passwordActiveDesc")
                : t("dashboard:settings.security.passwordNoneDesc")}
            </Text>
          </div>
          <Pressable onClick={() => onViewChange("change-password")} fontSize={13} fontWeight={500} color="var(--k-accent)" backgroundColor="transparent" borderWidth={0} cursor="pointer">
            {hasPassword
              ? t("dashboard:settings.security.changePassword")
              : t("dashboard:settings.security.setPassword")}
          </Pressable>
        </Box>

        <Box paddingVertical={18} paddingHorizontal={20} display="flex" alignItems="center" justifyContent="space-between">
          <div>
            <Text tag="div" fontSize={14} fontWeight={500} color="var(--k-text-primary)" display="block">{t("dashboard:settings.security.twoFaLabel")}</Text>
            <Text tag="div" fontSize={12} color="var(--k-text-tertiary)" marginTop={2} display="block">{t("dashboard:settings.security.twoFaDesc")}</Text>
          </div>
          <Text fontSize={11} color="var(--k-text-tertiary)" font="mono">{t("dashboard:settings.security.comingSoon")}</Text>
        </Box>
      </Box>
    </div>
  );
}

// ── Coming soon stub ──────────────────────────────────────────────────────────

function ComingSoonSection({ title }: { title: string }) {
  const { t } = useTranslation(["dashboard"]);
  return (
    <div>
      <Text tag="h1" fontSize={26} fontWeight={600} letterSpacing={-0.52} marginTop={0} marginHorizontal={0} marginBottom={24} font="display" color="var(--k-text-primary)" display="block">{title}</Text>
      <Text tag="div" padding={40} borderWidth={1} borderColor="var(--k-border)" borderRadius={12} color="var(--k-text-tertiary)" fontSize={14} textAlign="center" display="block" borderStyle="dashed">
        {t("dashboard:settings.comingSoon")}
      </Text>
    </div>
  );
}

// ── Shared styles ─────────────────────────────────────────────────────────────


// ── Root component ────────────────────────────────────────────────────────────

export function ProfileSettings({ onViewChange }: Props) {
  const { profile } = useAuth();
  const { t } = useTranslation(["dashboard"]);
  const [section, setSection] = useState<SettingsSection>("workspace");
  const navItems = buildNavItems(t);

  if (!profile) {
    return (
      <Box flexGrow={1} flexShrink={1} flexBasis="0%" display="flex" alignItems="center" justifyContent="center">
        <Spinner size="lg" />
      </Box>
    );
  }

  return (
    <Box flexGrow={1} flexShrink={1} flexBasis="0%" display="flex" height="100%" overflow="hidden" backgroundColor="var(--k-surface)">
      {/* Left nav */}
      <Box width={220} borderRightWidth={1} borderRightColor="var(--k-border)" paddingVertical={24} paddingHorizontal={12} flexShrink={0} scroll borderStyle="solid">
        <Text tag="div" fontSize={11} fontWeight={600} color="var(--k-text-tertiary)" textTransform="uppercase" letterSpacing={0.88} paddingVertical={0} paddingHorizontal={10} marginBottom={12} display="block">
          {t("dashboard:settings.navHeading")}
        </Text>
        {navItems.map((item) => {
          const active = section === item.id;
          return (
            <Pressable key={item.id} onClick={() => setSection(item.id)} display="flex" alignItems="center" gap={10} paddingVertical={7} paddingHorizontal={10} borderRadius={6} width="100%" textAlign="left" backgroundColor={active ? "var(--k-surface-raised, rgba(0,0,0,0.06))" : "transparent"} color={active ? "var(--k-text-primary)" : "var(--k-text-secondary)"} fontSize={13} fontWeight={active ? 500 : 400} marginBottom={1} borderWidth={0} cursor="pointer">
              <Icon name={item.icon} size={14} />
              <span>{item.label}</span>
            </Pressable>
          );
        })}
      </Box>

      {/* Content */}
      <Box flexGrow={1} flexShrink={1} flexBasis="0%" paddingTop={32} paddingHorizontal={40} paddingBottom={56} maxWidth={880} scroll>
        {section === "workspace" && <WorkspaceSection />}
        {section === "team" && <TeamSection />}
        {section === "integrations" && <IntegrationsSection onViewChange={onViewChange} />}
        {section === "triage" && <TriageSection />}
        {section === "sla" && <OperationalSlaSection />}
        {section === "security" && <SecuritySection onViewChange={onViewChange} />}
        {section === "kb" && <ComingSoonSection title={t("dashboard:settings.nav.kb")} />}
        {section === "billing" && <ComingSoonSection title={t("dashboard:settings.nav.billing")} />}
        {section === "api" && <ComingSoonSection title={t("dashboard:settings.nav.api")} />}
      </Box>
    </Box>
  );
}
