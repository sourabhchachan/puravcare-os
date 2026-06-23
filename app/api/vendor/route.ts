import { NextResponse } from "next/server";

import { assertActiveUser, getActorId, getUserRole } from "@/lib/api/actor";
import { getVendorsForUser } from "@/lib/api/vendorAccess";

/** Linked vendor records for the logged-in vendor user (portal). */
export async function GET(request: Request) {
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if ((await getUserRole(actorId)) !== "vendor") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const vendors = await getVendorsForUser(actorId!);
  return NextResponse.json({
    vendors,
    vendor: vendors[0] ?? null,
  });
}
