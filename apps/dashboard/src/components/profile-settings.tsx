import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@kairo/client-core/auth";
import { updateProfileName } from "@kairo/client-core/queries";
import { getOperationalSlaConfig, saveOperationalSlaConfig, listChannels } from "@kairo/client-core/endpoints";
import { useAccountMembers } from "@kairo/client-core/hooks/use-account-members";
import type { AppView } from "@/types";
import {
  Avatar, Box, Button, Card, Chip, EmptyState, Field, FieldInput, FieldRange, FieldSelect, Icon, IntegrationCard, MemberRow, MemberTable, NavItem,
  PageFormFooter, PageFrame, PageHeader, SettingsNav, SettingsRow, SlaPolicyCard, Spinner, Switch, Text, isSlaOrderValid,
  type IconName, type IntegrationStatus, type SlaPolicyKey,
} from "@kairo/ui";

interface Props {
  onViewChange: (view: AppView) => void;
}

type SettingsSection = "workspace" | "team" | "integrations" | "triage" | "sla" | "billing" | "security" | "api";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildNavItems(t: (...args: any[]) => string): { id: SettingsSection; label: string; icon: IconName }[] {
  return [
    { id: "workspace",    label: t("dashboard:settings.nav.workspace"),    icon: "panel" },
    { id: "team",         label: t("dashboard:settings.nav.team"),         icon: "clients" },
    { id: "integrations", label: t("dashboard:settings.nav.integrations"), icon: "layers" },
    { id: "triage",       label: t("dashboard:settings.nav.triage"),       icon: "spark" },
    { id: "sla",          label: t("dashboard:settings.nav.sla"),          icon: "alarm" },
    { id: "billing",      label: t("dashboard:settings.nav.billing"),      icon: "tag" },
    { id: "security",     label: t("dashboard:settings.nav.security"),     icon: "lock" },
    { id: "api",          label: t("dashboard:settings.nav.api"),          icon: "code" },
  ];
}

// ── Workspace ────────────────────────────────────────────────────────────────

