import { NextResponse } from "next/server";

import { assertActiveUser, getActorId } from "@/lib/api/actor";
import { assertCeo } from "@/lib/api/ceo";
import { createServiceClient } from "@/lib/supabase/service";

type PostBody = {
  field_name?: string;
  field_type?: "text" | "number" | "date";
  is_required?: boolean;
  display_order?: number;
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: cashbookId } = await params;
  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!(await assertCeo(actorId!))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const fieldName = (body.field_name ?? "").trim();
  if (!fieldName) return NextResponse.json({ error: "missing_field_name" }, { status: 400 });
  const fieldType = body.field_type;
  if (!fieldType || !["text", "number", "date"].includes(fieldType)) {
    return NextResponse.json({ error: "invalid_field_type" }, { status: 400 });
  }
  const displayOrder = Number.isFinite(body.display_order) ? Number(body.display_order) : 0;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("cashbook_fields")
    .insert({
      cashbook_id: cashbookId,
      field_name: fieldName,
      field_type: fieldType,
      is_required: Boolean(body.is_required),
      display_order: displayOrder,
    })
    .select("id, field_name, field_type, is_required, display_order")
    .single();

  if (error || !data) return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  return NextResponse.json({ field: data });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: cashbookId } = await params;
  const actorId = getActorId(request);
  if (!(await assertActiveUser(actorId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!(await assertCeo(actorId!))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const fieldId = url.searchParams.get("field_id")?.trim();
  if (!fieldId) return NextResponse.json({ error: "missing_field_id" }, { status: 400 });

  const supabase = createServiceClient();
  const { error } = await supabase.from("cashbook_fields").delete().eq("id", fieldId).eq("cashbook_id", cashbookId);
  if (error) return NextResponse.json({ error: "delete_failed" }, { status: 500 });

  return NextResponse.json({ ok: true });
}
