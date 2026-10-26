import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "./supabase";
import { getLandingUrl, redirectToSignIn } from "./api-client";
import { completeOnboarding as completeOnboardingRequest } from "./endpoints";
import { getPlatform, isDesktop } from "./config";
import type { User } from "@supabase/supabase-js";

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  company_name?: string;
  // gmail_connected removed in KAI-173 — use support_channels presence instead
}

/**
 * An owner who has not finished the onboarding goes back to the wizard instead of
 * the dashboard. Accounts that predate the completion record count as finished
 * when the owner's profile has a company name.
 */
export function ownerNeedsOnboarding(role: string | null, companyName: string | null | undefined, onboardingCompletedAt: string | null): boolean {
  return role === "owner" && !onboardingCompletedAt && !companyName?.trim();
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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [userRole, setUserRole] = useState<DashboardRole | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [onboardingPending, setOnboardingPending] = useState(false);

  const isAdmin = userRole === 'owner' || userRole === 'admin' || userRole === 'supervisor';

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    const init = async () => {
      try {
        const {
          data: { session: existingSession },
          error: existingError,
        } = await supabase.auth.getSession();

        if (existingSession && !existingError) {
          if (!cancelled) {
            setUser(existingSession.user);
            // Fire and forget to avoid any internal promise chaining deadlocks
            fetchProfile(existingSession.user.id).catch(console.error);
          }
          return;
        }

        // If no existing session, but we have hash tokens from a redirect
        const handoffTokens = await getPlatform().authHandoff.takeHandoffTokens();
        if (handoffTokens) {
          const { data, error } = await supabase.auth.setSession({
            access_token: handoffTokens.access_token,
            refresh_token: handoffTokens.refresh_token,
          });

          if (!error && data.session && !cancelled) {
            setUser(data.session.user);
            fetchProfile(data.session.user.id).catch(console.error);
            return;
          }
        }

        // Neither existing session nor valid hash tokens
        if (!cancelled) {
          setLoading(false);
          redirectToSignIn();
        }
      } catch {
        if (!cancelled) {
          setLoading(false);
          redirectToSignIn();
        }
      }
    };

    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === "SIGNED_IN" && session) {
        setUser(session.user);
        // Do NOT await this. If we await an async function that queries Supabase inside this subscriber,
        // we will deadlock the gotrue-js lock manager (which waits for subscribers to finish before releasing init locks).
        fetchProfile(session.user.id).catch(err => console.error("fetchProfile err:", err));
      } else if (event === "SIGNED_OUT") {
        setUser(null);
        setProfile(null);
        redirectToSignIn();
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const fetchProfile = async (userId: string) => {
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

      if (!profileResult.error && profileResult.data) {
        setProfile(profileResult.data as UserProfile);
      }
      if (memberResult.error) {
        console.error("[auth] account_members lookup failed:", memberResult.error.message);
      }
      setUserRole((memberResult.data?.role as DashboardRole) ?? null);
      setAccountId(memberResult.data?.account_id ?? null);

      if (memberResult.data?.role === "owner" && !isDesktop()) {
        const accountResult = await supabase
          .from("accounts")
          .select("onboarding_completed_at")
          .eq("id", memberResult.data.account_id)
          .maybeSingle();
        setOnboardingPending(
          !accountResult.error && !!accountResult.data &&
            ownerNeedsOnboarding("owner", profileResult.data?.company_name, accountResult.data.onboarding_completed_at),
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id);
    }
  };

  const completeOnboarding = async (settings: { industry: string | null; businessContext: string }) => {
    try {
      const response = await completeOnboardingRequest(settings.industry, settings.businessContext);
      if (!response.ok) return false;
      setOnboardingPending(false);
      return true;
    } catch {
      return false;
    }
  };

  const signOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setAccountId(null);
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
      value={{ user, profile, userRole, accountId, isAdmin, loading, signInWithPassword, signOut, refreshProfile, onboardingPending, completeOnboarding }}
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