function WorkspaceSection() {
  const { t } = useTranslation(["dashboard"]);
  const { profile, refreshProfile } = useAuth();
  const initial = profile?.company_name ?? "";
  const [name, setName] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    setName(profile?.company_name ?? "");
  }, [profile]);

  const save = async () => {
    setSaving(true);
    setError(undefined);
    try {
      const { error: saveError } = await updateProfileName(profile!.id, name);
      if (saveError) { setError(t("dashboard:settings.savedError")); return; }
      await refreshProfile();
    } catch {
      setError(t("dashboard:settings.savedError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader title={t("dashboard:settings.workspace.title")} />
      <Card paddingVertical={20} paddingHorizontal={20}>
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
      </Card>
      <Card paddingVertical={0}>
        <SettingsRow icon="globe" title={t("dashboard:settings.workspace.langTitle")} description={t("dashboard:settings.workspace.langDesc")} controlId="workspace-language">
          <FieldSelect id="workspace-language" width={220}>
            <option>{t("dashboard:settings.workspace.langLatam")}</option>
            <option>{t("dashboard:settings.workspace.langSpain")}</option>
            <option>{t("dashboard:settings.workspace.langEnglish")}</option>
          </FieldSelect>
        </SettingsRow>
      </Card>
      <PageFormFooter
        onDiscard={() => setName(initial)}
        onSave={save}
        canSave={name !== initial}
        saving={saving}
        error={error}
        labels={{ discard: t("dashboard:settings.discard"), save: t("dashboard:settings.saveChanges") }}
      />
    </>
  );
}

// ── Team ──────────────────────────────────────────────────────────────────────

function TeamSection() {
  const { t } = useTranslation(["dashboard"]);
  const { user } = useAuth();
  const { members, loading } = useAccountMembers(true);

  return (
    <>
      <PageHeader title={t("dashboard:settings.team.title")} />
      <MemberTable headers={[t("dashboard:settings.team.person"), t("dashboard:settings.team.role"), t("dashboard:settings.team.state"), t("dashboard:settings.team.options")]} loading={loading}>
        {members.map((member) => (
          <MemberRow
            key={member.user_id}
            name={member.name ?? member.email ?? member.user_id}
            email={member.email ?? ""}
            role={t(`dashboard:settings.team.roles.${member.role}`, { defaultValue: member.role })}
            state="active"
            isYou={member.user_id === user?.id}
            labels={{
              you: t("dashboard:settings.team.you"),
              states: { active: t("dashboard:settings.team.statusActive"), away: t("dashboard:settings.team.statusAway"), invited: t("dashboard:settings.team.statusInvited") },
              options: "",
              changeRole: "",
              remove: "",
              confirmRemove: "",
              confirm: "",
              resend: "",
              cancelInvitation: "",
            }}
          />
        ))}
      </MemberTable>
    </>
  );
}

// ── Integrations ──────────────────────────────────────────────────────────────

type Catalog = { name: string; status: IntegrationStatus; beta?: boolean; descriptionKey: string; color: string; letter: string };

const CATALOG: Catalog[] = [
  { name: "Slack", status: "available", descriptionKey: "slack", color: "var(--kairo-color-avatar-violet)", letter: "S" },
  { name: "WhatsApp Business", status: "requestable", beta: true, descriptionKey: "whatsapp", color: "var(--kairo-color-avatar-green)", letter: "W" },
  { name: "Telegram", status: "soon", descriptionKey: "telegram", color: "var(--kairo-color-avatar-blue)", letter: "T" },
  { name: "Instagram DM", status: "soon", descriptionKey: "instagram", color: "var(--kairo-color-avatar-lilac)", letter: "I" },
  { name: "Zendesk", status: "available", descriptionKey: "zendesk", color: "var(--kairo-color-faint)", letter: "Z" },
];

function IntegrationsSection({ onViewChange }: { onViewChange: (view: AppView) => void }) {
  const { t } = useTranslation(["dashboard"]);
  const { accountId } = useAuth();
  const [connected, setConnected] = useState<{ id: string; email: string }[] | null>(null);

  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    listChannels(accountId)
      .then((res) => (res.ok ? res.json() : { channels: [] }))
      .then((body: { channels?: { id: string; email_address: string; is_active: boolean }[] }) => {
        if (!cancelled) setConnected((body.channels ?? []).filter((channel) => channel.is_active).map((channel) => ({ id: channel.id, email: channel.email_address })));
      })
      .catch(() => { if (!cancelled) setConnected([]); });
    return () => { cancelled = true; };
  }, [accountId]);

  const labels = {
    beta: "BETA",
    soon: t("dashboard:settings.integrations.comingSoon"),
    connect: t("dashboard:settings.integrations.connect"),
    connecting: "…",
    reconnect: t("dashboard:settings.integrations.connect"),
    configure: t("dashboard:settings.integrations.configure"),
    requestAccess: t("dashboard:settings.integrations.requestAccess"),
    requested: t("dashboard:settings.integrations.requested"),
  };

  const gmailConnected = (connected?.length ?? 0) > 0;
  const descriptions: Record<string, string> = {
    slack: t("dashboard:settings.integrations.catalog.slack"),
    whatsapp: t("dashboard:settings.integrations.catalog.whatsapp"),
    telegram: t("dashboard:settings.integrations.catalog.telegram"),
    instagram: t("dashboard:settings.integrations.catalog.instagram"),
    zendesk: t("dashboard:settings.integrations.catalog.zendesk"),
  };

  return (
    <>
      <PageHeader title={t("dashboard:settings.integrations.title")} description={t("dashboard:settings.integrations.subtitle")} />
      <Box grid gridTemplateColumns="repeat(auto-fit, minmax(min(360px, 100%), 1fr))" gap={12}>
        <IntegrationCard
          name="Gmail"
          initial="G"
          tileColor="var(--kairo-color-avatar-coral)"
          status={gmailConnected ? "connected" : "available"}
          description={gmailConnected ? connected?.map((channel) => channel.email).join(" · ") : t("dashboard:settings.integrations.gmailDescription")}
          labels={labels}
          onConfigure={() => onViewChange("channels")}
          onConnect={() => onViewChange("channels")}
        />
        {CATALOG.map((entry) => (
          <IntegrationCard
            key={entry.name}
            name={entry.name}
            initial={entry.letter}
            tileColor={entry.color}
            status={entry.status}
            beta={entry.beta}
            description={descriptions[entry.descriptionKey]}
            labels={labels}
          />
        ))}
      </Box>

      <Text tag="h2" fontSize={15} fontWeight={600} margin={0} marginTop={8} color="var(--k-text-primary)" display="block">
        {t("dashboard:settings.integrations.channelsTitle")}
      </Text>
      <Card paddingVertical={0}>
        <SettingsRow title={t("dashboard:settings.integrations.emailInboxes")} description={t("dashboard:settings.integrations.emailInboxesDesc")}>
          <Button variant="link" iconEnd={<Icon name="right" size={12} color="var(--kairo-color-accent-ink)" />} onPress={() => onViewChange("channels")}>
            {t("dashboard:settings.integrations.manage")}
          </Button>
        </SettingsRow>
      </Card>
    </>
  );
}

