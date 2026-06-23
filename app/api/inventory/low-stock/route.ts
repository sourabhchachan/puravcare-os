import { NextResponse } from "next/server";

import { assertActiveUser, getActorId, getUserRole } from "@/lib/api/actor";
import { assertCeoOrOps } from "@/lib/api/ceoOrOps";
import { fetchStockLevels } from "@/lib/inventory/stockLevels";
import { getVendorIdsForUser } from "@/lib/api/vendorAccess";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET(request: Request) {
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const role = await getUserRole(actorId);
  const supabase = createServiceClient();

  let vendorIds: string[] | undefined;
  if (role === "vendor") {
    const ids = await getVendorIdsForUser(actorId!);
    if (!ids.length) return NextResponse.json({ items: [] });
    vendorIds = ids;
  } else if (!(await assertCeoOrOps(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const levels = await fetchStockLevels(supabase, vendorIds ? { vendorIds } : undefined);
    const low = levels.filter((r) => r.is_low_stock);
    return NextResponse.json({ items: low });
  } catch {
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }
}
