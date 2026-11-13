"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  BenefitCard,
  Box,
  Button,
  Callout,
  Chip,
  DraftCard,
  Icon,
  NoteCard,
  PermissionList,
  Section,
  SectionHeader,
  SlaIndicator,
  SourceList,
  Text,
  TicketRow,
  TierCard,
  type IconName,
} from "@kairo/ui";
import { useTranslation } from "@/lib/i18n";
import { AppLink } from "@/components/app-link";
import { HeroCockpit } from "@/components/hero-cockpit";
import { useMinWidth } from "@/lib/hooks/useMinWidth";
import { QueueList } from "@/components/queue-list";

const noop = () => {};

function Para({ children, strong, marginBottom = 16 }: { children: ReactNode; strong?: boolean; marginBottom?: number }) {
  return (
    <Text tag="p" display="block" fontSize={16} fontWeight={strong ? 600 : 400} color={strong ? "var(--kairo-color-text)" : "var(--kairo-color-muted)"} lineHeightRatio={1.65} marginTop={0} marginHorizontal={0} marginBottom={marginBottom} maxWidth={640}>
      {children}
    </Text>
  );
}

function Panel({ children }: { children: ReactNode }) {
  return (
    <Box backgroundColor="var(--kairo-color-surface)" borderWidth={1} borderStyle="solid" borderColor="var(--kairo-color-line)" borderRadius={12} padding={16}>
      {children}
    </Box>
  );
}

function Label({ children }: { children: ReactNode }) {
  return (
    <Text font="mono" fontSize={10} color="var(--kairo-color-faint)" textTransform="uppercase" letterSpacing={0.5}>
      {children}
    </Text>
  );
}

type Card = { title: string; text: string };

function Cards({ items, icons }: { items: readonly Card[]; icons: readonly IconName[] }) {
  const tablet = useMinWidth(720, true);
  return (
    <Box grid gridTemplateColumns={tablet ? "repeat(3, minmax(0, 1fr))" : "minmax(0, 1fr)"} gap={tablet ? 32 : 24} marginBottom={32}>
      {items.map((item, index) => (
        <BenefitCard key={item.title} icon={icons[index]} title={item.title} text={item.text} />
      ))}
    </Box>
  );
}

const PRIORITIES = ["P1", "P1", "P2", "P3"] as const;
const SLA_STATUS = ["overdue", "escalating", "atRisk", "onTime"] as const;

