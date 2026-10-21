"use client";

import { useClassificationProgress } from "@/lib/hooks/useClassificationProgress";
import { useTranslation } from "@/lib/i18n";
import { Box, Kbd, KpiStrip, Text, TicketRow } from "@kairo/ui";

const noop = () => {};

const SHORTCUTS = [
  { keys: ["J", "K"], label: "shortcutMove" },
  { keys: ["⌘", "K"], label: "shortcutPalette" },
  { keys: ["?"], label: "shortcutHelp" },
] as const;

function SectionLabel({ children }: { children: string }) {
  return (
    <Text tag="div" display="block" marginBottom={8} fontSize={11} font="mono" color="var(--kairo-color-faint)" letterSpacing={0.6}>
      {children}
    </Text>
  );
}

/** Aside of the last wizard step: what the scan found, the first rows of the queue and the shortcuts. */
export function TriageSummary() {
  const { t } = useTranslation();
  const { data } = useClassificationProgress();
  const w = t.wizard;

  return (
    <Box display="flex" flexDirection="column" gap={24}>
      <Box>
        <SectionLabel>{w.summaryTitle}</SectionLabel>
        <KpiStrip
          items={[
            { label: w.summaryTickets, value: data?.tickets_count ?? 0 },
            { label: w.summaryThreads, value: data?.threads_count ?? 0 },
            { label: w.summaryClients, value: data?.clients_count ?? 0 },
          ]}
        />
      </Box>

      {data && data.recent.length > 0 && (
        <Box>
          <SectionLabel>{w.summaryFirstRows}</SectionLabel>
          <Box borderWidth={1} borderStyle="solid" borderColor="var(--kairo-color-line)" borderRadius={10} overflow="hidden" backgroundColor="var(--kairo-color-surface)">
            {data.recent.map((row) => {
              const code = row.ticket_number ? `KAI-${row.ticket_number}` : "";
              return (
                <TicketRow
                  key={row.id}
                  code={code}
                  subject={row.subject ?? ""}
                  priority={row.priority}
                  sender={row.sender ?? ""}
                  age={row.classified_at ? new Date(row.classified_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : w.detect.justNow}
                  onPress={noop}
                  ariaLabel={`${code} ${row.subject ?? ""}`.trim()}
                />
              );
            })}
          </Box>
        </Box>
      )}

      <Box>
        <SectionLabel>{w.summaryShortcuts}</SectionLabel>
        <Box display="flex" flexDirection="column" gap={8}>
          {SHORTCUTS.map((shortcut) => (
            <Box key={shortcut.label} display="flex" alignItems="center" justifyContent="space-between" gap={12}>
              <Text fontSize={13} color="var(--kairo-color-muted)">
                {w[shortcut.label]}
              </Text>
              <Box display="flex" gap={4}>
                {shortcut.keys.map((key) => (
                  <Kbd key={key}>{key}</Kbd>
                ))}
              </Box>
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}
