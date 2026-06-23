import { NextResponse } from "next/server";

import { assertActiveUser, getActorId } from "@/lib/api/actor";
import { assertCeo } from "@/lib/api/ceo";
import { canManageMrd } from "@/lib/mrd/access";
import { insertMrdTransaction } from "@/lib/mrd/transactions";
import { createServiceClient } from "@/lib/supabase/service";

type PatchBody = { action?: string };

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
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

  const action = body.action;
  if (!["dispatch", "receive", "return", "receive_return"].includes(action ?? "")) {
    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  }

  const { id } = await params;
  const supabase = createServiceClient();
  const isCeo = await assertCeo(actorId);
  const canManage = await canManageMrd(actorId);

  const { data: req } = await supabase
    .from("mrd_requests")
    .select("id, file_id, request_type, purpose, status, requested_by, dispatched_at")
    .eq("id", id)
    .maybeSingle();

  if (!req) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data: file } = await supabase.from("mrd_files").select("id, status").eq("id", req.file_id).maybeSingle();
  if (!file) return NextResponse.json({ error: "file_not_found" }, { status: 404 });

  const now = new Date().toISOString();

  if (action === "dispatch") {
    if (!canManage) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    if (req.request_type !== "borrow" || req.status !== "pending") {
      return NextResponse.json({ error: "invalid_request_state" }, { status: 400 });
    }
    if (file.status !== "in_mrd") {
      return NextResponse.json({ error: "file_not_in_mrd" }, { status: 400 });
    }

    const { error: reqErr } = await supabase
      .from("mrd_requests")
      .update({ status: "dispatched", dispatched_by: actorId, dispatched_at: now })
      .eq("id", id);
    if (reqErr) return NextResponse.json({ error: "update_failed" }, { status: 500 });

    const { error: fileErr } = await supabase
      .from("mrd_files")
      .update({ status: "with_staff", updated_at: now })
      .eq("id", file.id);
    if (fileErr) return NextResponse.json({ error: "file_update_failed" }, { status: 500 });

    try {
      await insertMrdTransaction(supabase, {
        file_id: file.id as string,
        action: "dispatch",
        from_status: "in_mrd",
        to_status: "with_staff",
        request_id: id,
        actor_id: actorId,
      });
    } catch {
      return NextResponse.json({ error: "transaction_failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, status: "dispatched" });
  }

  if (action === "receive") {
    if (req.requested_by !== actorId && !isCeo) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (req.request_type !== "borrow" || req.status !== "dispatched") {
      return NextResponse.json({ error: "invalid_request_state" }, { status: 400 });
    }

    const { error: reqErr } = await supabase
      .from("mrd_requests")
      .update({ status: "received", received_at: now })
      .eq("id", id);
    if (reqErr) return NextResponse.json({ error: "update_failed" }, { status: 500 });

    try {
      await insertMrdTransaction(supabase, {
        file_id: file.id as string,
        action: "receive",
        from_status: file.status,
        to_status: file.status,
        request_id: id,
        actor_id: actorId,
      });
    } catch {
      return NextResponse.json({ error: "transaction_failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, status: "received" });
  }

  if (action === "return") {
    if (req.requested_by !== actorId && !isCeo) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (req.request_type !== "borrow" || !["dispatched", "received"].includes(req.status)) {
      return NextResponse.json({ error: "invalid_request_state" }, { status: 400 });
    }
    if (file.status !== "with_staff") {
      return NextResponse.json({ error: "file_not_with_staff" }, { status: 400 });
    }

    const { data: pendingReturn } = await supabase
      .from("mrd_requests")
      .select("id")
      .eq("file_id", file.id)
      .eq("request_type", "return")
      .eq("status", "pending")
      .maybeSingle();

    if (pendingReturn) return NextResponse.json({ error: "return_already_pending" }, { status: 409 });

    const { data: returnReq, error: insertErr } = await supabase
      .from("mrd_requests")
      .insert({
        file_id: file.id,
        request_type: "return",
        purpose: `Return for borrow request`,
        status: "pending",
        requested_by: actorId,
      })
      .select("id")
      .single();

    if (insertErr) return NextResponse.json({ error: "insert_failed" }, { status: 500 });

    try {
      await insertMrdTransaction(supabase, {
        file_id: file.id as string,
        action: "return_requested",
        from_status: file.status,
        to_status: file.status,
        request_id: returnReq.id,
        actor_id: actorId,
        note: `Borrow request ${id}`,
      });
    } catch {
      return NextResponse.json({ error: "transaction_failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, return_request_id: returnReq.id });
  }

  if (action === "receive_return") {
    if (!canManage) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    if (req.request_type !== "return" || req.status !== "pending") {
      return NextResponse.json({ error: "invalid_request_state" }, { status: 400 });
    }

    const { error: reqErr } = await supabase
      .from("mrd_requests")
      .update({ status: "returned", returned_at: now })
      .eq("id", id);
    if (reqErr) return NextResponse.json({ error: "update_failed" }, { status: 500 });

    const { error: fileErr } = await supabase
      .from("mrd_files")
      .update({ status: "in_mrd", updated_at: now })
      .eq("id", file.id);
    if (fileErr) return NextResponse.json({ error: "file_update_failed" }, { status: 500 });

    try {
      await insertMrdTransaction(supabase, {
        file_id: file.id as string,
        action: "receive_return",
        from_status: "with_staff",
        to_status: "in_mrd",
        request_id: id,
        actor_id: actorId,
      });
    } catch {
      return NextResponse.json({ error: "transaction_failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, status: "returned" });
  }

  return NextResponse.json({ error: "invalid_action" }, { status: 400 });
}
