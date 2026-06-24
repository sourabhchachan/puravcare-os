export function calcPendingPayment(entryType: "in" | "out", totalBillAmount: number, amount: number): number {
  const paid = entryType === "out" ? amount : 0;
  return totalBillAmount - paid;
}

export function parseBillFields(body: {
  ipd_number?: unknown;
  is_patient_related?: unknown;
  is_billed_to_cobra?: unknown;
  total_bill_amount?: unknown;
}):
  | { ok: true; ipd_number: string; is_patient_related: boolean; is_billed_to_cobra: boolean; total_bill_amount: number }
  | { ok: false; error: string } {
  const ipd_number = typeof body.ipd_number === "string" ? body.ipd_number.trim() : "";
  if (!ipd_number) return { ok: false, error: "missing_ipd_number" };

  if (typeof body.is_patient_related !== "boolean") return { ok: false, error: "invalid_patient_related" };
  if (typeof body.is_billed_to_cobra !== "boolean") return { ok: false, error: "invalid_billed_to_cobra" };

  const total_bill_amount = Number(body.total_bill_amount);
  if (body.total_bill_amount === undefined || body.total_bill_amount === null || Number.isNaN(total_bill_amount) || total_bill_amount < 0) {
    return { ok: false, error: "invalid_total_bill_amount" };
  }

  return {
    ok: true,
    ipd_number,
    is_patient_related: body.is_patient_related,
    is_billed_to_cobra: body.is_billed_to_cobra,
    total_bill_amount,
  };
}
