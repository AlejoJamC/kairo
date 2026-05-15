import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// Category mapping: DB labels → 5 canonical keys
const CATEGORY_MAP: Record<string, keyof typeof EMPTY_CATEGORIES> = {
  "Facturación":          "billing",
  "API Bugs":             "technical",
  "API · Bugs":           "technical",
  "Configuración":        "technical",
  "Ventas":               "general",
  "Producto Feedback":    "general",
  "Producto · Feedback":  "general",
  "Spam":                 "not_applicable",
  billing:                "billing",
  technical:              "technical",
  account:                "account",
  general:                "general",
  not_applicable:         "not_applicable",
};

const EMPTY_CATEGORIES = {
  technical:      0,
  billing:        0,
  account:        0,
  general:        0,
  not_applicable: 0,
};

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const until = new Date().toISOString();

  // Tickets scoped to user_id (new users don't have account_id yet)
  const { data: ticketRows, error: ticketErr } = await supabase
    .from("tickets")
    .select("id, category, gmail_thread_id, client_id, classified_at")
    .eq("user_id", user.id)
    .not("classified_at", "is", null);

  if (ticketErr) return NextResponse.json({ error: ticketErr.message }, { status: 500 });

  const rows = ticketRows ?? [];
  const tickets_count = rows.length;
  const threads_count = new Set(rows.map((r) => r.gmail_thread_id).filter(Boolean)).size;
  const clients_count = new Set(rows.map((r) => r.client_id).filter(Boolean)).size;

  const categories = { ...EMPTY_CATEGORIES };
  let last_classified_at: string | null = null;
  for (const row of rows) {
    const key = row.category ? (CATEGORY_MAP[row.category] ?? "general") : null;
    if (key) categories[key]++;
    if (row.classified_at && (!last_classified_at || row.classified_at > last_classified_at)) {
      last_classified_at = row.classified_at;
    }
  }

  // Derive status from tickets: if any tickets classified in the last 2 min, still running
  const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  let status: "idle" | "in_progress" | "complete" | "failed";
  if (tickets_count === 0) {
    status = "idle";
  } else if (last_classified_at && last_classified_at > twoMinAgo) {
    status = "in_progress";
  } else {
    status = "complete";
  }

  return NextResponse.json({
    status,
    tickets_count,
    threads_count,
    clients_count,
    categories,
    window: { since, until },
    last_classified_at,
  });
}
