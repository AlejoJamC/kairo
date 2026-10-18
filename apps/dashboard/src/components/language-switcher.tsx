import { useLocale } from "@/hooks/useLocale";
import type { SupportedLanguage } from "@/i18n/types";
import { useTranslation } from "react-i18next";
import { Field, FieldSelect, Icon } from "@kairo/ui";

export function LanguageSwitcher() {
  const { t } = useTranslation("common");
  const { language, setLanguage, supportedLanguages, languageMeta } =
    useLocale();

  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
      <Icon name="globe" size={13} color="var(--k-text-tertiary)" style={{ position: "absolute", left: 8, pointerEvents: "none", zIndex: 1 }} />
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
    </div>
  );
}
