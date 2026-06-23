import { NextResponse } from "next/server";

import { assertActiveUser, getActorId } from "@/lib/api/actor";
import { assertCeo } from "@/lib/api/ceo";
import { canViewAllMrdRequests } from "@/lib/mrd/access";
import { daysBetween } from "@/lib/mrd/files";
import { hasActiveMrdRequest } from "@/lib/mrd/requests";
import { createServiceClient } from "@/lib/supabase/service";

type PostBody = { file_id?: string; purpose?: string };

export async function GET(request: Request) {
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const viewAll = await canViewAllMrdRequests(actorId);
  const supabase = createServiceClient();

  let query = supabase
    .from("mrd_requests")
    .select(
      "id, file_id, request_type, purpose, status, requested_by, dispatched_by, dispatched_at, received_at, returned_at, created_at",
    )
    .in("status", ["pending", "dispatched", "received"])
    .order("created_at", { ascending: false });

  if (!viewAll) {
    query = query.eq("requested_by", actorId!);
  }

  const { data: rows, error } = await query;
  if (error) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });

  const fileIds = [...new Set((rows ?? []).map((r) => r.file_id as string))];
  const userIds = [
    ...new Set(
      (rows ?? []).flatMap((r) => [r.requested_by, r.dispatched_by].filter(Boolean)) as string[],
    ),
  ];

  const [filesRes, usersRes] = await Promise.all([
    fileIds.length
      ? supabase.from("mrd_files").select("id, ipd_number, patient_id, status").in("id", fileIds)
      : Promise.resolve({ data: [] }),
    userIds.length
      ? supabase.from("users").select("id, full_name").in("id", userIds)
      : Promise.resolve({ data: [] }),
  ]);

  const patientIds = [...new Set((filesRes.data ?? []).map((f) => f.patient_id).filter(Boolean))] as string[];
  const { data: patients } = patientIds.length
    ? await supabase.from("patients").select("id, full_name").in("id", patientIds)
    : { data: [] };

  const fileMap = new Map((filesRes.data ?? []).map((f) => [f.id as string, f]));
  const userMap = new Map((usersRes.data ?? []).map((u) => [u.id as string, u]));
  const patientMap = new Map((patients ?? []).map((p) => [p.id as string, p]));

  const requests = (rows ?? []).map((row) => {
    const file = fileMap.get(row.file_id as string);
    const patient = file?.patient_id ? patientMap.get(file.patient_id as string) : undefined;
    const daysSinceDispatched =
      row.dispatched_at && (row.status === "dispatched" || row.status === "received")
        ? daysBetween(row.dispatched_at as string)
        : 0;

    return {
      ...row,
      ipd_number: file?.ipd_number ?? null,
      patient_name: patient?.full_name ?? null,
      file_status: file?.status ?? null,
      requester_name: userMap.get(row.requested_by as string)?.full_name ?? "—",
      days_since_dispatched: daysSinceDispatched,
    };
  });

  const isCeo = await assertCeo(actorId);
  return NextResponse.json({ requests, can_manage: viewAll, is_ceo: isCeo, actor_id: actorId });
}

export async function POST(request: Request) {
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

  const fileId = (body.file_id ?? "").trim();
  const purpose = (body.purpose ?? "").trim();
  if (!fileId) return NextResponse.json({ error: "missing_file_id" }, { status: 400 });
  if (!purpose) return NextResponse.json({ error: "missing_purpose" }, { status: 400 });

  const supabase = createServiceClient();
  const { data: file } = await supabase.from("mrd_files").select("id, status").eq("id", fileId).maybeSingle();
  if (!file) return NextResponse.json({ error: "file_not_found" }, { status: 404 });
  if (file.status !== "in_mrd") {
    return NextResponse.json({ error: "file_not_available", status: file.status }, { status: 400 });
  }

  const { data: existingRequests } = await supabase
    .from("mrd_requests")
    .select("id, file_id, request_type, status, dispatched_at")
    .eq("file_id", fileId);

  if (hasActiveMrdRequest(existingRequests ?? [])) {
    return NextResponse.json({ error: "active_request_exists" }, { status: 409 });
  }

  const { data: req, error } = await supabase
    .from("mrd_requests")
    .insert({
      file_id: fileId,
      request_type: "borrow",
      purpose,
      status: "pending",
      requested_by: actorId,
    })
    .select("id, file_id, request_type, purpose, status, requested_by, created_at")
    .single();

  if (error) return NextResponse.json({ error: "insert_failed" }, { status: 500 });

  return NextResponse.json({ request: req });
}
