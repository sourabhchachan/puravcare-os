import { NextResponse } from "next/server";

import { assertActiveUser, getActorId } from "@/lib/api/actor";
import { processVerticalChainAfterTaskClosed } from "@/lib/chains/onTaskClose";
import { createServiceClient } from "@/lib/supabase/service";

type Body = {
  task_id?: string;
};

/** Called after a task is closed — advances vertical chains (sequential). */
export async function POST(request: Request) {
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const taskId = (body.task_id ?? "").trim();
  if (!taskId) return NextResponse.json({ error: "missing_task_id" }, { status: 400 });

  const supabase = createServiceClient();
  await processVerticalChainAfterTaskClosed(supabase, taskId);
  return NextResponse.json({ ok: true });
}
