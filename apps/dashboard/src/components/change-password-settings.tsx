import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Check, X, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { createClient } from "@/lib/supabase/client";
import type { AppView } from "@/types";

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;

    setSaving(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });

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
            <ArrowLeft style={{ width: 14, height: 14 }} />
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
              <div style={{ width: 48, height: 48, borderRadius: 999, background: "#ECFDF5", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Check style={{ width: 22, height: 22, color: "#10B981" }} />
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
                <div style={{ borderRadius: 6, background: "#FEF2F2", border: "1px solid #FECACA", padding: "8px 12px", fontSize: 13, color: "#991B1B" }}>
                  {error}
                </div>
              )}

              <div>
                <label className="k-label">{t("dashboard:changePassword.newPasswordLabel")}</label>
                <input
                  type="password"
                  className="k-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>

              <div>
                <label className="k-label">{t("dashboard:changePassword.confirmPasswordLabel")}</label>
                <input
                  type="password"
                  className="k-input"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>

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
                      ? <Check style={{ width: 14, height: 14, color: "#10B981", flexShrink: 0 }} />
                      : <X style={{ width: 14, height: 14, color: "var(--k-text-tertiary)", flexShrink: 0 }} />}
                    <span style={{ color: met ? "#065F46" : "var(--k-text-tertiary)" }}>{label}</span>
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, paddingTop: 4 }}>
                <button type="submit" className="k-btn-primary" disabled={!isValid || saving}>
                  {saving && <Loader2 style={{ width: 13, height: 13 }} className="animate-spin" />}
                  {saving
                    ? t("dashboard:changePassword.updating")
                    : hasPassword
                      ? t("dashboard:changePassword.updateButton")
                      : t("dashboard:changePassword.setButton")}
                </button>
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
