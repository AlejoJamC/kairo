// Locale JSON re-exports
export { default as enCommon } from "../locales/en/common.json";
export { default as enDashboard } from "../locales/en/dashboard.json";
export { default as enAuth } from "../locales/en/auth.json";
export { default as enClients } from "../locales/en/clients.json";

export { default as esCommon } from "../locales/es/common.json";
export { default as esDashboard } from "../locales/es/dashboard.json";
export { default as esAuth } from "../locales/es/auth.json";
export { default as esClients } from "../locales/es/clients.json";

// Type re-exports
export {
  supportedLanguages,
  defaultLanguage,
  defaultNamespace,
  languageMeta,
} from "./types";
export type {
  I18nNamespaces,
  I18nNamespace,
  SupportedLanguage,
} from "./types";
