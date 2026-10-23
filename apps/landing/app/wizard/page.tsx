"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getApiUrl } from "@/lib/api-config";
import { useTranslation } from "@/lib/i18n";
import { WizardChrome } from "@/components/wizard-chrome";
import { WizardHeading } from "@/components/wizard-heading";
import { WizardSteps } from "@/components/wizard-steps";
import { QueuePreviewRow, type QueuePreviewItem } from "@/components/queue-preview";
import { Box, Button, Callout, Icon, PermissionList, ProductFrame, Text } from "@kairo/ui";

export default function WizardPage() {
  return (
    <Suspense>
      <ConnectStep />
    </Suspense>
  );
}

function ConnectStep() {
  const { t } = useTranslation();
  const w = t.wizard;
  const [connecting, setConnecting] = useState(false);
  const [, setDrafts] = useState(false);
  const denied = useSearchParams().get("error") === "access_denied";

  const handleConnect = () => {
    setConnecting(true);
    const apiUrl = getApiUrl();
    window.location.href = `${apiUrl}/bff/auth/google`;
  };

  return (
    <WizardChrome stepper={<WizardSteps current="connect" />} width={480} centered aside={<ConnectPreview />}>
      <WizardHeading eyebrow={w.stepOf1} title={w.connectTitle} body={w.connectSubtitle} />

      <Box display="flex" flexDirection="column" gap={12}>
        {denied && (
          <Callout tone="error" icon={<Icon name="alert" size={14} />}>
            <Text fontWeight={500} color="var(--kairo-color-text)">
              {w.deniedTitle}
            </Text>{" "}
            {w.deniedDesc}
          </Callout>
        )}
        <Box alignSelf="flex-start">
          <Button variant="primary" size="webLg" loading={connecting} icon={<Icon name="mail" size={16} color="var(--kairo-color-on-accent)" />} onPress={handleConnect}>
            {w.connectButton}
          </Button>
        </Box>
        <Text tag="p" display="block" margin={0} fontSize={12.5} color="var(--kairo-color-faint)">
          {w.connectNote}
        </Text>
      </Box>

      <PermissionList
        label={w.permsSummary}
        collapsed={{ icon: "lock", text: w.permsSummary, state: w.permsState }}
        requirementLabels={{ required: w.ruleRequired, optional: w.ruleOptional }}
        onChange={(id, checked) => {
          if (id === "drafts") setDrafts(checked);
        }}
        items={[
          { id: "read", name: w.permReadName, description: w.permReadDesc, required: true, checked: true },
          { id: "classify", name: w.permClassifyName, description: w.permClassifyDesc, required: true, checked: true },
        ]}
      />

      <Text tag="p" display="block" margin={0} font="mono" fontSize={10.5} color="var(--kairo-color-faint)">
        {w.channelsNoted}
      </Text>
    </WizardChrome>
  );
}

function ConnectPreview() {
  const { t } = useTranslation();
  const w = t.wizard;
  const rows: QueuePreviewItem[] = [
    { id: "1", title: w.previewOneTitle, priority: "P1", age: "2m", category: { value: "billing", label: w.detect.categoryBilling }, confidence: 0.94, selected: true },
    { id: "2", title: w.previewTwoTitle, priority: "P2", age: "11m", category: { value: "technical", label: w.detect.categoryTechnical }, confidence: 0.82 },
    { id: "3", title: w.previewThreeTitle, priority: "P3", age: "1h", category: { value: "general", label: w.previewSupport }, confidence: 0.64, faded: true },
  ];
  return (
    <>
      <Text tag="span" display="block" font="mono" fontSize={10.5} letterSpacing={0.63} textTransform="uppercase" color="var(--kairo-color-faint)">
        {w.previewTitle}
      </Text>
      <ProductFrame compact label={w.previewLabel} route={w.previewRoute}>
        {rows.map((row) => (
          <QueuePreviewRow key={row.id} item={row} confidenceLabel={w.confidenceLabel} />
        ))}
      </ProductFrame>
      <Text tag="span" display="block" font="mono" fontSize={10.5} color="var(--kairo-color-faint)">
        {w.previewNote}
      </Text>
    </>
  );
}
