export type DashboardRole = "owner" | "admin" | "supervisor" | "agent";

// Pure function — no Supabase dependency, fully unit-testable.
// Returns true only when the member row exists, is active, and has an allowed role.
export function isRoleAllowed(
  member: { role: string; status: string } | null | undefined,
  allowedRoles: DashboardRole[]
): boolean {
  if (!member) return false;
  if (member.status !== "active") return false;
  return allowedRoles.includes(member.role as DashboardRole);
}
