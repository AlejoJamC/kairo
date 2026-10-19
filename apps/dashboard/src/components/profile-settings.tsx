import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@kairo/client-core/auth";
import { updateProfileName } from "@kairo/client-core/queries";
import { getOperationalSlaConfig, saveOperationalSlaConfig } from "@kairo/client-core/endpoints";
import type { AppView } from "@/types";
import { Avatar, Box, Button, Callout, Card, CardContent, Chip, EmptyState, Field, FieldInput, FieldRange, FieldSelect, Icon, IconButton, IntegrationCard, type IntegrationStatus, NavItem, SlaScale, Spinner, Switch, Text, type IconName } from "@kairo/ui";

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

      <Card marginBottom={12}>
        <CardContent>
          <Box display="flex" gap={14} alignItems="flex-end" marginBottom={20}>
            <Avatar name={name || "W"} seed={name || "workspace"} size={56} />
            <Box flexGrow={1} flexShrink={1} flexBasis="0%">
              <Field label={t("dashboard:settings.workspace.nameLabel")}>
                <FieldInput value={name} onChangeText={setName} placeholder={t("dashboard:settings.companyPlaceholder")} />
              </Field>
            </Box>
          </Box>
          <Box grid gridTemplateColumns="1fr 1fr" gap={16}>
            <Field label={t("dashboard:settings.workspace.urlLabel")}>
              <FieldInput readOnly placeholder={t("dashboard:settings.workspace.urlPlaceholder")} />
            </Field>
            <Field label={t("dashboard:settings.workspace.timezoneLabel")}>
              <FieldInput readOnly placeholder={t("dashboard:settings.workspace.timezonePlaceholder")} />
            </Field>
          </Box>
        </CardContent>
      </Card>

      <Card marginBottom={24}>
        <CardContent>
          <Box display="flex" alignItems="center" gap={16}>
            <Icon name="globe" size={16} color="var(--kairo-color-faint)" />
            <Box flexGrow={1} flexShrink={1} flexBasis="0%">
              <Text tag="div" fontSize={14} fontWeight={500} color="var(--k-text-primary)" display="block">{t("dashboard:settings.workspace.langTitle")}</Text>
              <Text tag="div" fontSize={13} color="var(--k-text-tertiary)" display="block">{t("dashboard:settings.workspace.langDesc")}</Text>
            </Box>
            <Field label={t("dashboard:settings.workspace.langTitle")} hideLabel>
              <FieldSelect minWidth={180}>
                <option>{t("dashboard:settings.workspace.langLatam")}</option>
                <option>{t("dashboard:settings.workspace.langSpain")}</option>
                <option>{t("dashboard:settings.workspace.langEnglish")}</option>
              </FieldSelect>
            </Field>
          </Box>
        </CardContent>
      </Card>

      {msg && (
        <Box marginBottom={16}>
          <Callout tone={msg.type === "success" ? "neutral" : "error"} icon={<Icon name={msg.type === "success" ? "check" : "alert"} size={14} />}>{msg.text}</Callout>
        </Box>
      )}

      <Box display="flex" justifyContent="flex-end" gap={8} paddingTop={20} borderTopWidth={1} borderTopColor="var(--k-border)" borderStyle="solid">
        <Button>{t("dashboard:settings.discard")}</Button>
        <Button variant="primary" loading={saving} loadingLabel={t("dashboard:settings.savingState")} onPress={save}>{t("dashboard:settings.saveChanges")}</Button>
      </Box>
    </div>
  );
}

// ── Team ──────────────────────────────────────────────────────────────────────

const TEAM_MEMBERS = [
  { name: "Valentina Castro", email: "valentina@empresa.io", role: "Owner", status: "online" },
  { name: "Mateo Ríos", email: "mateo@empresa.io", role: "Admin", status: "online" },
  { name: "Lucía Bermúdez", email: "lucia@empresa.io", role: "Agente", status: "away" },
];

