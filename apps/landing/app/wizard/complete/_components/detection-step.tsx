"use client";

import { useClassificationProgress, type ClassificationProgress } from "@/lib/hooks/useClassificationProgress";
import { useTranslation } from "@/lib/i18n";
import { Box, Button, CategoryChip, Icon, KpiStrip, ProgressBar, Text, TicketRow } from "@kairo/ui";

interface DetectionStepProps {
  onContinue: () => void;
}

function CategoryPills({
  categories, labels,
}: {
  categories: ClassificationProgress["categories"];
  labels: Record<string, string>;
}) {
  const entries = Object.entries(categories) as Array<[keyof typeof categories, number]>;
  return (
    <Box display="flex" gap={6} flexWrap="wrap" marginBottom={28}>
      {entries.map(([key, count]) => (
        <CategoryChip key={key} scale="category" value={key} label={`${labels[key] ?? key} ${count}`} />
      ))}
    </Box>
  );
}

export function DetectionStep({ onContinue }: DetectionStepProps) {
  const { t } = useTranslation();
  const dt = t.wizard.detect;
  const { data, error, retry } = useClassificationProgress();

  // Two independent signals:
  //  - isStillScanning controls the live "scanning…" indicator + spinner. It
  //    stays true until the pipeline truly finishes (status === "complete").
  //    "idle" means the pipeline hasn't written any classified tickets yet (e.g.
  //    user navigated back while Inngest is still booting) — treat it as scanning
  //    so the UI never looks stuck with zeros and a disabled button.
  //  - canContinue controls whether the Continue button is enabled. It fires
  //    as soon as threshold_reached is true, while the scan keeps running.
  const isStillScanning = !data || data.status === "in_progress" || data.status === "idle";
  const canContinue = data?.threshold_reached || data?.status === "complete" || !!error;

  const categoryLabels: Record<string, string> = {
    technical:      dt.categoryTechnical,
    billing:        dt.categoryBilling,
    account:        dt.categoryAccount,
    general:        dt.categoryGeneral,
    not_applicable: dt.categoryNotApplicable,
  };

  // ── Error state ────────────────────────────────────────────────────────────
  if (error) {
    return (
      <>
        <Text tag="h1" display="block" fontSize={32} fontWeight={600} letterSpacing={-0.64} marginTop={0} marginHorizontal={0} marginBottom={12} font="display" color="var(--kairo-color-text)">
          {dt.errorTitle}
        </Text>
        <Text tag="p" display="block" fontSize={15} color="var(--kairo-color-muted)" lineHeightRatio={1.6} marginTop={0} marginHorizontal={0} marginBottom={28}>
          {dt.errorBody}
        </Text>
        <Box display="flex" gap={8} alignItems="center">
          <Button size="web" icon={<Icon name="refresh" size={14} />} onPress={retry}>
            {dt.retry}
          </Button>
          <Button variant="ghost" size="web" onPress={onContinue}>
            {dt.skip}
          </Button>
        </Box>
      </>
    );
  }

  // ── Loading or data state ──────────────────────────────────────────────────
  const isDone = data?.status === "complete";
  const title = isDone ? t.wizard.detectDoneTitle : t.wizard.detectScanningTitle;
  const description = isDone ? t.wizard.detectDoneNote : dt.loadingDescription;

  return (
    <>
      <Text tag="h1" display="block" fontSize={32} fontWeight={600} letterSpacing={-0.64} marginTop={0} marginHorizontal={0} marginBottom={12} font="display" color="var(--kairo-color-text)">
        {title}
      </Text>
      <Text tag="p" display="block" fontSize={15} color="var(--kairo-color-muted)" lineHeightRatio={1.6} marginTop={0} marginHorizontal={0} marginBottom={28}>
        {description}
      </Text>

      <Box marginBottom={24}>
        <ProgressBar
          label={dt.progressLabel}
          value={data && data.messages_total > 0 ? data.messages_classified / data.messages_total : 0}
          status={isDone ? undefined : dt.progressStatus}
          running={isStillScanning}
        />
      </Box>

      <Box marginBottom={24}>
        <KpiStrip
          items={[
            { label: dt.metricTickets, value: data?.tickets_count ?? 0 },
            { label: dt.metricThreads, value: data?.threads_count ?? 0 },
            { label: dt.metricClients, value: data?.clients_count ?? 0 },
          ]}
        />
      </Box>

      {/* Categories */}
      <Text tag="div" display="block" marginBottom={8} fontSize={12} font="mono" color="var(--kairo-color-faint)" letterSpacing={0.6}>
        {dt.metricCategories}
      </Text>

      {data ? (
        <CategoryPills categories={data.categories} labels={categoryLabels} />
      ) : (
        <Box aria-live="polite" aria-label={dt.loadingDescription} height={28} marginBottom={28} />
      )}

      {/* Recently classified */}
      {data && data.recent.length > 0 && (
        <Box marginBottom={28}>
          <Text tag="div" display="block" marginBottom={8} fontSize={12} font="mono" color="var(--kairo-color-faint)" letterSpacing={0.6}>
            {dt.recentTitle}
          </Text>
          <Box display="flex" flexDirection="column" gap={2}>
            {data.recent.map((ticket) => (
              <TicketRow
                key={ticket.id}
                code={ticket.ticket_number ? `KAI-${ticket.ticket_number}` : ""}
                subject={ticket.subject ?? ""}
                priority={ticket.priority}
                age={ticket.classified_at ? new Date(ticket.classified_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : dt.justNow}
                sender={ticket.sender ?? ""}
                onPress={() => {}}
                ariaLabel={`${ticket.ticket_number ? `KAI-${ticket.ticket_number} ` : ""}${ticket.subject ?? ""}`}
              />
            ))}
          </Box>
        </Box>
      )}

      {/* Actions */}
      <Box display="flex" gap={8} alignItems="center" flexWrap="wrap">
        {/* "Configurar triage" — visually present, disabled per spec */}
        <Button size="web" disabled>
          {dt.configureTriageDisabled}
        </Button>

        <Button
          variant="primary"
          size="web"
          disabled={!canContinue}
          loading={!canContinue}
          loadingLabel={t.wizard.detectScanningTitle}
          iconEnd={<Icon name="right" size={14} color="var(--kairo-color-on-accent)" />}
          onPress={onContinue}
        >
          {dt.continue}
        </Button>
      </Box>
    </>
  );
}
