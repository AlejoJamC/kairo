import { Globe } from "lucide-react";
import { useLocale } from "@/hooks/useLocale";
import type { SupportedLanguage } from "@/i18n/types";

export function LanguageSwitcher() {
  const { language, setLanguage, supportedLanguages, languageMeta } =
    useLocale();

  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
      <Globe
        style={{
          position: "absolute",
          left: 8,
          width: 13,
          height: 13,
          color: "var(--k-text-tertiary)",
          pointerEvents: "none",
          zIndex: 1,
        }}
      />
      <select
        className="k-select"
        value={language}
        onChange={(e) => setLanguage(e.target.value as SupportedLanguage)}
        style={{ paddingLeft: 26, height: 30, fontSize: 12, minWidth: 110 }}
      >
        {supportedLanguages.map((lang: SupportedLanguage) => (
          <option key={lang} value={lang}>
            {languageMeta[lang].nativeLabel}
          </option>
        ))}
      </select>
    </div>
  );
}
