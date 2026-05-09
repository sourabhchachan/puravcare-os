/** UTC day start for coarse backdating checks (server runs UTC on Vercel). */
export function utcDayStart(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function parseEntryDate(isoOrYmd: string): Date {
  const s = isoOrYmd.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return new Date(`${s}T12:00:00.000Z`);
  }
  return new Date(s);
}

/** Returns true if entryDate is allowed for can_backdate policy. */
export function isEntryDateAllowed(entryDate: Date, canBackdate: string): boolean {
  const t = entryDate.getTime();
  if (Number.isNaN(t)) return false;
  const now = new Date();
  const todayStart = utcDayStart(now);
  const entryDay = utcDayStart(entryDate);
  if (canBackdate === "always") {
    return entryDay <= todayStart;
  }
  if (canBackdate === "never") {
    return entryDay === todayStart;
  }
  if (canBackdate === "1day") {
    return entryDay >= todayStart - 86400000 && entryDay <= todayStart;
  }
  return false;
}
