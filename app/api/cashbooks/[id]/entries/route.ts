import { NextResponse } from "next/server";

import { assertActiveUser, getActorId } from "@/lib/api/actor";
import { assertCeo } from "@/lib/api/ceo";
import { createServiceClient } from "@/lib/supabase/service";
import { isEntryDateAllowed, parseEntryDate } from "@/lib/cashbook/entryDate";

type PostBody = {
  entry_type?: string;
  amount?: number;
  description?: string | null;
  entry_date?: string;
  category_id?: string;
  payment_method_id?: string;
  customer_id?: string;
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

  const entryType = body.entry_type;
  if (!entryType || !["in", "out"].includes(entryType)) {
    return NextResponse.json({ error: "invalid_entry_type" }, { status: 400 });
  }

  const amount = body.amount;
  if (amount === undefined || amount === null || Number.isNaN(Number(amount)) || Number(amount) <= 0) {
    return NextResponse.json({ error: "invalid_amount" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const isCeo = await assertCeo(actorId!);

  const { data: myMember } = await supabase
    .from("cashbook_members")
    .select("*")
    .eq("cashbook_id", cashbookId)
    .eq("user_id", actorId!)
    .maybeSingle();

  if (!isCeo && !myMember) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { data: book } = await supabase.from("cashbooks").select("id, is_active").eq("id", cashbookId).maybeSingle();
  if (!book?.is_active) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const canBackdate = isCeo ? "always" : (myMember?.can_backdate as string) ?? "never";
  const entryDateStr = (body.entry_date ?? "").trim();
  const entryDate = entryDateStr ? parseEntryDate(entryDateStr) : new Date();
  if (!isEntryDateAllowed(entryDate, canBackdate)) {
    return NextResponse.json({ error: "invalid_entry_date" }, { status: 400 });
  }

  const categoryId = (body.category_id ?? "").trim();
  const paymentMethodId = (body.payment_method_id ?? "").trim();
  const customerId = (body.customer_id ?? "").trim();
  if (!categoryId || !paymentMethodId || !customerId) {
    return NextResponse.json({ error: "missing_classification" }, { status: 400 });
  }

  const [{ data: cat }, { data: pm }, { data: cust }] = await Promise.all([
    supabase.from("cashbook_categories").select("id").eq("id", categoryId).eq("is_active", true).maybeSingle(),
    supabase.from("payment_methods").select("id").eq("id", paymentMethodId).eq("is_active", true).maybeSingle(),
    supabase.from("customers").select("id").eq("id", customerId).eq("is_active", true).maybeSingle(),
  ]);
  if (!cat || !pm || !cust) {
    return NextResponse.json({ error: "invalid_classification" }, { status: 400 });
  }

  const { data: row, error } = await supabase
    .from("cash_entries")
    .insert({
      cashbook_id: cashbookId,
      entry_type: entryType,
      amount: Number(amount),
      description: (body.description ?? "").trim() || null,
      entry_date: entryDate.toISOString(),
      created_by: actorId!,
      category_id: categoryId,
      payment_method_id: paymentMethodId,
      customer_id: customerId,
    })
    .select("*")
    .single();

  if (error || !row) return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  return NextResponse.json({ entry: row });
}
