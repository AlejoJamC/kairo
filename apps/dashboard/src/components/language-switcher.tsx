import { useLocale } from "@/hooks/useLocale";
import type { SupportedLanguage } from "@/i18n/types";
import { useTranslation } from "react-i18next";
import { Box, Icon, PlainSelect } from "@kairo/ui";

export function LanguageSwitcher({ collapsed = false, plain = false }: { collapsed?: boolean; plain?: boolean }) {
  const { t } = useTranslation("common");
  const { language, setLanguage, supportedLanguages, languageMeta } = useLocale();

  return (
    <Box display="flex" alignItems="center" gap={8} height={30} width={plain ? 132 : undefined} paddingHorizontal={collapsed ? 0 : 9} justifyContent={collapsed ? "center" : "flex-start"} borderRadius={7} borderWidth={plain ? 0 : 1} borderStyle="solid" borderColor="var(--k-border)" backgroundColor={plain ? "transparent" : "var(--kairo-color-bg)"}>
      <Icon name="globe" size={14} color="var(--k-text-tertiary)" />
      {!collapsed && (
        <PlainSelect
          aria-label={t("language")}
          value={language}
          onChange={(event) => setLanguage(event.target.value as SupportedLanguage)}
          flexGrow={1}
          flexShrink={1}
          flexBasis="0%"
          minWidth={0}
          backgroundColor="transparent"
          borderWidth={0}
          fontSize={12.5}
          color="var(--k-text-primary)"
          cursor="pointer"
        >
          {supportedLanguages.map((lang: SupportedLanguage) => (
            <option key={lang} value={lang}>{languageMeta[lang].nativeLabel}</option>
          ))}
        </PlainSelect>
      )}
    </Box>
  );
}
