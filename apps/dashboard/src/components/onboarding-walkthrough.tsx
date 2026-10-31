import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@kairo/client-core/auth";
import { INDUSTRIES, INDUSTRY_NAMES, isIndustryChoice } from "@kairo/types/industry";
import { Box, Button, Callout, Dialog, Field, FieldSelect, FieldTextarea, Text } from "@kairo/ui";

/**
 * Shown over the dashboard to the owner who went to Triage without finishing the
 * onboarding. Either button finishes it: Continue with what is filled in, Skip
 * with nothing, which keeps the default settings.
 */
export function OnboardingWalkthrough() {
  const { t, i18n } = useTranslation("onboarding");
  const { onboardingPending, completeOnboarding } = useAuth();
  const [industry, setIndustry] = useState("");
  const [businessContext, setBusinessContext] = useState("");
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const lang = i18n.language.startsWith("es") ? "es" : "en";
  const points = t("points", { returnObjects: true }) as string[];

  const finish = async (chosen: { industry: string; businessContext: string }) => {
    setSaving(true);
    setFailed(false);
    const done = await completeOnboarding({
      industry: isIndustryChoice(chosen.industry) ? chosen.industry : null,
      businessContext: chosen.businessContext,
    });
    if (!done) {
      setFailed(true);
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={onboardingPending}
      onOpenChange={(open) => { if (!open && !saving) void finish({ industry: "", businessContext: "" }); }}
      title={t("title")}
      closeLabel={t("skip")}
      maxWidth={520}
      footer={
        <>
          <Button variant="ghost" size="sm" disabled={saving} onPress={() => void finish({ industry: "", businessContext: "" })}>
            {t("skip")}
          </Button>
          <Button variant="primary" size="sm" loading={saving} loadingLabel={t("saving")} onPress={() => void finish({ industry, businessContext })}>
            {t("continue")}
          </Button>
        </>
      }
    >
      <Box display="flex" flexDirection="column" gap={16}>
        {failed && <Callout tone="error">{t("error")}</Callout>}
        <Text tag="p" display="block" margin={0} fontSize={14} color="var(--k-text-secondary)">{t("intro")}</Text>
        <Box tag="ul" margin={0} paddingLeft={18} display="flex" flexDirection="column" gap={6}>
          {points.map((point) => (
            <Text key={point} tag="li" fontSize={13.5} color="var(--k-text-secondary)">{point}</Text>
          ))}
        </Box>
        <Field label={t("industryLabel")} hint={t("industryHint")}>
          <FieldSelect value={industry} onValueChange={setIndustry} disabled={saving}>
            <option value="">{t("industryPlaceholder")}</option>
            {INDUSTRIES.map((value) => (
              <option key={value} value={value}>{INDUSTRY_NAMES[value][lang]}</option>
            ))}
            <option value="other">{t("industryOther")}</option>
          </FieldSelect>
        </Field>
        <Field label={t("contextLabel")} hint={t("contextHint")}>
          <FieldTextarea
            value={businessContext}
            onChangeText={setBusinessContext}
            placeholder={t("contextPlaceholder")}
            maxLength={2500}
            rows={3}
            disabled={saving}
          />
        </Field>
      </Box>
    </Dialog>
  );
}
