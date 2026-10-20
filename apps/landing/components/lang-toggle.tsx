"use client";

import { Segmented } from "@kairo/ui";
import { useTranslation } from "@/lib/i18n";

export function LangToggle() {
  const { locale, setLocale, t } = useTranslation();

  return (
    <Segmented
      semantics="group"
      label={t.header.language}
      value={locale}
      onChange={setLocale}
      items={[
        { value: "es", label: "ES" },
        { value: "en", label: "EN" },
      ]}
    />
  );
}
