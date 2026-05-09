import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

import { assertActiveUser, getActorId } from "@/lib/api/actor";
import { assertCeo } from "@/lib/api/ceo";
import { fileSuffixFromDates, rangeFromPreset } from "@/lib/dashboard/reportRange";
import { createServiceClient } from "@/lib/supabase/service";

const EVENT_TYPES = new Set([
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
]);

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
  if (eventType && !EVENT_TYPES.has(eventType)) {
    return NextResponse.json({ error: "invalid_event_type" }, { status: 400 });
  }

  const supabase = createServiceClient();

  let q = supabase
    .from("task_events")
    .select("id, task_id, actor_id, event_type, old_value, new_value, note, created_at")
    .gte("created_at", start.toISOString())
    .lte("created_at", end.toISOString())
    .order("created_at", { ascending: false })
    .limit(20000);

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
    "Date & Time": new Date(e.created_at as string).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }),
    "Task Title": taskTitle[e.task_id as string] ?? "—",
    "Event Type": e.event_type,
    Actor: actorName[e.actor_id as string] ?? "—",
    "Old Value": (e.old_value as string) ?? "",
    "New Value": (e.new_value as string) ?? "",
    Note: (e.note as string) ?? "",
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ "Date & Time": "" }]);
  XLSX.utils.book_append_sheet(wb, ws, "Audit");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const body = new Uint8Array(buf);

  const suffix = fileSuffixFromDates(start, end);
  const filename = `audit-log-${suffix}.xlsx`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
