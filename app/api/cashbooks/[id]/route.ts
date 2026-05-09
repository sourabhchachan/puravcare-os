import { NextResponse } from "next/server";

import { assertActiveUser, getActorId } from "@/lib/api/actor";
import { assertCeo } from "@/lib/api/ceo";
import { createServiceClient } from "@/lib/supabase/service";

async function bookBalance(supabase: ReturnType<typeof createServiceClient>, cashbookId: string): Promise<number> {
  const { data: entries } = await supabase
    .from("cash_entries")
    .select("entry_type, amount")
    .eq("cashbook_id", cashbookId);
  let sum = 0;
  for (const row of entries ?? []) {
    const amt = Number(row.amount);
    sum += row.entry_type === "in" ? amt : -amt;
  }
  return sum;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: cashbookId } = await params;
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = createServiceClient();
  const isCeo = await assertCeo(actorId!);

  const { data: book, error: bErr } = await supabase
    .from("cashbooks")
    .select("id, name, description, is_active")
    .eq("id", cashbookId)
    .maybeSingle();

  if (bErr || !book || !book.is_active) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { data: myMember } = await supabase
    .from("cashbook_members")
    .select("*")
    .eq("cashbook_id", cashbookId)
    .eq("user_id", actorId!)
    .maybeSingle();

  if (!isCeo && !myMember) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const role = isCeo ? "ceo" : (myMember!.role as string);
  const hideOthers = !isCeo && role === "data_operator" && Boolean(myMember!.hide_others_entries);
  const hideBal = !isCeo && role === "data_operator" && Boolean(myMember!.hide_balance);

  const canManageMembers = isCeo || role === "primary_admin";
  const canEditAnyEntry = isCeo || role === "primary_admin" || role === "admin";

  let entriesQuery = supabase
    .from("cash_entries")
    .select("id, entry_type, amount, description, entry_date, created_by, created_at")
    .eq("cashbook_id", cashbookId)
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (hideOthers) {
    entriesQuery = entriesQuery.eq("created_by", actorId!);
  }

  const { data: entryRows, error: eErr } = await entriesQuery;
  if (eErr) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });

  const creatorIds = [...new Set((entryRows ?? []).map((e) => e.created_by as string))];
  let nameMap: Record<string, string> = {};
  if (creatorIds.length) {
    const { data: users } = await supabase.from("users").select("id, full_name").in("id", creatorIds);
    nameMap = Object.fromEntries((users ?? []).map((u) => [u.id as string, u.full_name as string]));
  }

  const entries = (entryRows ?? []).map((e) => ({
    ...e,
    created_by_name: nameMap[e.created_by as string] ?? "—",
  }));

  const balance = hideBal ? null : await bookBalance(supabase, cashbookId);

  const { data: memberRows } = await supabase.from("cashbook_members").select("user_id, role").eq("cashbook_id", cashbookId);
  const memberUserIds = [...new Set((memberRows ?? []).map((m) => m.user_id as string))];
  let memberNames: Record<string, string> = {};
  if (memberUserIds.length) {
    const { data: users } = await supabase.from("users").select("id, full_name").in("id", memberUserIds);
    memberNames = Object.fromEntries((users ?? []).map((u) => [u.id as string, u.full_name as string]));
  }

  const members = (memberRows ?? []).map((m) => ({
    user_id: m.user_id as string,
    full_name: memberNames[m.user_id as string] ?? "—",
    role: m.role as string,
  }));

  let directory_users: { id: string; full_name: string; role: string }[] | undefined;
  if (canManageMembers) {
    const existing = new Set(members.map((m) => m.user_id));
    const { data: allUsers } = await supabase.from("users").select("id, full_name, role").eq("is_active", true).order("full_name");
    directory_users = (allUsers ?? []).filter((u) => !existing.has(u.id as string)) as typeof directory_users;
  }

  return NextResponse.json({
    cashbook: { id: book.id, name: book.name, description: book.description },
    balance,
    role,
    my_member: myMember ?? null,
    can_manage_members: canManageMembers,
    can_edit_any_entry: canEditAnyEntry,
    hide_others_entries: hideOthers,
    hide_balance: hideBal,
    can_backdate: isCeo ? "always" : (myMember?.can_backdate as string) ?? "never",
    can_edit_own: isCeo ? true : Boolean(myMember?.can_edit_own),
    entries,
    members,
    directory_users,
  });
}
