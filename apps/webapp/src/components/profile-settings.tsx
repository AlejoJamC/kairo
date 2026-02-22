import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { User, Check, AlertCircle, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { createClient } from "@/lib/supabase/client";

export function ProfileSettings() {
  const { t } = useTranslation(["dashboard", "common"]);
  const { profile, refreshProfile } = useAuth();
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
        setMessage({
          type: "error",
          text: t("dashboard:settings.saveError"),
        });
        return;
      }

      await refreshProfile();
      setMessage({
        type: "success",
        text: t("dashboard:settings.saveSuccess"),
      });
    } catch {
      setMessage({ type: "error", text: t("dashboard:settings.saveError") });
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  if (!profile) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-zinc-50 p-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-zinc-900">
            {t("dashboard:settings.title")}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {t("dashboard:settings.subtitle")}
          </p>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-6">
          <div className="mb-6 flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-zinc-100">
              <User className="h-8 w-8 text-zinc-400" />
            </div>
            <div>
              <p className="font-medium text-zinc-900">
                {profile.name || profile.email}
              </p>
              <p className="text-sm text-zinc-500">{profile.email}</p>
            </div>
          </div>

          <div className="space-y-5">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-700">
                {t("dashboard:settings.nameLabel")}
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) =>
                  setFormData((p) => ({ ...p, name: e.target.value }))
                }
                placeholder={t("dashboard:settings.namePlaceholder")}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-700">
                {t("dashboard:settings.emailLabel")}
              </label>
              <input
                type="email"
                value={formData.email}
                disabled
                className="w-full rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-500 cursor-not-allowed"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-700">
                {t("dashboard:settings.phoneLabel")}
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) =>
                  setFormData((p) => ({ ...p, phone: e.target.value }))
                }
                placeholder={t("dashboard:settings.phonePlaceholder")}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-700">
                {t("dashboard:settings.companyLabel")}
              </label>
              <input
                type="text"
                value={formData.company_name}
                onChange={(e) =>
                  setFormData((p) => ({ ...p, company_name: e.target.value }))
                }
                placeholder={t("dashboard:settings.companyPlaceholder")}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {message && (
            <div
              className={`mt-4 flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
                message.type === "success"
                  ? "bg-green-50 text-green-700"
                  : "bg-red-50 text-red-700"
              }`}
            >
              {message.type === "success" ? (
                <Check className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              {message.text}
            </div>
          )}

          <div className="mt-6">
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving
                ? t("dashboard:settings.saving")
                : t("dashboard:settings.saveButton")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
