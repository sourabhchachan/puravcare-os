/** Calendar date (YYYY-MM-DD) for Asia/Kolkata. */
export function kolkataToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export function hoursBetween(punchInIso: string, punchOutIso: string): number {
  const ms = new Date(punchOutIso).getTime() - new Date(punchInIso).getTime();
  if (ms <= 0) return 0;
  return Math.round((ms / 3600000) * 100) / 100;
}
