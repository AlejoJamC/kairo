"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { apiCall, getDashboardUrl } from "@/lib/api-config";
import { createClient } from "@/lib/supabase/client";
import { useTranslation } from "@/lib/i18n";
import { WizardChrome } from "@/components/wizard-chrome";
import { WizardStepper } from "@/components/wizard-stepper";
import { Toggle } from "@/components/toggle";
import { AuthInput } from "@/components/auth-input";
import { Building2 } from "lucide-react";
import { DetectionStep } from "./detection-step";

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
  { label: "Facturación", count: 47, color: "var(--accent)" },
  { label: "API · Bugs", count: 38, color: "var(--danger)" },
  { label: "Configuración", count: 31, color: "var(--warning)" },
  { label: "Ventas", count: 24, color: "var(--success)" },
  { label: "Producto · Feedback", count: 18, color: "#A855F7" },
  { label: "Spam", count: 76, color: "var(--text-tertiary)" },
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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

  const steps = [t.wizard.stepConnect, t.wizard.stepDetect, t.wizard.stepTriage];

  if (profileLoading && (!showDetectionStep || !scanned)) {
    return (
      <WizardChrome>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", paddingTop: 80 }}>
          <Loader2 size={24} className="animate-spin" style={{ color: "var(--text-tertiary)" }} />
        </div>
      </WizardChrome>
    );
  }

  return (
    <WizardChrome>
      <WizardStepper steps={steps} current={localStep} />

      <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 14, padding: 40 }}>

        {/* ── Step 1: Detect (real-time) — flag ON only ──────────────────── */}
        {localStep === 1 && showDetectionStep && (
          <DetectionStep onContinue={() => setLocalStep(2)} />
        )}

        {/* ── Step 1: Detect (fake animation) — flag OFF only ───────────── */}
        {localStep === 1 && !showDetectionStep && (
          <>
            <h1
              style={{
                fontSize: 32, fontWeight: 600, letterSpacing: "-0.02em",
                margin: "0 0 12px", fontFamily: "var(--font-display)",
                color: "var(--text-primary)",
              }}
            >
              {scanned ? t.wizard.detectDoneTitle : t.wizard.detectScanningTitle}
            </h1>
            <p style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.6, margin: "0 0 28px" }}>
              {scanned ? t.wizard.detectDoneNote : t.wizard.detectScanningNote}
            </p>

            <div
              style={{
                display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
                gap: 1, background: "var(--border-subtle)",
                border: "1px solid var(--border)", borderRadius: 10,
                overflow: "hidden", marginBottom: 24,
              }}
            >
              {[
                { label: t.wizard.detectTickets, value: detected.tickets, color: "var(--accent)" },
                { label: t.wizard.detectThreads, value: detected.threads, color: "var(--success)" },
                { label: t.wizard.detectCustomers, value: detected.customers, color: "var(--warning)" },
              ].map((m) => (
                <div key={m.label} style={{ background: "white", padding: "20px 18px" }}>
                  <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {m.label}
                  </div>
                  <div style={{ fontSize: 32, fontWeight: 600, color: m.color, fontFamily: "var(--font-display)", letterSpacing: "-0.02em", marginTop: 4 }}>
                    {m.value}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginBottom: 8, fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--text-tertiary)", letterSpacing: "0.05em" }}>
              {t.wizard.detectCategories}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 28 }}>
              {STATIC_CATEGORIES.map((cat) => (
                <span key={cat.label} style={{ padding: "4px 10px", fontSize: 12, borderRadius: 999, border: "1px solid var(--border)", background: "white", display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: 999, background: cat.color, flexShrink: 0 }} />
                  {cat.label}
                  <span style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{cat.count}</span>
                </span>
              ))}
            </div>

            <button
              onClick={() => setLocalStep(2)}
              disabled={!scanned}
              style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "10px 18px", fontSize: 14, fontWeight: 500,
                background: scanned ? "var(--accent)" : "var(--border)",
                color: "white", border: "none", borderRadius: "var(--radius-input)",
                cursor: scanned ? "pointer" : "not-allowed",
                transition: "background 0.12s ease", fontFamily: "inherit",
              }}
              onMouseEnter={(e) => { if (scanned) e.currentTarget.style.background = "var(--accent-hover)"; }}
              onMouseLeave={(e) => { if (scanned) e.currentTarget.style.background = "var(--accent)"; }}
            >
              {scanned ? t.wizard.detectContinue : t.wizard.detectScanningTitle}
              {scanned && <ArrowRight size={14} strokeWidth={2} />}
              {!scanned && <Loader2 size={14} className="animate-spin" />}
            </button>
          </>
        )}

        {/* ── Step 2: Triage + company name ─────────────────────────────── */}
        {localStep === 2 && (
          <form onSubmit={handleSubmit}>
            <h1
              style={{
                fontSize: 32, fontWeight: 600, letterSpacing: "-0.02em",
                margin: "0 0 12px", fontFamily: "var(--font-display)",
                color: "var(--text-primary)",
              }}
            >
              {t.wizard.triageTitle}
            </h1>
            <p style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.6, margin: "0 0 28px" }}>
              {t.wizard.triageSubtitle}
            </p>

            {[
              { label: t.wizard.triageAutoClassify, desc: t.wizard.triageAutoClassifyDesc, defaultOn: true },
              { label: t.wizard.triageDraftReplies, desc: t.wizard.triageDraftRepliesDesc, defaultOn: true },
              { label: t.wizard.triageAutoResolveSpam, desc: t.wizard.triageAutoResolveSpamDesc, defaultOn: true },
              { label: t.wizard.triagePriorityPro, desc: t.wizard.triagePriorityProDesc, defaultOn: false },
            ].map((rule, i, arr) => (
              <div
                key={rule.label}
                style={{
                  display: "flex", alignItems: "center", gap: 14,
                  padding: "14px 0",
                  borderBottom: i < arr.length - 1 ? "1px solid var(--border-subtle)" : "none",
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 2, color: "var(--text-primary)" }}>{rule.label}</div>
                  <div style={{ fontSize: 13, color: "var(--text-tertiary)" }}>{rule.desc}</div>
                </div>
                <Toggle defaultOn={rule.defaultOn} />
              </div>
            ))}

            <div style={{ marginTop: 28, paddingTop: 24, borderTop: "1px solid var(--border-subtle)" }}>
              <AuthInput
                id="company"
                label={t.wizard.companyLabel}
                placeholder={t.wizard.companyPlaceholder}
                icon={<Building2 size={14} color="var(--text-tertiary)" strokeWidth={1.6} />}
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                required
                autoComplete="organization"
              />
            </div>

            {error && (
              <p style={{ marginTop: 12, fontSize: 13, color: "var(--danger)" }}>{error}</p>
            )}

            <div style={{ marginTop: 28, display: "flex", gap: 8, alignItems: "center" }}>
              <button
                type="submit"
                disabled={saving || !companyName.trim()}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  padding: "10px 18px", fontSize: 14, fontWeight: 500,
                  background: saving || !companyName.trim() ? "var(--border)" : "var(--accent)",
                  color: "white", border: "none", borderRadius: "var(--radius-input)",
                  cursor: saving || !companyName.trim() ? "not-allowed" : "pointer",
                  transition: "background 0.12s ease", fontFamily: "inherit",
                }}
                onMouseEnter={(e) => { if (!saving && companyName.trim()) e.currentTarget.style.background = "var(--accent-hover)"; }}
                onMouseLeave={(e) => { if (!saving && companyName.trim()) e.currentTarget.style.background = "var(--accent)"; }}
              >
                {saving ? (
                  <><Loader2 size={14} className="animate-spin" />{t.wizard.saving}</>
                ) : (
                  <>{t.wizard.openCockpit}<ArrowRight size={14} strokeWidth={2} /></>
                )}
              </button>
              <button
                type="button"
                onClick={() => redirectToDashboard()}
                style={{
                  fontSize: 13, color: "var(--text-secondary)", background: "none",
                  border: "none", cursor: "pointer", padding: "10px 12px", fontFamily: "inherit",
                }}
              >
                {t.wizard.skipConfig}
              </button>
            </div>
          </form>
        )}
      </div>
    </WizardChrome>
  );
}
