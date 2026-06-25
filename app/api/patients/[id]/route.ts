import { NextResponse } from "next/server";

import { assertActiveUser, getActorId, getUserRole } from "@/lib/api/actor";
import { assertCeo } from "@/lib/api/ceo";
import { SYSTEM_ADMIN_LOGIN_ID } from "@/lib/api/pin";
import { notifyMrdMembers } from "@/lib/mrd/notify";
import { createServiceClient } from "@/lib/supabase/service";

const PATIENT_SELECT =
  "id, uhid, full_name, age, gender, phone, admission_type, bed_number, ipd_number, admission_date, discharge_date, status";

type PatchBody = {
  action?: string;
  admission_date?: string | null;
  ipd_number?: string;
};

async function canConvertOpdToIpd(actorId: string, role: string | null): Promise<boolean> {
  if (["ceo", "ops"].includes(role ?? "")) return true;
  const supabase = createServiceClient();
  const { data } = await supabase.from("users").select("login_id").eq("id", actorId).maybeSingle();
  return data?.login_id === SYSTEM_ADMIN_LOGIN_ID;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const supabase = createServiceClient();

  const { data: patient, error } = await supabase
    .from("patients")
    .select("id, uhid, full_name, age, gender, phone, admission_type, bed_number, ipd_number, admission_date, discharge_date, status")
    .eq("id", id)
    .maybeSingle();
  if (error || !patient) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data: billRows, error: billErr } = await supabase
    .from("billable_items")
    .select("id, item_id, quantity, unit_price, total_price, billed_by, billed_at, note, status, cancel_reason, cancelled_by, cancelled_at")
    .eq("patient_id", id)
    .order("billed_at", { ascending: false });
  if (billErr) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });

  const itemIds = [...new Set((billRows ?? []).map((r) => r.item_id as string).filter(Boolean))];
  const billedByIds = [...new Set((billRows ?? []).map((r) => r.billed_by as string).filter(Boolean))];
  const cancelledByIds = [...new Set((billRows ?? []).map((r) => r.cancelled_by as string).filter(Boolean))];
  const userIds = [...new Set([...billedByIds, ...cancelledByIds])];

  const [itemsRes, usersRes] = await Promise.all([
    itemIds.length ? supabase.from("items").select("id, name, vendor_id").in("id", itemIds) : Promise.resolve({ data: [] }),
    userIds.length ? supabase.from("users").select("id, full_name, role").in("id", userIds) : Promise.resolve({ data: [] }),
  ]);
  const vendorIds = [...new Set(((itemsRes.data ?? []) as { vendor_id: string | null }[]).map((i) => i.vendor_id).filter(Boolean))] as string[];
  const { data: vendorRows } = vendorIds.length
    ? await supabase.from("vendors").select("id, user_id").in("id", vendorIds)
    : { data: [] as { id: string; user_id: string | null }[] };
  const vendorUserMap = new Map<string, string | null>();
  for (const v of vendorRows ?? []) vendorUserMap.set(v.id, v.user_id);

  const itemMap = new Map<string, { name: string; vendor_id: string | null }>();
  for (const i of (itemsRes.data ?? []) as { id: string; name: string; vendor_id: string | null }[]) {
    itemMap.set(i.id, { name: i.name, vendor_id: i.vendor_id });
  }
  const userMap = new Map<string, { full_name: string; role: string }>();
  for (const u of (usersRes.data ?? []) as { id: string; full_name: string; role: string }[]) {
    userMap.set(u.id, { full_name: u.full_name, role: u.role });
  }

  const role = await getUserRole(actorId);
  const billableItems = (billRows ?? []).map((row) => {
    const item = itemMap.get(row.item_id as string);
    const billedBy = userMap.get(row.billed_by as string);
    const canCancel =
      row.status === "active" &&
      (actorId === row.billed_by ||
        role === "ceo" ||
        role === "ops" ||
        role === "staff" ||
        (role === "vendor" && Boolean(item?.vendor_id && vendorUserMap.get(item.vendor_id) === actorId)));

    return {
      ...row,
      item_name: item?.name ?? "Unknown item",
      billed_by_name: billedBy?.full_name ?? "—",
      cancelled_by_name: row.cancelled_by ? (userMap.get(row.cancelled_by as string)?.full_name ?? "—") : null,
      can_cancel: canCancel,
    };
  });

  const activeTotal = billableItems
    .filter((r) => r.status === "active")
    .reduce((sum, r) => sum + Number(r.total_price ?? 0), 0);

  const { data: activeItems } = await supabase
    .from("items")
    .select("id, name, price")
    .eq("is_active", true)
    .order("name");

  return NextResponse.json({
    patient,
    billable_items: billableItems,
    active_total: activeTotal,
    active_items: activeItems ?? [],
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  if (!["discharge", "readmit", "update", "convert_to_ipd"].includes(body.action ?? "")) {
    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  }

  const { id } = await params;
  const supabase = createServiceClient();

  if (body.action === "convert_to_ipd") {
    const role = await getUserRole(actorId);
    if (!(await canConvertOpdToIpd(actorId!, role))) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const ipdNumber = (body.ipd_number ?? "").trim();
    if (!ipdNumber) return NextResponse.json({ error: "missing_ipd_number" }, { status: 400 });

    const { data: patient } = await supabase
      .from("patients")
      .select("id, admission_type, status")
      .eq("id", id)
      .maybeSingle();
    if (!patient) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (patient.admission_type !== "opd" || patient.status !== "active") {
      return NextResponse.json({ error: "invalid_patient_state" }, { status: 400 });
    }

    const { data: existingIpd, error: ipdErr } = await supabase
      .from("patients")
      .select("id")
      .eq("ipd_number", ipdNumber)
      .neq("id", id)
      .maybeSingle();
    if (ipdErr) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
    if (existingIpd) return NextResponse.json({ error: "ipd_number_taken" }, { status: 400 });

    const { data: updated, error: updateErr } = await supabase
      .from("patients")
      .update({
        admission_type: "ipd",
        ipd_number: ipdNumber,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select(PATIENT_SELECT)
      .single();

    if (updateErr || !updated) return NextResponse.json({ error: "update_failed" }, { status: 500 });
    return NextResponse.json({ patient: updated });
  }

  if (body.action === "update") {
    if (!(await assertCeo(actorId))) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (body.admission_date === undefined) {
      return NextResponse.json({ error: "no_updates" }, { status: 400 });
    }
    const admissionDate = new Date(body.admission_date ?? "");
    if (Number.isNaN(admissionDate.getTime())) {
      return NextResponse.json({ error: "invalid_admission_date" }, { status: 400 });
    }
    const { data: existing } = await supabase.from("patients").select("id").eq("id", id).maybeSingle();
    if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const { error: updateErr } = await supabase
      .from("patients")
      .update({ admission_date: admissionDate.toISOString() })
      .eq("id", id);
    if (updateErr) return NextResponse.json({ error: "update_failed" }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const role = await getUserRole(actorId);
  if (body.action === "discharge" && !["ceo", "ops"].includes(role ?? "")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (body.action === "readmit" && role !== "ceo") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { data: patient } = await supabase
    .from("patients")
    .select("id, status, ipd_number, full_name")
    .eq("id", id)
    .maybeSingle();
  if (!patient) return NextResponse.json({ error: "not_found" }, { status: 404 });

  let error: { message?: string } | null = null;
  if (body.action === "discharge") {
    if (patient.status === "discharged") return NextResponse.json({ error: "already_discharged" }, { status: 400 });
    const { error: updateErr } = await supabase
      .from("patients")
      .update({ status: "discharged", discharge_date: new Date().toISOString() })
      .eq("id", id);
    error = updateErr;

    if (!error && patient.ipd_number) {
      const { data: existingFile } = await supabase
        .from("mrd_files")
        .select("id")
        .eq("ipd_number", patient.ipd_number)
        .maybeSingle();

      if (!existingFile) {
        await supabase.from("mrd_files").insert({
          ipd_number: patient.ipd_number,
          patient_id: patient.id,
          status: "missing",
          created_by: actorId,
        });

        await notifyMrdMembers(
          supabase,
          `New file received: IPD-${patient.ipd_number} — ${patient.full_name}`,
          null,
        );
      }
    }
  } else {
    if (patient.status !== "discharged") return NextResponse.json({ error: "not_discharged" }, { status: 400 });
    const { error: updateErr } = await supabase
      .from("patients")
      .update({ status: "active", discharge_date: null })
      .eq("id", id);
    error = updateErr;
  }
  if (error) return NextResponse.json({ error: "update_failed" }, { status: 500 });

  return NextResponse.json({ ok: true });
}
