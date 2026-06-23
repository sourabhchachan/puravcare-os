import { NextResponse } from "next/server";

import { assertActiveUser, getActorId } from "@/lib/api/actor";
import { assertCeo } from "@/lib/api/ceo";
import { getItemCurrentStock } from "@/lib/inventory/stockLevels";
import { createServiceClient } from "@/lib/supabase/service";

type PostBody = {
  item_id?: string;
  quantity?: number;
  reason?: string;
};

export async function POST(request: Request) {
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!(await assertCeo(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const itemId = (body.item_id ?? "").trim();
  const quantity = Number(body.quantity);
  const reason = (body.reason ?? "").trim();

  if (!itemId) return NextResponse.json({ error: "missing_item_id" }, { status: 400 });
  if (!Number.isFinite(quantity) || quantity === 0) {
    return NextResponse.json({ error: "invalid_quantity" }, { status: 400 });
  }
  if (!reason) return NextResponse.json({ error: "missing_reason" }, { status: 400 });

  const supabase = createServiceClient();
  const { data: item, error: itemErr } = await supabase
    .from("items")
    .select("id, track_inventory, is_active")
    .eq("id", itemId)
    .maybeSingle();

  if (itemErr) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  if (!item || !item.is_active) return NextResponse.json({ error: "invalid_item" }, { status: 400 });
  if (!item.track_inventory) return NextResponse.json({ error: "inventory_not_tracked" }, { status: 400 });

  const { data: txn, error: txnErr } = await supabase
    .from("inventory_transactions")
    .insert({
      item_id: itemId,
      transaction_type: "adjustment",
      quantity,
      note: reason,
      created_by: actorId!,
    })
    .select("id, item_id, transaction_type, quantity, note, created_at")
    .single();

  if (txnErr || !txn) return NextResponse.json({ error: "insert_failed" }, { status: 500 });

  try {
    const currentStock = await getItemCurrentStock(supabase, itemId);
    return NextResponse.json({ transaction: txn, current_stock: currentStock });
  } catch {
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }
}
