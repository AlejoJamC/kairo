import { createContext, useContext, useEffect, useRef, useState } from "react";
import { createClient } from "./supabase";
import { getLandingUrl, redirectToSignIn } from "./api-client";
import { completeOnboarding as completeOnboardingRequest, markOnboardingOffered } from "./endpoints";
import { retryWithBackoff } from "./retry";
import { getClientConfig, getPlatform, isDesktop } from "./config";
import type { User } from "@supabase/supabase-js";

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  company_name?: string;
  // gmail_connected removed in KAI-173 — use support_channels presence instead
}

/**
 * An owner who has not finished the onboarding is offered it over the dashboard. Accounts that
 * predate the completion record count as finished when the owner's profile has a company name,
 * except on a local test stack (`localReplay`), where the company name does not count so the
 * onboarding can be replayed with the same account.
 */
export function ownerNeedsOnboarding(
  role: string | null,
  companyName: string | null | undefined,
  onboardingCompletedAt: string | null,
  localReplay = false,
): boolean {
  return role === "owner" && !onboardingCompletedAt && (localReplay || !companyName?.trim());
}

/** Names a failed password sign-in without exposing the provider's text. */
export function classifySignInError(message: string): "invalid" | "unexpected" {
  return message.includes("Invalid login credentials") ? "invalid" : "unexpected";
}

