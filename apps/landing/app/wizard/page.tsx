"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { getApiUrl } from "@/lib/api-config";
import { useTranslation } from "@/lib/i18n";
import { WizardChrome } from "@/components/wizard-chrome";
import { WizardStepper } from "@/components/wizard-stepper";

const GoogleSvg = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0 }}>
    <path fill="#EA4335" d="M21.35 11.1h-9.17v2.74h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.28 5 16.25 5 12c0-4.1 3.2-7.28 7.2-7.28 3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10 5.35 0 9.25-3.67 9.25-9.09 0-1.15-.15-1.81-.15-1.81z" />
  </svg>
);

const COMING_SOON = ["Slack", "WhatsApp", "Telegram", "Instagram"];

export default function WizardPage() {
  const { t } = useTranslation();
  const [connecting, setConnecting] = useState(false);

  const handleGoogleSignIn = () => {
    setConnecting(true);
    const apiUrl = getApiUrl();
    window.location.href = `${apiUrl}/bff/auth/google`;
  };

  return (
    <WizardChrome>
      <WizardStepper
        steps={[t.wizard.stepConnect, t.wizard.stepDetect, t.wizard.stepTriage]}
        current={0}
      />

      <div
        style={{
          background: "white",
          border: "1px solid var(--border)",
          borderRadius: 14,
          padding: 40,
        }}
      >
        <h1
          style={{
            fontSize: 32,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            margin: "0 0 12px",
            fontFamily: "var(--font-display)",
            color: "var(--text-primary)",
          }}
        >
          {t.wizard.connectTitle}
        </h1>
        <p
          style={{
            fontSize: 15,
            color: "var(--text-secondary)",
            lineHeight: 1.6,
            margin: "0 0 28px",
          }}
        >
          {t.wizard.connectSubtitle}
        </p>

        {/* Google connect button */}
        <button
          onClick={handleGoogleSignIn}
          disabled={connecting}
          style={{
            width: "100%",
            padding: "16px 18px",
            border: "1px solid var(--border)",
            borderRadius: 10,
            background: "white",
            display: "flex",
            alignItems: "center",
            gap: 14,
            cursor: connecting ? "default" : "pointer",
            fontSize: 14,
            fontWeight: 500,
            transition: "background 0.15s ease",
            position: "relative",
            overflow: "hidden",
            fontFamily: "inherit",
            color: "var(--text-primary)",
            opacity: connecting ? 0.7 : 1,
          }}
          onMouseEnter={(e) => {
            if (!connecting) e.currentTarget.style.background = "var(--surface)";
          }}
          onMouseLeave={(e) => {
            if (!connecting) e.currentTarget.style.background = "white";
          }}
        >
          <GoogleSvg />
          <span>{t.wizard.googleButton}</span>
          <span
            style={{
              marginLeft: "auto",
              fontSize: 12,
              color: "var(--text-tertiary)",
              fontFamily: "var(--font-mono)",
            }}
          >
            {t.wizard.connectOAuth}
          </span>
        </button>

        {/* Coming soon channels */}
        <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
          {COMING_SOON.map((name) => (
            <span
              key={name}
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                fontSize: 12,
                color: "var(--text-tertiary)",
                background: "var(--surface)",
                fontFamily: "var(--font-mono)",
              }}
            >
              {name} · {t.wizard.emailComingSoon.replace("(", "").replace(")", "")}
            </span>
          ))}
        </div>

        {/* Security note */}
        <div
          style={{
            marginTop: 28,
            padding: 14,
            background: "var(--surface)",
            borderRadius: 8,
            fontSize: 12,
            color: "var(--text-secondary)",
            display: "flex",
            gap: 10,
          }}
        >
          <Lock size={14} color="var(--text-tertiary)" strokeWidth={1.6} style={{ marginTop: 1, flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 500, color: "var(--text-primary)", marginBottom: 2 }}>
              {t.wizard.connectReadOnlyTitle}
            </div>
            {t.wizard.connectReadOnlyDesc}
          </div>
        </div>
      </div>
    </WizardChrome>
  );
}
