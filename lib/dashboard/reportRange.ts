/** Shared date ranges for reports and Excel exports (preset + optional custom ISO bounds). */

export type ReportPreset = "this_month" | "last_month" | "this_year" | "custom";

export function rangeFromPreset(
  preset: string | null,
  start?: string | null,
  end?: string | null,
): { start: Date; end: Date } {
  if (preset === "custom" && start && end) {
    return { start: new Date(start), end: new Date(end) };
  }
  const now = new Date();
  if (preset === "last_month") {
    return {
      start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
      end: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999),
    };
  }
  if (preset === "this_year") {
    return {
      start: new Date(now.getFullYear(), 0, 1),
      end: new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999),
    };
  }
  return {
    start: new Date(now.getFullYear(), now.getMonth(), 1),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
  };
}

export function toYmdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Filename fragment from inclusive report range (local calendar dates). */
export function fileSuffixFromDates(start: Date, end: Date): string {
  return `${toYmdLocal(start)}_${toYmdLocal(end)}`;
}

export function slugFilePart(name: string, max = 36): string {
  const s = name.replace(/[^\w\-]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  return (s || "export").slice(0, max);
}

/** Parse filename from Content-Disposition header. */
export function filenameFromContentDisposition(header: string | null): string | null {
  if (!header) return null;
  const m = /filename\*?=(?:UTF-8'')?["']?([^"';]+)/i.exec(header);
  return m?.[1]?.trim() ?? null;
}
