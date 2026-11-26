/** Desfase (minutos) de una zona horaria respecto a UTC en un instante dado. */
function tzOffsetMinutes(timeZone: string, at: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return (asUtc - at.getTime()) / 60_000;
}

/** "AAAA-MM-DD" → instante de las 00:00 de ese día en la zona horaria de la empresa. */
export function startOfDayInZone(isoDate: string, timeZone: string): Date {
  const [y, m, d] = isoDate.split("-").map(Number) as [number, number, number];
  const utcMidnight = new Date(Date.UTC(y, m - 1, d));
  return new Date(utcMidnight.getTime() - tzOffsetMinutes(timeZone, utcMidnight) * 60_000);
}

/** Fecha de hoy ("AAAA-MM-DD") en la zona horaria indicada. */
export function todayInZone(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function addMonths(date: Date, months: number) {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

export function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 86_400_000);
}
