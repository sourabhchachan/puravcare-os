import { NextResponse } from "next/server";

import { assertActiveUser, getActorId, getUserRole } from "@/lib/api/actor";
import { assertCeo } from "@/lib/api/ceo";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET(request: Request) {
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const role = await getUserRole(actorId);
  if (!["ceo", "ops"].includes(role ?? "")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();

  const supabase = createServiceClient();
  let query = supabase.from("vendors").select("*").order("name", { ascending: true });
  if (q) query = query.ilike("name", `%${q}%`);

  const { data: vendors, error } = await query;
  if (error) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  return NextResponse.json({ vendors: vendors ?? [] });
}

type PostBody = {
  name?: string;
  category?: string | null;
  phone?: string | null;
  user_id?: string | null;
  is_active?: boolean;
};

export async function POST(request: Request) {
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId)) || !(await assertCeo(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "missing_name" }, { status: 400 });

  const supabase = createServiceClient();
  const userId = body.user_id?.trim() || null;
  if (userId) {
    const { data: u } = await supabase.from("users").select("id, role").eq("id", userId).eq("is_active", true).maybeSingle();
    if (!u || u.role !== "vendor") return NextResponse.json({ error: "invalid_user_link" }, { status: 400 });
    const { data: taken } = await supabase.from("vendors").select("id").eq("user_id", userId).maybeSingle();
    if (taken) return NextResponse.json({ error: "user_already_linked" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("vendors")
    .insert({
      name,
      category: (body.category ?? "").trim() || null,
      phone: (body.phone ?? "").trim() || null,
      user_id: userId,
      is_active: body.is_active !== false,
    })
    .select("*")
    .single();

  if (error || !data) return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  return NextResponse.json({ vendor: data });
}
