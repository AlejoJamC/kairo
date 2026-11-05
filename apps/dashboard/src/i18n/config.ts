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
import enClients from "./resources/en/clients.json";
import enOnboarding from "./resources/en/onboarding.json";

import esCommon from "./resources/es/common.json";
import esDashboard from "./resources/es/dashboard.json";
import esAuth from "./resources/es/auth.json";
import esClients from "./resources/es/clients.json";
import esOnboarding from "./resources/es/onboarding.json";

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { common: enCommon, dashboard: enDashboard, auth: enAuth, clients: enClients, onboarding: enOnboarding },
      es: { common: esCommon, dashboard: esDashboard, auth: esAuth, clients: esClients, onboarding: esOnboarding },
    },

    fallbackLng: defaultLanguage,
    defaultNS: defaultNamespace,
    supportedLngs: [...supportedLanguages],

    // The shared cookie keeps the choice between the landing and dashboard ports.
    detection: {
      order: ["cookie", "localStorage", "navigator"],
      lookupCookie: "kairo-locale",
      lookupLocalStorage: "kairo-lang",
      caches: ["cookie", "localStorage"],
      cookieMinutes: 525600,
      cookieOptions: { path: "/", sameSite: "lax" },
    },

    interpolation: {
      escapeValue: false, // React already escapes
    },

    react: {
      useSuspense: false, // All resources are bundled, no async loading needed
    },

    ns: [defaultNamespace, "dashboard", "auth", "clients", "onboarding"],
  });

// Update <html lang> on language change for accessibility/SEO
i18n.on("languageChanged", (lng) => {
  if (typeof document !== "undefined") {
    document.documentElement.lang = lng;
  }
});

export default i18n;
