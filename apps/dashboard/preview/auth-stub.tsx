import type { ReactNode } from "react";
import { profile } from "./fixtures";

export type DashboardRole = "owner" | "admin" | "supervisor" | "agent";
export interface UserProfile { id: string; email: string; name: string; company_name?: string }

const value = {
  user: { id: profile.id, email: profile.email },
  profile,
  userRole: "owner" as DashboardRole,
  accountId: "acct-1",
  isAdmin: true,
  loading: false,
  signOut: async () => undefined,
  refreshProfile: async () => undefined,
};

export function AuthProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function useAuth() {
  return value;
}
