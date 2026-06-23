import { NextResponse } from "next/server";

import { assertActiveUser, getActorId } from "@/lib/api/actor";
import { assertCeo } from "@/lib/api/ceo";
import { createServiceClient } from "@/lib/supabase/service";

type PostBody = {
  full_name?: string;
  age?: number | null;
  gender?: string | null;
  phone?: string | null;
  admission_type?: string | null;
  bed_number?: string | null;
  ipd_number?: string | null;
  admission_date?: string | null;
};

function nextUhidFrom(lastUhid: string | null): string {
  const current = Number((lastUhid ?? "").replace(/^PC-/, ""));
  const next = Number.isFinite(current) && current > 0 ? current + 1 : 1;
  return `PC-${String(next).padStart(5, "0")}`;
}

export async function GET(request: Request) {
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const status = (url.searchParams.get("status") ?? "active").toLowerCase();
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();

  if (!["active", "discharged"].includes(status)) {
    return NextResponse.json({ error: "invalid_status" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("patients")
    .select("id, uhid, full_name, age, gender, phone, admission_type, bed_number, ipd_number, admission_date, discharge_date, status")
    .eq("status", status)
    .order("admission_date", { ascending: false });

  if (error) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });

  const rows = (data ?? []).filter((row) => {
    if (!q) return true;
    return (
      String(row.full_name ?? "")
        .toLowerCase()
        .includes(q) || String(row.uhid ?? "").toLowerCase().includes(q)
    );
  });

  return NextResponse.json({ patients: rows });
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

  const fullName = (body.full_name ?? "").trim();
  if (!fullName) return NextResponse.json({ error: "missing_name" }, { status: 400 });

  const admissionType = (body.admission_type ?? "").toLowerCase();
  if (!["opd", "ipd"].includes(admissionType)) {
    return NextResponse.json({ error: "invalid_admission_type" }, { status: 400 });
  }

  const bedNumber = (body.bed_number ?? "").trim();
  const ipdNumber = (body.ipd_number ?? "").trim();
  if (admissionType === "ipd" && !bedNumber) {
    return NextResponse.json({ error: "missing_bed_number" }, { status: 400 });
  }

  const supabase = createServiceClient();
  if (admissionType === "ipd" && ipdNumber) {
    const { data: existingIpd, error: ipdErr } = await supabase
      .from("patients")
      .select("id")
      .eq("ipd_number", ipdNumber)
      .limit(1)
      .maybeSingle();
    if (ipdErr) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
    if (existingIpd) return NextResponse.json({ error: "ipd_number_taken" }, { status: 400 });
  }
  const { data: lastRow } = await supabase
    .from("patients")
    .select("uhid")
    .order("uhid", { ascending: false })
    .limit(1)
    .maybeSingle();

  const uhid = nextUhidFrom((lastRow?.uhid as string | undefined) ?? null);
  const isCeo = await assertCeo(actorId!);
  const admissionDate =
    isCeo && body.admission_date ? new Date(body.admission_date) : new Date();
  if (Number.isNaN(admissionDate.getTime())) {
    return NextResponse.json({ error: "invalid_admission_date" }, { status: 400 });
  }

  const ageVal = body.age === null || body.age === undefined ? null : Number(body.age);
  if (ageVal !== null && (Number.isNaN(ageVal) || ageVal < 0)) {
    return NextResponse.json({ error: "invalid_age" }, { status: 400 });
  }

  const gender = (body.gender ?? "").toLowerCase();
  if (gender && !["male", "female", "other"].includes(gender)) {
    return NextResponse.json({ error: "invalid_gender" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("patients")
    .insert({
      uhid,
      full_name: fullName,
      age: ageVal,
      gender: gender || null,
      phone: (body.phone ?? "").trim() || null,
      admission_type: admissionType,
      bed_number: admissionType === "ipd" ? bedNumber : null,
      ipd_number: admissionType === "ipd" ? ipdNumber || null : null,
      admission_date: admissionDate.toISOString(),
      status: "active",
      created_by: actorId!,
    })
    .select("id, uhid, full_name, age, gender, phone, admission_type, bed_number, ipd_number, admission_date, discharge_date, status")
    .single();

  if (error || !data) return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  return NextResponse.json({ patient: data });
}
