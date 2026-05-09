import { NextResponse } from "next/server";

import { assertActiveUser, getActorId, getUserRole } from "@/lib/api/actor";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET(request: Request) {
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = createServiceClient();
  const { data: rows, error } = await supabase
    .from("notices")
    .select("id, title, body, created_by, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });

  const authorIds = [...new Set((rows ?? []).map((r) => r.created_by as string | null).filter(Boolean))] as string[];
  let names: Record<string, string> = {};
  if (authorIds.length) {
    const { data: users } = await supabase.from("users").select("id, full_name").in("id", authorIds);
    names = Object.fromEntries((users ?? []).map((u) => [u.id, u.full_name as string]));
  }

  const notices = (rows ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    body: r.body,
    created_at: r.created_at,
    posted_by: r.created_by ? (names[r.created_by as string] ?? "—") : "—",
  }));

  return NextResponse.json({ notices });
}

type PostBody = { title?: string; body?: string | null };

export async function POST(request: Request) {
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const role = await getUserRole(actorId);
  if (role !== "ceo" && role !== "ops") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const title = body.title?.trim() ?? "";
  if (!title) return NextResponse.json({ error: "title_required" }, { status: 400 });

  const supabase = createServiceClient();
  const { data: row, error } = await supabase
    .from("notices")
    .insert({
      title,
      body: body.body?.trim() || null,
      created_by: actorId,
    })
    .select("id, title, body, created_by, created_at")
    .maybeSingle();

  if (error || !row) return NextResponse.json({ error: "insert_failed" }, { status: 500 });

  const { data: u } = await supabase.from("users").select("full_name").eq("id", actorId!).maybeSingle();

  return NextResponse.json({
    notice: {
      id: row.id,
      title: row.title,
      body: row.body,
      created_at: row.created_at,
      posted_by: u?.full_name ?? "—",
    },
  });
}
