export const LINEN_STORE_CATEGORY = "linen_store";

export const LINEN_STATUSES = [
  "in_store",
  "in_use",
  "in_laundry_bag",
  "in_laundry",
  "lost",
  "damaged",
] as const;

export type LinenStatus = (typeof LINEN_STATUSES)[number];

export const LINEN_TXN_TYPES = [
  "stock_in",
  "issued",
  "return_good",
  "return_damaged",
  "return_lost",
  "laundry_send",
  "laundry_receive",
  "laundry_lost",
] as const;

export type LinenTxnType = (typeof LINEN_TXN_TYPES)[number];

export const LINEN_FOLLOWUP_RESOLUTIONS = ["recovered", "written_off", "vendor_deducted"] as const;

export type LinenFollowupResolution = (typeof LINEN_FOLLOWUP_RESOLUTIONS)[number];
