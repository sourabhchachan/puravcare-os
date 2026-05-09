import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

import { assertActiveUser, getActorId, getUserRole } from "@/lib/api/actor";
import { fileSuffixFromDates, rangeFromPreset } from "@/lib/dashboard/reportRange";
import { canViewTask } from "@/lib/tasks/canViewTask";
import { createServiceClient } from "@/lib/supabase/service";

type TaskRow = {
  id: string;
  title: string;
  assignee_id: string;
  created_by: string;
  countersign_user_id: string | null;
};

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: taskId } = await params;
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const preset = url.searchParams.get("preset") ?? "this_year";
  const startQ = url.searchParams.get("start");
  const endQ = url.searchParams.get("end");

  const { start, end } = rangeFromPreset(preset, startQ, endQ);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return NextResponse.json({ error: "invalid_range" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: task, error: taskErr } = await supabase
    .from("tasks")
    .select("id, title, assignee_id, created_by, countersign_user_id")
    .eq("id", taskId)
    .maybeSingle();
  if (taskErr || !task) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const role = await getUserRole(actorId);
  if (!canViewTask(task as TaskRow, actorId!, role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { data: events, error } = await supabase
    .from("task_events")
    .select("actor_id, event_type, old_value, new_value, note, created_at")
    .eq("task_id", taskId)
    .gte("created_at", start.toISOString())
    .lte("created_at", end.toISOString())
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });

  const actorIds = [...new Set((events ?? []).map((e) => e.actor_id as string))];
  let actorName: Record<string, string> = {};
  if (actorIds.length) {
    const { data: users } = await supabase.from("users").select("id, full_name").in("id", actorIds);
    actorName = Object.fromEntries((users ?? []).map((u) => [u.id, u.full_name as string]));
  }

  const rows = (events ?? []).map((e) => ({
    "Date & Time": new Date(e.created_at as string).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }),
    "Event Type": e.event_type,
    Actor: actorName[e.actor_id as string] ?? "—",
    "Old Value": (e.old_value as string) ?? "",
    "New Value": (e.new_value as string) ?? "",
    Note: (e.note as string) ?? "",
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ "Date & Time": "" }]);
  XLSX.utils.book_append_sheet(wb, ws, "Activity");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const body = new Uint8Array(buf);

  const titleSlug = String(task.title)
    .replace(/[^\w\-]+/g, "_")
    .slice(0, 28)
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "") || "task";
  const suffix = fileSuffixFromDates(start, end);
  const filename = `task-activity-${titleSlug}-${suffix}.xlsx`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
