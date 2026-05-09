import { NextResponse } from "next/server";

import { assertActiveUser, getActorId } from "@/lib/api/actor";
import { createServiceClient } from "@/lib/supabase/service";

type PostBody = {
  item_id?: string;
  quantity?: number;
  unit_price?: number;
  note?: string | null;
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
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

  const { id: patientId } = await params;
  const itemId = (body.item_id ?? "").trim();
  if (!itemId) return NextResponse.json({ error: "missing_item_id" }, { status: 400 });

  const qty = Number(body.quantity ?? 1);
  if (Number.isNaN(qty) || qty <= 0) return NextResponse.json({ error: "invalid_quantity" }, { status: 400 });
  const unitPrice = Number(body.unit_price);
  if (Number.isNaN(unitPrice) || unitPrice < 0) return NextResponse.json({ error: "invalid_unit_price" }, { status: 400 });

  const supabase = createServiceClient();
  const [patientRes, itemRes] = await Promise.all([
    supabase.from("patients").select("id, status").eq("id", patientId).maybeSingle(),
    supabase.from("items").select("id, is_active").eq("id", itemId).maybeSingle(),
  ]);
  if (!patientRes.data) return NextResponse.json({ error: "invalid_patient" }, { status: 400 });
  if (patientRes.data.status !== "active") return NextResponse.json({ error: "patient_discharged" }, { status: 400 });
  if (!itemRes.data || !itemRes.data.is_active) return NextResponse.json({ error: "invalid_item" }, { status: 400 });

  const { data, error } = await supabase
    .from("billable_items")
    .insert({
      patient_id: patientId,
      item_id: itemId,
      quantity: qty,
      unit_price: unitPrice,
      billed_by: actorId!,
      billed_at: new Date().toISOString(),
      note: (body.note ?? "").trim() || null,
      status: "active",
    })
    .select("id")
    .single();
  if (error || !data) return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  return NextResponse.json({ billable_item_id: data.id });
}
