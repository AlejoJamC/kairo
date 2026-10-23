"use client";

import { useClassificationProgress, type ClassificationProgress } from "@/lib/hooks/useClassificationProgress";
import { useTranslation } from "@/lib/i18n";
import { WizardHeading } from "@/components/wizard-heading";
import { WizardSectionLabel } from "@/components/wizard-section-label";
import { QueueList } from "@/components/queue-list";
import { formatAge } from "@/lib/format-age";
import { Box, Button, Chip, Icon, KpiStrip, ProgressBar, Text, TicketRow } from "@kairo/ui";

interface DetectionStepProps {
  onContinue: () => void;
  /** The connected mailbox, shown in the eyebrow. */
  mailbox?: string;
}

function CategoryPills({
  categories, labels,
}: {
  categories: ClassificationProgress["categories"];
  labels: Record<string, string>;
}) {
  const entries = Object.entries(categories) as Array<[keyof typeof categories, number]>;
  return (
    <Box tag="ul" margin={0} padding={0} listStyle="none" display="flex" gap={6} flexWrap="wrap">
      {entries.map(([key, count]) => (
        <Box key={key} tag="li">
          <Chip icon={<Box width={7} height={7} circle backgroundColor={`var(--kairo-category-${key})`} aria-hidden />}>
            <Text fontSize={12} fontWeight={500} color="var(--kairo-color-muted)">
              {(labels[key] ?? key).toLowerCase()}
            </Text>
            <Text font="mono" fontSize={11} color="var(--kairo-color-faint)">
              {count}
            </Text>
          </Chip>
        </Box>
      ))}
    </Box>
  );
}

export function DetectionStep({ onContinue, mailbox }: DetectionStepProps) {
  const { t } = useTranslation();
  const dt = t.wizard.detect;
  const { data, error, retry } = useClassificationProgress();
  const eyebrow = mailbox ? `${t.wizard.stepOf2} · ${mailbox}` : t.wizard.stepOf2;

  // Two independent signals:
  //  - isStillScanning controls the live "classifying…" legend. It stays true
  //    until the pipeline truly finishes (status === "complete"). "idle" means
  //    the pipeline hasn't written any classified tickets yet (e.g. user
  //    navigated back while Inngest is still booting) — treat it as scanning
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
        <WizardHeading eyebrow={eyebrow} title={dt.errorTitle} body={dt.errorBody} />
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

  return (
    <>
      <WizardHeading
        eyebrow={eyebrow}
        title={isDone ? t.wizard.detectDoneTitle : t.wizard.detectScanningTitle}
        body={isDone ? t.wizard.detectDoneNote : t.wizard.detectScanningNote}
      />

      <ProgressBar
        label={dt.progressLabel}
        value={data && data.messages_total > 0 ? data.messages_classified / data.messages_total : 0}
        status={isDone ? dt.progressDone : dt.progressStatus}
        running={isStillScanning}
      />

      <Box>
        <Button
          variant="primary"
          size="webLg"
          disabled={!canContinue}
          loading={!canContinue}
          loadingLabel={dt.classifying}
          iconEnd={<Icon name="right" size={14} color="var(--kairo-color-on-accent)" />}
          onPress={onContinue}
        >
          {dt.continue}
        </Button>
      </Box>

      <KpiStrip
        items={[
          { label: dt.metricMails, value: data?.messages_total },
          { label: dt.metricTickets, value: data?.tickets_count },
          { label: dt.metricUrgent, value: data?.urgent_count, urgent: (data?.urgent_count ?? 0) > 0 },
        ]}
      />

      <Box grid gridTemplateColumns="minmax(0, 1fr) minmax(0, 1.2fr)" gap={16} alignItems="flex-start">
        <Box display="flex" flexDirection="column" gap={10}>
          <WizardSectionLabel>{dt.metricCategories}</WizardSectionLabel>
          {data ? (
            <CategoryPills categories={data.categories} labels={categoryLabels} />
          ) : (
            <Box aria-live="polite" aria-label={dt.loadingDescription} height={28} />
          )}
        </Box>
        <Box display="flex" flexDirection="column" gap={10}>
          <WizardSectionLabel>{dt.recentTitle}</WizardSectionLabel>
          <Box borderWidth={1} borderStyle="solid" borderColor="var(--kairo-color-line)" borderRadius={12} backgroundColor="var(--kairo-color-surface)" padding={6} minHeight={180}>
            <QueueList label={dt.recentTitle}>
              {data?.recent.map((ticket) => (
                <TicketRow
                  key={ticket.id}
                  variant="compact"
                  entering
                  subject={ticket.subject ?? ""}
                  priority={ticket.priority}
                  age={formatAge(ticket.classified_at)}
                  category={ticket.category ? { value: ticket.category, label: (categoryLabels[ticket.category] ?? ticket.category).toLowerCase() } : undefined}
                  confidence={ticket.confidence}
                  confidenceLabel={t.wizard.confidenceLabel}
                />
              ))}
            </QueueList>
          </Box>
        </Box>
      </Box>
    </>
  );
}
