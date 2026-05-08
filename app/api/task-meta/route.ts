import { NextResponse } from "next/server";

import { assertActiveUser, canCreateTasks, getActorId, getUserRole } from "@/lib/api/actor";
import { createServiceClient } from "@/lib/supabase/service";

/** Active users, active patients, approved PSI nodes — for task forms & filters */
export async function GET(request: Request) {
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const role = await getUserRole(actorId);
  const supabase = createServiceClient();

  const [{ data: users, error: usersError }, { data: patients }, { data: psiNodes }] = await Promise.all([
    supabase.from("users").select("id, full_name, role").eq("is_active", true).order("full_name"),
    supabase.from("patients").select("id, full_name, uhid").eq("status", "active").order("full_name"),
    supabase.from("psi_nodes").select("id, title, type").eq("status", "approved").order("title"),
  ]);

  if (usersError) {
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }

  const canCreate = role === "ceo" || (await canCreateTasks(actorId));

  return NextResponse.json({
    users: users ?? [],
    patients: patients ?? [],
    psi_nodes: psiNodes ?? [],
    can_create_tasks: canCreate,
    role,
  });
}
