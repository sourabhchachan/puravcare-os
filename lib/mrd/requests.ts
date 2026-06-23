const ACTIVE_STATUSES = ["pending", "dispatched", "received"] as const;

export type MrdRequestRow = {
  id: string;
  file_id: string;
  request_type: string;
  status: string;
  dispatched_at: string | null;
};

export function isActiveMrdRequest(req: Pick<MrdRequestRow, "status">) {
  return ACTIVE_STATUSES.includes(req.status as (typeof ACTIVE_STATUSES)[number]);
}

export function hasActiveMrdRequest(requests: MrdRequestRow[]) {
  return requests.some(isActiveMrdRequest);
}

export function latestOpenBorrow(requests: MrdRequestRow[]) {
  return requests
    .filter((r) => r.request_type === "borrow" && (r.status === "dispatched" || r.status === "received"))
    .sort((a, b) => new Date(b.dispatched_at ?? 0).getTime() - new Date(a.dispatched_at ?? 0).getTime())[0];
}
