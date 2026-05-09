import { NextResponse } from "next/server";

import { assertActiveUser, getActorId, getUserRole } from "@/lib/api/actor";
import { kolkataDayBoundsIso } from "@/lib/dashboard/kolkataDay";
import { scanOverdueTaskNotifications } from "@/lib/notifications/scanOverdue";
import { createServiceClient } from "@/lib/supabase/service";
import { OPEN_ASSIGNMENT_STATUSES } from "@/lib/tasks/activeTaskFilters";

/** Same notion as task list “Overdue” filter: open work, past due. */
const OVERDUE_STATUSES = ["pending", "acknowledged", "in_progress", "blocked"];

export async function GET(request: Request) {
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if ((await getUserRole(actorId)) !== "ceo") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = createServiceClient();
  await scanOverdueTaskNotifications(supabase);

  const { startIso, endIso } = kolkataDayBoundsIso();
  const nowIso = new Date().toISOString();

  const [
    tasksTodayRes,
    overdueRes,
    patientsRes,
    cashRes,
    unlinkedRes,
  ] = await Promise.all([
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true)
      .neq("status", "cancelled")
      .neq("status", "waiting")
      .gte("created_at", startIso)
      .lte("created_at", endIso),
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true)
      .not("due_at", "is", null)
      .lt("due_at", nowIso)
      .in("status", OVERDUE_STATUSES),
    supabase.from("patients").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("cash_entries").select("entry_type, amount"),
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true)
      .is("psi_node_id", null)
      .in("status", OPEN_ASSIGNMENT_STATUSES),
  ]);

  let cashBalance = 0;
  for (const row of cashRes.data ?? []) {
    const amt = Number((row as { amount: string }).amount);
    if (Number.isNaN(amt)) continue;
    if ((row as { entry_type: string }).entry_type === "in") cashBalance += amt;
    else cashBalance -= amt;
  }

  return NextResponse.json({
    tasks_today: tasksTodayRes.count ?? 0,
    overdue: overdueRes.count ?? 0,
    active_patients: patientsRes.count ?? 0,
    cash_balance: cashBalance,
    tasks_unlinked_psi: unlinkedRes.count ?? 0,
  });
}
