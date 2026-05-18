import { createClientForRequest } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// GET /bff/clients — list all clients for the authenticated user
export async function GET(request: Request) {
  try {
    const supabase = await createClientForRequest(request);
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // RLS automatically filters to user's own clients
    const { data: clients, error } = await supabase
      .from("clients")
      .select("*")
      .order("name", { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: "Failed to fetch clients" },
        { status: 500 }
      );
    }

    const clientList = clients ?? [];
    if (clientList.length === 0) {
      return NextResponse.json({ clients: [] });
    }

    const clientIds = clientList.map((c) => c.id);

    // Ticket counts + last contact per client
    const { data: ticketRows } = await supabase
      .from("tickets")
      .select("client_id, received_at")
      .in("client_id", clientIds);

    // Build ticket_id → client_id map + ticket stats
    const ticketCountMap: Record<string, number> = {};
    const lastContactMap: Record<string, string> = {};
    const ticketToClient: Record<string, string> = {};
    const ticketIds: string[] = [];

    for (const t of ticketRows ?? []) {
      if (!t.client_id) continue;
      ticketCountMap[t.client_id] = (ticketCountMap[t.client_id] ?? 0) + 1;
      const prev = lastContactMap[t.client_id];
      if (!prev || (t.received_at && t.received_at > prev)) {
        lastContactMap[t.client_id] = t.received_at ?? "";
      }
    }

    // Need ticket ids for CSAT lookup — re-query with id
    const { data: ticketWithIds } = await supabase
      .from("tickets")
      .select("id, client_id")
      .in("client_id", clientIds);

    for (const t of ticketWithIds ?? []) {
      if (t.client_id) { ticketToClient[t.id] = t.client_id; ticketIds.push(t.id); }
    }

    // CSAT per ticket
    let csatRows: { ticket_id: string; score: number | null }[] = [];
    if (ticketIds.length) {
      const { data } = await supabase
        .from("csat_events")
        .select("ticket_id, score")
        .in("ticket_id", ticketIds);
      csatRows = (data ?? []) as { ticket_id: string; score: number | null }[];
    }

    const csatSumMap: Record<string, { sum: number; count: number }> = {};
    for (const row of csatRows) {
      const cid = ticketToClient[row.ticket_id];
      if (!cid || row.score == null) continue;
      const prev = csatSumMap[cid] ?? { sum: 0, count: 0 };
      csatSumMap[cid] = { sum: prev.sum + row.score, count: prev.count + 1 };
    }

    const enriched = clientList.map((c) => ({
      ...c,
      ticketCount: ticketCountMap[c.id] ?? 0,
      lastContactAt: lastContactMap[c.id] ?? null,
      csatAvg: csatSumMap[c.id]
        ? Math.round((csatSumMap[c.id].sum / csatSumMap[c.id].count) * 10) / 10
        : null,
    }));

    return NextResponse.json({ clients: enriched });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /bff/clients — create a new client
export async function POST(request: Request) {
  try {
    const supabase = await createClientForRequest(request);
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const {
      internal_id,
      name,
      legal_id,
      telephone,
      authorized_emails,
      contact_persons,
      plan_type,
      sla_level,
    } = body;

    if (!internal_id?.trim() || !name?.trim()) {
      return NextResponse.json(
        { error: "internal_id and name are required" },
        { status: 400 }
      );
    }

    const { data: membership } = await supabase
      .from("account_members")
      .select("account_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("joined_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!membership?.account_id) {
      return NextResponse.json(
        { error: "No active account found for this user" },
        { status: 403 }
      );
    }

    const { data: client, error } = await supabase
      .from("clients")
      .insert({
        account_id: membership.account_id,
        internal_id: internal_id.trim(),
        name: name.trim(),
        legal_id: legal_id?.trim() || null,
        telephone: telephone?.trim() || null,
        authorized_emails: authorized_emails ?? [],
        contact_persons: contact_persons ?? [],
        plan_type: plan_type || null,
        sla_level: sla_level || null,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "A client with this Internal ID already exists" },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: "Failed to create client" },
        { status: 500 }
      );
    }

    return NextResponse.json({ client }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
