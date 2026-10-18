import { useLocale } from "@/hooks/useLocale";
import type { SupportedLanguage } from "@/i18n/types";
import { useTranslation } from "react-i18next";
import { Box, Field, FieldSelect, Icon } from "@kairo/ui";

export function LanguageSwitcher() {
  const { t } = useTranslation("common");
  const { language, setLanguage, supportedLanguages, languageMeta } =
    useLocale();

  return (
    <Box position="relative" display="flex" alignItems="center">
      <Box position="absolute" left={8} zIndex={1} pointerEvents="none">
        <Icon name="globe" size={13} color="var(--k-text-tertiary)" />
      </Box>
      <Field label={t("language")} hideLabel>
      <FieldSelect
        value={language}
        onValueChange={(next) => setLanguage(next as SupportedLanguage)}
        paddingLeft={26}
        minWidth={110}
      >
        {supportedLanguages.map((lang: SupportedLanguage) => (
          <option key={lang} value={lang}>
            {languageMeta[lang].nativeLabel}
          </option>
        ))}
      </FieldSelect>
      </Field>
    </Box>
  );
}