export default function HomePage() {
  const { t } = useTranslation();
  const router = useRouter();
  const l = t.landing;
  const d = l.demo;
  const tablet = useMinWidth(720, true);
  const desktop = useMinWidth(980, true);
  const goToWizard = () => router.push("/wizard");
  const goToHow = () => document.getElementById("como")?.scrollIntoView({ behavior: "smooth" });

  const channels = ["Gmail", "WhatsApp", "Instagram", "Telegram", "Slack"];

  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <Section first grid>
        <Text tag="h1" display="block" fontSize={desktop ? 76 : tablet ? 56 : 38} lineHeightRatio={1.06} letterSpacing={desktop ? -2.66 : tablet ? -1.8 : -1.1} fontWeight={600} marginTop={0} marginHorizontal={0} marginBottom={22} maxWidth={1000} font="display" color="var(--kairo-color-text)">
          {l.heroTitle}
        </Text>
        <Text tag="p" display="block" fontSize={tablet ? 19 : 17} color="var(--kairo-color-muted)" maxWidth={640} lineHeightRatio={1.55} marginTop={0} marginHorizontal={0} marginBottom={28}>
          {l.heroSubtitle}
        </Text>
        <Box display="flex" flexDirection={tablet ? "row" : "column"} alignItems={tablet ? "center" : "stretch"} gap={12} marginBottom={24}>
          <Button variant="primary" size="webLg" iconEnd={<Icon name="right" size={16} color="var(--kairo-color-on-accent)" />} onPress={goToWizard}>
            {l.heroCta}
          </Button>
          <Button variant="ghost" size="webLg" iconEnd={<Icon name="right" size={14} />} onPress={goToHow}>
            {l.heroCtaSecondary}
          </Button>
        </Box>
        <Text tag="div" display="flex" flexDirection={tablet ? "row" : "column"} flexWrap="wrap" gap={tablet ? 24 : 8} font="mono" fontSize={11} color="var(--kairo-color-faint)">
          <span>✓ {l.heroTrust1}</span>
          <span>✓ {l.heroTrust2}</span>
          <span>✓ {l.heroTrust3}</span>
        </Text>
        <Box marginTop={tablet ? 64 : 40}>
          <HeroCockpit />
        </Box>
      </Section>

      {/* ── Channels ─────────────────────────────────────────────────────── */}
      <Box tag="section" id="canales" paddingVertical={tablet ? 40 : 32} borderTopWidth={1} borderStyle="solid" borderTopColor="var(--kairo-color-line)">
        <Box maxWidth={1200} marginHorizontal="auto" paddingHorizontal={tablet ? 32 : 16}>
          <Text tag="p" display="block" fontSize={16} fontWeight={600} marginTop={0} marginHorizontal={0} marginBottom={16}>
            {l.channelsLead}
          </Text>
          <Box tag="ul" display="flex" gap={8} flexWrap="wrap" margin={0} padding={0} listStyle="none">
            {channels.map((name, index) => (
              <Box tag="li" key={name}>
                <Chip mono tone={index === 0 ? "accent" : "neutral"}>
                  {`${name} · ${index === 0 ? l.channelAvailable : l.channelSoon}`}
                </Chip>
              </Box>
            ))}
          </Box>
        </Box>
      </Box>

      {/* ── The problem ──────────────────────────────────────────────────── */}
      <Section surface="sidebar" narrow>
        <SectionHeader eyebrow={l.problemEyebrow} title={l.problemTitle} />
        <Para>{l.problemP1}</Para>
        <Para>{l.problemP2}</Para>
        <Para marginBottom={0}>{l.problemP3}</Para>
      </Section>

      {/* ── 01 How it works ──────────────────────────────────────────────── */}
      <Section id="como">
        <SectionHeader eyebrow={l.howEyebrow} title={l.howTitle} body={l.howBody} />
        <Box grid gridTemplateColumns={desktop ? "repeat(4, minmax(0, 1fr))" : tablet ? "repeat(2, minmax(0, 1fr))" : "minmax(0, 1fr)"} gap={12}>
          {l.howSteps.map((step, index) => (
            <TierCard
              key={step.title}
              color={index === 3 ? "var(--kairo-color-ok)" : "var(--kairo-color-accent)"}
              tier={`0${index + 1}`}
              title={step.title}
              text={step.text}
              metricValue={index === 3 ? l.howWhoYou : l.howWhoKairo}
            />
          ))}
        </Box>
      </Section>

      {/* ── 02 Sort ──────────────────────────────────────────────────────── */}
      <Section surface="sidebar">
        <SectionHeader eyebrow={l.sortEyebrow} title={l.sortTitle} body={l.sortBody} />
        <Cards items={l.sortCards} icons={["flag", "clock", "clients"]} />
        <Box maxWidth={720} marginBottom={24}>
          <Panel>
            <QueueList label={d.sortList}>
              {d.sortRows.map((row, index) => (
                <TicketRow
                  key={row.subject}
                  code={`KAI-0${921 - index}`}
                  subject={row.subject}
                  priority={PRIORITIES[index]}
                  escalated={index === 1}
                  age={["2m", "4m", "11m", "23m"][index]}
                  sentiment={index < 2 ? "frustrated" : index === 2 ? "neutral" : "positive"}
                  sentimentLabel={d.sentiment[index < 2 ? "frustrated" : index === 2 ? "neutral" : "positive"]}
                  sender={row.sender}
                  sla={<SlaIndicator variant="compact" time={row.sla} title={row.slaTitle} status={SLA_STATUS[index]} />}
                  footer={
                    <Text font="mono" fontSize={10.5} color="var(--kairo-color-faint)">
                      {d.ownerLabel} · {row.owner}
                    </Text>
                  }
                  onPress={noop}
                  ariaLabel={row.subject}
                />
              ))}
            </QueueList>
          </Panel>
        </Box>
        <Para marginBottom={0}>{l.sortClosing}</Para>
      </Section>

      {/* ── 03 Knows your business ───────────────────────────────────────── */}
      <Section>
        <SectionHeader eyebrow={l.knowEyebrow} title={l.knowTitle} body={l.knowBody} />
        <Cards items={l.knowCards} icons={["knowledge", "link", "check"]} />
        <Box grid gridTemplateColumns={desktop ? "1fr 1fr" : "minmax(0, 1fr)"} gap={16} marginBottom={16}>
          <Panel>
            <Label>{d.knowledgeTitle}</Label>
            <Box marginTop={12} display="flex" flexDirection="column" gap={14}>
              {d.knowledgeDrafts.map((draft) => (
                <Box key={draft.title}>
                  <Text tag="div" display="block" fontSize={14} fontWeight={600}>{draft.title}</Text>
                  <Text tag="div" display="block" font="mono" fontSize={11} color="var(--kairo-color-faint)" marginTop={2}>{draft.origin}</Text>
                  <Box display="flex" gap={8} marginTop={8}>
                    <Button size="sm" variant="primary" onPress={noop}>{d.knowledgePublish}</Button>
                    <Button size="sm" onPress={noop}>{d.knowledgeEdit}</Button>
                    <Button size="sm" variant="ghost" onPress={noop}>{d.knowledgeDiscard}</Button>
                  </Box>
                </Box>
              ))}
            </Box>
          </Panel>
          <Panel>
            <SourceList
              stacked={!tablet}
              title={d.similarOnlyTitle}
              items={d.similar.map((item, index) => ({ id: String(index), kind: "similar" as const, code: ["KAI-0892", "KAI-0814", "KAI-0701"][index], title: item.title, meta: item.outcome, metaTone: "ok" as const }))}
            />
          </Panel>
        </Box>
        <Box maxWidth={720} marginBottom={24}>
          <Panel>
            <Box display="flex" justifyContent="space-between" alignItems="center" marginBottom={8}>
              <Label>{d.historyTitle}</Label>
              <Chip mono>{d.historySample}</Chip>
            </Box>
            <Box grid gridTemplateColumns="1fr 1fr 1.4fr" gap={12} paddingVertical={8}>
              <Label>{d.historyCols.type}</Label>
              <Label>{d.historyCols.hits}</Label>
              <Label>{d.historyCols.mode}</Label>
            </Box>
            {d.historyRows.map((row) => (
              <Box key={row.type} grid gridTemplateColumns="1fr 1fr 1.4fr" gap={12} paddingVertical={10} borderTopWidth={1} borderStyle="solid" borderTopColor="var(--kairo-color-line)">
                <Text fontSize={14} fontWeight={500}>{row.type}</Text>
                <Text font="mono" fontSize={13}>{row.hits}</Text>
                <Text fontSize={13} color={row.auto ? "var(--kairo-color-ok-ink)" : "var(--kairo-color-muted)"}>{row.auto ? d.modeAuto : d.modeAsk}</Text>
              </Box>
            ))}
          </Panel>
        </Box>
        <Para marginBottom={0}>{l.knowClosing}</Para>
      </Section>

      {/* ── 04 Replies ───────────────────────────────────────────────────── */}
      <Section surface="sidebar">
        <SectionHeader eyebrow={l.replyEyebrow} title={l.replyTitle} />
        <Para>{l.replyP1}</Para>
        <Para>{l.replyP2}</Para>
        <Para strong>{l.replyP3}</Para>
        <Para marginBottom={32}>{l.replyP4}</Para>
        <Box grid gridTemplateColumns={desktop ? "3fr 2fr" : "minmax(0, 1fr)"} gap={16}>
          <DraftCard
            variant="web"
            badge={d.draftBadge}
            heading={d.draftSource}
            body={d.draftBody}
            actions={
              <>
                <Button size="sm" variant="ghost" icon={<Icon name="refresh" size={11} />} onPress={noop}>{d.draftRegen}</Button>
                <Button size="sm" icon={<Icon name="pen" size={12} />} onPress={noop}>{d.draftEdit}</Button>
                <Button size="sm" variant="primary" iconEnd={<Icon name="send" size={12} color="var(--kairo-color-on-accent)" />} onPress={noop}>{d.draftSend}</Button>
              </>
            }
          />
          <Box display="flex" flexDirection="column" gap={10}>
            <Callout tone="note" icon={<Icon name="info" size={12} />}>{d.missingNotice}</Callout>
            <DraftCard
              variant="web"
              badge={d.draftBadge}
              heading={d.missingHeading}
              body={d.missingBody}
              actions={<Button size="sm" icon={<Icon name="pen" size={12} />} onPress={noop}>{d.draftEdit}</Button>}
            />
          </Box>
        </Box>
      </Section>

      {/* ── 05 Your team ─────────────────────────────────────────────────── */}
      <Section>
        <SectionHeader eyebrow={l.teamEyebrow} title={l.teamTitle} body={l.teamBody} />
        <Cards items={l.teamCards} icons={["user", "clients", "escalate"]} />
        <Box maxWidth={520}>
          <Text tag="div" display="block" font="mono" fontSize={11} color="var(--kairo-color-faint)" textTransform="uppercase" letterSpacing={0.5} marginBottom={8}>
            {l.teamNoteCaption}
          </Text>
          <NoteCard
            author={d.teamNoteAuthor}
            authorName={d.teamNoteAuthor}
            seed="valentina"
            time={d.teamNoteTime}
            badge={<Text font="mono" fontSize={9.5}>{l.teamNoteBadge}</Text>}
          >
            {d.teamNoteText}
          </NoteCard>
          <Para marginBottom={0}>
            <Text tag="span" fontSize={13} color="var(--kairo-color-faint)">{l.teamNoteRule}</Text>
          </Para>
        </Box>
      </Section>

      {/* ── 06 Your data ─────────────────────────────────────────────────── */}
      <Section id="datos" surface="sidebar">
        <SectionHeader eyebrow={l.dataEyebrow} title={l.dataTitle} body={l.dataBody} />
        <Box grid gridTemplateColumns={desktop ? "3fr 2fr" : "minmax(0, 1fr)"} gap={32}>
          <Box>
            {l.dataRows.map((row, index) => (
              <Box key={row.title} grid gridTemplateColumns={tablet ? "200px 1fr" : "minmax(0, 1fr)"} gap={tablet ? 16 : 4} paddingVertical={12} borderTopWidth={index === 0 ? 1 : 0} borderBottomWidth={1} borderStyle="solid" borderTopColor="var(--kairo-color-line)" borderBottomColor="var(--kairo-color-line)">
                <Text fontSize={14} fontWeight={600}>{row.title}</Text>
                <Text fontSize={14} color="var(--kairo-color-muted)">{row.text}</Text>
              </Box>
            ))}
            <Box marginTop={20}>
              <AppLink href="/privacy" fontSize={14} color="var(--kairo-color-accent-ink)">
                {l.dataPrivacyLink}
              </AppLink>
            </Box>
          </Box>
          <PermissionList
            label={l.dataPermsTitle}
            provider="Gmail"
            requirementLabels={{ required: t.wizard.ruleRequired, optional: t.wizard.ruleOptional }}
            onChange={noop}
            items={[
              { id: "read", name: t.wizard.permReadName, required: true, checked: true },
              { id: "send", name: l.dataPermSend, required: true, checked: true },
            ]}
          />
        </Box>
      </Section>

      {/* ── Closing ──────────────────────────────────────────────────────── */}
      <Section surface="inverse" grid>
        <SectionHeader level="h2" title={l.ctaTitle} body={l.ctaBody} inverse />
        <Box display="flex" flexDirection={tablet ? "row" : "column"} gap={12} marginBottom={20}>
          <Button variant="primary" size="webLg" iconEnd={<Icon name="right" size={16} color="var(--kairo-color-on-accent)" />} onPress={goToWizard}>
            {l.ctaPrimary}
          </Button>
          <Button size="webLg" onPress={() => router.push("/pricing")}>
            {l.ctaSecondary}
          </Button>
        </Box>
        <Text tag="p" display="block" margin={0} fontSize={14} color="var(--kairo-color-inverse-faint)">
          {l.ctaNote}
        </Text>
      </Section>
    </>
  );
}