function TeamSection() {
  const { t } = useTranslation(["dashboard"]);
  return (
    <div>
      <Box display="flex" alignItems="baseline" justifyContent="space-between" marginBottom={6}>
        <Text tag="h1" fontSize={26} fontWeight={600} letterSpacing={-0.52} margin={0} font="display" color="var(--k-text-primary)" display="block">{t("dashboard:settings.team.title")}</Text>
        <Button variant="primary" icon={<Icon name="plus" size={13} color="var(--kairo-color-on-accent)" />}>{t("dashboard:settings.team.invite")}</Button>
      </Box>
      <Text tag="p" fontSize={14} color="var(--k-text-tertiary)" marginTop={8} marginHorizontal={0} marginBottom={24} display="block">
        {t("dashboard:settings.team.seats", { used: 3, total: 5, plan: "Pro" })}
      </Text>
      <Box borderWidth={1} borderColor="var(--k-border)" borderRadius={12} overflow="hidden" borderStyle="solid">
        {TEAM_MEMBERS.map((m, i) => (
          <Box key={m.email} grid gridTemplateColumns="2fr 1fr 1fr 30px" paddingVertical={14} paddingHorizontal={18} alignItems="center" borderBottomWidth={i < TEAM_MEMBERS.length - 1 ? 1 : 0} borderBottomColor="var(--k-border)" backgroundColor="var(--k-bg)" borderStyle="solid">
            <Box display="flex" gap={12} alignItems="center">
              <Avatar name={m.name} seed={m.name} size={32} presence={m.status === "online" ? "online" : "away"} />
              <div>
                <Text tag="div" fontSize={14} fontWeight={500} color="var(--k-text-primary)" display="block">{m.name}</Text>
                <Text tag="div" fontSize={12} color="var(--k-text-tertiary)" display="block">{m.email}</Text>
              </div>
            </Box>
            <Text fontSize={13} color="var(--k-text-primary)">{m.role}</Text>
            <Text fontSize={12} color="var(--k-text-tertiary)" font="mono">
              {m.status === "online" ? t("dashboard:settings.team.statusActive") : t("dashboard:settings.team.statusAway")}
            </Text>
            <IconButton label={t("dashboard:settings.team.more", "More")}>
              <Icon name="more" size={14} color="var(--kairo-color-faint)" />
            </IconButton>
          </Box>
        ))}
      </Box>
    </div>
  );
}

// ── Integrations ──────────────────────────────────────────────────────────────

