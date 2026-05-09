import { NextResponse } from "next/server";

import { assertActiveUser, getActorId } from "@/lib/api/actor";
import { assertCeo } from "@/lib/api/ceo";
import { createServiceClient } from "@/lib/supabase/service";

type PatchBody = {
  action?: string;
};

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (!(await assertCeo(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const action = body.action;
  if (!["approve", "reject"].includes(action ?? "")) {
    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: row, error: fetchErr } = await supabase.from("psi_nodes").select("id, status").eq("id", id).maybeSingle();
  if (fetchErr || !row) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (row.status !== "proposed") {
    return NextResponse.json({ error: "not_proposed" }, { status: 400 });
  }

  const updates = action === "approve" ? { status: "approved" as const, approved_by: actorId! } : { status: "rejected" as const };

  const { data, error } = await supabase.from("psi_nodes").update(updates).eq("id", id).select("*").single();
  if (error || !data) return NextResponse.json({ error: "update_failed" }, { status: 500 });
  return NextResponse.json({ node: data });
}
