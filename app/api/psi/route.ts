import { NextResponse } from "next/server";

import { assertActiveUser, getActorId } from "@/lib/api/actor";
import { createServiceClient } from "@/lib/supabase/service";

type PsiRow = {
  id: string;
  type: string;
  title: string;
  description: string | null;
  parent_id: string | null;
  status: string;
  created_by: string | null;
  created_at: string;
  approved_by: string | null;
};

export async function GET(request: Request) {
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = createServiceClient();
  const { data: rows, error } = await supabase
    .from("psi_nodes")
    .select("id, type, title, description, parent_id, status, created_by, created_at, approved_by")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });

  const creatorIds = [...new Set((rows ?? []).map((r) => r.created_by as string).filter(Boolean))];
  let nameMap: Record<string, string> = {};
  if (creatorIds.length) {
    const { data: users } = await supabase.from("users").select("id, full_name").in("id", creatorIds);
    nameMap = Object.fromEntries((users ?? []).map((u) => [u.id as string, u.full_name as string]));
  }

  const nodes = (rows ?? []).map((r) => ({
    ...(r as PsiRow),
    created_by_name: r.created_by ? (nameMap[r.created_by as string] ?? "—") : "—",
  }));

  return NextResponse.json({ nodes });
}

type PostBody = {
  type?: string;
  title?: string;
  description?: string | null;
  parent_id?: string | null;
};

export async function POST(request: Request) {
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const type = (body.type ?? "").toLowerCase();
  if (!["problem", "solution", "indicator"].includes(type)) {
    return NextResponse.json({ error: "invalid_type" }, { status: 400 });
  }

  const title = (body.title ?? "").trim();
  if (!title) return NextResponse.json({ error: "missing_title" }, { status: 400 });

  const parentId = body.parent_id?.trim() || null;
  const supabase = createServiceClient();

  if (type === "problem" && parentId) {
    return NextResponse.json({ error: "problem_must_be_root" }, { status: 400 });
  }

  if (type === "solution") {
    if (!parentId) return NextResponse.json({ error: "missing_parent" }, { status: 400 });
    const { data: parent } = await supabase.from("psi_nodes").select("id, type").eq("id", parentId).maybeSingle();
    if (!parent || parent.type !== "problem") {
      return NextResponse.json({ error: "invalid_parent" }, { status: 400 });
    }
  }

  if (type === "indicator") {
    if (!parentId) return NextResponse.json({ error: "missing_parent" }, { status: 400 });
    const { data: parent } = await supabase.from("psi_nodes").select("id, type").eq("id", parentId).maybeSingle();
    if (!parent || parent.type !== "solution") {
      return NextResponse.json({ error: "invalid_parent" }, { status: 400 });
    }
  }

  const { data, error } = await supabase
    .from("psi_nodes")
    .insert({
      type,
      title,
      description: (body.description ?? "").trim() || null,
      parent_id: type === "problem" ? null : parentId,
      status: "proposed",
      created_by: actorId!,
    })
    .select("id, type, title, description, parent_id, status, created_by, created_at, approved_by")
    .single();

  if (error || !data) return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  return NextResponse.json({ node: data });
}
