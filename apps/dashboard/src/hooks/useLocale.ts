import { useTranslation } from "react-i18next";
import { useCallback } from "react";
import {
  supportedLanguages,
  languageMeta,
  type SupportedLanguage,
} from "@/i18n/types";

/**
 * Custom hook for locale management.
 * Provides current language, setter, and language metadata.
 */
export function useLocale() {
  const { i18n } = useTranslation();

  const currentLanguage = (
    supportedLanguages.includes(i18n.language as SupportedLanguage)
      ? i18n.language
      : "en"
  ) as SupportedLanguage;

  const setLanguage = useCallback(
    (lang: SupportedLanguage) => {
      i18n.changeLanguage(lang);
    },
    [i18n]
  );

  return {
    /** Current active language code */
    language: currentLanguage,
    /** Change the active language */
    setLanguage,
    /** List of all supported language codes */
    supportedLanguages,
    /** Metadata (labels, direction) for all languages */
    languageMeta,
    /** Whether the current language is RTL */
    isRTL: languageMeta[currentLanguage].dir === "rtl",
  };
}
