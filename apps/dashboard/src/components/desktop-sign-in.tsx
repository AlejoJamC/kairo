// Sign-in window of the desktop app: shown when there is no session. Google is
// confirmed in the system browser (the app opens by itself when it finishes);
// email and password sign in here.

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@kairo/client-core/auth";
import { getPlatform } from "@kairo/client-core/config";
import { copyText, openLanding, startGoogleSignIn } from "@kairo/client-core/endpoints";
import { AuthCard, AuthHeader, AuthLayout, Box, Field, FieldInput, GoogleMark, Icon, Pressable, Text, WindowControlsSlot, useWindowChrome } from "@kairo/ui";
import { APP_WINDOW_HEIGHT, APP_WINDOW_MIN_HEIGHT, appWindowMinWidth, appWindowWidth } from "@/lib/desktop-window";
import { useContentHeight } from "@/hooks/useContentHeight";
import { LanguageSwitcher } from "@/components/language-switcher";

export function DesktopSignIn() {
  const { t } = useTranslation(["auth"]);
  const { signInWithPassword } = useAuth();
  const macosWindow = useWindowChrome();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [signInUrl, setSignInUrl] = useState<string | null>(null);


  // The sign-in window is as tall as its content: the bar, the card and the space around it. The app takes the large window once there is a session.
  const SIGN_IN_WIDTH = 520;
  const BAR_AND_SPACE = 44 + 80;
  const contentRef = useContentHeight<HTMLDivElement>((height) => {
    const total = height + BAR_AND_SPACE;
    getPlatform().host?.setWindowSize(SIGN_IN_WIDTH, total, 440, total);
  });
  useEffect(
    () => () => {
      const collapsed = getPlatform().storage.getItem("sidebar-collapsed") === "true";
      getPlatform().host?.setWindowSize(appWindowWidth(), APP_WINDOW_HEIGHT, appWindowMinWidth(collapsed), APP_WINDOW_MIN_HEIGHT);
    },
    [],
  );

  const submit = async () => {
    setLoading(true);
    setError(null);
    const failure = await signInWithPassword(email, password);
    // On success the session arrives through the auth provider and this view goes away.
    if (failure) {
      setError(failure === "invalid" ? t("auth:desktop.errorInvalid") : t("auth:desktop.errorUnexpected"));
      setLoading(false);
    }
  };

  const continueInBrowser = () => {
    setError(null);
    setCopied(false);
    setWaiting(true);
    void startGoogleSignIn().then(setSignInUrl).catch(() => {
      setWaiting(false);
      setError(t("auth:desktop.errorUnexpected"));
    });
  };

  const copyLink = () => {
    if (signInUrl) void copyText(signInUrl).then(() => setCopied(true));
  };

  return (
    <AuthLayout header={<AuthHeader desktop={{ controls: macosWindow ? <WindowControlsSlot /> : null }} language={<LanguageSwitcher plain />} />}>
      <Box ref={contentRef}>
      <AuthCard
        mark={
          <Box width={40} height={40} borderRadius={10} display="flex" alignItems="center" justifyContent="center" backgroundColor="var(--kairo-color-accent)">
            <Icon name="zap" size={20} color="var(--kairo-color-on-accent)" strokeWidth={2.4} label={t("auth:desktop.markLabel")} />
          </Box>
        }
        title={t("auth:desktop.title")}
        subtitle={t("auth:desktop.subtitle")}
        providers={[{ id: "google", label: t("auth:desktop.google"), icon: <GoogleMark />, onPress: continueInBrowser }]}
        dividerLabel={t("auth:desktop.emailDivider")}
        aside={
          <Box alignItems="flex-end">
            <Pressable onClick={() => openLanding("/set-password")} fontSize={12} color="var(--kairo-color-accent)">
              {t("auth:desktop.forgot")}
            </Pressable>
          </Box>
        }
        error={error ?? undefined}
        submitLabel={t("auth:desktop.submit")}
        loading={loading}
        loadingLabel={t("auth:desktop.submitting")}
        submitDisabled={!email || !password}
        submitKey="↵"
        onSubmit={submit}
        wait={
          waiting
            ? {
                title: t("auth:desktop.waitTitle"),
                body: t("auth:desktop.waitBody"),
                copyLabel: t("auth:desktop.copyLink"),
                copiedLabel: t("auth:desktop.linkCopied"),
                copied,
                onCopy: copyLink,
                cancelLabel: t("auth:desktop.cancel"),
                onCancel: () => setWaiting(false),
              }
            : undefined
        }
        footer={
          <Text fontSize={12.5} color="var(--kairo-color-faint)">
            {t("auth:desktop.noteBefore")}{" "}
            <Pressable onClick={() => openLanding("/")} color="var(--kairo-color-accent)" fontSize={12.5}>
              {t("auth:desktop.noteLink")}
            </Pressable>
            {t("auth:desktop.noteAfter")}
          </Text>
        }
      >
        <Field label={t("auth:desktop.emailLabel")} size="web">
          <FieldInput value={email} onChangeText={setEmail} placeholder={t("auth:desktop.emailPlaceholder")} autoComplete="username" inputMode="email" readOnly={loading} />
        </Field>
        <Field label={t("auth:desktop.passwordLabel")} size="web">
          <FieldInput secureTextEntry value={password} onChangeText={setPassword} placeholder="••••••••" autoComplete="current-password" readOnly={loading} />
        </Field>
      </AuthCard>
      </Box>
    </AuthLayout>
  );
}
