"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { apiCall, getDashboardUrl } from "@/lib/api-config";
import { createClient } from "@/lib/supabase/client";
import { useTranslation } from "@/lib/i18n";
import { WizardChrome } from "@/components/wizard-chrome";
import { WizardSteps } from "@/components/wizard-steps";
import { DetectionStep } from "./detection-step";
import { TriageStep } from "./triage-step";
import { WizardHeading } from "@/components/wizard-heading";
import { WizardSectionLabel } from "@/components/wizard-section-label";
import { Box, Button, CategoryChip, Icon, KpiStrip, Spinner } from "@kairo/ui";

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
const SCAN_TARGETS = { mails: 234, tickets: 89, urgent: 2 };

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
  const [user, setUser] = useState<UserData | null>(null);
  const [askName, setAskName] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [profileLoading, setProfileLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fake scan animation state (flag OFF only)
  const [scanned, setScanned] = useState(false);
  const [detected, setDetected] = useState({ mails: 0, tickets: 0, urgent: 0 });
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
            else setAskName(true);
          } else {
            setAskName(true);
          }
        } catch {
          // non-fatal: the name is asked for on the last step
          setAskName(true);
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
        urgent: Math.round(SCAN_TARGETS.urgent * ease),
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

  if (profileLoading && (!showDetectionStep || !scanned)) {
    return (
      <WizardChrome>
        <Box display="flex" alignItems="center" justifyContent="center" paddingTop={80}>
          <Spinner size="lg" />
        </Box>
      </WizardChrome>
    );
  }

  if (localStep === 2) {
    return <TriageStep onOpen={handleSubmit} saving={saving} error={error} askName={askName} companyName={companyName} onCompanyName={setCompanyName} />;
  }

  const w = t.wizard;

  return (
    <WizardChrome stepper={<WizardSteps current="detect" />} width={760}>
      {/* ── Step 1: Detect (real-time) — flag ON only ──────────────────── */}
      {showDetectionStep && <DetectionStep onContinue={() => setLocalStep(2)} mailbox={user?.email} />}

      {/* ── Step 1: Detect (fake animation) — flag OFF only ───────────── */}
      {!showDetectionStep && (
        <>
          <WizardHeading
            eyebrow={user?.email ? `${w.stepOf2} · ${user.email}` : w.stepOf2}
            title={scanned ? w.detectDoneTitle : w.detectScanningTitle}
            body={scanned ? w.detectDoneNote : w.detectScanningNote}
          />

          <Box>
            <Button
              variant="primary"
              size="webLg"
              disabled={!scanned}
              loading={!scanned}
              loadingLabel={w.detect.classifying}
              iconEnd={<Icon name="right" size={14} color="var(--kairo-color-on-accent)" />}
              onPress={() => setLocalStep(2)}
            >
              {w.detect.continue}
            </Button>
          </Box>

          <KpiStrip
            items={[
              { label: w.detect.metricMails, value: detected.mails },
              { label: w.detect.metricTickets, value: detected.tickets },
              { label: w.detect.metricUrgent, value: detected.urgent, urgent: detected.urgent > 0 },
            ]}
          />

          <Box display="flex" flexDirection="column" gap={10}>
            <WizardSectionLabel>{w.detect.metricCategories}</WizardSectionLabel>
            <Box display="flex" gap={6} flexWrap="wrap">
              {STATIC_CATEGORIES.map((cat) => (
                <CategoryChip key={cat.label} scale="category" value={cat.value} label={`${cat.label.toLowerCase()} ${cat.count}`} />
              ))}
            </Box>
          </Box>
        </>
      )}
    </WizardChrome>
  );
}
