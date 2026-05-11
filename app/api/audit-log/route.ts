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
  "dispatch",
  "receive",
  "cancel",
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

  let taskQ = supabase
    .from("task_events")
    .select("id, task_id, actor_id, event_type, old_value, new_value, note, created_at")
    .gte("created_at", start.toISOString())
    .lte("created_at", end.toISOString())
    .limit(3000);

  let indentQ = supabase
    .from("indent_events")
    .select("id, indent_id, actor_id, event_type, old_value, new_value, note, created_at")
    .gte("created_at", start.toISOString())
    .lte("created_at", end.toISOString())
    .limit(3000);

  if (eventType) {
    taskQ = taskQ.eq("event_type", eventType);
    indentQ = indentQ.eq("event_type", eventType);
  }
  if (filterActorId) {
    taskQ = taskQ.eq("actor_id", filterActorId);
    indentQ = indentQ.eq("actor_id", filterActorId);
  }

  const [{ data: taskEvents, error: taskErr }, { data: indentEvents, error: indentErr }] = await Promise.all([taskQ, indentQ]);
  if (taskErr || indentErr) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });

  const taskIds = [...new Set((taskEvents ?? []).map((e) => e.task_id as string).filter(Boolean))];
  const indentIds = [...new Set((indentEvents ?? []).map((e) => e.indent_id as string).filter(Boolean))];
  const actorIds = [
    ...new Set([...(taskEvents ?? []).map((e) => e.actor_id as string), ...(indentEvents ?? []).map((e) => e.actor_id as string)].filter(Boolean)),
  ];

  const [tasksRes, usersRes, indentsRes] = await Promise.all([
    taskIds.length ? supabase.from("tasks").select("id, title").in("id", taskIds) : Promise.resolve({ data: [] }),
    actorIds.length ? supabase.from("users").select("id, full_name").in("id", actorIds) : Promise.resolve({ data: [] }),
    indentIds.length ? supabase.from("indents").select("id, item_description, patient_id").in("id", indentIds) : Promise.resolve({ data: [] }),
  ]);

  const taskTitle = Object.fromEntries((tasksRes.data ?? []).map((t) => [t.id, t.title as string]));
  const actorName = Object.fromEntries((usersRes.data ?? []).map((u) => [u.id, u.full_name as string]));
  const indentMeta = Object.fromEntries(
    (indentsRes.data ?? []).map((i) => [i.id, { item_description: i.item_description as string, patient_id: (i.patient_id as string | null) ?? null }]),
  );
  const patientIds = [...new Set((indentsRes.data ?? []).map((i) => i.patient_id as string).filter(Boolean))];
  const patientsRes = patientIds.length
    ? await supabase.from("patients").select("id, ipd_number, full_name").in("id", patientIds)
    : { data: [] as Array<{ id: string; ipd_number: string | null; full_name: string | null }> };
  const patientMeta = Object.fromEntries(
    (patientsRes.data ?? []).map((p) => [p.id, { ipd_number: (p.ipd_number as string | null) ?? null, full_name: (p.full_name as string | null) ?? null }]),
  );

  const taskRows = (taskEvents ?? []).map((e) => ({
    id: e.id,
    source: "task",
    task_id: e.task_id,
    indent_id: null,
    item_name: taskTitle[e.task_id as string] ?? "—",
    task_title: taskTitle[e.task_id as string] ?? "—",
    event_type: e.event_type,
    actor_id: e.actor_id,
    actor_name: actorName[e.actor_id as string] ?? "—",
    patient_ipd: null,
    patient_name: null,
    old_value: e.old_value,
    new_value: e.new_value,
    note: e.note,
    created_at: e.created_at,
  }));
  const indentRows = (indentEvents ?? []).map((e) => {
    const meta = indentMeta[e.indent_id as string] as { item_description: string; patient_id: string | null } | undefined;
    const patient = meta?.patient_id ? patientMeta[meta.patient_id] : null;
    return {
      id: e.id,
      source: "indent",
      task_id: null,
      indent_id: e.indent_id,
      item_name: meta?.item_description ?? "—",
      task_title: null,
      event_type: e.event_type,
      actor_id: e.actor_id,
      actor_name: actorName[e.actor_id as string] ?? "—",
      patient_ipd: patient?.ipd_number ?? null,
      patient_name: patient?.full_name ?? null,
      old_value: e.old_value,
      new_value: e.new_value,
      note: e.note,
      created_at: e.created_at,
    };
  });
  const rows = [...taskRows, ...indentRows].sort(
    (a, b) => new Date(b.created_at as string).getTime() - new Date(a.created_at as string).getTime(),
  );

  return NextResponse.json({
    events: rows,
    event_types: [...EVENT_TYPES],
  });
}
