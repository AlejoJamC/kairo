import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@kairo/client-core/auth";
import { updatePassword } from "@kairo/client-core/queries";
import type { AppView } from "@/types";
import { Box, Button, Field, FieldInput, Icon, Pressable, Text } from "@kairo/ui";

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
    <Box flexGrow={1} flexShrink={1} flexBasis="0%" scroll backgroundColor="var(--k-surface)" padding={32}>
      <Box maxWidth={640} marginVertical={0} marginHorizontal="auto">

        {/* Back + title */}
        <Box marginBottom={28}>
          <Pressable onClick={() => onViewChange("settings")} display="flex" alignItems="center" gap={6} fontSize={13} color="var(--k-text-tertiary)" backgroundColor="transparent" borderWidth={0} cursor="pointer" marginBottom={12} padding={0}>
            <Icon name="back" size={14} />
            {t("dashboard:changePassword.backToSettings")}
          </Pressable>
          <Text tag="h1" fontSize={22} fontWeight={600} letterSpacing={-0.22} color="var(--k-text-primary)" font="display" margin={0} display="block">
            {hasPassword
              ? t("dashboard:changePassword.changeTitle")
              : t("dashboard:changePassword.setTitle")}
          </Text>
          <Text tag="p" marginTop={4} fontSize={13} color="var(--k-text-tertiary)" display="block">
            {hasPassword
              ? t("dashboard:changePassword.changeSubtitle")
              : t("dashboard:changePassword.setSubtitle")}
          </Text>
        </Box>

        <Box padding={24} borderWidth={1} borderStyle="solid" borderColor="var(--k-border)" borderRadius={12} backgroundColor="white" boxShadow="var(--kairo-shadow-xs)">
          {success ? (
            <Text tag="div" display="flex" flexDirection="column" alignItems="center" gap={12} paddingVertical={32} paddingHorizontal={0} textAlign="center">
              <Box width={48} height={48} borderRadius={999} backgroundColor="color-mix(in srgb, var(--kairo-color-ok) 8%, transparent)" display="flex" alignItems="center" justifyContent="center">
                <Icon name="check" size={22} color="var(--kairo-color-ok)" />
              </Box>
              <Text tag="p" fontSize={14} fontWeight={500} color="var(--k-text-primary)" display="block">
                {t("dashboard:changePassword.successMessage")}
              </Text>
              <Text tag="p" fontSize={13} color="var(--k-text-tertiary)" display="block">
                {t("dashboard:changePassword.redirecting")}
              </Text>
            </Text>
          ) : (
            <Box tag="form" onSubmit={handleSubmit} display="flex" flexDirection="column" gap={16}>
              {error && (
                <Text tag="div" borderRadius={6} backgroundColor="var(--kairo-color-bad-soft)" borderWidth={1} borderColor="var(--kairo-color-bad-line)" paddingVertical={8} paddingHorizontal={12} fontSize={13} color="var(--kairo-color-bad-ink)" display="block" borderStyle="solid">
                  {error}
                </Text>
              )}

              <Field label={t("dashboard:changePassword.newPasswordLabel")}>
                <FieldInput secureTextEntry value={password} onChangeText={setPassword} placeholder="••••••••" />
              </Field>

              <Field label={t("dashboard:changePassword.confirmPasswordLabel")}>
                <FieldInput secureTextEntry value={confirmPassword} onChangeText={setConfirmPassword} placeholder="••••••••" />
              </Field>

              {/* Requirements */}
              <Box display="flex" flexDirection="column" gap={6}>
                <Text tag="p" fontSize={13} fontWeight={500} color="var(--k-text-secondary)" display="block">
                  {t("dashboard:changePassword.requirements.title")}
                </Text>
                {[
                  { met: hasMinLength, label: t("dashboard:changePassword.requirements.minLength") },
                  { met: hasUppercase, label: t("dashboard:changePassword.requirements.uppercase") },
                  { met: hasNumber,    label: t("dashboard:changePassword.requirements.number") },
                  { met: passwordsMatch, label: t("dashboard:changePassword.requirements.match") },
                ].map(({ met, label }) => (
                  <Text tag="div" key={label} display="flex" alignItems="center" gap={8} fontSize={13}>
                    {met
                      ? <Icon name="check" size={14} color="var(--kairo-color-ok)" />
                      : <Icon name="x" size={14} color="var(--k-text-tertiary)" />}
                    <Text color={met ? "var(--kairo-color-ok-ink)" : "var(--k-text-tertiary)"}>{label}</Text>
                  </Text>
                ))}
              </Box>

              {/* Actions */}
              <Box display="flex" alignItems="center" gap={12} paddingTop={4}>
                <Button
                  variant="primary"
                  loading={saving}
                  loadingLabel={t("dashboard:changePassword.updating")}
                  disabled={!isValid}
                  onPress={handleSubmit}
                >
                  {hasPassword ? t("dashboard:changePassword.updateButton") : t("dashboard:changePassword.setButton")}
                </Button>
                <Pressable type="button" onClick={() => onViewChange("settings")} fontSize={13} color="var(--k-text-tertiary)" backgroundColor="transparent" borderWidth={0} cursor="pointer">
                  {t("common:cancel")}
                </Pressable>
              </Box>
            </Box>
          )}
        </Box>

      </Box>
    </Box>
  );
}
