"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { apiCall, getDashboardUrl } from "@/lib/api-config";
import { createClient } from "@/lib/supabase/client";
import { useTranslation } from "@/lib/i18n";
import { WizardChrome } from "@/components/wizard-chrome";
import { WizardSteps } from "@/components/wizard-steps";
import { DetectionStep } from "./detection-step";
import { TriageSummary } from "./triage-summary";
import { WizardHeading } from "@/components/wizard-heading";
import { Box, Button, Callout, CategoryChip, Field, FieldInput, Icon, KpiStrip, SettingsRow, Spinner, Switch, Text } from "@kairo/ui";

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
const SCAN_TARGETS = { mails: 234, tickets: 89, customers: 47 };

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
  const [detected, setDetected] = useState({ mails: 0, tickets: 0, customers: 0 });
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
        mails: Math.round(SCAN_TARGETS.mails * ease),
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

  const w = t.wizard;
  const ruleRows = [
    { id: "classify", name: w.triageAutoClassify, description: w.triageAutoClassifyDesc },
    { id: "drafts", name: w.triageDraftReplies, description: w.triageDraftRepliesDesc },
    { id: "spam", name: w.triageAutoResolveSpam, description: w.triageAutoResolveSpamDesc },
    { id: "priority", name: w.triagePriorityPro, description: w.triagePriorityProDesc },
  ] as const;

  return (
    <WizardChrome
      stepper={<WizardSteps current={localStep === 1 ? "detect" : "triage"} />}
      width={localStep === 1 ? 760 : 540}
      gap={localStep === 1 ? 32 : 28}
      aside={localStep === 2 ? <TriageSummary /> : undefined}
    >
      {/* ── Step 1: Detect (real-time) — flag ON only ──────────────────── */}
      {localStep === 1 && showDetectionStep && <DetectionStep onContinue={() => setLocalStep(2)} />}

      {/* ── Step 1: Detect (fake animation) — flag OFF only ───────────── */}
      {localStep === 1 && !showDetectionStep && (
        <>
          <WizardHeading
            eyebrow={w.stepOf2}
            title={scanned ? w.detectDoneTitle : w.detectScanningTitle}
            body={scanned ? w.detectDoneNote : w.detectScanningNote}
          />

          <KpiStrip
            items={[
              { label: w.detectMails, value: detected.mails },
              { label: w.detectTickets, value: detected.tickets },
              { label: w.detectCustomers, value: detected.customers },
            ]}
          />

          <Box display="flex" flexDirection="column" gap={10}>
            <Text tag="span" display="block" font="mono" fontSize={10.5} letterSpacing={0.63} textTransform="uppercase" color="var(--kairo-color-faint)">
              {w.detectCategories}
            </Text>
            <Box display="flex" gap={6} flexWrap="wrap">
              {STATIC_CATEGORIES.map((cat) => (
                <CategoryChip key={cat.label} scale="category" value={cat.value} label={`${cat.label} ${cat.count}`} />
              ))}
            </Box>
          </Box>

          <Box display="flex" flexWrap="wrap" alignItems="center" gap={14} borderTopWidth={1} borderStyle="solid" borderTopColor="var(--kairo-color-line)" paddingTop={24}>
            <Button
              variant="primary"
              size="webLg"
              disabled={!scanned}
              loading={!scanned}
              loadingLabel={w.detect.classifying}
              iconEnd={<Icon name="right" size={14} color="var(--kairo-color-on-accent)" />}
              onPress={() => setLocalStep(2)}
            >
              {w.detectContinue}
            </Button>
            <Text fontSize={12.5} color="var(--kairo-color-faint)">
              {w.detect.rangeNote}
            </Text>
          </Box>
        </>
      )}

      {/* ── Step 2: Triage + company name ─────────────────────────────── */}
      {localStep === 2 && (
        <>
          <WizardHeading eyebrow={w.stepOf3} title={w.triageTitle} body={w.triageSubtitle} />

          <Box borderWidth={1} borderStyle="solid" borderColor="var(--kairo-color-line)" borderRadius={12} backgroundColor="var(--kairo-color-surface)" overflow="hidden">
            <Box paddingVertical={12} paddingHorizontal={16}>
              <Text font="mono" fontSize={10.5} letterSpacing={0.63} textTransform="uppercase" color="var(--kairo-color-faint)">
                {w.rulesLabel}
              </Text>
            </Box>
            {ruleRows.map((rule) => (
              <SettingsRow key={rule.id} title={rule.name} description={rule.description} divider>
                <Switch label={rule.name} checked={rules[rule.id]} onCheckedChange={(checked) => setRules((current) => ({ ...current, [rule.id]: checked }))} />
              </SettingsRow>
            ))}
          </Box>

          <Field label={w.companyLabel} size="web">
            <FieldInput value={companyName} onChangeText={setCompanyName} placeholder={w.companyPlaceholder} autoComplete="organization" />
          </Field>

          <Callout tone="ai" icon={<Icon name="spark" size={14} />}>
            {w.aiCallout}
          </Callout>

          {error && (
            <Text tag="p" role="alert" display="block" margin={0} fontSize={13} color="var(--kairo-color-bad-ink)">
              {error}
            </Text>
          )}

          <Box display="flex" flexWrap="wrap" alignItems="center" gap={10}>
            <Button
              variant="primary"
              size="webLg"
              disabled={!companyName.trim()}
              loading={saving}
              loadingLabel={w.saving}
              iconEnd={<Icon name="right" size={14} color="var(--kairo-color-on-accent)" />}
              onPress={handleSubmit}
            >
              {w.openTriage}
            </Button>
            <Button variant="ghost" size="webLg" onPress={() => redirectToDashboard()}>
              {w.configureLater}
            </Button>
          </Box>
        </>
      )}
    </WizardChrome>
  );
}
