import { NextResponse } from "next/server";

import { assertActiveUser, getActorId } from "@/lib/api/actor";
import { assertCeo } from "@/lib/api/ceo";
import { canViewMrdFiles } from "@/lib/mrd/access";
import { enrichMrdFile } from "@/lib/mrd/enrich";
import { createServiceClient } from "@/lib/supabase/service";

type PostBody = { ipd_number?: string };

export async function GET(request: Request) {
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!(await canViewMrdFiles(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = createServiceClient();
  const { data: files, error } = await supabase
    .from("mrd_files")
    .select("id, ipd_number, patient_id, status, added_manually, created_at, updated_at")
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });

  const patientIds = [...new Set((files ?? []).map((f) => f.patient_id).filter(Boolean))] as string[];
  const fileIds = (files ?? []).map((f) => f.id as string);

  const [patientsRes, requestsRes] = await Promise.all([
    patientIds.length
      ? supabase.from("patients").select("id, full_name").in("id", patientIds)
      : Promise.resolve({ data: [] }),
    fileIds.length
      ? supabase
          .from("mrd_requests")
          .select("id, file_id, request_type, status, dispatched_at")
          .in("file_id", fileIds)
      : Promise.resolve({ data: [] }),
  ]);

  const patientMap = new Map((patientsRes.data ?? []).map((p) => [p.id as string, p]));
  const requests = requestsRes.data ?? [];

  const enriched = (files ?? []).map((file) =>
    enrichMrdFile(
      file as {
        id: string;
        ipd_number: string;
        patient_id: string | null;
        status: string;
        added_manually: boolean;
        created_at: string;
        updated_at: string;
      },
      file.patient_id ? patientMap.get(file.patient_id as string) : undefined,
      requests as { id: string; file_id: string; request_type: string; status: string; dispatched_at: string | null }[],
    ),
  );

  return NextResponse.json({ files: enriched });
}

export async function POST(request: Request) {
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
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

  const ipdNumber = (body.ipd_number ?? "").trim();
  if (!ipdNumber) return NextResponse.json({ error: "missing_ipd_number" }, { status: 400 });

  const supabase = createServiceClient();

  const { data: existing } = await supabase.from("mrd_files").select("id").eq("ipd_number", ipdNumber).maybeSingle();
  if (existing) return NextResponse.json({ error: "duplicate_ipd" }, { status: 409 });

  const { data: patient } = await supabase
    .from("patients")
    .select("id")
    .eq("ipd_number", ipdNumber)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: file, error } = await supabase
    .from("mrd_files")
    .insert({
      ipd_number: ipdNumber,
      patient_id: patient?.id ?? null,
      status: "in_mrd",
      added_manually: true,
      created_by: actorId,
    })
    .select("id, ipd_number, patient_id, status, added_manually, created_at, updated_at")
    .single();

  if (error) return NextResponse.json({ error: "insert_failed" }, { status: 500 });

  return NextResponse.json({ file });
}
