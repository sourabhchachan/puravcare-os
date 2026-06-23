import { NextResponse } from "next/server";

import { assertActiveUser, getActorId } from "@/lib/api/actor";
import { assertCeo } from "@/lib/api/ceo";
import { createServiceClient } from "@/lib/supabase/service";

type PostBody = { user_id?: string };

export async function GET(request: Request) {
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!(await assertCeo(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = createServiceClient();
  const { data: rows, error } = await supabase
    .from("mrd_members")
    .select("id, user_id, created_at, created_by")
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });

  const userIds = [...new Set((rows ?? []).map((r) => r.user_id as string))];
  const { data: users } = userIds.length
    ? await supabase.from("users").select("id, full_name, staff_id, role, is_active").in("id", userIds)
    : { data: [] };

  const userMap = new Map((users ?? []).map((u) => [u.id as string, u]));

  const members = (rows ?? []).map((row) => {
    const user = userMap.get(row.user_id as string);
    return {
      id: row.id,
      user_id: row.user_id,
      created_at: row.created_at,
      full_name: user?.full_name ?? "—",
      staff_id: user?.staff_id ?? "—",
      role: user?.role ?? "—",
      is_active: user?.is_active ?? false,
    };
  });

  return NextResponse.json({ members });
}

export async function POST(request: Request) {
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!(await assertCeo(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const userId = (body.user_id ?? "").trim();
  if (!userId) return NextResponse.json({ error: "missing_user_id" }, { status: 400 });

  const supabase = createServiceClient();
  const { data: user } = await supabase.from("users").select("id").eq("id", userId).eq("is_active", true).maybeSingle();
  if (!user) return NextResponse.json({ error: "invalid_user" }, { status: 400 });

  const { error } = await supabase.from("mrd_members").insert({
    user_id: userId,
    created_by: actorId,
  });

  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "already_member" }, { status: 409 });
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!(await assertCeo(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const userId = new URL(request.url).searchParams.get("user_id")?.trim();
  if (!userId) return NextResponse.json({ error: "missing_user_id" }, { status: 400 });

  const supabase = createServiceClient();
  const { error } = await supabase.from("mrd_members").delete().eq("user_id", userId);
  if (error) return NextResponse.json({ error: "delete_failed" }, { status: 500 });

  return NextResponse.json({ ok: true });
}
