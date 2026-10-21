"use client";

import { useClassificationProgress, type ClassificationProgress } from "@/lib/hooks/useClassificationProgress";
import { useTranslation } from "@/lib/i18n";
import { WizardHeading } from "@/components/wizard-heading";
import { QueuePreviewRow } from "@/components/queue-preview";
import { Box, Button, CategoryChip, Icon, KpiStrip, ProgressBar, Text } from "@kairo/ui";

interface DetectionStepProps {
  onContinue: () => void;
}

function SectionLabel({ children }: { children: string }) {
  return (
    <Text tag="span" display="block" font="mono" fontSize={10.5} letterSpacing={0.63} textTransform="uppercase" color="var(--kairo-color-faint)">
      {children}
    </Text>
  );
}

function CategoryPills({
  categories, labels,
}: {
  categories: ClassificationProgress["categories"];
  labels: Record<string, string>;
}) {
  const entries = Object.entries(categories) as Array<[keyof typeof categories, number]>;
  return (
    <Box display="flex" gap={6} flexWrap="wrap">
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
        <WizardHeading eyebrow={t.wizard.stepOf2} title={dt.errorTitle} body={dt.errorBody} />
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
        eyebrow={t.wizard.stepOf2}
        title={isDone ? t.wizard.detectDoneTitle : t.wizard.detectScanningTitle}
        body={isDone ? t.wizard.detectDoneNote : t.wizard.detectScanningNote}
      />

      <ProgressBar
        label={dt.progressLabel}
        value={data && data.messages_total > 0 ? data.messages_classified / data.messages_total : 0}
        status={isDone ? dt.progressDone : dt.progressStatus}
        running={isStillScanning}
      />

      <KpiStrip
        items={[
          { label: dt.metricMails, value: data?.messages_total ?? 0 },
          { label: dt.metricTickets, value: data?.tickets_count ?? 0 },
          { label: dt.metricClients, value: data?.clients_count ?? 0 },
        ]}
      />

      <Box grid gridTemplateColumns="minmax(0, 1fr) minmax(0, 1.2fr)" gap={16} alignItems="flex-start">
        <Box display="flex" flexDirection="column" gap={10}>
          <SectionLabel>{dt.metricCategories}</SectionLabel>
          {data ? (
            <CategoryPills categories={data.categories} labels={categoryLabels} />
          ) : (
            <Box aria-live="polite" aria-label={dt.loadingDescription} height={28} />
          )}
        </Box>
        <Box display="flex" flexDirection="column" gap={10}>
          <SectionLabel>{dt.recentTitle}</SectionLabel>
          <Box borderWidth={1} borderStyle="solid" borderColor="var(--kairo-color-line)" borderRadius={12} backgroundColor="var(--kairo-color-surface)" padding={6} display="flex" flexDirection="column" gap={2} minHeight={196}>
            {data?.recent.map((ticket) => (
              <QueuePreviewRow
                key={ticket.id}
                confidenceLabel={t.wizard.confidenceLabel}
                item={{
                  id: ticket.id,
                  title: ticket.subject ?? "",
                  priority: ticket.priority,
                  category: ticket.category ? { value: ticket.category, label: categoryLabels[ticket.category] ?? ticket.category } : undefined,
                  confidence: ticket.confidence,
                }}
              />
            ))}
          </Box>
        </Box>
      </Box>

      <Box display="flex" flexWrap="wrap" alignItems="center" gap={14} borderTopWidth={1} borderStyle="solid" borderTopColor="var(--kairo-color-line)" paddingTop={24}>
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
        <Text fontSize={12.5} color="var(--kairo-color-faint)">
          {dt.rangeNote}
        </Text>
      </Box>
    </>
  );
}
