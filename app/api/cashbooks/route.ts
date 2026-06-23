import { NextResponse } from "next/server";

import { assertActiveUser, getActorId, getUserRole } from "@/lib/api/actor";
import { assertCeo } from "@/lib/api/ceo";
import { createServiceClient } from "@/lib/supabase/service";

type CashbookRow = { id: string; name: string; description: string | null };

async function computeBalances(supabase: ReturnType<typeof createServiceClient>, bookIds: string[]) {
  if (!bookIds.length) return new Map<string, number>();
  const { data: entries } = await supabase
    .from("cash_entries")
    .select("cashbook_id, entry_type, amount")
    .in("cashbook_id", bookIds);
  const map = new Map<string, number>();
  for (const row of entries ?? []) {
    const id = row.cashbook_id as string;
    const amt = Number(row.amount);
    const delta = row.entry_type === "in" ? amt : -amt;
    map.set(id, (map.get(id) ?? 0) + delta);
  }
  return map;
}

async function memberCounts(supabase: ReturnType<typeof createServiceClient>, bookIds: string[]) {
  if (!bookIds.length) return new Map<string, number>();
  const { data: rows } = await supabase.from("cashbook_members").select("cashbook_id").in("cashbook_id", bookIds);
  const map = new Map<string, number>();
  for (const r of rows ?? []) {
    const id = r.cashbook_id as string;
    map.set(id, (map.get(id) ?? 0) + 1);
  }
  return map;
}

export async function GET(request: Request) {
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = createServiceClient();
  const role = await getUserRole(actorId);
  const isCeo = role === "ceo";

  let books: CashbookRow[] = [];
  if (isCeo) {
    const { data, error } = await supabase.from("cashbooks").select("id, name, description").eq("is_active", true).order("name");
    if (error) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
    books = (data ?? []) as CashbookRow[];
  } else {
    const { data: mems, error: mErr } = await supabase.from("cashbook_members").select("cashbook_id").eq("user_id", actorId!);
    if (mErr) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
    const ids = [...new Set((mems ?? []).map((m) => m.cashbook_id as string))];
    if (!ids.length) {
      return NextResponse.json({ cashbooks: [], is_ceo: false });
    }
    const { data, error } = await supabase.from("cashbooks").select("id, name, description").in("id", ids).eq("is_active", true).order("name");
    if (error) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
    books = (data ?? []) as CashbookRow[];
  }

  const ids = books.map((b) => b.id);
  const [balMap, countMap] = await Promise.all([computeBalances(supabase, ids), memberCounts(supabase, ids)]);

  const cashbooks = books.map((b) => ({
    ...b,
    balance: balMap.get(b.id) ?? 0,
    member_count: countMap.get(b.id) ?? 0,
  }));

  let users: { id: string; full_name: string; role: string }[] | undefined;
  if (isCeo) {
    const { data } = await supabase.from("users").select("id, full_name, role").eq("is_active", true).order("full_name");
    users = data ?? undefined;
  }

  return NextResponse.json({ cashbooks, is_ceo: isCeo, users });
}

type MemberIn = {
  user_id: string;
  role: "primary_admin" | "admin" | "data_operator" | "viewer";
  can_backdate?: "always" | "never" | "1day";
  can_edit_own?: boolean;
  hide_balance?: boolean;
  hide_others_entries?: boolean;
};

type PostBody = {
  name?: string;
  description?: string | null;
  members?: MemberIn[];
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

  const name = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "missing_name" }, { status: 400 });

  const supabase = createServiceClient();

  const { data: book, error: bErr } = await supabase
    .from("cashbooks")
    .insert({
      name,
      description: (body.description ?? "").trim() || null,
      is_active: true,
      created_by: actorId!,
    })
    .select("id, name, description")
    .single();

  if (bErr || !book) return NextResponse.json({ error: "insert_failed" }, { status: 500 });

  const cashbookId = book.id as string;
  const seen = new Set<string>();

  const memberRows: Record<string, unknown>[] = [];

  memberRows.push({
    cashbook_id: cashbookId,
    user_id: actorId!,
    role: "primary_admin",
    can_backdate: "always",
    can_edit_own: true,
    hide_balance: false,
    hide_others_entries: false,
  });
  seen.add(actorId!);

  for (const m of body.members ?? []) {
    const uid = (m.user_id ?? "").trim();
    if (!uid || seen.has(uid)) continue;
    if (m.role === "primary_admin") {
      return NextResponse.json({ error: "invalid_primary_admin" }, { status: 400 });
    }
    const { data: u } = await supabase.from("users").select("id").eq("id", uid).eq("is_active", true).maybeSingle();
    if (!u) return NextResponse.json({ error: "invalid_member_user" }, { status: 400 });

    const role = m.role;
    if (!["admin", "data_operator", "viewer"].includes(role)) {
      return NextResponse.json({ error: "invalid_member_role" }, { status: 400 });
    }

    const canBackdate = role === "data_operator" ? m.can_backdate ?? "never" : "never";
    if (!["always", "never", "1day"].includes(canBackdate)) {
      return NextResponse.json({ error: "invalid_can_backdate" }, { status: 400 });
    }

    memberRows.push({
      cashbook_id: cashbookId,
      user_id: uid,
      role,
      can_backdate: canBackdate,
      can_edit_own: role === "data_operator" ? Boolean(m.can_edit_own) : role === "viewer" ? false : true,
      hide_balance: role === "data_operator" ? Boolean(m.hide_balance) : false,
      hide_others_entries: role === "data_operator" ? Boolean(m.hide_others_entries) : false,
    });
    seen.add(uid);
  }

  const { error: memErr } = await supabase.from("cashbook_members").insert(memberRows);
  if (memErr) {
    await supabase.from("cashbooks").delete().eq("id", cashbookId);
    return NextResponse.json({ error: "members_insert_failed" }, { status: 500 });
  }

  return NextResponse.json({ cashbook: { ...book, balance: 0, member_count: memberRows.length } });
}
