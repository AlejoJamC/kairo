"use client";

import Link from "next/link";
import { Globe, ChevronDown } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "@/lib/i18n";

export function Footer() {
  const { t, locale, setLocale } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <footer className="bg-neutral-50 border-t border-neutral-200 mt-auto">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-center md:text-left">
            <p className="text-sm font-semibold text-neutral-900">Kairo</p>
            <p className="text-xs text-neutral-600">{t.footer.tagline}</p>
          </div>

          <div className="flex items-center gap-6">
            <Link
              href="/privacy/"
              className="text-sm text-neutral-600 hover:text-neutral-900 transition"
            >
              {t.footer.privacy}
            </Link>
            <span className="text-neutral-300">|</span>
            <Link
              href="/terms/"
              className="text-sm text-neutral-600 hover:text-neutral-900 transition"
            >
              {t.footer.terms}
            </Link>
            <span className="text-neutral-300">|</span>
            <div className="relative">
              <button
                onClick={() => setOpen((v) => !v)}
                className="flex items-center gap-1.5 text-sm text-neutral-600 hover:text-neutral-900 transition"
                aria-label="Select language"
              >
                <Globe className="w-4 h-4" />
                <span>{locale === "en" ? "EN" : "ES"}</span>
                <ChevronDown className="w-3 h-3" />
              </button>
              {open && (
                <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-white border border-neutral-200 rounded-lg shadow-lg overflow-hidden min-w-[110px]">
                  <button
                    onClick={() => {
                      setLocale("en");
                      setOpen(false);
                    }}
                    className={`w-full px-4 py-2 text-sm text-left hover:bg-neutral-50 transition ${locale === "en" ? "font-medium text-neutral-900" : "text-neutral-600"}`}
                  >
                    English
                  </button>
                  <button
                    onClick={() => {
                      setLocale("es");
                      setOpen(false);
                    }}
                    className={`w-full px-4 py-2 text-sm text-left hover:bg-neutral-50 transition ${locale === "es" ? "font-medium text-neutral-900" : "text-neutral-600"}`}
                  >
                    Español
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="text-center md:text-right">
            <p className="text-xs text-neutral-500">{t.footer.copyright}</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
