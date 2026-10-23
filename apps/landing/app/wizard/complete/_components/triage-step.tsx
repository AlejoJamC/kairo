"use client";

import { useState } from "react";
import { useClassificationProgress } from "@/lib/hooks/useClassificationProgress";
import { useTranslation } from "@/lib/i18n";
import { formatAge } from "@/lib/format-age";
import { WizardChrome } from "@/components/wizard-chrome";
import { WizardHeading } from "@/components/wizard-heading";
import { WizardSectionLabel } from "@/components/wizard-section-label";
import { WizardSteps } from "@/components/wizard-steps";
import { QueueList } from "@/components/queue-list";
import { Box, Button, Field, FieldInput, Icon, Kbd, PermissionList, ProductFrame, Text, TicketRow } from "@kairo/ui";

interface TriageStepProps {
  onOpen: () => void;
  saving: boolean;
  error: string | null;
  /** The account has no name yet: ask for it before opening Triage. */
  askName: boolean;
  companyName: string;
  onCompanyName: (value: string) => void;
}

/** Last wizard step: the result of the scan, the way into Triage and the initial rules below it. */
export function TriageStep({ onOpen, saving, error, askName, companyName, onCompanyName }: TriageStepProps) {
  const { t } = useTranslation();
  const { data } = useClassificationProgress();
  const w = t.wizard;
  const [rules, setRules] = useState({ classify: true, spam: true, paid: false, drafts: false });

  const ruleRows = [
    { id: "classify", name: w.triageAutoClassify, description: w.triageAutoClassifyDesc },
    { id: "spam", name: w.triageAutoResolveSpam, description: w.triageAutoResolveSpamDesc },
    { id: "paid", name: w.triagePriorityPro, description: w.triagePriorityProDesc },
    { id: "drafts", name: w.permDraftName, description: w.permDraftDesc },
  ] as const;
  const active = ruleRows.filter((rule) => rules[rule.id]).length;

  const body = data
    ? w.triageBody
        .replace("{tickets}", data.tickets_count === 1 ? w.ticketCountOne : w.ticketCountMany.replace("{n}", String(data.tickets_count)))
        .replace("{urgent}", data.urgent_count === 1 ? w.urgentOne : w.urgentMany.replace("{n}", String(data.urgent_count)))
    : w.triageBodyShort;

  const categoryLabel = (key: string) =>
    ({ technical: w.detect.categoryTechnical, billing: w.detect.categoryBilling, account: w.detect.categoryAccount, general: w.detect.categoryGeneral, not_applicable: w.detect.categoryNotApplicable })[key as "technical"]?.toLowerCase() ?? key;

  const shortcuts = [
    { keys: ["J", "K"], label: w.shortcutNavigate },
    { keys: ["A"], label: w.shortcutAcknowledge },
    { keys: ["⌘K"], label: w.shortcutCommands },
  ];

  const aside = (
    <>
      {data && data.recent.length > 0 && (
        <Box display="flex" flexDirection="column" gap={10}>
          <WizardSectionLabel>{w.summaryFirst}</WizardSectionLabel>
          <ProductFrame bare>
            <QueueList label={w.summaryFirst}>
              {data.recent.slice(0, 3).map((row) => (
                <TicketRow
                  key={row.id}
                  variant="compact"
                  subject={row.subject ?? ""}
                  priority={row.priority}
                  age={formatAge(row.classified_at)}
                  category={row.category ? { value: row.category, label: categoryLabel(row.category) } : undefined}
                  confidence={row.confidence}
                  confidenceLabel={w.confidenceLabel}
                />
              ))}
            </QueueList>
          </ProductFrame>
        </Box>
      )}
      <Box display="flex" flexDirection="column" gap={10}>
        <WizardSectionLabel>{w.summaryShortcuts}</WizardSectionLabel>
        <Box display="flex" flexWrap="wrap" columnGap={18} rowGap={10}>
          {shortcuts.map((shortcut) => (
            <Box key={shortcut.label} display="inline-flex" alignItems="center" gap={6}>
              {shortcut.keys.map((key) => (
                <Kbd key={key} size="lg">{key}</Kbd>
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

  return (
    <WizardChrome stepper={<WizardSteps current="triage" />} width={480} centered exit={false} aside={aside} asideLabel={w.summaryAside}>
      <WizardHeading eyebrow={w.stepOf3} title={w.triageTitle} body={body} />

      {askName && (
        <Field label={w.companyLabel} size="web">
          <FieldInput value={companyName} onChangeText={onCompanyName} placeholder={w.companyPlaceholder} autoComplete="organization" />
        </Field>
      )}

      {error && (
        <Text tag="p" role="alert" display="block" margin={0} fontSize={13} color="var(--kairo-color-bad-ink)">
          {error}
        </Text>
      )}

      <Box alignSelf="flex-start">
        <Button
          variant="primary"
          size="webLg"
          disabled={!companyName.trim()}
          loading={saving}
          loadingLabel={w.saving}
          iconEnd={<Icon name="right" size={14} color="var(--kairo-color-on-accent)" />}
          onPress={onOpen}
        >
          {w.openTriage}
        </Button>
      </Box>

      <PermissionList
        label={w.rulesLabel}
        collapsed={{ icon: "settings", text: w.rulesLabel, state: w.rulesState.replace("{n}", String(active)).replace("{m}", String(ruleRows.length)) }}
        onChange={(id, checked) => setRules((current) => ({ ...current, [id]: checked }))}
        items={ruleRows.map((rule) => ({ id: rule.id, name: rule.name, description: rule.description, checked: rules[rule.id] }))}
      />
    </WizardChrome>
  );
}
