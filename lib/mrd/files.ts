export function daysBetween(fromIso: string, toDate = new Date()) {
  const start = new Date(fromIso);
  const diff = toDate.getTime() - start.getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

export function computeDaysOutOfMrd(
  fileStatus: string,
  latestDispatchedAt: string | null | undefined,
  hasOpenDispatch: boolean,
) {
  if (fileStatus !== "with_staff" || !hasOpenDispatch || !latestDispatchedAt) return 0;
  return daysBetween(latestDispatchedAt);
}
