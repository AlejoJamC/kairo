import { createClient, getUserFromRequest } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// GET /api/clients — list all clients for the authenticated user
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await getUserFromRequest(request, supabase);

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

    return NextResponse.json({ clients: clients ?? [] });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/clients — create a new client
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await getUserFromRequest(request, supabase);

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

    const { data: client, error } = await supabase
      .from("clients")
      .insert({
        user_id: user.id,
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
