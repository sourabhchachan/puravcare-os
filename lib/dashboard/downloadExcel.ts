/** Trigger browser download from a successful Excel export Response. */
export async function downloadExcelResponse(res: Response, fallbackFilename: string) {
  const cd = res.headers.get("Content-Disposition");
  let name = fallbackFilename;
  if (cd) {
    const m = /filename\*?=(?:UTF-8'')?["']?([^"';]+)/i.exec(cd);
    if (m?.[1]) name = decodeURIComponent(m[1].trim().replace(/["']/g, ""));
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
