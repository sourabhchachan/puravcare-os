import { NextResponse } from "next/server";

import { assertActiveUser, getActorId, getUserRole } from "@/lib/api/actor";
import { createServiceClient } from "@/lib/supabase/service";

type PatchBody = {
  action?: string;
  remarks?: string;
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; billId: string }> },
) {
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
  if (body.action !== "cancel") return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  const remarks = (body.remarks ?? "").trim();
  if (!remarks) return NextResponse.json({ error: "missing_remarks" }, { status: 400 });

  const { id: patientId, billId } = await params;
  const supabase = createServiceClient();
  const { data: billRow, error } = await supabase
    .from("billable_items")
    .select("id, item_id, billed_by, status")
    .eq("id", billId)
    .eq("patient_id", patientId)
    .maybeSingle();
  if (error || !billRow) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (billRow.status !== "active") return NextResponse.json({ error: "not_active" }, { status: 400 });

  const role = await getUserRole(actorId);
  let canCancel = actorId === billRow.billed_by || ["ceo", "ops", "staff"].includes(role ?? "");

  if (!canCancel && role === "vendor") {
    const { data: item } = await supabase.from("items").select("vendor_id").eq("id", billRow.item_id).maybeSingle();
    if (item?.vendor_id) {
      const { data: vendor } = await supabase
        .from("vendors")
        .select("id")
        .eq("id", item.vendor_id)
        .eq("user_id", actorId!)
        .maybeSingle();
      canCancel = Boolean(vendor?.id);
    }
  }

  if (!canCancel) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { error: updateErr } = await supabase
    .from("billable_items")
    .update({
      status: "cancelled",
      cancel_reason: remarks,
      cancelled_by: actorId!,
      cancelled_at: new Date().toISOString(),
    })
    .eq("id", billId)
    .eq("patient_id", patientId);
  if (updateErr) return NextResponse.json({ error: "update_failed" }, { status: 500 });

  return NextResponse.json({ ok: true });
}
