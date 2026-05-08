import { NextResponse } from "next/server";

import { assertActiveUser, getActorId } from "@/lib/api/actor";
import { assertCeo } from "@/lib/api/ceo";
import { createServiceClient } from "@/lib/supabase/service";

const RECURRENCE = ["one-time", "hourly", "2h", "4h", "6h", "8h", "daily", "weekly"] as const;

export async function GET(request: Request) {
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId)) || !(await assertCeo(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase.from("task_master").select("*").order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  return NextResponse.json({ templates: data ?? [] });
}

type PostBody = {
  title?: string;
  task_type?: string;
  default_assignee_role?: string | null;
  proof_type?: string;
  recurrence?: string;
  priority?: string;
  is_patient_linked?: boolean;
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
  if (!taskType || !["patient", "ops"].includes(taskType)) {
    return NextResponse.json({ error: "invalid_type" }, { status: 400 });
  }

  const dar = body.default_assignee_role?.trim() || null;
  if (dar && !["ceo", "ops", "staff"].includes(dar)) {
    return NextResponse.json({ error: "invalid_assignee_role" }, { status: 400 });
  }

  const proofType = body.proof_type;
  if (!proofType || !["tap", "photo", "countersign"].includes(proofType)) {
    return NextResponse.json({ error: "invalid_proof" }, { status: 400 });
  }

  const recurrence = body.recurrence;
  if (!recurrence || !RECURRENCE.includes(recurrence as (typeof RECURRENCE)[number])) {
    return NextResponse.json({ error: "invalid_recurrence" }, { status: 400 });
  }

  const priority = body.priority;
  if (!priority || !["critical", "high", "normal", "low"].includes(priority)) {
    return NextResponse.json({ error: "invalid_priority" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("task_master")
    .insert({
      title,
      task_type: taskType,
      default_assignee_role: dar,
      proof_type: proofType,
      recurrence,
      priority,
      is_patient_linked: Boolean(body.is_patient_linked),
      is_active: body.is_active !== false,
      created_by: actorId!,
    })
    .select("*")
    .single();

  if (error || !data) return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  return NextResponse.json({ template: data });
}
