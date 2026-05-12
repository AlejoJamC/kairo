"use client";

import { useTranslation } from "@/lib/i18n";

export function LangToggle() {
  const { locale, setLocale } = useTranslation();

  return (
    <div
      style={{
        display: "flex",
        gap: 4,
        padding: 2,
        border: "1px solid var(--border)",
        borderRadius: 6,
        background: "white",
      }}
    >
      {(["ES", "EN"] as const).map((l) => {
        const active = locale.toUpperCase() === l;
        return (
          <button
            key={l}
            onClick={() => setLocale(l.toLowerCase() as "en" | "es")}
            style={{
              padding: "3px 8px",
              borderRadius: 4,
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              background: active ? "var(--surface-2)" : "transparent",
              color: active ? "var(--text-primary)" : "var(--text-tertiary)",
              border: "none",
              cursor: "pointer",
              fontWeight: active ? 500 : 400,
            }}
          >
            {l}
          </button>
        );
      })}
    </div>
  );
}
