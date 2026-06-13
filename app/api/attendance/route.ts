import { NextResponse } from "next/server";

import { assertActiveUser, getActorId, getUserRole } from "@/lib/api/actor";
import { assertCeoOrOps } from "@/lib/api/ceoOrOps";
import { hoursBetween, kolkataToday } from "@/lib/attendance/kolkataToday";
import { createServiceClient } from "@/lib/supabase/service";

type PostBody = {
  action?: string;
};

function userNameFromJoin(users: unknown): string {
  const u = users as { full_name: string } | { full_name: string }[] | null;
  if (Array.isArray(u)) return u[0]?.full_name ?? "—";
  return u?.full_name ?? "—";
}

async function findOpenSession(supabase: ReturnType<typeof createServiceClient>, userId: string) {
  const { data, error } = await supabase
    .from("attendance")
    .select("*")
    .eq("user_id", userId)
    .is("punch_out", null)
    .order("punch_in", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { row: null, error };
  return { row: data, error: null };
}

export async function GET(request: Request) {
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const scope = url.searchParams.get("scope");

  const supabase = createServiceClient();

  if (scope === "report") {
    if (!(await assertCeoOrOps(actorId))) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const from = url.searchParams.get("from")?.trim() || "";
    const to = url.searchParams.get("to")?.trim() || "";
    const userQ = (url.searchParams.get("user") || "").trim().toLowerCase();

    let q = supabase
      .from("attendance")
      .select("id, user_id, date, punch_in, punch_out, users(full_name)")
      .order("date", { ascending: false })
      .order("punch_in", { ascending: false });

    if (from) q = q.gte("date", from);
    if (to) q = q.lte("date", to);

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });

    let records = (data ?? []).map((r) => {
      const punchIn = r.punch_in as string;
      const punchOut = r.punch_out as string | null;
      return {
        id: r.id as string,
        user_id: r.user_id as string,
        user_name: userNameFromJoin(r.users),
        date: r.date as string,
        punch_in: punchIn,
        punch_out: punchOut,
        total_hours: punchOut ? hoursBetween(punchIn, punchOut) : null,
      };
    });

    if (userQ) {
      records = records.filter((r) => r.user_name.toLowerCase().includes(userQ));
    }

    return NextResponse.json({ records });
  }

  const today = kolkataToday();
  const [{ data: rows, error }, openResult] = await Promise.all([
    supabase
      .from("attendance")
      .select("*")
      .eq("user_id", actorId!)
      .eq("date", today)
      .order("punch_in", { ascending: true }),
    findOpenSession(supabase, actorId!),
  ]);

  if (error || openResult.error) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });

  const list = rows ?? [];

  return NextResponse.json({
    date: today,
    open_record: openResult.row,
    today_records: list,
  });
}

export async function POST(request: Request) {
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const role = await getUserRole(actorId);
  if (role === "ceo") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const action = (body.action ?? "").trim();
  if (!["punch_in", "punch_out"].includes(action)) {
    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const today = kolkataToday();
  const nowIso = new Date().toISOString();

  if (action === "punch_in") {
    const { row: open, error: openErr } = await findOpenSession(supabase, actorId!);
    if (openErr) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });

    if (open) {
      return NextResponse.json({ error: "already_punched_in", open_session: open }, { status: 400 });
    }

    const { data: inserted, error } = await supabase
      .from("attendance")
      .insert({
        user_id: actorId!,
        date: today,
        punch_in: nowIso,
      })
      .select("*")
      .single();

    if (error || !inserted) {
      return NextResponse.json({ error: "insert_failed" }, { status: 500 });
    }

    return NextResponse.json({ record: inserted });
  }

  const { row: openRow, error: openErr } = await findOpenSession(supabase, actorId!);

  if (openErr) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  if (!openRow) {
    return NextResponse.json({ error: "no_open_punch" }, { status: 400 });
  }

  const { data: updated, error: updateErr } = await supabase
    .from("attendance")
    .update({ punch_out: nowIso })
    .eq("id", openRow.id as string)
    .select("*")
    .single();

  if (updateErr || !updated) {
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  return NextResponse.json({ record: updated });
}
