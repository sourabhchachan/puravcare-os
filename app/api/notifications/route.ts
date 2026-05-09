import { NextResponse } from "next/server";

import { assertActiveUser, getActorId } from "@/lib/api/actor";
import { scanOverdueTaskNotifications } from "@/lib/notifications/scanOverdue";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET(request: Request) {
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  if (url.searchParams.get("unread_count_only") === "1") {
    const supabase = createServiceClient();
    const { count, error } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", actorId!)
      .eq("is_read", false);
    if (error) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
    return NextResponse.json({ unread: count ?? 0 });
  }

  const supabase = createServiceClient();
  await scanOverdueTaskNotifications(supabase);

  const { data: rows, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", actorId!)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  return NextResponse.json({ notifications: rows ?? [] });
}

export async function POST(request: Request) {
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { action?: string };
  try {
    body = (await request.json()) as { action?: string };
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (body.action !== "mark_all_read") {
    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { error } = await supabase.from("notifications").update({ is_read: true }).eq("user_id", actorId!).eq("is_read", false);
  if (error) return NextResponse.json({ error: "update_failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
