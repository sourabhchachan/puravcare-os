import { NextResponse } from "next/server";

import { assertActiveUser, canCreateTasks, getActorId, getUserRole } from "@/lib/api/actor";
import { assertCeoOrOps } from "@/lib/api/ceoOrOps";
import { createServiceClient } from "@/lib/supabase/service";
import { normalizeTemplateTaskType } from "@/lib/task/taskTypes";

/** Active users, active IPD patients, approved active Problem nodes, task templates — for task forms */
export async function GET(request: Request) {
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const role = await getUserRole(actorId);
  const supabase = createServiceClient();
  const canCreate = await canCreateTasks(actorId);

  let templatesQuery = supabase.from("task_master").select("id, title, task_type, psi_node_id").eq("is_active", true);
  if (canCreate) {
    const privileged = await assertCeoOrOps(actorId);
    if (!privileged) {
      if (role === "vendor") {
        templatesQuery = templatesQuery.eq("visible_to_vendor", true);
      } else {
        templatesQuery = templatesQuery.eq("visible_to_staff", true);
      }
    }
  }

  const [usersRes, patientsRes, psiRes, templatesRes] = await Promise.all([
    supabase.from("users").select("id, full_name, role").eq("is_active", true).order("full_name"),
    supabase
      .from("patients")
      .select("id, full_name, uhid, ipd_number")
      .eq("status", "active")
      .eq("admission_type", "ipd")
      .order("full_name"),
    supabase
      .from("psi_nodes")
      .select("id, title, type")
      .eq("status", "approved")
      .eq("type", "problem")
      .eq("is_active", true)
      .order("title"),
    canCreate ? templatesQuery.order("title") : Promise.resolve({ data: [] as { id: string; title: string; task_type: string; psi_node_id: string | null }[], error: null }),
  ]);

  if (usersRes.error) {
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }

  const templates = (templatesRes.data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    task_type: normalizeTemplateTaskType(row.task_type),
    psi_node_id: (row.psi_node_id as string | null) ?? null,
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
