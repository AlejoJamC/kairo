"use client";

import { useTranslation } from "@/lib/i18n";

export function CTAButton() {
  const { t } = useTranslation();

  return (
    <div className="flex justify-center mt-12">
      <a
        href="/wizard/"
        className="px-8 py-4 bg-blue-600 text-white text-lg font-semibold rounded-lg hover:bg-blue-700 transition"
      >
        {t.cta.button}
      </a>
    </div>
  );
}
