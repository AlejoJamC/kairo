import { Hono } from "hono";
import { requireRole } from "../../middleware/rbac.js";
import { supabase } from "../../lib/supabase.js";

export const classificationProgress = new Hono();

// ---------------------------------------------------------------------------
// Category mapping: raw DB values → 5 canonical keys
// ---------------------------------------------------------------------------

const CATEGORY_MAP: Record<string, keyof typeof EMPTY_CATEGORIES> = {
  // Spanish labels written by the current pipeline
  "Facturación":          "billing",
  "API Bugs":             "technical",
  "API · Bugs":           "technical",
  "Configuración":        "technical",
  "Ventas":               "general",
  "Producto Feedback":    "general",
  "Producto · Feedback":  "general",
  "Spam":                 "not_applicable",
  // English canonical keys (future pipeline)
  "billing":              "billing",
  "technical":            "technical",
  "account":              "account",
  "general":              "general",
  "not_applicable":       "not_applicable",
};

const EMPTY_CATEGORIES = {
  technical:      0,
  billing:        0,
  account:        0,
  general:        0,
  not_applicable: 0,
};

// ---------------------------------------------------------------------------
// GET /v1/classification/progress
// Requires: Bearer token + x-account-id header (same as other account-scoped routes)
// ---------------------------------------------------------------------------

classificationProgress.get(
  "/",
  requireRole(["owner", "admin", "supervisor", "agent"]),
  async (c) => {
    const accountId = c.req.header("x-account-id")!; // guaranteed by requireRole

    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const until = new Date().toISOString();

    // ── 1. Aggregate tickets ─────────────────────────────────────────────────
    const { data: ticketRows, error: ticketErr } = await supabase
      .from("tickets")
      .select("id, category, gmail_thread_id, client_id, classified_at")
      .eq("account_id", accountId)
      .not("classified_at", "is", null);

    if (ticketErr) return c.json({ error: ticketErr.message }, 500);

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

    // ── 2. Derive status from messages ───────────────────────────────────────
    const { data: msgRows, error: msgErr } = await supabase
      .from("messages")
      .select("classification_status")
      .eq("account_id", accountId);

    if (msgErr) return c.json({ error: msgErr.message }, 500);

    const msgs = msgRows ?? [];
    let pending = 0, classified = 0, failed = 0;
    for (const m of msgs) {
      if (m.classification_status === "pending") pending++;
      else if (m.classification_status === "classified") classified++;
      else if (m.classification_status === "failed") failed++;
    }

    let status: "idle" | "in_progress" | "complete" | "failed";
    if (msgs.length === 0) {
      status = "idle";
    } else if (pending > 0) {
      status = "in_progress";
    } else if (failed > 0 && classified === 0 && failed > msgs.length * 0.5) {
      status = "failed";
    } else {
      status = "complete";
    }

    return c.json({
      status,
      tickets_count,
      threads_count,
      clients_count,
      categories,
      window: { since, until },
      last_classified_at,
    });
  }
);