export type DashboardRole = 'owner' | 'admin' | 'supervisor' | 'agent';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  userRole: DashboardRole | null;
  accountId: string | null;   // active account — send as x-account-id header to API
  isAdmin: boolean;
  loading: boolean;
  /** Email and password sign-in; the error names what failed, never the provider's text. */
  signInWithPassword: (email: string, password: string) => Promise<"invalid" | "unexpected" | null>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  /** The owner has not finished or skipped the onboarding; the dashboard offers it as an overlay. */
  onboardingPending: boolean;
  /** Records the industry and business context (or their omission) and finishes the onboarding. */
  completeOnboarding: (settings: { industry: string | null; businessContext: string }) => Promise<boolean>;
  /** Changes whenever the account's own data (industry, business context) is rewritten by the session, so open views read it again. */
  accountRevision: number;
  /** Records, once per session, that the setup was shown: the evidence that lets the pipeline settle an unanswered choice. */
  recordOnboardingOffered: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [userRole, setUserRole] = useState<DashboardRole | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [onboardingPending, setOnboardingPending] = useState(false);
  const [accountRevision, setAccountRevision] = useState(0);
  const authVersion = useRef(0);

  const isAdmin = userRole === 'owner' || userRole === 'admin' || userRole === 'supervisor';

  useEffect(() => {
    let cancelled = false;
    let initializing = true;
    const version = ++authVersion.current;
    const supabase = createClient();
    const diagnostic = (stage: string) => getPlatform().host?.authDiagnostic?.(stage);

    const init = async () => {
      try {
        // A new sign-in must take precedence over any older stored session.
        const handoffTokens = await getPlatform().authHandoff.takeHandoffTokens();
        diagnostic(handoffTokens ? "handoff_received" : "handoff_missing");
        if (cancelled || version !== authVersion.current) return;
        const { data: { session }, error } = handoffTokens
          ? await supabase.auth.setSession(handoffTokens)
          : await supabase.auth.getSession();
        if (cancelled || version !== authVersion.current) return;
        if (error || !session) {
          diagnostic("session_unavailable");
          setLoading(false);
          redirectToSignIn();
          return;
        }

        // A cached session is not proof that the server still accepts it.
        const { data: { user: verifiedUser }, error: userError } = await supabase.auth.getUser();
        if (cancelled || version !== authVersion.current) return;
        if (userError || !verifiedUser || verifiedUser.id !== session.user.id) {
          diagnostic("user_verification_failed");
          setLoading(false);
          redirectToSignIn();
          return;
        }
        setUser(verifiedUser);
        diagnostic("session_verified");
        fetchProfile(verifiedUser.id, version).catch(() => console.error("[auth] Profile lookup failed"));
      } catch {
        diagnostic("initialization_failed");
        if (!cancelled && version === authVersion.current) {
          setLoading(false);
          redirectToSignIn();
        }
      } finally {
        initializing = false;
      }
    };

    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === "SIGNED_IN" && session && !initializing) {
        const nextVersion = ++authVersion.current;
        setUser(session.user);
        setProfile(null);
        setAccountId(null);
        setUserRole(null);
        setOnboardingPending(false);
        setLoading(true);
        // Do NOT await this. If we await an async function that queries Supabase inside this subscriber,
        // we will deadlock the gotrue-js lock manager (which waits for subscribers to finish before releasing init locks).
        fetchProfile(session.user.id, nextVersion).catch(() => console.error("[auth] Profile lookup failed"));
      } else if (event === "SIGNED_OUT") {
        diagnostic("signed_out");
        ++authVersion.current;
        setUser(null);
        setProfile(null);
        setAccountId(null);
        setUserRole(null);
        setOnboardingPending(false);
        setLoading(false);
        redirectToSignIn();
      }
    });

    return () => {
      cancelled = true;
      ++authVersion.current;
      subscription.unsubscribe();
    };
  }, []);

  const fetchProfile = async (userId: string, version = authVersion.current) => {
    try {
      const supabase = createClient();
      const [profileResult, memberResult] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, email, name, company_name")
          .eq("id", userId)
          .single(),
        // Fetch active membership — first account by joined_at (matches current_account_id() fallback).
        // When multi-account context switching is implemented, update this to respect
        // the user's last-selected account (e.g. from localStorage or JWT claim).
        supabase
          .from("account_members")
          .select("role, account_id")
          .eq("user_id", userId)
          .eq("status", "active")
          .order("joined_at", { ascending: true })
          .limit(1)
          .maybeSingle(),
      ]);

      if (version !== authVersion.current) return;

      if (!profileResult.error && profileResult.data) {
        setProfile(profileResult.data as UserProfile);
      }
      if (memberResult.error) {
        console.error("[auth] account_members lookup failed:", memberResult.error.message);
      }
      setUserRole((memberResult.data?.role as DashboardRole) ?? null);
      setAccountId(memberResult.data?.account_id ?? null);

      const member = memberResult.data;
      if (member?.role === "owner") {
        // A failed read must not leave the owner without the setup: retry for about a minute.
        const accountResult = await retryWithBackoff(async () => {
          const result = await supabase
            .from("accounts")
            .select("onboarding_completed_at")
            .eq("id", member.account_id)
            .maybeSingle();
          if (result.error) throw new Error("Account lookup failed");
          return result;
        }, { attempts: 6, baseMs: 2000, maxMs: 30_000 }).catch(() => null);
        if (version !== authVersion.current) return;
        const supabaseUrl = new URL(getClientConfig().supabaseUrl);
        const localReplay = supabaseUrl.protocol === "http:" && supabaseUrl.port === "54321" &&
          ["127.0.0.1", "localhost", "[::1]"].includes(supabaseUrl.hostname);
        setOnboardingPending(
          !!accountResult?.data &&
            ownerNeedsOnboarding("owner", profileResult.data?.company_name, accountResult.data.onboarding_completed_at, localReplay),
        );
      }
    } finally {
      if (version === authVersion.current) setLoading(false);
    }
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id);
    }
  };

  const offeredRecorded = useRef(false);
  const recordOnboardingOffered = async () => {
    if (offeredRecorded.current) return;
    offeredRecorded.current = true;
    try {
      await retryWithBackoff(async () => {
        const response = await markOnboardingOffered();
        if (!response.ok) throw new Error(`Recording the offer failed with status ${response.status}`);
      });
    } catch (error) {
      // Without the record the pipeline never settles the choice on the owner's behalf: it is offered again next time.
      console.error("[onboarding] the offer could not be recorded", error instanceof Error ? error.message : "unknown error");
      offeredRecorded.current = false;
    }
  };

  const completeOnboarding = async (settings: { industry: string | null; businessContext: string }) => {
    try {
      const response = await completeOnboardingRequest(settings.industry, settings.businessContext);
      if (!response.ok) {
        console.error("[onboarding] the setup was rejected", response.status);
        return false;
      }
      setOnboardingPending(false);
      setAccountRevision((revision) => revision + 1);
      return true;
    } catch (error) {
      console.error("[onboarding] the setup could not be sent", error instanceof Error ? error.message : "unknown error");
      return false;
    }
  };

  const signOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setAccountId(null);
    setUserRole(null);
    setOnboardingPending(false);
    if (!isDesktop()) getPlatform().navigation.navigate(getLandingUrl("/"));
  };

  const signInWithPassword = async (email: string, password: string) => {
    try {
      const { error } = await createClient().auth.signInWithPassword({ email, password });
      if (!error) return null;
      return classifySignInError(error.message);
    } catch {
      return "unexpected";
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, profile, userRole, accountId, isAdmin, loading, signInWithPassword, signOut, refreshProfile, onboardingPending, accountRevision, completeOnboarding, recordOnboardingOffered }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
