import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import {
  defaultLanguage,
  defaultNamespace,
  supportedLanguages,
} from "./types";

import enCommon from "./resources/en/common.json";
import enDashboard from "./resources/en/dashboard.json";
import enAuth from "./resources/en/auth.json";

import esCommon from "./resources/es/common.json";
import esDashboard from "./resources/es/dashboard.json";
import esAuth from "./resources/es/auth.json";

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { common: enCommon, dashboard: enDashboard, auth: enAuth },
      es: { common: esCommon, dashboard: esDashboard, auth: esAuth },
    },

    fallbackLng: defaultLanguage,
    defaultNS: defaultNamespace,
    supportedLngs: [...supportedLanguages],

    // Detection: localStorage → browser → fallback to English
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: "kairo-lang",
      caches: ["localStorage"],
    },

    interpolation: {
      escapeValue: false, // React already escapes
    },

    react: {
      useSuspense: false, // All resources are bundled, no async loading needed
    },

    ns: [defaultNamespace, "dashboard", "auth"],
  });

// Update <html lang> on language change for accessibility/SEO
i18n.on("languageChanged", (lng) => {
  if (typeof document !== "undefined") {
    document.documentElement.lang = lng;
  }
});

export default i18n;
