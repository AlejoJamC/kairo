"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getApiUrl } from "@/lib/api-config";
import { useTranslation } from "@/lib/i18n";
import { WizardChrome } from "@/components/wizard-chrome";
import { WizardHeading } from "@/components/wizard-heading";
import { WizardSteps } from "@/components/wizard-steps";
import { QueuePreviewRow, type QueuePreviewItem } from "@/components/queue-preview";
import { Box, Button, Callout, Chip, ChoiceCard, ChoiceGroup, GoogleMark, Icon, PermissionList, ProductFrame, Segmented, Text } from "@kairo/ui";

type Intent = "support" | "sales" | "both";

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
  const [intent, setIntent] = useState<Intent>("support");
  const [drafts, setDrafts] = useState(false);
  const denied = useSearchParams().get("error") === "access_denied";

  const handleGoogleSignIn = () => {
    setConnecting(true);
    const apiUrl = getApiUrl();
    window.location.href = `${apiUrl}/bff/auth/google`;
  };

  return (
    <WizardChrome stepper={<WizardSteps current="connect" />} aside={<ConnectPreview />}>
      <WizardHeading eyebrow={w.stepOf1} title={w.connectTitle} body={w.connectSubtitle} />

      <Box>
        <ChoiceGroup legend={w.channelLegend}>
          <ChoiceCard icon={<GoogleMark size={20} />} name="Gmail" availability={w.channelAvailable} selected />
          <ChoiceCard icon={<Icon name="msg" size={20} />} name="Slack" availability={w.channelSoon} soon />
          <ChoiceCard icon={<Icon name="phone" size={20} />} name="WhatsApp" availability={w.channelSoon} soon />
        </ChoiceGroup>
        <Text tag="p" display="block" font="mono" fontSize={10.5} color="var(--kairo-color-faint)" marginTop={10} marginHorizontal={0} marginBottom={0}>
          {w.channelsNoted}
        </Text>
      </Box>

      <Box display="flex" flexDirection="column" gap={10}>
        <Text tag="span" display="block" fontSize={13} fontWeight={500} color="var(--kairo-color-text)">
          {w.intentLegend}
        </Text>
        <Segmented
          label={w.intentLegend}
          semantics="group"
          size="lg"
          value={intent}
          onChange={setIntent}
          items={[
            { value: "support", label: w.intentSupport },
            { value: "sales", label: w.intentSales },
            { value: "both", label: w.intentBoth },
          ]}
        />
      </Box>

      <PermissionList
        label={w.permsLabel}
        provider={w.permsProvider}
        requirementLabels={{ required: w.ruleRequired, optional: w.ruleOptional }}
        onChange={(id, checked) => {
          if (id === "drafts") setDrafts(checked);
        }}
        items={[
          { id: "read", name: w.permReadName, description: w.permReadDesc, required: true, checked: true },
          { id: "classify", name: w.permClassifyName, description: w.permClassifyDesc, required: true, checked: true },
          { id: "drafts", name: w.permDraftName, description: w.permDraftDesc, checked: drafts },
        ]}
      />

      {denied && (
        <Callout tone="error" icon={<Icon name="alert" size={14} />}>
          <Text fontWeight={500} color="var(--kairo-color-text)">
            {w.deniedTitle}
          </Text>{" "}
          {w.deniedDesc}
        </Callout>
      )}

      <Box display="flex" flexWrap="wrap" alignItems="center" gap={14}>
        <Button variant="primary" size="webLg" loading={connecting} icon={<GoogleMark size={18} />} onPress={handleGoogleSignIn}>
          {w.googleButton}
        </Button>
        <Box display="flex" alignItems="center" gap={6}>
          <Icon name="lock" size={13} color="var(--kairo-color-faint)" />
          <Text fontSize={12.5} color="var(--kairo-color-faint)">
            {w.disconnectNote}
          </Text>
        </Box>
      </Box>
    </WizardChrome>
  );
}

function ConnectPreview() {
  const { t } = useTranslation();
  const w = t.wizard;
  const rows: QueuePreviewItem[] = [
    { id: "1", title: w.previewOneTitle, priority: "P1", age: "2m", category: { value: "billing", label: w.detect.categoryBilling }, confidence: 0.94, selected: true },
    { id: "2", title: w.previewTwoTitle, priority: "P2", age: "11m", category: { value: "technical", label: w.detect.categoryTechnical }, confidence: 0.82 },
    { id: "3", title: w.previewThreeTitle, priority: "P3", age: "1h", category: { value: "general", label: w.detect.categoryGeneral }, confidence: 0.64, faded: true },
  ];
  return (
    <>
      <Text tag="span" display="block" font="mono" fontSize={10.5} letterSpacing={0.63} textTransform="uppercase" color="var(--kairo-color-faint)">
        {w.previewTitle}
      </Text>
      <Box display="flex" alignItems="center" gap={10}>
        <Chip icon={<Icon name="mail" size={13} />}>
          <Text font="mono" fontSize={11.5}>
            support@acme.com
          </Text>
        </Chip>
        <Box flexGrow={1} height={1} backgroundColor="var(--kairo-color-line-strong)" aria-hidden />
        <Box width={26} height={26} borderRadius={6} backgroundColor="var(--kairo-color-accent)" display="flex" alignItems="center" justifyContent="center" aria-hidden>
          <Icon name="zap" size={14} color="var(--kairo-color-on-accent)" strokeWidth={2.5} />
        </Box>
      </Box>
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
