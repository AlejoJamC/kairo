import { createClient, getUserFromRequest } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// GET /api/clients/:id
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await getUserFromRequest(request, supabase);

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { data: client, error } = await supabase
      .from("clients")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    return NextResponse.json({ client });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH /api/clients/:id
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await getUserFromRequest(request, supabase);

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const updates = {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.legal_id !== undefined && { legal_id: body.legal_id }),
      ...(body.telephone !== undefined && { telephone: body.telephone }),
      ...(body.authorized_emails !== undefined && { authorized_emails: body.authorized_emails }),
      ...(body.contact_persons !== undefined && { contact_persons: body.contact_persons }),
      ...(body.plan_type !== undefined && { plan_type: body.plan_type }),
      ...(body.sla_level !== undefined && { sla_level: body.sla_level }),
    };

    const { data: client, error } = await supabase
      .from("clients")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: "Failed to update client" },
        { status: 500 }
      );
    }

    return NextResponse.json({ client });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/clients/:id
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await getUserFromRequest(request, supabase);

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { error } = await supabase.from("clients").delete().eq("id", id);

    if (error) {
      return NextResponse.json(
        { error: "Failed to delete client" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
