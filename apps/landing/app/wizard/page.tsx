"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getApiUrl } from "@/lib/api-config";
import { useTranslation } from "@/lib/i18n";
import { WizardChrome } from "@/components/wizard-chrome";
import { WizardSteps } from "@/components/wizard-steps";
import { Box, Button, Callout, ChoiceCard, ChoiceGroup, GoogleMark, Icon, PermissionList, ProductFrame, Segmented, Text, TicketRow } from "@kairo/ui";

type Intent = "support" | "sales" | "both";

const noop = () => {};

export default function WizardPage() {
  return (
    <Suspense>
      <ConnectStep />
    </Suspense>
  );
}

function ConnectStep() {
  const { t } = useTranslation();
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
      <Box backgroundColor="var(--kairo-color-surface)" borderWidth={1} borderStyle="solid" borderColor="var(--kairo-color-line)" borderRadius={14} padding={40}>
        <Text tag="h1" display="block" fontSize={32} fontWeight={600} letterSpacing={-0.64} marginTop={0} marginHorizontal={0} marginBottom={12} font="display" color="var(--kairo-color-text)">
          {t.wizard.connectTitle}
        </Text>
        <Text tag="p" display="block" fontSize={15} color="var(--kairo-color-muted)" lineHeightRatio={1.6} marginTop={0} marginHorizontal={0} marginBottom={28}>
          {t.wizard.connectSubtitle}
        </Text>

        <ChoiceGroup legend={t.wizard.channelLegend}>
          <ChoiceCard icon={<GoogleMark size={20} />} name="Gmail" availability={t.wizard.channelAvailable} selected />
          <ChoiceCard icon={<Icon name="msg" size={20} />} name="Slack" availability={t.wizard.channelSoon} soon />
          <ChoiceCard icon={<Icon name="phone" size={20} />} name="WhatsApp" availability={t.wizard.channelSoon} soon />
        </ChoiceGroup>
        <Text tag="p" display="block" font="mono" fontSize={12} color="var(--kairo-color-faint)" marginTop={12} marginHorizontal={0} marginBottom={24}>
          {t.wizard.channelsNoted}
        </Text>

        <Box marginBottom={24}>
          <Text tag="div" display="block" marginBottom={8} fontSize={13} fontWeight={500} color="var(--kairo-color-text)">
            {t.wizard.intentLegend}
          </Text>
          <Segmented
            label={t.wizard.intentLegend}
            semantics="group"
            size="lg"
            value={intent}
            onChange={setIntent}
            items={[
              { value: "support", label: t.wizard.intentSupport },
              { value: "sales", label: t.wizard.intentSales },
              { value: "both", label: t.wizard.intentBoth },
            ]}
          />
        </Box>

        <Box marginBottom={24}>
          <PermissionList
            label={t.wizard.permsLabel}
            provider={t.wizard.permsProvider}
            requirementLabels={{ required: t.wizard.ruleRequired, optional: t.wizard.ruleOptional }}
            onChange={(id, checked) => {
              if (id === "drafts") setDrafts(checked);
            }}
            items={[
              { id: "read", name: t.wizard.permReadName, description: t.wizard.permReadDesc, required: true, checked: true },
              { id: "classify", name: t.wizard.permClassifyName, description: t.wizard.permClassifyDesc, required: true, checked: true },
              { id: "drafts", name: t.wizard.permDraftName, description: t.wizard.permDraftDesc, checked: drafts },
            ]}
          />
        </Box>

        {denied && (
          <Box marginBottom={16}>
            <Callout tone="error" icon={<Icon name="alert" size={14} />}>
              <Text fontWeight={500} color="var(--kairo-color-text)">
                {t.wizard.deniedTitle}
              </Text>{" "}
              {t.wizard.deniedDesc}
            </Callout>
          </Box>
        )}

        <Button variant="primary" size="webLg" full loading={connecting} icon={<GoogleMark size={18} />} onPress={handleGoogleSignIn}>
          {t.wizard.googleButton}
        </Button>

        <Box marginTop={28}>
          <Callout icon={<Icon name="lock" size={14} />}>
            <Text fontWeight={500} color="var(--kairo-color-text)">
              {t.wizard.connectReadOnlyTitle}
            </Text>{" "}
            {t.wizard.connectReadOnlyDesc}
          </Callout>
        </Box>
      </Box>
    </WizardChrome>
  );
}

function ConnectPreview() {
  const { t } = useTranslation();
  const rows = [
    { code: "KAI-T-1004", subject: t.wizard.previewOneTitle, sender: t.wizard.previewOneSender, priority: "P1", age: "2m", sentiment: "frustrated" as const },
    { code: "KAI-T-1003", subject: t.wizard.previewTwoTitle, sender: t.wizard.previewTwoSender, priority: "P2", age: "11m", sentiment: "neutral" as const },
    { code: "KAI-T-1002", subject: t.wizard.previewThreeTitle, sender: t.wizard.previewThreeSender, priority: "P2", age: "23m", sentiment: "positive" as const },
    { code: "KAI-T-1001", subject: t.wizard.previewFourTitle, sender: t.wizard.previewFourSender, priority: "P3", age: "1h", sentiment: "positive" as const },
  ];
  return (
    <Box>
      <Text tag="p" display="block" marginTop={0} marginHorizontal={0} marginBottom={16} fontSize={13} color="var(--kairo-color-muted)">
        {t.wizard.previewCaption}
      </Text>
      <ProductFrame compact label={t.wizard.previewLabel} route={t.wizard.previewRoute}>
        {rows.map((row, index) => (
          <TicketRow key={row.code} code={row.code} subject={row.subject} sender={row.sender} priority={row.priority} age={row.age} sentiment={row.sentiment} sentimentLabel={row.sentiment} selected={index === 0} onPress={noop} ariaLabel={`${row.code} ${row.subject}`} />
        ))}
      </ProductFrame>
    </Box>
  );
}
