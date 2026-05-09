import { NextResponse } from "next/server";

import { assertActiveUser, getActorId } from "@/lib/api/actor";
import { assertCeo } from "@/lib/api/ceo";
import { DEFAULT_PAYMENT_METHOD_NAMES } from "@/lib/cashbook/paymentMethodDefaults";
import { createServiceClient } from "@/lib/supabase/service";

function sortByNameCi<T extends { name: string }>(rows: T[]) {
  return [...rows].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

async function seedDefaultsIfEmpty(supabase: ReturnType<typeof createServiceClient>) {
  const { count } = await supabase.from("payment_methods").select("id", { count: "exact", head: true });
  if ((count ?? 0) > 0) return;

  const rows = DEFAULT_PAYMENT_METHOD_NAMES.map((name) => ({
    name,
    is_active: true,
  }));
  await supabase.from("payment_methods").insert(rows);
}

export async function GET(request: Request) {
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const activeOnly = url.searchParams.get("active_only") === "1";

  const supabase = createServiceClient();
  await seedDefaultsIfEmpty(supabase);

  let q = supabase.from("payment_methods").select("id, name, is_active, created_at");
  if (activeOnly) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });

  const rows = sortByNameCi(data ?? []);
  const { data: usage } = await supabase.from("cash_entries").select("payment_method_id");
  const usageMap: Record<string, number> = {};
  for (const r of usage ?? []) {
    const pid = r.payment_method_id as string | null;
    if (pid) usageMap[pid] = (usageMap[pid] ?? 0) + 1;
  }

  return NextResponse.json({
    payment_methods: rows.map((r) => ({
      ...r,
      entry_count: usageMap[r.id as string] ?? 0,
    })),
  });
}

type PostBody = { name?: string };

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
  if (!name) return NextResponse.json({ error: "name_required" }, { status: 400 });

  const supabase = createServiceClient();
  const { data: existing } = await supabase.from("payment_methods").select("id, name");
  const lower = name.toLowerCase();
  if ((existing ?? []).some((r) => (r.name as string).toLowerCase() === lower)) {
    return NextResponse.json({ error: "duplicate_name" }, { status: 400 });
  }

  const { data: row, error } = await supabase
    .from("payment_methods")
    .insert({ name, created_by: actorId })
    .select("id, name, is_active, created_at")
    .single();

  if (error || !row) return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  return NextResponse.json({ payment_method: { ...row, entry_count: 0 } });
}
