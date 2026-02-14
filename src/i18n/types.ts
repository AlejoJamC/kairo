import type common from "./resources/en/common.json";
import type dashboard from "./resources/en/dashboard.json";
import type auth from "./resources/en/auth.json";

/** All available namespaces and their translation shapes */
export interface I18nNamespaces {
  common: typeof common;
  dashboard: typeof dashboard;
  auth: typeof auth;
}

/** Union of all namespace names */
export type I18nNamespace = keyof I18nNamespaces;

/** Supported language codes */
export const supportedLanguages = ["en", "es"] as const;
export type SupportedLanguage = (typeof supportedLanguages)[number];

/** Default language and namespace */
export const defaultLanguage: SupportedLanguage = "en";
export const defaultNamespace: I18nNamespace = "common";

/** Language display metadata */
export const languageMeta: Record<
  SupportedLanguage,
  { label: string; nativeLabel: string; dir: "ltr" | "rtl" }
> = {
  en: { label: "English", nativeLabel: "English", dir: "ltr" },
  es: { label: "Spanish", nativeLabel: "Español", dir: "ltr" },
};

// Module augmentation: gives react-i18next full type safety on t() keys
declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: typeof defaultNamespace;
    resources: I18nNamespaces;
  }
}
