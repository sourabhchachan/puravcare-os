import { NextResponse } from "next/server";

import { assertActiveUser, canCreateTasks, getActorId } from "@/lib/api/actor";
import { assertCeo } from "@/lib/api/ceo";
import { createServiceClient } from "@/lib/supabase/service";
import { normalizeTemplateTaskType } from "@/lib/task/taskTypes";

export async function GET(request: Request) {
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = createServiceClient();
  const isCeo = await assertCeo(actorId);

  if (isCeo) {
    const { data, error } = await supabase.from("task_master").select("*").order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
    return NextResponse.json({ templates: data ?? [] });
  }

  if (!(await canCreateTasks(actorId!))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("task_master")
    .select("id, title, task_type, is_active")
    .eq("is_active", true)
    .order("title");

  if (error) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  const templates = (data ?? []).map((row) => ({
    ...row,
    task_type: normalizeTemplateTaskType(row.task_type as string),
  }));
  return NextResponse.json({ templates });
}

type PostBody = {
  title?: string;
  task_type?: string;
  is_active?: boolean;
};

export async function POST(request: Request) {
  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId)) || !(await assertCeo(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const title = (body.title ?? "").trim();
  if (!title) return NextResponse.json({ error: "missing_title" }, { status: 400 });

  const taskType = body.task_type;
  if (!taskType || !["ops", "clinical"].includes(taskType)) {
    return NextResponse.json({ error: "invalid_type" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("task_master")
    .insert({
      title,
      task_type: taskType,
      is_active: body.is_active !== false,
      created_by: actorId!,
    })
    .select("*")
    .single();

  if (error || !data) return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  return NextResponse.json({ template: data });
}
