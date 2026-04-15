import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getLandingUrl } from "@/lib/api-client";
import type { User } from "@supabase/supabase-js";

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  company_name?: string;
  gmail_connected: boolean;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Extract hash tokens ONCE at module level — survives StrictMode double-mount.
// The hash is read and cleared before any React effect runs.
const initialHashTokens: {
  access_token: string;
  refresh_token: string;
} | null = (() => {
  const hash = window.location.hash.substring(1);
  if (!hash) return null;

  const params = new URLSearchParams(hash);
  const access_token = params.get("access_token");
  const refresh_token = params.get("refresh_token");

  if (access_token && refresh_token) {
    // Clean hash from URL immediately
    history.replaceState(null, "", window.location.pathname);
    return { access_token, refresh_token };
  }
  return null;
})();

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

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
        if (initialHashTokens) {
          const { data, error } = await supabase.auth.setSession({
            access_token: initialHashTokens.access_token,
            refresh_token: initialHashTokens.refresh_token,
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
          window.location.href = getLandingUrl("/wizard/");
        }
      } catch (err) {
        if (!cancelled) {
          setLoading(false);
          window.location.href = getLandingUrl("/wizard/");
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
        window.location.href = getLandingUrl("/wizard/");
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
      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, name, company_name, gmail_connected")
        .eq("id", userId)
        .single();

      if (!error && data) {
        setProfile(data as UserProfile);
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

  const signOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    window.location.href = getLandingUrl("/");
  };

  return (
    <AuthContext.Provider
      value={{ user, profile, loading, signOut, refreshProfile }}
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
