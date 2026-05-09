import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Check, AlertCircle, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { createClient } from "@/lib/supabase/client";
import type { AppView } from "@/types";

interface Props {
  onViewChange: (view: AppView) => void;
}

export function ProfileSettings({ onViewChange }: Props) {
  const { t } = useTranslation(["dashboard", "common"]);
  const { user, profile, refreshProfile } = useAuth();
  const hasPassword = user?.identities?.some((id) => id.provider === "email") ?? false;
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    company_name: "",
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    if (profile) {
      setFormData({
        name: profile.name || "",
        email: profile.email || "",
        phone: "",
        company_name: profile.company_name || "",
      });
    }
  }, [profile]);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    try {
      const supabase = createClient();

      const { error } = await supabase
        .from("profiles")
        .update({
          name: formData.name.trim(),
          company_name: formData.company_name.trim(),
        })
        .eq("id", profile!.id);

      if (error) {
        setMessage({ type: "error", text: t("dashboard:settings.saveError") });
        return;
      }

      await refreshProfile();
      setMessage({ type: "success", text: t("dashboard:settings.saveSuccess") });
    } catch {
      setMessage({ type: "error", text: t("dashboard:settings.saveError") });
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  if (!profile) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Loader2 style={{ width: 28, height: 28, color: "var(--k-text-tertiary)" }} className="animate-spin" />
      </div>
    );
  }

  // Initials avatar
  const initials = (profile.name ?? profile.email ?? "?")
    .split(/\s+/)
    .slice(0, 2)
    .map((w: string) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div style={{ flex: 1, overflowY: "auto", background: "var(--k-surface)", padding: 32 }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>

        {/* Page title */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em", color: "var(--k-text-primary)", fontFamily: "var(--k-font-display)", margin: 0 }}>
            {t("dashboard:settings.title")}
          </h1>
          <p style={{ marginTop: 4, fontSize: 13, color: "var(--k-text-tertiary)" }}>
            {t("dashboard:settings.subtitle")}
          </p>
        </div>

        {/* Profile card */}
        <div className="k-card" style={{ marginBottom: 16 }}>
          {/* Avatar + name */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
            <div style={{ width: 52, height: 52, borderRadius: 999, background: "linear-gradient(135deg, var(--k-accent), #6E8BFF)", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 600, flexShrink: 0 }}>
              {initials}
            </div>
            <div>
              <p style={{ fontSize: 14, fontWeight: 500, color: "var(--k-text-primary)" }}>
                {profile.name || profile.email}
              </p>
              <p style={{ fontSize: 12, color: "var(--k-text-tertiary)" }}>{profile.email}</p>
            </div>
          </div>

          {/* Fields */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label className="k-label">{t("dashboard:settings.nameLabel")}</label>
              <input
                type="text"
                className="k-input"
                value={formData.name}
                onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                placeholder={t("dashboard:settings.namePlaceholder")}
              />
            </div>

            <div>
              <label className="k-label">{t("dashboard:settings.emailLabel")}</label>
              <input
                type="email"
                className="k-input"
                value={formData.email}
                disabled
              />
            </div>

            <div>
              <label className="k-label">{t("dashboard:settings.phoneLabel")}</label>
              <input
                type="tel"
                className="k-input"
                value={formData.phone}
                onChange={(e) => setFormData((p) => ({ ...p, phone: e.target.value }))}
                placeholder={t("dashboard:settings.phonePlaceholder")}
              />
            </div>

            <div>
              <label className="k-label">{t("dashboard:settings.companyLabel")}</label>
              <input
                type="text"
                className="k-input"
                value={formData.company_name}
                onChange={(e) => setFormData((p) => ({ ...p, company_name: e.target.value }))}
                placeholder={t("dashboard:settings.companyPlaceholder")}
              />
            </div>
          </div>

          {/* Message */}
          {message && (
            <div
              style={{
                marginTop: 16,
                display: "flex",
                alignItems: "center",
                gap: 8,
                borderRadius: 6,
                padding: "8px 12px",
                fontSize: 13,
                background: message.type === "success" ? "#ECFDF5" : "#FEF2F2",
                color: message.type === "success" ? "#065F46" : "#991B1B",
                border: `1px solid ${message.type === "success" ? "#A7F3D0" : "#FECACA"}`,
              }}
            >
              {message.type === "success"
                ? <Check style={{ width: 14, height: 14, flexShrink: 0 }} />
                : <AlertCircle style={{ width: 14, height: 14, flexShrink: 0 }} />}
              {message.text}
            </div>
          )}

          {/* Save */}
          <div style={{ marginTop: 20 }}>
            <button className="k-btn-primary" onClick={handleSave} disabled={saving}>
              {saving && <Loader2 style={{ width: 13, height: 13 }} className="animate-spin" />}
              {saving ? t("dashboard:settings.saving") : t("dashboard:settings.saveButton")}
            </button>
          </div>
        </div>

        {/* Security card */}
        <div className="k-card">
          <h2 style={{ fontSize: 15, fontWeight: 600, color: "var(--k-text-primary)", margin: "0 0 16px", fontFamily: "var(--k-font-display)" }}>
            {t("dashboard:settings.security.title")}
          </h2>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderRadius: 8, background: "var(--k-surface)", padding: 14, border: "1px solid var(--k-border-subtle)" }}>
            <div>
              <p style={{ fontSize: 13, fontWeight: 500, color: "var(--k-text-primary)" }}>
                {t("dashboard:settings.security.passwordLabel")}
              </p>
              <p style={{ fontSize: 12, color: "var(--k-text-tertiary)", marginTop: 2 }}>
                {hasPassword
                  ? t("dashboard:settings.security.passwordEnabledDesc")
                  : t("dashboard:settings.security.passwordDisabledDesc")}
              </p>
            </div>
            <button
              onClick={() => onViewChange("change-password")}
              style={{ fontSize: 13, fontWeight: 500, color: "var(--k-accent)", background: "none", border: "none", cursor: "pointer" }}
            >
              {hasPassword
                ? t("dashboard:settings.security.changePassword")
                : t("dashboard:settings.security.setPassword")}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
