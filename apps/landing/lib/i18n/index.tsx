"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { en } from "./locales/en";
import { es } from "./locales/es";

type Locale = "en" | "es";

const translations = { en, es };

interface LanguageContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: typeof en;
}

const LanguageContext = createContext<LanguageContextType>({
  locale: "en",
  setLocale: () => {},
  t: en,
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    const stored = localStorage.getItem("kairo-locale") as Locale | null;
    if (stored === "en" || stored === "es") {
      setLocaleState(stored);
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  function setLocale(newLocale: Locale) {
    setLocaleState(newLocale);
    localStorage.setItem("kairo-locale", newLocale);
  }

  return (
    <LanguageContext.Provider
      value={{ locale, setLocale, t: translations[locale] }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useTranslation() {
  return useContext(LanguageContext);
}
