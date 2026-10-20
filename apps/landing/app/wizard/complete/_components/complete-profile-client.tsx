"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { apiCall, getDashboardUrl } from "@/lib/api-config";
import { createClient } from "@/lib/supabase/client";
import { useTranslation } from "@/lib/i18n";
import { WizardChrome } from "@/components/wizard-chrome";
import { WizardSteps } from "@/components/wizard-steps";
import { DetectionStep } from "./detection-step";
import { Box, Button, CategoryChip, Field, FieldInput, Icon, KpiStrip, PermissionList, Spinner, Text } from "@kairo/ui";

interface UserData {
  id: string;
  email: string;
  name: string;
  company_name?: string;
}

interface Props {
  showDetectionStep: boolean;
}

// Fake scan animation constants (used only when showDetectionStep=false is toggled off — kept for reference)
const SCAN_DURATION = 1800;
const SCAN_TARGETS = { tickets: 234, threads: 89, customers: 47 };

const STATIC_CATEGORIES = [
  { label: "Facturación", count: 47, value: "billing" },
  { label: "API · Bugs", count: 38, value: "technical" },
  { label: "Configuración", count: 31, value: "account" },
  { label: "Ventas", count: 24, value: "general" },
  { label: "Producto · Feedback", count: 18, value: "general" },
  { label: "Spam", count: 76, value: "not_applicable" },
];

async function redirectToDashboard() {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const dashboardUrl = getDashboardUrl();
  if (session?.access_token && session?.refresh_token) {
    const hash = `#access_token=${encodeURIComponent(session.access_token)}&refresh_token=${encodeURIComponent(session.refresh_token)}`;
    window.location.href = `${dashboardUrl}${hash}`;
  } else {
    window.location.href = dashboardUrl;
  }
}

// KAI-206 (C1): the OAuth callback can race with the browser's cookie
// installation when redirecting through @supabase/auth-helpers-nextjs. A
// transient 401 on the first /bff/auth/me call doesn't necessarily mean the
// user is unauthenticated — it can mean cookies haven't propagated yet. We
// retry with a short backoff before treating it as a real auth failure. Once
// KAI-207 ships (@supabase/ssr migration) this retry should never trigger.
async function fetchMeWithRetry(): Promise<Response> {
  const BACKOFFS_MS = [0, 500, 1000];
  let lastRes: Response | null = null;
  for (let i = 0; i < BACKOFFS_MS.length; i++) {
    if (BACKOFFS_MS[i] > 0) {
      await new Promise((resolve) => setTimeout(resolve, BACKOFFS_MS[i]));
    }
    lastRes = await apiCall("/bff/auth/me");
    if (lastRes.ok) return lastRes;
    if (lastRes.status !== 401) return lastRes;
  }
  return lastRes!;
}

