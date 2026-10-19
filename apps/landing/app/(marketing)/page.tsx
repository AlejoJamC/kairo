"use client";

import { useRouter } from "next/navigation";
import {
  BenefitCard,
  Box,
  Button,
  Chip,
  DraftCard,
  GoogleMark,
  Icon,
  PermissionList,
  PropRow,
  Section,
  SectionHeader,
  SourceList,
  Text,
  TierCard,
} from "@kairo/ui";
import { useTranslation } from "@/lib/i18n";
import { HeroCockpit } from "@/components/hero-cockpit";

const noop = () => {};

function Lead({ children }: { children: string }) {
  return (
    <Text tag="p" display="block" fontSize={16} color="var(--kairo-color-muted)" lineHeightRatio={1.65} marginTop={0} marginHorizontal={0} marginBottom={28} maxWidth={640}>
      {children}
    </Text>
  );
}

export default function HomePage() {
  const { t } = useTranslation();
  const router = useRouter();
  const l = t.landing;
  const goToWizard = () => router.push("/wizard");

  const tiers = [
    { lbl: "TIER 0", name: l.tier0Name, desc: l.tier0Desc, kpi: "~40%", color: "var(--kairo-color-faint)" },
    { lbl: "TIER 1", name: l.tier1Name, desc: l.tier1Desc, kpi: "< 5s", color: "var(--kairo-color-bad)" },
    { lbl: "TIER 2", name: l.tier2Name, desc: l.tier2Desc, kpi: "< 60s", color: "var(--kairo-color-warn)" },
    { lbl: "TIER 3", name: l.tier3Name, desc: l.tier3Desc, kpi: "< 1h", color: "var(--kairo-color-ok)" },
  ];

  const differentiators = [
    { id: "a", icon: "zap", name: l.diffAName, desc: l.diffADesc },
    { id: "b", icon: "globe", name: l.diffBName, desc: l.diffBDesc },
    { id: "c", icon: "flag", name: l.diffCName, desc: l.diffCDesc },
  ] as const;

  const stackRows = [
    ["Frontend", "Next.js 15 · React Server Components", l.stackFrontendNote],
    ["Backend", "Hono · Cloudflare Workers", l.stackBackendNote],
    ["DB", "PostgreSQL 16 · pgvector", l.stackDbNote],
    ["LLM", "Anthropic · Ollama (on-prem)", l.stackLlmNote],
    ["Queue", "Cloudflare Queues + Durable Objects", l.stackQueueNote],
    ["Auth", "Better Auth + WorkOS SSO", l.stackAuthNote],
  ];

  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <Section first grid>
        <Text tag="h1" display="block" fontSize={76} lineHeightRatio={1.04} letterSpacing={-2.66} fontWeight={600} marginTop={0} marginHorizontal={0} marginBottom={22} maxWidth={1000} font="display" color="var(--kairo-color-text)">
          {l.heroTitle1}{" "}
          <Text color="var(--kairo-color-accent)">{l.heroTitleAccent}</Text>.
        </Text>
        <Text tag="p" display="block" fontSize={19} color="var(--kairo-color-muted)" maxWidth={640} lineHeightRatio={1.55} marginTop={0} marginHorizontal={0} marginBottom={28}>
          {l.heroSubtitle}
        </Text>
        <Box display="flex" gap={12} alignItems="center" marginBottom={24}>
          <Button variant="primary" size="webLg" iconEnd={<Icon name="right" size={16} color="var(--kairo-color-on-accent)" />} onPress={goToWizard}>
            {l.heroCta}
          </Button>
          <Button variant="ghost" size="webLg" iconEnd={<Icon name="right" size={14} />} onPress={noop}>
            {l.heroCtaSecondary}
          </Button>
        </Box>
        <Text tag="div" display="flex" gap={24} font="mono" fontSize={11} color="var(--kairo-color-faint)">
          <span>{l.heroTrust1}</span>
          <span>{l.heroTrust2}</span>
          <span>{l.heroTrust3}</span>
        </Text>
        <Box marginTop={64}>
          <HeroCockpit />
        </Box>
      </Section>

      {/* ── 1.0 Connect ──────────────────────────────────────────────────── */}
      <Section id="product">
        <SectionHeader eyebrow="1.0" title={l.s1Title} />
        <Lead>{l.s1Body}</Lead>
        <Box maxWidth={640}>
          <PermissionList
            label={l.s1PermsTitle}
            provider="Gmail"
            requirementLabels={{ required: t.wizard.ruleRequired, optional: t.wizard.ruleOptional }}
            onChange={noop}
            items={[
              { id: "perm1", name: l.s1Perm1, required: true, checked: true },
              { id: "perm2", name: l.s1Perm2, required: true, checked: true },
              { id: "perm3", name: l.s1Perm3, checked: false },
            ]}
          />
          <Box display="flex" alignItems="center" gap={10} marginTop={14}>
            <GoogleMark size={18} />
            <Text font="mono" fontSize={11} color="var(--kairo-color-faint)">
              kairo.app
            </Text>
          </Box>
          <Box display="flex" gap={8} marginTop={14} flexWrap="wrap">
            {["Gmail · now", "Slack · Q3", "WhatsApp · Q3", "Telegram · Q4", "Instagram · Q4"].map((label, index) => (
              <Chip key={label} mono tone={index === 0 ? "accent" : "neutral"}>
                {label}
              </Chip>
            ))}
          </Box>
        </Box>
      </Section>

      {/* ── 2.0 Pipeline ─────────────────────────────────────────────────── */}
      <Section surface="sidebar">
        <SectionHeader eyebrow="2.0" title={l.s2Title} />
        <Lead>{l.s2Body}</Lead>
        <Box grid gridTemplateColumns="repeat(4, minmax(0, 1fr))" gap={12}>
          {tiers.map((tier) => (
            <TierCard key={tier.lbl} color={tier.color} tier={tier.lbl} title={tier.name} text={tier.desc} metricValue={tier.kpi} />
          ))}
        </Box>
      </Section>

      {/* ── 3.0 Context ──────────────────────────────────────────────────── */}
      <Section>
        <SectionHeader eyebrow="3.0" title={l.s3Title} />
        <Lead>{l.s3Body}</Lead>
        <Box grid gridTemplateColumns="1fr 1fr" gap={16}>
          <Box backgroundColor="var(--kairo-color-surface)" borderWidth={1} borderStyle="solid" borderColor="var(--kairo-color-line)" borderRadius={12} padding={16}>
            <Text font="mono" fontSize={10} color="var(--kairo-color-faint)" textTransform="uppercase" letterSpacing={0.5}>
              {l.s3ClientPanel}
            </Text>
            <Box marginTop={12}>
              <PropRow label="Marta Pérez">Acme · CFO · Pro</PropRow>
              <PropRow label="MRR" mono>$199</PropRow>
              <PropRow label="Tickets" mono>34</PropRow>
              <PropRow label="CSAT" mono>4.8</PropRow>
              <PropRow label="NPS" mono last>+62</PropRow>
            </Box>
          </Box>
          <Box backgroundColor="var(--kairo-color-surface)" borderWidth={1} borderStyle="solid" borderColor="var(--kairo-color-line)" borderRadius={12} padding={16}>
            <SourceList
              title={l.s3SimilarPanel}
              items={[
                { id: "a", kind: "similar", code: "KAI-T-0892", title: "Cargo duplicado · reembolso", meta: "0.94" },
                { id: "b", kind: "similar", code: "KAI-T-0814", title: "Doble cobro tras upgrade", meta: "0.91" },
                { id: "c", kind: "similar", code: "KAI-T-0701", title: "Factura monto erróneo", meta: "0.87" },
              ]}
            />
          </Box>
        </Box>
      </Section>

      {/* ── 4.0 Response Flow ────────────────────────────────────────────── */}
      <Section surface="sidebar">
        <SectionHeader eyebrow="4.0" title={l.s4Title} />
        <Lead>{l.s4Body}</Lead>
        <Box maxWidth={720}>
          <DraftCard
            variant="web"
            badge={l.s4Badge}
            heading={l.s4BadgeSource}
            meta={l.s4Conf}
            body={"Hola Marta,\n\nConfirmamos el cargo duplicado en la orden 4729 y ya iniciamos el reembolso al método original.\n\nSaludos, Valentina · Soporte Kairo"}
            actions={
              <>
                <Button size="sm" icon={<Icon name="pen" size={12} />} onPress={noop}>{l.s4Edit}</Button>
                <Button size="sm" variant="primary" iconEnd={<Icon name="send" size={12} color="var(--kairo-color-on-accent)" />} onPress={noop}>{l.s4Send}</Button>
                <Button size="sm" variant="ghost" icon={<Icon name="refresh" size={11} />} onPress={noop}>{l.s4Regen}</Button>
              </>
            }
          />
        </Box>
      </Section>

      {/* ── 5.0 Differentiators ──────────────────────────────────────────── */}
      <Section>
        <SectionHeader eyebrow="5.0" title={l.s5Title} />
        <Box grid gridTemplateColumns="repeat(3, minmax(0, 1fr))" gap={32}>
          {differentiators.map((d) => (
            <BenefitCard key={d.id} icon={d.icon} title={d.name} text={d.desc} />
          ))}
        </Box>
      </Section>

      {/* ── 6.0 Stack ────────────────────────────────────────────────────── */}
      <Section surface="sidebar">
        <SectionHeader eyebrow="6.0" title={l.s6Title} />
        <Lead>{l.s6Body}</Lead>
        <Box backgroundColor="var(--kairo-color-surface)" borderWidth={1} borderStyle="solid" borderColor="var(--kairo-color-line)" borderRadius={12} overflow="hidden">
          {stackRows.map((row, index) => (
            <Box key={row[0]} grid gridTemplateColumns="120px 1fr 1fr" paddingVertical={14} paddingHorizontal={18} alignItems="center" gap={16} borderTopWidth={index === 0 ? 0 : 1} borderStyle="solid" borderTopColor="var(--kairo-color-line)">
              <Text font="mono" fontSize={11} color="var(--kairo-color-faint)" textTransform="uppercase" letterSpacing={0.55}>
                {row[0]}
              </Text>
              <Text fontSize={14} fontWeight={500}>{row[1]}</Text>
              <Text fontSize={13} color="var(--kairo-color-muted)">{row[2]}</Text>
            </Box>
          ))}
        </Box>
      </Section>

      {/* ── Final CTA ────────────────────────────────────────────────────── */}
      <Section surface="inverse" grid>
        <SectionHeader level="h2" title={l.ctaTitle} body={l.ctaBody} inverse />
        <Box display="flex" gap={12}>
          <Button variant="primary" size="webLg" iconEnd={<Icon name="right" size={16} color="var(--kairo-color-on-accent)" />} onPress={goToWizard}>
            {l.ctaPrimary}
          </Button>
          <Button size="webLg" onPress={() => router.push("/pricing")}>
            {l.ctaSecondary}
          </Button>
        </Box>
      </Section>
    </>
  );
}
