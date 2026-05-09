import { NextResponse } from "next/server";

import { assertActiveUser, getActorId } from "@/lib/api/actor";
import { createServiceClient } from "@/lib/supabase/service";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data: row } = await supabase.from("notifications").select("id, user_id").eq("id", id).maybeSingle();
  if (!row || row.user_id !== actorId) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { data, error } = await supabase.from("notifications").update({ is_read: true }).eq("id", id).select("*").single();
  if (error || !data) return NextResponse.json({ error: "update_failed" }, { status: 500 });
  return NextResponse.json({ notification: data });
}
