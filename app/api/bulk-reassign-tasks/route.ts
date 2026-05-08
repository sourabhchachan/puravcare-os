import { NextResponse } from "next/server";

import { assertActiveUser } from "@/lib/api/actor";
import { assertCeo } from "@/lib/api/ceo";
import { createServiceClient } from "@/lib/supabase/service";

type Body = {
  actor_id?: string;
  task_ids?: string[];
  new_assignee_id?: string;
  reason?: string;
};

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const actorId = body.actor_id?.trim();
  if (!actorId || !(await assertActiveUser(actorId))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!(await assertCeo(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const ids = body.task_ids ?? [];
  const reason = (body.reason ?? "").trim();
  const newAssignee = body.new_assignee_id?.trim();
  if (!ids.length || !reason || !newAssignee) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: nu } = await supabase.from("users").select("id").eq("id", newAssignee).eq("is_active", true).maybeSingle();
  if (!nu) return NextResponse.json({ error: "invalid_assignee" }, { status: 400 });

  const nowIso = new Date().toISOString();
  const terminal = new Set(["closed", "confirmed"]);

  for (const tid of ids) {
    const { data: task } = await supabase.from("tasks").select("assignee_id, status").eq("id", tid).maybeSingle();
    if (!task || terminal.has(task.status as string)) continue;

    const prevAssignee = task.assignee_id as string;
    const prevStatus = task.status as string;

    await supabase
      .from("tasks")
      .update({
        assignee_id: newAssignee,
        reassign_reason: reason,
        status: "pending",
        updated_at: nowIso,
      })
      .eq("id", tid);

    await supabase.from("task_events").insert({
      task_id: tid,
      actor_id: actorId,
      event_type: "reassigned",
      old_value: prevAssignee,
      new_value: newAssignee,
      note: reason,
    });

    await supabase.from("task_events").insert({
      task_id: tid,
      actor_id: actorId,
      event_type: "status_changed",
      old_value: prevStatus,
      new_value: "pending",
      note: "bulk reassign",
    });
  }

  return NextResponse.json({ ok: true });
}
