"use client";

import { useState } from "react";
import { getApiUrl } from "@/lib/api-config";
import { useTranslation } from "@/lib/i18n";
import { WizardChrome } from "@/components/wizard-chrome";
import { WizardSteps } from "@/components/wizard-steps";
import { Box, Button, Callout, ChoiceCard, ChoiceGroup, GoogleMark, Icon, Text } from "@kairo/ui";

export default function WizardPage() {
  const { t } = useTranslation();
  const [connecting, setConnecting] = useState(false);

  const handleGoogleSignIn = () => {
    setConnecting(true);
    const apiUrl = getApiUrl();
    window.location.href = `${apiUrl}/bff/auth/google`;
  };

  return (
    <WizardChrome stepper={<WizardSteps current="connect" />}>
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