const INTEGRATIONS = [
  { name: "Gmail", status: "connected", meta: "soporte@empresa.io · 2,341 mensajes", color: "var(--kairo-color-avatar-coral)", letter: "G" },
  { name: "Slack", status: "available", meta: "Notificaciones + crear tickets desde DM", color: "var(--kairo-color-avatar-violet)", letter: "S" },
  { name: "WhatsApp Business", status: "beta", meta: "Twilio + Meta WABA", color: "var(--kairo-color-avatar-green)", letter: "W" },
  { name: "Telegram", status: "soon", meta: "Q4 2026", color: "var(--kairo-color-avatar-blue)", letter: "T" },
  { name: "Instagram DM", status: "soon", meta: "Q4 2026", color: "var(--kairo-color-avatar-lilac)", letter: "I" },
  { name: "Zendesk", status: "available", meta: "Importar tickets históricos", color: "var(--kairo-color-faint)", letter: "Z" },
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
          <IntegrationCard
            key={int.name}
            name={int.name}
            initial={int.letter}
            tileColor={int.color}
            status={(int.status === "beta" ? "available" : int.status) as IntegrationStatus}
            beta={int.status === "beta"}
            description={int.meta}
            labels={{
              beta: "BETA",
              soon: t("dashboard:settings.integrations.comingSoon"),
              connect: int.status === "beta" ? t("dashboard:settings.integrations.requestAccess") : t("dashboard:settings.integrations.connect"),
              connecting: "…",
              reconnect: t("dashboard:settings.integrations.connect"),
              disconnect: t("dashboard:settings.integrations.configure"),
            }}
          />
        ))}
      </Box>

      {/* Support Channels */}
      <Box marginTop={28}>
        <Text tag="h2" fontSize={14} fontWeight={600} color="var(--k-text-primary)" marginTop={0} marginHorizontal={0} marginBottom={12} display="block">
          Support Channels
        </Text>
        <Card>
          <CardContent>
            <Box display="flex" alignItems="center" justifyContent="space-between">
              <div>
                <Text tag="div" fontSize={14} fontWeight={500} color="var(--k-text-primary)" display="block">Email inboxes</Text>
                <Text tag="div" fontSize={12} color="var(--k-text-tertiary)" marginTop={2} display="block">Gmail and other email channels connected to this account</Text>
              </div>
              <Button variant="link" iconEnd={<Icon name="right" size={12} color="var(--kairo-color-accent-ink)" />} onPress={() => onViewChange("channels")}>Manage</Button>
            </Box>
          </CardContent>
        </Card>
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
            <Card key={tier.tier} marginBottom={8}>
              <CardContent>
                <Box display="flex" alignItems="center" gap={16}>
                  <Text tag="div" width={32} height={32} borderRadius={8} backgroundColor={`color-mix(in srgb, ${col} 14%, transparent)`} color={col} display="flex" alignItems="center" justifyContent="center" font="mono" fontSize={12} fontWeight={600} flexShrink={0}>
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
              </CardContent>
            </Card>
          );
        })}
      </Box>

      {/* Confidence slider */}
      <Card marginBottom={32}>
        <CardContent>
          <FieldRange
            label={t("dashboard:settings.triage.confidenceTitle")}
            value={confidence}
            min={0.5}
            max={1}
            step={0.01}
            onValueChange={setConfidence}
            format={(value) => value.toFixed(2)}
            startLabel={t("dashboard:settings.triage.confidenceLow")}
            endLabel={t("dashboard:settings.triage.confidenceHigh")}
            hint={t("dashboard:settings.triage.confidenceDesc", { threshold: confidence.toFixed(2) })}
          />
        </CardContent>
      </Card>

      {/* Custom categories */}
      <Box marginBottom={32}>
        <Box display="flex" justifyContent="space-between" alignItems="center" marginBottom={12}>
          <Text tag="div" fontSize={12} fontWeight={500} color="var(--k-text-secondary)" font="mono" textTransform="uppercase" letterSpacing={0.6} display="block">{t("dashboard:settings.triage.categoriesLabel")}</Text>
          <Box display="flex" gap={6} alignItems="center">
            <Field label={t("dashboard:settings.triage.categoriesLabel")} hideLabel>
              <FieldInput placeholder={t("dashboard:settings.triage.categoryPlaceholder")} value={newCat} onChangeText={setNewCat} onKeyPress={(e) => e.nativeEvent.key === "Enter" && addCat()} width={160} />
            </Field>
            <Button icon={<Icon name="plus" size={12} />} onPress={addCat}>{t("dashboard:settings.triage.addCategory")}</Button>
          </Box>
        </Box>
        <Box display="flex" gap={8} flexWrap="wrap">
          {categories.map((c) => (
            <Chip key={c} icon={<Icon name="x" size={11} />} onPress={() => setCategories((p) => p.filter((x) => x !== c))}>
              {c}
            </Chip>
          ))}
        </Box>
      </Box>

      <Box display="flex" justifyContent="flex-end" gap={8} paddingTop={20} borderTopWidth={1} borderTopColor="var(--k-border)" borderStyle="solid">
        <Button>{t("dashboard:settings.discard")}</Button>
        <Button variant="primary">{t("dashboard:settings.saveChanges")}</Button>
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
        const minutes = {
          minimum: secondsToMinutes(row.minResponseSeconds),
          alert: secondsToMinutes(row.riskAlertSeconds),
          escalation: secondsToMinutes(row.escalationSeconds),
          maximum: secondsToMinutes(row.maxResponseSeconds),
        };
        const ordered = minutes.minimum < minutes.alert && minutes.alert < minutes.escalation && minutes.escalation < minutes.maximum;
        return (
          <Card key={priority} marginBottom={12}>
            <CardContent>
              <Text tag="div" fontSize={14} fontWeight={600} color="var(--k-text-primary)" marginBottom={12} display="block">
                {t(`dashboard:settings.sla.priority${priority}`)}
              </Text>
              <Box grid gridTemplateColumns="1fr 1fr 1fr 1fr" gap={16}>
                {SLA_FIELDS.map((field) => (
                  <Field key={field.key} label={t(field.labelKey)} unit={t("dashboard:settings.sla.unitMinutes")}>
                    <FieldInput inputMode="numeric" value={String(secondsToMinutes(row[field.key]))} onChangeText={(value) => updateField(priority, field.key, Number(value))} />
                  </Field>
                ))}
              </Box>
              <Box marginTop={16}>
                <SlaScale
                  alert={minutes.alert}
                  escalation={minutes.escalation}
                  maximum={minutes.maximum}
                  labels={{
                    minimum: `${minutes.minimum}m`,
                    alert: `${minutes.alert}m`,
                    escalation: `${minutes.escalation}m`,
                    breach: `${minutes.maximum}m`,
                  }}
                  orderError={ordered ? undefined : t("dashboard:settings.sla.orderError")}
                />
              </Box>
            </CardContent>
          </Card>
        );
      })}

      {msg && (
        <Box marginBottom={16}>
          <Callout tone={msg.type === "success" ? "neutral" : "error"} icon={<Icon name={msg.type === "success" ? "check" : "alert"} size={14} />}>{msg.text}</Callout>
        </Box>
      )}

      <Box display="flex" justifyContent="flex-end" gap={8} paddingTop={20} borderTopWidth={1} borderTopColor="var(--k-border)" borderStyle="solid">
        <Button variant="primary" loading={saving} loadingLabel={t("dashboard:settings.savingState")} onPress={save}>{t("dashboard:settings.saveChanges")}</Button>
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

      <Card>
        <Box paddingVertical={18} paddingHorizontal={20} display="flex" alignItems="center" justifyContent="space-between" borderBottomWidth={1} borderBottomColor="var(--k-border)" borderStyle="solid">
          <div>
            <Text tag="div" fontSize={14} fontWeight={500} color="var(--k-text-primary)" display="block">{t("dashboard:settings.security.passwordLabel")}</Text>
            <Text tag="div" fontSize={12} color="var(--k-text-tertiary)" marginTop={2} display="block">
              {hasPassword
                ? t("dashboard:settings.security.passwordActiveDesc")
                : t("dashboard:settings.security.passwordNoneDesc")}
            </Text>
          </div>
          <Button variant="link" onPress={() => onViewChange("change-password")}>
            {hasPassword
              ? t("dashboard:settings.security.changePassword")
              : t("dashboard:settings.security.setPassword")}
          </Button>
        </Box>

        <Box paddingVertical={18} paddingHorizontal={20} display="flex" alignItems="center" justifyContent="space-between">
          <div>
            <Text tag="div" fontSize={14} fontWeight={500} color="var(--k-text-primary)" display="block">{t("dashboard:settings.security.twoFaLabel")}</Text>
            <Text tag="div" fontSize={12} color="var(--k-text-tertiary)" marginTop={2} display="block">{t("dashboard:settings.security.twoFaDesc")}</Text>
          </div>
          <Text fontSize={11} color="var(--k-text-tertiary)" font="mono">{t("dashboard:settings.security.comingSoon")}</Text>
        </Box>
      </Card>
    </div>
  );
}

// ── Coming soon stub ──────────────────────────────────────────────────────────

function ComingSoonSection({ title }: { title: string }) {
  const { t } = useTranslation(["dashboard"]);
  return (
    <div>
      <Text tag="h1" fontSize={26} fontWeight={600} letterSpacing={-0.52} marginTop={0} marginHorizontal={0} marginBottom={24} font="display" color="var(--k-text-primary)" display="block">{title}</Text>
      <EmptyState icon="layers" title={t("dashboard:settings.comingSoon")} />
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
        {navItems.map((item) => (
          <Box key={item.id} marginBottom={1}>
            <NavItem variant="settings" icon={item.icon} label={item.label} active={section === item.id} onPress={() => setSection(item.id)} />
          </Box>
        ))}
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
