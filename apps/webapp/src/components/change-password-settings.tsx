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
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

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
    <div className="flex-1 overflow-y-auto bg-zinc-50 p-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8">
          <button
            onClick={() => onViewChange("settings")}
            className="mb-4 flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-800 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("dashboard:changePassword.backToSettings")}
          </button>
          <h1 className="text-2xl font-semibold text-zinc-900">
            {hasPassword
              ? t("dashboard:changePassword.changeTitle")
              : t("dashboard:changePassword.setTitle")}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {hasPassword
              ? t("dashboard:changePassword.changeSubtitle")
              : t("dashboard:changePassword.setSubtitle")}
          </p>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-6">
          {success ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                <Check className="h-6 w-6 text-green-600" />
              </div>
              <p className="text-sm font-medium text-zinc-900">
                {t("dashboard:changePassword.successMessage")}
              </p>
              <p className="text-sm text-zinc-500">
                {t("dashboard:changePassword.redirecting")}
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-700">
                  {t("dashboard:changePassword.newPasswordLabel")}
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-700">
                  {t("dashboard:changePassword.confirmPasswordLabel")}
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="space-y-1.5">
                <p className="text-sm font-medium text-zinc-700">
                  {t("dashboard:changePassword.requirements.title")}
                </p>
                {[
                  { met: hasMinLength, label: t("dashboard:changePassword.requirements.minLength") },
                  { met: hasUppercase, label: t("dashboard:changePassword.requirements.uppercase") },
                  { met: hasNumber, label: t("dashboard:changePassword.requirements.number") },
                  { met: passwordsMatch, label: t("dashboard:changePassword.requirements.match") },
                ].map(({ met, label }) => (
                  <div key={label} className="flex items-center gap-2 text-sm">
                    {met ? (
                      <Check className="h-4 w-4 text-green-600" />
                    ) : (
                      <X className="h-4 w-4 text-zinc-400" />
                    )}
                    <span className={met ? "text-green-700" : "text-zinc-500"}>
                      {label}
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-3 pt-1">
                <button
                  type="submit"
                  disabled={!isValid || saving}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors flex items-center gap-2"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {saving
                    ? t("dashboard:changePassword.updating")
                    : hasPassword
                      ? t("dashboard:changePassword.updateButton")
                      : t("dashboard:changePassword.setButton")}
                </button>
                <button
                  type="button"
                  onClick={() => onViewChange("settings")}
                  className="text-sm text-zinc-500 hover:text-zinc-800 transition-colors"
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
