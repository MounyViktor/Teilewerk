export function euro(cents: number): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100);
}

/** "35", "35,00", "35.5", "1.234,50" → Cent. Gibt null bei ungültiger Eingabe. */
export function parseEuro(input: string | null | undefined): number | null {
  if (input == null) return null;
  let s = String(input).trim().replace(/\s|€/g, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(parseFloat(s) * 100);
}

const TZ = "Europe/Berlin";

export function date(d: Date | string | null | undefined): string {
  if (!d) return "–";
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) d = d + "T12:00:00Z";
  return new Intl.DateTimeFormat("de-DE", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(d));
}

export function dateTime(d: Date | string | null | undefined): string {
  if (!d) return "–";
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(d));
}

/** "YYYY-MM-DD" + n Tage → "YYYY-MM-DD" */
export function addDays(isoDay: string, days: number): string {
  const x = new Date(isoDay + "T12:00:00Z");
  x.setUTCDate(x.getUTCDate() + days);
  return x.toISOString().slice(0, 10);
}

export function todayBerlin(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}
