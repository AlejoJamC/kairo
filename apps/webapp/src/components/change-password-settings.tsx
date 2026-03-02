import { useState } from "react";
import { ArrowLeft, Check, X, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { createClient } from "@/lib/supabase/client";
import type { AppView } from "@/types";

interface Props {
  onViewChange: (view: AppView) => void;
}

export function ChangePasswordSettings({ onViewChange }: Props) {
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
      setError("Failed to update password. Please try again.");
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
            Back to Settings
          </button>
          <h1 className="text-2xl font-semibold text-zinc-900">
            {hasPassword ? "Change Password" : "Set Password"}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {hasPassword
              ? "Update your email/password login credentials"
              : "Add a password to enable email/password login"}
          </p>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-6">
          {success ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                <Check className="h-6 w-6 text-green-600" />
              </div>
              <p className="text-sm font-medium text-zinc-900">
                Password updated successfully
              </p>
              <p className="text-sm text-zinc-500">
                Redirecting back to settings…
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
                  New Password
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
                  Confirm Password
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
                  Password must contain:
                </p>
                {[
                  { met: hasMinLength, label: "At least 8 characters" },
                  { met: hasUppercase, label: "One uppercase letter" },
                  { met: hasNumber, label: "One number" },
                  { met: passwordsMatch, label: "Passwords match" },
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
                    ? "Updating…"
                    : hasPassword
                      ? "Update Password"
                      : "Set Password"}
                </button>
                <button
                  type="button"
                  onClick={() => onViewChange("settings")}
                  className="text-sm text-zinc-500 hover:text-zinc-800 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