export function CompleteProfileClient({ showDetectionStep }: Props) {
  const router = useRouter();
  const { t } = useTranslation();
  // When showDetectionStep=true: start at step 1 (detect); false: start at step 2 (triage)
  const [localStep, setLocalStep] = useState(showDetectionStep ? 1 : 2);
  const [, setUser] = useState<UserData | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [profileLoading, setProfileLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fake scan animation state (flag OFF only)
  const [scanned, setScanned] = useState(false);
  const [detected, setDetected] = useState({ tickets: 0, threads: 0, customers: 0 });
  const rafRef = useRef<number>(0);

  // Load user profile + pre-fill organisation name from the provisioned account
  useEffect(() => {
    fetchMeWithRetry()
      .then((res) => {
        if (!res.ok) { router.push("/wizard/"); return null; }
        return res.json();
      })
      .then(async (data) => {
        if (!data) return;
        setUser(data.user);

        // If the user already completed the wizard (company_name set) skip it
        if (data.user.company_name) {
          redirectToDashboard();
          return;
        }

        // Pre-fill with the account name that was provisioned during OAuth
        // (derived from Google display name / email prefix). The user can edit it.
        try {
          const accRes = await apiCall("/bff/account/current");
          if (accRes.ok) {
            const acc = await accRes.json();
            if (acc.name) setCompanyName(acc.name);
          }
        } catch {
          // non-fatal: input stays empty, user types manually
        }

        setProfileLoading(false);
      })
      .catch(() => {
        setError("Failed to load profile. Please try again.");
        setProfileLoading(false);
      });
  }, [router]);

  // Fake scan animation — only when detection step flag is OFF
  useEffect(() => {
    if (showDetectionStep) return;
    const start = Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(1, elapsed / SCAN_DURATION);
      const ease = 1 - Math.pow(1 - progress, 3);
      setDetected({
        tickets: Math.round(SCAN_TARGETS.tickets * ease),
        threads: Math.round(SCAN_TARGETS.threads * ease),
        customers: Math.round(SCAN_TARGETS.customers * ease),
      });
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setScanned(true);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [showDetectionStep]);

  const handleSubmit = async () => {
    if (!companyName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      // (A) Update accounts.name — the authoritative organisation name
      const accRes = await apiCall("/bff/account/name", {
        method: "PATCH",
        body: JSON.stringify({ name: companyName }),
      });
      if (!accRes.ok) throw new Error("account_name_update_failed");

      // (B) Sync profiles.company_name — used as the "wizard completed" signal
      //     and as a personal data point for the user record
      await apiCall("/bff/user/profile", {
        method: "PATCH",
        body: JSON.stringify({ company_name: companyName }),
      });

      await redirectToDashboard();
    } catch {
      setError("Failed to save. Please try again.");
      setSaving(false);
    }
  };

  const [rules, setRules] = useState({ classify: true, drafts: true, spam: true, priority: false });

  if (profileLoading && (!showDetectionStep || !scanned)) {
    return (
      <WizardChrome>
        <Box display="flex" alignItems="center" justifyContent="center" paddingTop={80}>
          <Spinner size="lg" />
        </Box>
      </WizardChrome>
    );
  }

  return (
    <WizardChrome stepper={<WizardSteps current={localStep === 1 ? "detect" : "triage"} />}>
      <Box backgroundColor="var(--kairo-color-surface)" borderWidth={1} borderStyle="solid" borderColor="var(--kairo-color-line)" borderRadius={14} padding={40}>

        {/* ── Step 1: Detect (real-time) — flag ON only ──────────────────── */}
        {localStep === 1 && showDetectionStep && (
          <DetectionStep onContinue={() => setLocalStep(2)} />
        )}

        {/* ── Step 1: Detect (fake animation) — flag OFF only ───────────── */}
        {localStep === 1 && !showDetectionStep && (
          <>
            <Text tag="h1" display="block" fontSize={32} fontWeight={600} letterSpacing={-0.64} marginTop={0} marginHorizontal={0} marginBottom={12} font="display" color="var(--kairo-color-text)">
              {scanned ? t.wizard.detectDoneTitle : t.wizard.detectScanningTitle}
            </Text>
            <Text tag="p" display="block" fontSize={15} color="var(--kairo-color-muted)" lineHeightRatio={1.6} marginTop={0} marginHorizontal={0} marginBottom={28}>
              {scanned ? t.wizard.detectDoneNote : t.wizard.detectScanningNote}
            </Text>

            <Box marginBottom={24}>
              <KpiStrip
                items={[
                  { label: t.wizard.detectTickets, value: detected.tickets },
                  { label: t.wizard.detectThreads, value: detected.threads },
                  { label: t.wizard.detectCustomers, value: detected.customers },
                ]}
              />
            </Box>

            <Text tag="div" display="block" marginBottom={8} fontSize={12} font="mono" color="var(--kairo-color-faint)" letterSpacing={0.6}>
              {t.wizard.detectCategories}
            </Text>
            <Box display="flex" gap={6} flexWrap="wrap" marginBottom={28}>
              {STATIC_CATEGORIES.map((cat) => (
                <CategoryChip key={cat.label} scale="category" value={cat.value} label={`${cat.label} ${cat.count}`} />
              ))}
            </Box>

            <Button
              variant="primary"
              size="web"
              disabled={!scanned}
              loading={!scanned}
              loadingLabel={t.wizard.detectScanningTitle}
              iconEnd={<Icon name="right" size={14} color="var(--kairo-color-on-accent)" />}
              onPress={() => setLocalStep(2)}
            >
              {t.wizard.detectContinue}
            </Button>
          </>
        )}

        {/* ── Step 2: Triage + company name ─────────────────────────────── */}
        {localStep === 2 && (
          <Box>
            <Text tag="h1" display="block" fontSize={32} fontWeight={600} letterSpacing={-0.64} marginTop={0} marginHorizontal={0} marginBottom={12} font="display" color="var(--kairo-color-text)">
              {t.wizard.triageTitle}
            </Text>
            <Text tag="p" display="block" fontSize={15} color="var(--kairo-color-muted)" lineHeightRatio={1.6} marginTop={0} marginHorizontal={0} marginBottom={28}>
              {t.wizard.triageSubtitle}
            </Text>

            <PermissionList
              label={t.wizard.rulesLabel}
              requirementLabels={{ required: t.wizard.ruleRequired, optional: t.wizard.ruleOptional }}
              onChange={(id, checked) => setRules((current) => ({ ...current, [id]: checked }))}
              items={[
                { id: "classify", name: t.wizard.triageAutoClassify, description: t.wizard.triageAutoClassifyDesc, checked: rules.classify },
                { id: "drafts", name: t.wizard.triageDraftReplies, description: t.wizard.triageDraftRepliesDesc, checked: rules.drafts },
                { id: "spam", name: t.wizard.triageAutoResolveSpam, description: t.wizard.triageAutoResolveSpamDesc, checked: rules.spam },
                { id: "priority", name: t.wizard.triagePriorityPro, description: t.wizard.triagePriorityProDesc, checked: rules.priority },
              ]}
            />

            <Box marginTop={28} paddingTop={24} borderTopWidth={1} borderStyle="solid" borderTopColor="var(--kairo-color-line)">
              <Field label={t.wizard.companyLabel} size="web">
                <FieldInput value={companyName} onChangeText={setCompanyName} placeholder={t.wizard.companyPlaceholder} autoComplete="organization" />
              </Field>
            </Box>

            {error && (
              <Text tag="p" role="alert" display="block" marginTop={12} fontSize={13} color="var(--kairo-color-bad-ink)">{error}</Text>
            )}

            <Box marginTop={28} display="flex" gap={8} alignItems="center">
              <Button
                variant="primary"
                size="web"
                disabled={!companyName.trim()}
                loading={saving}
                loadingLabel={t.wizard.saving}
                iconEnd={<Icon name="right" size={14} color="var(--kairo-color-on-accent)" />}
                onPress={handleSubmit}
              >
                {t.wizard.openCockpit}
              </Button>
              <Button variant="ghost" size="web" onPress={() => redirectToDashboard()}>
                {t.wizard.skipConfig}
              </Button>
            </Box>
          </Box>
        )}
      </Box>
    </WizardChrome>
  );
}
