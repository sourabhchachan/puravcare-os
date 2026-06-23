import { NextResponse } from "next/server";

import { assertActiveUser, getActorId } from "@/lib/api/actor";
import { assertCeo } from "@/lib/api/ceo";
import { isMrdMember } from "@/lib/mrd/access";

export async function GET(request: Request) {
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const isCeo = await assertCeo(actorId);
  const mrd = await isMrdMember(actorId);

  return NextResponse.json({
    is_mrd_member: mrd,
    can_view_mrd: isCeo || mrd,
    is_ceo: isCeo,
  });
}
