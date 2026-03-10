"use client";

import { useTranslation } from "@/lib/i18n";

export function Hero() {
  const { t } = useTranslation();

  return (
    <div className="container mx-auto px-4 py-24 text-center">
      <h1 className="text-6xl font-bold tracking-tight text-neutral-900">
        {t.hero.titlePrefix}{" "}
        <span className="text-blue-600">{t.hero.titleHighlight}</span>
      </h1>
      <p className="mt-6 text-xl text-neutral-600 max-w-2xl mx-auto">
        {t.hero.description}
      </p>
    </div>
  );
}
