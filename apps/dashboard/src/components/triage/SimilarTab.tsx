// Similar tab of the context panel: earlier resolved tickets like the open one.

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTriageStore } from "@kairo/client-core/stores/triage-store";
import { getRelatedHistory } from "@kairo/client-core/endpoints";
import { Box, Button, Icon, Skeleton, Text } from "@kairo/ui";
import { formatDate } from "@/lib/date-format";

interface SimilarCase {
  id:                 string;
  subject:            string | null;
  resolved_at:        string | null;
  resolution_summary: string | null;
  ticket_number:      number;
  similarity:         number | null;
}

function formatSim(s: number | null): string | null {
  return s === null ? null : `${Math.round(s * 100)}%`;
}

export function SimilarTab({ ticketId }: { ticketId: string | null }) {
  const { t } = useTranslation("dashboard");
  const setSuggestedReply = useTriageStore((s) => s.setSuggestedReply);

  // The result is kept with the ticket it belongs to, so another ticket never shows it.
  const [loaded, setLoaded] = useState<{ ticketId: string; cases: SimilarCase[] } | null>(null);
  const [expanded, setExpanded] = useState<{ ticketId: string; caseId: string } | null>(null);
  const loading = !!ticketId && loaded?.ticketId !== ticketId;
  const cases = loaded && loaded.ticketId === ticketId ? loaded.cases : [];
  const expandedCase = expanded && expanded.ticketId === ticketId ? expanded.caseId : null;

  useEffect(() => {
    if (!ticketId) return;
    let current = true;
    getRelatedHistory(ticketId)
      .then(async (res) => {
        const json: { data: SimilarCase[] } = res.ok ? await res.json() : { data: [] };
        if (current) setLoaded({ ticketId, cases: (json.data ?? []).slice(0, 3) });
      })
      .catch(() => { if (current) setLoaded({ ticketId, cases: [] }); });
    return () => { current = false; };
  }, [ticketId]);

  if (loading) {
    return (
      <Box display="flex" flexDirection="column" gap={8}>
        <Skeleton height={80} borderRadius={8} />
        <Skeleton height={80} borderRadius={8} />
      </Box>
    );
  }

  if (cases.length === 0) {
    return (
      <Text tag="p" fontSize={12} color="var(--k-text-tertiary)" fontStyle="italic" margin={0} display="block">
        {t("ai.noSimilarCases")}
      </Text>
    );
  }

  return (
    <Box display="flex" flexDirection="column" gap={8}>
      <Text tag="p" fontSize={11} color="var(--k-text-tertiary)" font="mono" marginTop={0} marginHorizontal={0} marginBottom={4} display="block">
        {cases.length} {t("ai.resolvedCases")}
      </Text>
      {cases.map((c) => (
        <Box key={c.id} padding={12} borderWidth={1} borderColor="var(--k-border)" borderRadius={8} display="flex" flexDirection="column" gap={4} borderStyle="solid">
          <Box display="flex" alignItems="center" justifyContent="space-between" gap={8}>
            <Text font="mono" fontSize={11} color="var(--k-text-tertiary)">
              {t("ai.ticketNumber", { number: c.ticket_number })}
            </Text>
            {formatSim(c.similarity) && (
              <Text font="mono" fontSize={11} color="var(--kairo-color-ok)" flexShrink={0}>
                {formatSim(c.similarity)} sim
              </Text>
            )}
          </Box>
          {c.subject && (
            <Text tag="p" fontSize={13} fontWeight={500} color="var(--k-text-primary)" lineHeight={17.55} margin={0} display="block">
              {c.subject}
            </Text>
          )}
          {c.resolved_at && (
            <Text tag="p" fontSize={11} font="mono" color="var(--k-text-tertiary)" margin={0} display="block">
              {t("ai.resolvedOn")} {formatDate(c.resolved_at)}
            </Text>
          )}
          {c.resolution_summary && (
            <>
              <Button variant="link" size="sm" iconEnd={<Icon name="right" size={11} color="var(--kairo-color-accent-ink)" />} onPress={() => setExpanded(expandedCase === c.id || !ticketId ? null : { ticketId, caseId: c.id })}>
                {expandedCase === c.id ? t("ai.hideResolution") : t("ai.viewResolution")}
              </Button>
              {expandedCase === c.id && (
                <>
                  <Text tag="p" marginTop={4} borderRadius={6} backgroundColor="var(--k-surface)" paddingVertical={8} paddingHorizontal={10} fontSize={12} lineHeight={18.6} color="var(--k-text-secondary)" display="block">
                    {c.resolution_summary}
                  </Text>
                  <Button variant="link" size="sm" icon={<Icon name="note" size={12} color="var(--kairo-color-accent-ink)" />} onPress={() => setSuggestedReply(c.resolution_summary!)}>
                    {t("ai.useInReply")}
                  </Button>
                </>
              )}
            </>
          )}
        </Box>
      ))}
    </Box>
  );
}
