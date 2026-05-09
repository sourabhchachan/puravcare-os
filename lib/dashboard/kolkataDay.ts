/** Start/end ISO range for the current calendar day in Asia/Kolkata. */
export function kolkataDayBoundsIso(): { startIso: string; endIso: string } {
  const now = new Date();
  const d = now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const start = new Date(`${d}T00:00:00+05:30`);
  const end = new Date(`${d}T23:59:59.999+05:30`);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}
