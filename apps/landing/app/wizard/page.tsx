"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { getApiUrl } from "@/lib/api-config";
import { useTranslation } from "@/lib/i18n";
import { WizardChrome } from "@/components/wizard-chrome";
import { WizardStepper } from "@/components/wizard-stepper";
import { GoogleIcon } from "@/components/google-button";

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
          <GoogleIcon size={22} />
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
