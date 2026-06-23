import { NextResponse } from "next/server";

import { assertActiveUser, getActorId } from "@/lib/api/actor";
import { assertCeo } from "@/lib/api/ceo";
import { createServiceClient } from "@/lib/supabase/service";

type PatchBody = {
  name?: string;
  is_active?: boolean;
};

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId)) || !(await assertCeo(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name) return NextResponse.json({ error: "name_required" }, { status: 400 });
    updates.name = name;
  }
  if (typeof body.is_active === "boolean") updates.is_active = body.is_active;
  if (!Object.keys(updates).length) return NextResponse.json({ error: "no_updates" }, { status: 400 });

  const supabase = createServiceClient();
  if (updates.name) {
    const { data: existing } = await supabase.from("locations").select("id, name").neq("id", id);
    const lower = (updates.name as string).toLowerCase();
    if ((existing ?? []).some((r) => (r.name as string).toLowerCase() === lower)) {
      return NextResponse.json({ error: "duplicate_name" }, { status: 400 });
    }
  }

  const { data, error } = await supabase
    .from("locations")
    .update(updates)
    .eq("id", id)
    .select("id, name, is_active, created_at")
    .single();

  if (error || !data) return NextResponse.json({ error: "update_failed" }, { status: 500 });
  return NextResponse.json({ location: data });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId)) || !(await assertCeo(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = createServiceClient();
  const { error } = await supabase.from("locations").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
