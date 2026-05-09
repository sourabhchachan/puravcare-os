import { NextResponse } from "next/server";

import { assertActiveUser, getActorId, getUserRole } from "@/lib/api/actor";
import { getVendorForUser } from "@/lib/api/vendorAccess";

/** Linked vendor record for the logged-in vendor user (portal). */
export async function GET(request: Request) {
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if ((await getUserRole(actorId)) !== "vendor") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const vendor = await getVendorForUser(actorId!);
  if (!vendor) return NextResponse.json({ vendor: null }, { status: 200 });
  return NextResponse.json({ vendor });
}