// ── Triage Engine ─────────────────────────────────────────────────────────────

// Default category keys — stored in i18n so they switch language automatically
const DEFAULT_CATEGORY_KEYS = ["billing", "apiBugs", "configuration", "sales", "product", "onboarding", "account"] as const;

function TriageSection() {
  const { t } = useTranslation(["dashboard"]);
  const [confidence, setConfidence] = useState(0.85);
  const [tiers, setTiers] = useState([true, true, true, true]);
  const [categories, setCategories] = useState(() => DEFAULT_CATEGORY_KEYS.map((k) => t(`dashboard:settings.triage.cat_${k}`)));
  const [newCat, setNewCat] = useState("");

  const addCat = () => {
    const v = newCat.trim();
    if (v && !categories.includes(v)) setCategories((p) => [...p, v]);
    setNewCat("");
  };

  const TIER_DATA = [
    { tier: 0, nameKey: "tier0Name", descKey: "tier0Desc" },
    { tier: 1, nameKey: "tier1Name", descKey: "tier1Desc" },
    { tier: 2, nameKey: "tier2Name", descKey: "tier2Desc" },
    { tier: 3, nameKey: "tier3Name", descKey: "tier3Desc" },
  ] as const;

  const label = (key: string) => (
    <Text tag="div" font="mono" fontSize={10.5} letterSpacing={0.63} textTransform="uppercase" color="var(--k-text-tertiary)" display="block" marginTop={6}>
      {key}
    </Text>
  );

  return (
    <>
      <PageHeader title={t("dashboard:settings.triage.title")} description={t("dashboard:settings.triage.subtitle")} />

      <Box>
        {label(t("dashboard:settings.triage.tiersLabel"))}
        <Box marginTop={8}>
          <Card paddingVertical={0}>
            {TIER_DATA.map((tier, i) => (
              <SettingsRow key={tier.tier} divider={i > 0} title={t(`dashboard:settings.triage.${tier.nameKey}`)} description={t(`dashboard:settings.triage.${tier.descKey}`)}>
                <Switch checked={tiers[i]} label={t(`dashboard:settings.triage.${tier.nameKey}`)} onCheckedChange={() => setTiers((p) => p.map((v, j) => (j === i ? !v : v)))} />
              </SettingsRow>
            ))}
          </Card>
        </Box>
      </Box>

      <Card paddingVertical={20} paddingHorizontal={20}>
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
      </Card>

      <Box>
        <Box display="flex" justifyContent="space-between" alignItems="center" marginBottom={12}>
          {label(t("dashboard:settings.triage.categoriesLabel"))}
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
    </>
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
const FIELD_OF: Record<SlaPolicyKey, keyof Omit<PrioritySlaRow, "priority">> = {
  maximum: "maxResponseSeconds",
  minimum: "minResponseSeconds",
  alert: "riskAlertSeconds",
  escalation: "escalationSeconds",
};

const secondsToMinutes = (seconds: number) => Math.round(seconds / 60);
const minutesToSeconds = (minutes: number) => Math.round(minutes * 60);

function OperationalSlaSection() {
  const { t } = useTranslation(["dashboard"]);
  const [rows, setRows] = useState<PrioritySlaRow[] | null>(null);
  const [saved, setSaved] = useState<PrioritySlaRow[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    let cancelled = false;
    getOperationalSlaConfig()
      .then((res) => res.json())
      .then((body: { config: PrioritySlaRow[] }) => {
        if (!cancelled) {
          setRows(body.config);
          setSaved(body.config);
        }
      })
      .catch(() => { if (!cancelled) setError(t("dashboard:settings.savedError")); });
    return () => { cancelled = true; };
  }, [t]);

  function update(priority: Priority, key: SlaPolicyKey, minutes: number) {
    setRows((prev) => (prev ? prev.map((row) => (row.priority === priority ? { ...row, [FIELD_OF[key]]: minutesToSeconds(minutes) } : row)) : prev));
  }

  const valuesOf = (row: PrioritySlaRow) => ({
    minimum: secondsToMinutes(row.minResponseSeconds),
    alert: secondsToMinutes(row.riskAlertSeconds),
    escalation: secondsToMinutes(row.escalationSeconds),
    maximum: secondsToMinutes(row.maxResponseSeconds),
  });
  const allOrdered = rows?.every((row) => isSlaOrderValid(valuesOf(row))) ?? false;
  const changed = JSON.stringify(rows) !== JSON.stringify(saved);

  async function save() {
    if (!rows) return;
    setSaving(true);
    setError(undefined);
    try {
      const res = await saveOperationalSlaConfig(rows);
      if (!res.ok) { setError(t("dashboard:settings.savedError")); return; }
      setSaved(rows);
    } catch {
      setError(t("dashboard:settings.savedError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title={t("dashboard:settings.nav.sla")} description={t("dashboard:settings.sla.subtitle")} />
      {PRIORITY_ORDER.map((priority) => {
        const row = rows?.find((r) => r.priority === priority);
        return (
          <SlaPolicyCard
            key={priority}
            priority={priority}
            title={t(`dashboard:settings.sla.priority${priority}`)}
            loading={!row}
            values={row ? valuesOf(row) : { minimum: 0, alert: 0, escalation: 0, maximum: 0 }}
            onChange={(key, value) => update(priority, key, value)}
            labels={{
              unit: t("dashboard:settings.sla.unitMinutes"),
              maximum: t("dashboard:settings.sla.fieldMax"),
              minimum: t("dashboard:settings.sla.fieldMin"),
              alert: t("dashboard:settings.sla.fieldRisk"),
              escalation: t("dashboard:settings.sla.fieldEscalation"),
              legend: { minimum: t("dashboard:settings.sla.legendMin"), alert: t("dashboard:settings.sla.legendAlert"), escalation: t("dashboard:settings.sla.legendEscalation"), breach: t("dashboard:settings.sla.legendBreach") },
              orderError: t("dashboard:settings.sla.orderError"),
            }}
          />
        );
      })}
      <PageFormFooter
        onDiscard={() => setRows(saved)}
        onSave={save}
        canSave={!!rows && changed && allOrdered}
        saving={saving}
        error={error}
        labels={{ discard: t("dashboard:settings.discard"), save: t("dashboard:settings.saveChanges") }}
      />
    </>
  );
}

// ── Security ──────────────────────────────────────────────────────────────────

function SecuritySection({ onViewChange }: { onViewChange: (view: AppView) => void }) {
  const { t } = useTranslation(["dashboard"]);
  const { user } = useAuth();
  const hasPassword = user?.identities?.some((id) => id.provider === "email") ?? false;

  return (
    <>
      <PageHeader title={t("dashboard:settings.security.title")} />
      <Card paddingVertical={0}>
        <SettingsRow
          title={t("dashboard:settings.security.passwordLabel")}
          description={hasPassword ? t("dashboard:settings.security.passwordActiveDesc") : t("dashboard:settings.security.passwordNoneDesc")}
        >
          <Button onPress={() => onViewChange("change-password")}>
            {hasPassword ? t("dashboard:settings.security.changePassword") : t("dashboard:settings.security.setPassword")}
          </Button>
        </SettingsRow>
        <SettingsRow divider title={t("dashboard:settings.security.twoFaLabel")} description={t("dashboard:settings.security.twoFaDesc")}>
          <Text font="mono" fontSize={10} textTransform="uppercase" color="var(--k-text-tertiary)">
            {t("dashboard:settings.security.comingSoon")}
          </Text>
        </SettingsRow>
      </Card>
    </>
  );
}

// ── Sections without a design ─────────────────────────────────────────────────

function PendingSection({ title }: { title: string }) {
  return (
    <>
      <PageHeader title={title} />
      <EmptyState variant="pending" title={`${title} — pending reference`} />
    </>
  );
}

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
    <Box flexGrow={1} flexShrink={1} flexBasis="0%" display="flex" height="100%" overflow="hidden" backgroundColor="var(--kairo-color-bg)">
      <SettingsNav title={t("dashboard:settings.navHeading")}>
        {navItems.map((item) => (
          <NavItem key={item.id} variant="settings" icon={item.icon} label={item.label} active={section === item.id} onPress={() => setSection(item.id)} />
        ))}
      </SettingsNav>
      <PageFrame narrow>
        {section === "workspace" && <WorkspaceSection />}
        {section === "team" && <TeamSection />}
        {section === "integrations" && <IntegrationsSection onViewChange={onViewChange} />}
        {section === "triage" && <TriageSection />}
        {section === "sla" && <OperationalSlaSection />}
        {section === "security" && <SecuritySection onViewChange={onViewChange} />}
        {section === "billing" && <PendingSection title={t("dashboard:settings.nav.billing")} />}
        {section === "api" && <PendingSection title={t("dashboard:settings.nav.api")} />}
      </PageFrame>
    </Box>
  );
}
