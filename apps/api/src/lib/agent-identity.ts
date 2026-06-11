import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = SupabaseClient<any>;

/**
 * Agent identity resolution for transactional emails — KAI-247
 *
 * Resolves the authenticated agent's display name/role/initials from
 * `public.profiles` (the real profile table — not the non-existent
 * `user_profiles`). Falls back to the tenant mailbox address if no profile
 * row or name is found, per ADR-024 §4 ("no bloquear por esto").
 */

export interface AgentIdentity {
  agent_name: string;
  agent_role: string;
  agent_initials: string;
}

/** Constant role label — no per-agent role model exists yet. */
const DEFAULT_AGENT_ROLE = "Equipo de Soporte";

function deriveInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}

export async function resolveAgentIdentity(
  client: DbClient,
  userId: string,
  fallbackEmail: string,
): Promise<AgentIdentity> {
  const { data: profile } = await client
    .from("profiles")
    .select("name, email")
    .eq("id", userId)
    .maybeSingle();

  const agent_name = profile?.name || profile?.email || fallbackEmail;

  return {
    agent_name,
    agent_role: DEFAULT_AGENT_ROLE,
    agent_initials: deriveInitials(agent_name),
  };
}
