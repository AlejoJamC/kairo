"use client";

import { Avatar, Box, Button, Callout, Icon, NavItem, NoteCard, ProductFrame, PropRow, SourceList, Text, ThreadMessage, TicketRow, type IconName } from "@kairo/ui";
import { useTranslation } from "@/lib/i18n";
import { useMinWidth } from "@/lib/hooks/useMinWidth";

// The product, as it is: the same pieces the app is built from, with invented data.

const noop = () => {};

const PRIORITIES = ["P1", "P1", "P2", "P2", "P3"] as const;
const SENTIMENTS = ["frustrated", "frustrated", "neutral", "positive", "positive"] as const;
const AGES = ["2m", "4m", "11m", "23m", "1h"] as const;
const CODES = ["KAI-0921", "KAI-0920", "KAI-0919", "KAI-0918", "KAI-0917"] as const;

export function HeroCockpit() {
  const { t } = useTranslation();
  const d = t.landing.demo;
  const full = useMinWidth(1180, true);
  const withQueue = useMinWidth(760, true);

  const sidebar: { label: string; count?: number; icon: IconName; active?: boolean }[] = [
    { label: d.sidebarTriage, count: 5, active: true, icon: "triage" },
    { label: d.sidebarProgress, count: 7, icon: "activity" },
    { label: d.sidebarPending, count: 12, icon: "awaiting" },
    { label: d.sidebarResolved, count: 184, icon: "resolved" },
    { label: d.sidebarClients, icon: "clients" },
    { label: d.sidebarKnowledge, icon: "knowledge" },
  ];

  return (
    <ProductFrame label={d.frameLabel} route={d.route}>
      <Box grid gridTemplateColumns={full ? "180px 300px minmax(0, 1fr) 260px" : withQueue ? "300px minmax(0, 1fr)" : "minmax(0, 1fr)"} height={full || withQueue ? 580 : undefined} position="relative">
        {full && (
          <Box borderRightWidth={1} borderStyle="solid" borderRightColor="var(--kairo-color-line)" padding={10} backgroundColor="var(--kairo-color-sunk)">
            {sidebar.map((item) => (
              <NavItem key={item.label} icon={item.icon} label={item.label} count={item.count} active={item.active} onPress={noop} />
            ))}
          </Box>
        )}

        {withQueue && (
        <Box borderRightWidth={1} borderStyle="solid" borderRightColor="var(--kairo-color-line)" overflow="hidden">
          <Box paddingVertical={10} paddingHorizontal={12} borderBottomWidth={1} borderStyle="solid" borderBottomColor="var(--kairo-color-line)" display="flex" justifyContent="space-between" alignItems="center">
            <Text font="mono" fontSize={11} color="var(--kairo-color-faint)" textTransform="uppercase" letterSpacing={0.55}>
              {d.queueTitle} · {d.queue.length}
            </Text>
            <Icon name="sidebar" size={12} color="var(--kairo-color-faint)" />
          </Box>
          {d.queue.map((item, index) => (
            <TicketRow
              key={CODES[index]}
              code={CODES[index]}
              subject={item.subject}
              priority={PRIORITIES[index]}
              age={AGES[index]}
              sentiment={SENTIMENTS[index]}
              sentimentLabel={d.sentiment[SENTIMENTS[index]]}
              sender={item.sender}
              selected={index === 0}
              onPress={noop}
              ariaLabel={`${CODES[index]} ${item.subject}`}
            />
          ))}
        </Box>
        )}

        <Box display="flex" flexDirection="column" minWidth={0} backgroundColor="var(--kairo-color-sunk)">
          <Box paddingVertical={8} paddingHorizontal={14} borderBottomWidth={1} borderStyle="solid" borderBottomColor="var(--kairo-color-line)" display="flex" gap={8} alignItems="center" backgroundColor="var(--kairo-color-surface)">
            <Text font="mono" fontSize={11} fontWeight={500}>{CODES[0]}</Text>
            <Text font="mono" fontSize={11} color="var(--kairo-color-bad-ink)">P1</Text>
            <Text font="mono" fontSize={11} color="var(--kairo-color-muted)">{d.caseCategory}</Text>
          </Box>
          <Box padding={16} flexGrow={1} flexShrink={1} flexBasis="0%" overflow="hidden" display="flex" flexDirection="column" gap={12}>
            <Text tag="div" display="block" fontSize={16} fontWeight={600} letterSpacing={-0.16} lineHeightRatio={1.25}>
              {d.caseTitle}
            </Text>
            <ThreadMessage variant="initial" avatar={<Avatar name="Marta Pérez" seed="marta" size={28} />} name="Marta Pérez" meta="09:42">
              {d.caseMessage}
            </ThreadMessage>
            <Box backgroundColor="var(--kairo-color-surface)" borderWidth={1} borderStyle="solid" borderColor="var(--kairo-color-accent-line)" borderRadius={10} overflow="hidden">
              <Box padding={10}>
                <Callout tone="ai" icon={<Icon name="spark" size={11} color="var(--kairo-color-accent)" />}>
                  {d.proposalTitle}
                </Callout>
              </Box>
              <Box paddingHorizontal={12}>
                <PropRow label={d.proposalTypeLabel} size="sm">{d.proposalTypeValue}</PropRow>
                <PropRow label={d.proposalPriorityLabel} size="sm">{d.proposalPriorityValue}</PropRow>
                <PropRow label={d.proposalSourceLabel} size="sm" last>{d.proposalSourceValue}</PropRow>
              </Box>
              <Box display="flex" justifyContent="flex-end" gap={8} padding={10}>
                <Button size="sm" onPress={noop}>{d.proposalFix}</Button>
                <Button size="sm" variant="primary" onPress={noop}>{d.proposalConfirm}</Button>
              </Box>
            </Box>
            <NoteCard author={d.noteAuthor} authorName={d.noteAuthor} seed="valentina" time="09:50" badge={<Text font="mono" fontSize={9.5}>{t.landing.teamNoteBadge}</Text>}>
              {d.noteBody}
            </NoteCard>
          </Box>
        </Box>

        {full && (
        <Box borderLeftWidth={1} borderStyle="solid" borderLeftColor="var(--kairo-color-line)" padding={12}>
          <Text font="mono" fontSize={10} color="var(--kairo-color-faint)" textTransform="uppercase" letterSpacing={0.5}>
            {d.clientPanel}
          </Text>
          <Box display="flex" gap={8} marginTop={8} marginBottom={10} alignItems="center">
            <Avatar name="Marta Pérez" seed="marta" size={32} />
            <Box>
              <Text tag="div" display="block" fontSize={12} fontWeight={500}>Marta Pérez</Text>
              <Text tag="div" display="block" color="var(--kairo-color-faint)" fontSize={10}>{d.clientCompany}</Text>
            </Box>
          </Box>
          <PropRow label={d.clientCases} size="sm" mono>3</PropRow>
          <PropRow label={d.clientLast} size="sm" last>{d.clientLastValue}</PropRow>
          <Box marginTop={14}>
            <SourceList
              stacked
              title={d.similarTitle}
              items={d.similar.map((item, index) => ({ id: String(index), kind: "similar" as const, title: item.title, meta: item.outcome, metaTone: "ok" as const }))}
            />
          </Box>
        </Box>
        )}
      </Box>
    </ProductFrame>
  );
}
