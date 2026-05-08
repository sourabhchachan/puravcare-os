import { NextResponse } from "next/server";

import { assertActiveUser, getActorId } from "@/lib/api/actor";
import { assertCeo } from "@/lib/api/ceo";
import { createServiceClient } from "@/lib/supabase/service";

const RECURRENCE = ["one-time", "hourly", "2h", "4h", "6h", "8h", "daily", "weekly"] as const;

type PatchBody = {
  title?: string;
  task_type?: string;
  default_assignee_role?: string | null;
  proof_type?: string;
  recurrence?: string;
  priority?: string;
  is_patient_linked?: boolean;
  is_active?: boolean;
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
  if (!(await assertActiveUser(actorId)) || !(await assertCeo(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const updates: Record<string, unknown> = {};
  if (typeof body.title === "string") updates.title = body.title.trim();
  if (typeof body.task_type === "string") {
    if (!["patient", "ops"].includes(body.task_type)) return NextResponse.json({ error: "invalid_type" }, { status: 400 });
    updates.task_type = body.task_type;
  }
  if (body.default_assignee_role !== undefined) {
    const dar = body.default_assignee_role?.trim() || null;
    if (dar && !["ceo", "ops", "staff"].includes(dar)) {
      return NextResponse.json({ error: "invalid_assignee_role" }, { status: 400 });
    }
    updates.default_assignee_role = dar;
  }
  if (typeof body.proof_type === "string") {
    if (!["tap", "photo", "countersign"].includes(body.proof_type)) {
      return NextResponse.json({ error: "invalid_proof" }, { status: 400 });
    }
    updates.proof_type = body.proof_type;
  }
  if (typeof body.recurrence === "string") {
    if (!RECURRENCE.includes(body.recurrence as (typeof RECURRENCE)[number])) {
      return NextResponse.json({ error: "invalid_recurrence" }, { status: 400 });
    }
    updates.recurrence = body.recurrence;
  }
  if (typeof body.priority === "string") {
    if (!["critical", "high", "normal", "low"].includes(body.priority)) {
      return NextResponse.json({ error: "invalid_priority" }, { status: 400 });
    }
    updates.priority = body.priority;
  }
  if (typeof body.is_patient_linked === "boolean") updates.is_patient_linked = body.is_patient_linked;
  if (typeof body.is_active === "boolean") updates.is_active = body.is_active;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "no_updates" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase.from("task_master").update(updates).eq("id", id).select("*").single();

  if (error || !data) return NextResponse.json({ error: "update_failed" }, { status: 500 });
  return NextResponse.json({ template: data });
}
