import { NextResponse } from "next/server";

import { assertActiveUser, getActorId, getUserRole } from "@/lib/api/actor";
import { assertCeoOrOps } from "@/lib/api/ceoOrOps";
import { getVendorForUser } from "@/lib/api/vendorAccess";
import { createServiceClient } from "@/lib/supabase/service";

function userNameFromJoin(users: unknown): string {
  const u = users as { full_name: string } | { full_name: string }[] | null;
  if (Array.isArray(u)) return u[0]?.full_name ?? "—";
  return u?.full_name ?? "—";
}

async function canViewItemHistory(actorId: string, itemId: string) {
  const supabase = createServiceClient();
  const role = await getUserRole(actorId);

  const { data: item } = await supabase.from("items").select("id, vendor_id, track_inventory").eq("id", itemId).maybeSingle();
  if (!item || !item.track_inventory) return { ok: false as const, item: null };

  if (role === "ceo" || role === "ops") return { ok: true as const, item };
  if (role === "vendor") {
    const vendor = await getVendorForUser(actorId);
    if (!vendor || (vendor as { id: string }).id !== item.vendor_id) {
      return { ok: false as const, item: null };
    }
    return { ok: true as const, item };
  }
  return { ok: false as const, item: null };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: itemId } = await params;
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const access = await canViewItemHistory(actorId!, itemId);
  if (!access.ok) {
    if (!(await assertCeoOrOps(actorId)) && (await getUserRole(actorId)) !== "vendor") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = createServiceClient();
  const { data: item } = await supabase.from("items").select("id, name").eq("id", itemId).maybeSingle();

  const { data: transactions, error } = await supabase
    .from("inventory_transactions")
    .select(
      "id, transaction_type, quantity, note, created_at, created_by, reference_id, inventory_stock_id, users(full_name), inventory_stock(batch_number, invoice_number, expiry_date, purchase_price)",
    )
    .eq("item_id", itemId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });

  const history = (transactions ?? []).map((t) => {
    const stock = t.inventory_stock as
      | { batch_number: string; invoice_number: string; expiry_date: string; purchase_price: number }
      | { batch_number: string; invoice_number: string; expiry_date: string; purchase_price: number }[]
      | null;
    const stockRow = Array.isArray(stock) ? stock[0] : stock;
    return {
      id: t.id as string,
      date: t.created_at as string,
      transaction_type: t.transaction_type as string,
      quantity: t.quantity as number,
      reason: (t.note as string | null) ?? null,
      batch_number: stockRow?.batch_number ?? null,
      invoice_number: stockRow?.invoice_number ?? null,
      expiry_date: stockRow?.expiry_date ?? null,
      purchase_price: stockRow?.purchase_price ?? null,
      added_by_name: userNameFromJoin(t.users),
      reference_id: t.reference_id as string | null,
    };
  });

  return NextResponse.json({
    item: item ? { id: item.id as string, name: item.name as string } : null,
    history,
  });
}
