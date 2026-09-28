// Calendar maths on plain "YYYY-MM-DD" strings. Everything is done in UTC so
// the server's own time zone can never shift a date. Weeks start on Monday.

const DAY = 86_400_000;

const toMs = (d: string) => Date.parse(d + "T00:00:00Z");
const fromMs = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function isIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const ms = toMs(s);
  return Number.isFinite(ms) && fromMs(ms) === s;
}

export function isTime(s: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

export function todayIn(timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export function nowTimeIn(timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
  } catch {
    return new Date().toISOString().slice(11, 16);
  }
}

export const addDays = (d: string, n: number) => fromMs(toMs(d) + n * DAY);
export const daysBetween = (a: string, b: string) => Math.round((toMs(b) - toMs(a)) / DAY);

// 0 = Monday … 6 = Sunday
export const weekdayIndex = (d: string) => (new Date(toMs(d)).getUTCDay() + 6) % 7;
export const startOfWeek = (d: string) => addDays(d, -weekdayIndex(d));

export const startOfMonth = (d: string) => d.slice(0, 8) + "01";
export function addMonths(d: string, n: number): string {
  const dt = new Date(toMs(startOfMonth(d)));
  dt.setUTCMonth(dt.getUTCMonth() + n);
  return fromMs(dt.getTime());
}
export const endOfMonth = (d: string) => addDays(addMonths(d, 1), -1);

export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const fmt = (d: string, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-NZ", { timeZone: "UTC", ...opts }).format(new Date(toMs(d)));

// "Mon 5 Oct"
export const fmtDay = (d: string) => fmt(d, { weekday: "short", day: "numeric", month: "short" });
// "5 Oct 2026"
export const fmtDate = (d: string) => fmt(d, { day: "numeric", month: "short", year: "numeric" });
// "Monday 5 October 2026"
export const fmtLong = (d: string) => fmt(d, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
// "October 2026"
export const fmtMonth = (d: string) => fmt(d, { month: "long", year: "numeric" });
// "5 Oct"
export const fmtShort = (d: string) => fmt(d, { day: "numeric", month: "short" });

export function fmtRange(from: string, to: string): string {
  if (from === to) return fmtDate(from);
  if (from.slice(0, 4) !== to.slice(0, 4)) return `${fmtDate(from)} – ${fmtDate(to)}`;
  return `${fmtShort(from)} – ${fmtDate(to)}`;
}

export const minutesOf = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

export function timeFromMinutes(m: number): string {
  const mm = ((m % 1440) + 1440) % 1440;
  return `${String(Math.floor(mm / 60)).padStart(2, "0")}:${String(mm % 60).padStart(2, "0")}`;
}

// "05:30" -> "5:30 am"
export function fmtTime(t: string): string {
  const h = Number(t.slice(0, 2));
  const m = t.slice(3, 5);
  const suffix = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${suffix}`;
}

export function fmtDuration(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
