"use client";

import { INDUSTRIES, INDUSTRY_NAMES } from "@kairo/types/industry";
import { Box, Field, FieldSelect, FieldTextarea } from "@kairo/ui";
import { useTranslation } from "@/lib/i18n";
import { industryFromSelect, type OnboardingSettings } from "@/lib/onboarding-settings";

interface Props {
  settings: OnboardingSettings;
  onChange: (settings: OnboardingSettings) => void;
  disabled?: boolean;
}

/** Industry and business context, shared by the optional setup section and the walkthrough. */
export function OnboardingSettingsFields({ settings, onChange, disabled }: Props) {
  const { t, locale } = useTranslation();
  const s = t.wizard.setup;
  return (
    <Box display="flex" flexDirection="column" gap={16}>
      <Field label={s.industryLabel} hint={s.industryHint} size="web">
        <FieldSelect
          value={settings.industry ?? ""}
          onValueChange={(value) => onChange({ ...settings, industry: industryFromSelect(value) })}
          disabled={disabled}
        >
          <option value="">{s.industryPlaceholder}</option>
          {INDUSTRIES.map((industry) => (
            <option key={industry} value={industry}>{INDUSTRY_NAMES[industry][locale]}</option>
          ))}
          <option value="other">{s.industryOther}</option>
        </FieldSelect>
      </Field>
      <Field label={s.contextLabel} hint={s.contextHint} size="web">
        <FieldTextarea
          value={settings.businessContext}
          onChangeText={(businessContext: string) => onChange({ ...settings, businessContext })}
          placeholder={s.contextPlaceholder}
          maxLength={2500}
          rows={3}
          disabled={disabled}
        />
      </Field>
    </Box>
  );
}
