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
    const cookie = document.cookie.split("; ").find((part) => part.startsWith("kairo-locale="))?.split("=")[1];
    let stored: string | null = null;
    try { stored = localStorage.getItem("kairo-locale"); } catch { /* Storage may be unavailable. */ }
    const preferred = cookie === "en" || cookie === "es" ? cookie : stored;
    const detected = navigator.language.toLowerCase().startsWith("es") ? "es" : "en";
    const initial = preferred === "en" || preferred === "es" ? preferred : detected;
    setLocaleState(initial);
    if (!cookie && (stored === "en" || stored === "es")) {
      const secure = window.location.protocol === "https:" ? "; Secure" : "";
      document.cookie = `kairo-locale=${stored}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  function setLocale(newLocale: Locale) {
    setLocaleState(newLocale);
    try { localStorage.setItem("kairo-locale", newLocale); } catch { /* Storage may be unavailable. */ }
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `kairo-locale=${newLocale}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
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
