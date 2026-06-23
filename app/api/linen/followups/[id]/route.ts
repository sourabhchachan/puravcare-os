import { NextResponse } from "next/server";

import { assertActiveUser, getActorId } from "@/lib/api/actor";
import { canResolveLinenFollowup } from "@/lib/linen/access";
import { LINEN_FOLLOWUP_RESOLUTIONS } from "@/lib/linen/constants";
import { createServiceClient } from "@/lib/supabase/service";

type PatchBody = {
  resolution?: string;
  resolution_note?: string;
};

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!(await canResolveLinenFollowup(actorId!))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const resolution = (body.resolution ?? "").trim().toLowerCase();
  const note = (body.resolution_note ?? "").trim();
  if (!LINEN_FOLLOWUP_RESOLUTIONS.includes(resolution as (typeof LINEN_FOLLOWUP_RESOLUTIONS)[number])) {
    return NextResponse.json({ error: "invalid_resolution" }, { status: 400 });
  }
  if (!note) return NextResponse.json({ error: "missing_resolution_note" }, { status: 400 });

  const supabase = createServiceClient();
  const { data: row } = await supabase.from("linen_followups").select("id, status").eq("id", id).maybeSingle();
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (row.status !== "open") return NextResponse.json({ error: "already_resolved" }, { status: 400 });

  const { data, error } = await supabase
    .from("linen_followups")
    .update({
      status: "resolved",
      resolution,
      resolution_note: note,
      resolved_by: actorId!,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error || !data) return NextResponse.json({ error: "update_failed" }, { status: 500 });
  return NextResponse.json({ followup: data });
}
