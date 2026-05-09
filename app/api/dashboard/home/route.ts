import { NextResponse } from "next/server";

import { assertActiveUser, getActorId, getUserRole } from "@/lib/api/actor";
import { createServiceClient } from "@/lib/supabase/service";

function startOfTodayIso() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return start.toISOString();
}

export async function GET(request: Request) {
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const role = await getUserRole(actorId);
  if (role !== "ops" && role !== "staff") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = createServiceClient();
  const nowIso = new Date().toISOString();
  const todayIso = startOfTodayIso();

  const [myOpenTasksRes, overdueTasksRes, activePatientsRes] = await Promise.all([
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true)
      .eq("assignee_id", actorId!)
      .neq("status", "closed"),
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true)
      .eq("assignee_id", actorId!)
      .lt("due_at", nowIso)
      .neq("status", "closed"),
    supabase.from("patients").select("id", { count: "exact", head: true }).eq("status", "active"),
  ]);

  if (myOpenTasksRes.error || overdueTasksRes.error || activePatientsRes.error) {
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }

  if (role === "ops") {
    const myCashbooksRes = await supabase
      .from("cashbook_members")
      .select("cashbook_id", { count: "exact", head: true })
      .eq("user_id", actorId!);

    if (myCashbooksRes.error) {
      return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
    }

    return NextResponse.json({
      role,
      my_open_tasks: myOpenTasksRes.count ?? 0,
      overdue_tasks: overdueTasksRes.count ?? 0,
      active_patients: activePatientsRes.count ?? 0,
      my_cashbooks: myCashbooksRes.count ?? 0,
    });
  }

  const completedTodayRes = await supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true)
    .eq("assignee_id", actorId!)
    .in("status", ["confirmed", "closed"])
    .gte("updated_at", todayIso)
    .lt("updated_at", nowIso);

  if (completedTodayRes.error) {
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }

  return NextResponse.json({
    role,
    my_open_tasks: myOpenTasksRes.count ?? 0,
    overdue_tasks: overdueTasksRes.count ?? 0,
    tasks_completed_today: completedTodayRes.count ?? 0,
  });
}
