import { NextResponse } from "next/server";

import { assertActiveUser, getActorId } from "@/lib/api/actor";
import { assertCeo } from "@/lib/api/ceo";
import { rangeFromPreset } from "@/lib/dashboard/reportRange";
import { createServiceClient } from "@/lib/supabase/service";

const EVENT_TYPES = [
  "created",
  "assigned",
  "acknowledged",
  "status_changed",
  "reassigned",
  "proof_uploaded",
  "countersigned",
  "confirmed",
  "closed",
  "blocked",
  "force_skipped",
] as const;

export async function GET(request: Request) {
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!(await assertCeo(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const preset = url.searchParams.get("preset") ?? "this_month";
  const startQ = url.searchParams.get("start");
  const endQ = url.searchParams.get("end");
  const eventType = url.searchParams.get("event_type")?.trim() || "";
  const filterActorId = url.searchParams.get("actor_id")?.trim() || "";

  const { start, end } = rangeFromPreset(preset, startQ, endQ);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return NextResponse.json({ error: "invalid_range" }, { status: 400 });
  }

  if (eventType && !EVENT_TYPES.includes(eventType as (typeof EVENT_TYPES)[number])) {
    return NextResponse.json({ error: "invalid_event_type" }, { status: 400 });
  }

  const supabase = createServiceClient();

  let q = supabase
    .from("task_events")
    .select("id, task_id, actor_id, event_type, old_value, new_value, note, created_at")
    .gte("created_at", start.toISOString())
    .lte("created_at", end.toISOString())
    .order("created_at", { ascending: false })
    .limit(3000);

  if (eventType) q = q.eq("event_type", eventType);
  if (filterActorId) q = q.eq("actor_id", filterActorId);

  const { data: events, error } = await q;
  if (error) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });

  const taskIds = [...new Set((events ?? []).map((e) => e.task_id as string))];
  const actorIds = [...new Set((events ?? []).map((e) => e.actor_id as string))];

  const [tasksRes, usersRes] = await Promise.all([
    taskIds.length ? supabase.from("tasks").select("id, title").in("id", taskIds) : Promise.resolve({ data: [] }),
    actorIds.length ? supabase.from("users").select("id, full_name").in("id", actorIds) : Promise.resolve({ data: [] }),
  ]);

  const taskTitle = Object.fromEntries((tasksRes.data ?? []).map((t) => [t.id, t.title as string]));
  const actorName = Object.fromEntries((usersRes.data ?? []).map((u) => [u.id, u.full_name as string]));

  const rows = (events ?? []).map((e) => ({
    id: e.id,
    task_id: e.task_id,
    task_title: taskTitle[e.task_id as string] ?? "—",
    event_type: e.event_type,
    actor_id: e.actor_id,
    actor_name: actorName[e.actor_id as string] ?? "—",
    old_value: e.old_value,
    new_value: e.new_value,
    note: e.note,
    created_at: e.created_at,
  }));

  return NextResponse.json({
    events: rows,
    event_types: [...EVENT_TYPES],
  });
}
