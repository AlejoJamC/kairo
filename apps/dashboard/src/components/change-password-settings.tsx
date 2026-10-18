import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@kairo/client-core/auth";
import { updatePassword } from "@kairo/client-core/queries";
import type { AppView } from "@/types";
import { Button, Field, FieldInput, Icon } from "@kairo/ui";

interface Props {
  onViewChange: (view: AppView) => void;
}

export function ChangePasswordSettings({ onViewChange }: Props) {
  const { t } = useTranslation(["dashboard", "common"]);
  const { user } = useAuth();
  const hasPassword =
    user?.identities?.some((id) => id.provider === "email") ?? false;

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const hasMinLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const passwordsMatch = password === confirmPassword && password.length > 0;
  const isValid = hasMinLength && hasUppercase && hasNumber && passwordsMatch;

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!isValid) return;

    setSaving(true);
    setError(null);

    try {
      const { error: updateError } = await updatePassword(password);

      if (updateError) {
        setError(updateError.message);
        return;
      }

      setSuccess(true);
      setTimeout(() => onViewChange("settings"), 2000);
    } catch {
      setError(t("dashboard:changePassword.error"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ flex: 1, overflowY: "auto", background: "var(--k-surface)", padding: 32 }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>

        {/* Back + title */}
        <div style={{ marginBottom: 28 }}>
          <button
            onClick={() => onViewChange("settings")}
            style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--k-text-tertiary)", background: "none", border: "none", cursor: "pointer", marginBottom: 12, padding: 0 }}
          >
            <Icon name="back" size={14} />
            {t("dashboard:changePassword.backToSettings")}
          </button>
          <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em", color: "var(--k-text-primary)", fontFamily: "var(--k-font-display)", margin: 0 }}>
            {hasPassword
              ? t("dashboard:changePassword.changeTitle")
              : t("dashboard:changePassword.setTitle")}
          </h1>
          <p style={{ marginTop: 4, fontSize: 13, color: "var(--k-text-tertiary)" }}>
            {hasPassword
              ? t("dashboard:changePassword.changeSubtitle")
              : t("dashboard:changePassword.setSubtitle")}
          </p>
        </div>

        <div className="k-card">
          {success ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "32px 0", textAlign: "center" }}>
              <div style={{ width: 48, height: 48, borderRadius: 999, background: "color-mix(in srgb, var(--kairo-color-ok) 8%, transparent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name="check" size={22} color="var(--kairo-color-ok)" />
              </div>
              <p style={{ fontSize: 14, fontWeight: 500, color: "var(--k-text-primary)" }}>
                {t("dashboard:changePassword.successMessage")}
              </p>
              <p style={{ fontSize: 13, color: "var(--k-text-tertiary)" }}>
                {t("dashboard:changePassword.redirecting")}
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {error && (
                <div style={{ borderRadius: 6, background: "var(--kairo-color-bad-soft)", border: "1px solid var(--kairo-color-bad-line)", padding: "8px 12px", fontSize: 13, color: "var(--kairo-color-bad-ink)" }}>
                  {error}
                </div>
              )}

              <Field label={t("dashboard:changePassword.newPasswordLabel")}>
                <FieldInput secureTextEntry value={password} onChangeText={setPassword} placeholder="••••••••" />
              </Field>

              <Field label={t("dashboard:changePassword.confirmPasswordLabel")}>
                <FieldInput secureTextEntry value={confirmPassword} onChangeText={setConfirmPassword} placeholder="••••••••" />
              </Field>

              {/* Requirements */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <p style={{ fontSize: 13, fontWeight: 500, color: "var(--k-text-secondary)" }}>
                  {t("dashboard:changePassword.requirements.title")}
                </p>
                {[
                  { met: hasMinLength, label: t("dashboard:changePassword.requirements.minLength") },
                  { met: hasUppercase, label: t("dashboard:changePassword.requirements.uppercase") },
                  { met: hasNumber,    label: t("dashboard:changePassword.requirements.number") },
                  { met: passwordsMatch, label: t("dashboard:changePassword.requirements.match") },
                ].map(({ met, label }) => (
                  <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                    {met
                      ? <Icon name="check" size={14} color="var(--kairo-color-ok)" style={{ flexShrink: 0 }} />
                      : <Icon name="x" size={14} color="var(--k-text-tertiary)" style={{ flexShrink: 0 }} />}
                    <span style={{ color: met ? "var(--kairo-color-ok-ink)" : "var(--k-text-tertiary)" }}>{label}</span>
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, paddingTop: 4 }}>
                <Button
                  variant="primary"
                  loading={saving}
                  loadingLabel={t("dashboard:changePassword.updating")}
                  disabled={!isValid}
                  onPress={handleSubmit}
                >
                  {hasPassword ? t("dashboard:changePassword.updateButton") : t("dashboard:changePassword.setButton")}
                </Button>
                <button
                  type="button"
                  onClick={() => onViewChange("settings")}
                  style={{ fontSize: 13, color: "var(--k-text-tertiary)", background: "none", border: "none", cursor: "pointer" }}
                >
                  {t("common:cancel")}
                </button>
              </div>
            </form>
          )}
        </div>

      </div>
    </div>
  );
}
