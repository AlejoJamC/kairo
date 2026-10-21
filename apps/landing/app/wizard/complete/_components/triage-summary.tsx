"use client";

import { useClassificationProgress } from "@/lib/hooks/useClassificationProgress";
import { useTranslation } from "@/lib/i18n";
import { QueuePreviewRow } from "@/components/queue-preview";
import { Box, Kbd, KpiStrip, ProductFrame, Text } from "@kairo/ui";

function SectionLabel({ children }: { children: string }) {
  return (
    <Text tag="span" display="block" font="mono" fontSize={10.5} letterSpacing={0.63} textTransform="uppercase" color="var(--kairo-color-faint)">
      {children}
    </Text>
  );
}

/** Aside of the last wizard step: what the scan found, the first rows of the queue and the shortcuts. */
export function TriageSummary() {
  const { t } = useTranslation();
  const { data } = useClassificationProgress();
  const w = t.wizard;
  const shortcuts = [
    { keys: ["J", "K"], label: w.shortcutNavigate },
    { keys: ["A"], label: w.shortcutAssign },
    { keys: ["⌘K"], label: w.shortcutCommands },
  ];

  return (
    <>
      <KpiStrip
        items={[
          { label: w.summaryTickets, value: data?.tickets_count },
          { label: w.summaryClients, value: data?.clients_count },
          { label: w.summaryUrgent, value: data?.urgent_count, urgent: (data?.urgent_count ?? 0) > 0 },
        ]}
      />

      {data && data.recent.length > 0 && (
        <Box display="flex" flexDirection="column" gap={10}>
          <SectionLabel>{w.summaryFirst}</SectionLabel>
          <ProductFrame compact label={w.previewLabel} route={w.previewRoute}>
            {data.recent.slice(0, 3).map((row, index) => (
              <QueuePreviewRow
                key={row.id}
                confidenceLabel={w.confidenceLabel}
                item={{ id: row.id, title: row.subject ?? "", priority: row.priority, code: row.ticket_number ? `KAI-${row.ticket_number}` : undefined, selected: index === 0 }}
              />
            ))}
          </ProductFrame>
        </Box>
      )}

      <Box display="flex" flexDirection="column" gap={10}>
        <SectionLabel>{w.summaryShortcuts}</SectionLabel>
        <Box display="flex" flexWrap="wrap" columnGap={18} rowGap={10}>
          {shortcuts.map((shortcut) => (
            <Box key={shortcut.label} display="inline-flex" alignItems="center" gap={6}>
              {shortcut.keys.map((key) => (
                <Kbd key={key}>{key}</Kbd>
              ))}
              <Text fontSize={12.5} color="var(--kairo-color-muted)">
                {shortcut.label}
              </Text>
            </Box>
          ))}
        </Box>
      </Box>
    </>
  );
}
