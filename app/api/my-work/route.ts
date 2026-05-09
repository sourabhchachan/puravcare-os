import { NextResponse } from "next/server";

import { assertActiveUser, getActorId } from "@/lib/api/actor";
import { createServiceClient } from "@/lib/supabase/service";
import { OPEN_ASSIGNMENT_STATUSES } from "@/lib/tasks/activeTaskFilters";

type Tab = "assigned" | "raised" | "items_raised" | "items_assigned";

export async function GET(request: Request) {
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const tab = (new URL(request.url).searchParams.get("tab") ?? "assigned") as Tab;
  const supabase = createServiceClient();

  if (tab === "assigned") {
    const { data: tasks, error } = await supabase
      .from("tasks")
      .select("id, title, status, due_at, created_at")
      .eq("assignee_id", actorId!)
      .eq("is_active", true)
      .in("status", OPEN_ASSIGNMENT_STATUSES)
      .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
    const rows = (tasks ?? []).map((t) => ({
      id: t.id as string,
      title: t.title as string,
      subtitle: (t.due_at as string | null) ? `Due ${new Date(t.due_at as string).toLocaleString()}` : null,
      status: t.status as string,
      href: `/dashboard/tasks/${t.id}`,
    }));
    return NextResponse.json({ tab, rows });
  }

  if (tab === "raised") {
    const { data: tasks, error } = await supabase
      .from("tasks")
      .select("id, title, status, due_at, created_at")
      .eq("created_by", actorId!)
      .eq("is_active", true)
      .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
    const rows = (tasks ?? []).map((t) => ({
      id: t.id as string,
      title: t.title as string,
      subtitle: `Status · ${t.status}`,
      status: t.status as string,
      href: `/dashboard/tasks/${t.id}`,
    }));
    return NextResponse.json({ tab, rows });
  }

  async function mapBillableRows(
    bills: { id: string; status: string; patient_id: string; item_id: string }[] | null,
  ) {
    const list = bills ?? [];
    const patientIds = [...new Set(list.map((b) => b.patient_id))];
    const itemIds = [...new Set(list.map((b) => b.item_id))];
    const [{ data: patients }, { data: items }] = await Promise.all([
      patientIds.length ? supabase.from("patients").select("id, full_name, uhid").in("id", patientIds) : { data: [] },
      itemIds.length ? supabase.from("items").select("id, name").in("id", itemIds) : { data: [] },
    ]);
    const pMap = Object.fromEntries((patients ?? []).map((p) => [p.id, p as { full_name: string; uhid: string }]));
    const iMap = Object.fromEntries((items ?? []).map((i) => [i.id, i as { name: string }]));
    return list.map((b) => {
      const pat = pMap[b.patient_id];
      const item = iMap[b.item_id];
      return {
        id: b.id,
        title: item?.name ?? "Item",
        subtitle: pat ? `${pat.full_name} (${pat.uhid})` : "Patient",
        status: b.status,
        href: `/dashboard/patients/${b.patient_id}`,
      };
    });
  }

  if (tab === "items_raised") {
    const { data: bills, error } = await supabase
      .from("billable_items")
      .select("id, status, patient_id, item_id")
      .eq("billed_by", actorId!)
      .order("billed_at", { ascending: false })
      .limit(200);
    if (error) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
    const rows = await mapBillableRows(bills as { id: string; status: string; patient_id: string; item_id: string }[]);
    return NextResponse.json({ tab, rows });
  }

  const { data: myItems, error: iErr } = await supabase.from("items").select("id").eq("created_by", actorId!);
  if (iErr) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  const itemIds = (myItems ?? []).map((x) => x.id as string);
  if (!itemIds.length) {
    return NextResponse.json({ tab, rows: [] });
  }
  const { data: bills, error } = await supabase
    .from("billable_items")
    .select("id, status, patient_id, item_id")
    .in("item_id", itemIds)
    .order("billed_at", { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  const rows = await mapBillableRows(bills as { id: string; status: string; patient_id: string; item_id: string }[]);
  return NextResponse.json({ tab, rows });
}
