import { NextResponse } from "next/server";

import { assertActiveUser, canCreateTasks, getActorId, getUserRole } from "@/lib/api/actor";
import { createServiceClient } from "@/lib/supabase/service";
import { normalizeTemplateTaskType } from "@/lib/task/taskTypes";

/** Active users, active IPD patients, approved PSI nodes, task templates — for task forms */
export async function GET(request: Request) {
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const role = await getUserRole(actorId);
  const supabase = createServiceClient();
  const canCreate = await canCreateTasks(actorId);

  const [usersRes, patientsRes, psiRes, templatesRes] = await Promise.all([
    supabase.from("users").select("id, full_name, role").eq("is_active", true).order("full_name"),
    supabase
      .from("patients")
      .select("id, full_name, uhid")
      .eq("status", "active")
      .eq("admission_type", "ipd")
      .order("full_name"),
    supabase.from("psi_nodes").select("id, title, type").eq("status", "approved").order("title"),
    canCreate
      ? supabase.from("task_master").select("id, title, task_type").eq("is_active", true).order("title")
      : Promise.resolve({ data: [] as { id: string; title: string; task_type: string }[], error: null }),
  ]);

  if (usersRes.error) {
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }

  const templates = (templatesRes.data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    task_type: normalizeTemplateTaskType(row.task_type),
  }));

  return NextResponse.json({
    users: usersRes.data ?? [],
    patients: patientsRes.data ?? [],
    psi_nodes: psiRes.data ?? [],
    task_templates: templates,
    can_create_tasks: canCreate,
    role,
  });
}
