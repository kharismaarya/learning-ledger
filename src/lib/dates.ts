export function today(): string {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
export function parseD(s?: string | null): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
export function fmtD(s?: string | null, opt?: Intl.DateTimeFormatOptions): string {
  const d = parseD(s);
  return d ? d.toLocaleDateString("en-GB", opt || { day: "numeric", month: "short" }) : "";
}
export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}
/** "07 Mon" in the timeline, "07 Oct" in grouped views */
export function dayLabel(s: string | undefined, full: boolean): string {
  const d = parseD(s);
  return d ? String(d.getDate()).padStart(2, "0") + " " + d.toLocaleDateString("en-GB", full ? { month: "short" } : { weekday: "short" }) : "";
}
