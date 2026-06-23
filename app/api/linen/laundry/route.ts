import { NextResponse } from "next/server";

import { assertActiveUser, getActorId } from "@/lib/api/actor";
import { assertLinenStoreVendor } from "@/lib/linen/access";
import { createLinenFollowup } from "@/lib/linen/followups";
import { getLinenStatusQty } from "@/lib/linen/stockLevels";
import { createServiceClient } from "@/lib/supabase/service";

type PostBody = {
  action?: string;
  item_id?: string;
  quantity?: number;
  quantity_sent?: number;
  quantity_returned?: number;
};

export async function POST(request: Request) {
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const vendor = await assertLinenStoreVendor(actorId!);
  if (!vendor) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const action = body.action;
  if (!action || !["send", "receive"].includes(action)) {
    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  }

  const itemId = (body.item_id ?? "").trim();
  if (!itemId) return NextResponse.json({ error: "missing_item_id" }, { status: 400 });

  const supabase = createServiceClient();
  const { data: item } = await supabase
    .from("items")
    .select("id, vendor_id, track_inventory")
    .eq("id", itemId)
    .maybeSingle();
  if (!item || item.vendor_id !== vendor.id || !item.track_inventory) {
    return NextResponse.json({ error: "invalid_item" }, { status: 400 });
  }

  if (action === "send") {
    const quantity = Number(body.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return NextResponse.json({ error: "invalid_quantity" }, { status: 400 });
    }
    const inBag = await getLinenStatusQty(supabase, itemId, "in_laundry_bag");
    if (quantity > inBag + 0.001) {
      return NextResponse.json({ error: "insufficient_laundry_bag_stock" }, { status: 400 });
    }

    const { error } = await supabase.from("linen_transactions").insert({
      item_id: itemId,
      transaction_type: "laundry_send",
      quantity,
      from_status: "in_laundry_bag",
      to_status: "in_laundry",
      created_by: actorId!,
    });
    if (error) return NextResponse.json({ error: "transaction_failed" }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const quantitySent = Number(body.quantity_sent);
  const quantityReturned = Number(body.quantity_returned);
  if (!Number.isFinite(quantitySent) || quantitySent <= 0) {
    return NextResponse.json({ error: "invalid_quantity_sent" }, { status: 400 });
  }
  if (!Number.isFinite(quantityReturned) || quantityReturned < 0) {
    return NextResponse.json({ error: "invalid_quantity_returned" }, { status: 400 });
  }
  if (quantityReturned > quantitySent + 0.001) {
    return NextResponse.json({ error: "returned_exceeds_sent" }, { status: 400 });
  }

  const inLaundry = await getLinenStatusQty(supabase, itemId, "in_laundry");
  if (quantitySent > inLaundry + 0.001) {
    return NextResponse.json({ error: "insufficient_in_laundry_stock" }, { status: 400 });
  }

  const shortage = quantitySent - quantityReturned;

  if (quantityReturned > 0) {
    const { error } = await supabase.from("linen_transactions").insert({
      item_id: itemId,
      transaction_type: "laundry_receive",
      quantity: quantityReturned,
      from_status: "in_laundry",
      to_status: "in_store",
      created_by: actorId!,
    });
    if (error) return NextResponse.json({ error: "transaction_failed" }, { status: 500 });
  }

  if (shortage > 0) {
    const { error } = await supabase.from("linen_transactions").insert({
      item_id: itemId,
      transaction_type: "laundry_lost",
      quantity: shortage,
      from_status: "in_laundry",
      to_status: "lost",
      created_by: actorId!,
    });
    if (error) return NextResponse.json({ error: "transaction_failed" }, { status: 500 });

    const laundryRef = crypto.randomUUID();
    try {
      await createLinenFollowup(supabase, {
        item_id: itemId,
        quantity: shortage,
        source_type: "laundry",
        source_id: laundryRef,
        created_by: actorId!,
      });
    } catch {
      return NextResponse.json({ error: "followup_failed" }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, shortage });
}
