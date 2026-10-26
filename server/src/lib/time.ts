import { TZDate } from "@date-fns/tz";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A calendar date with no time or zone attached. */
export interface LocalDate {
  year: number;
  month: number; // 1-12
  day: number;
}

export function parseLocalDate(value: string): LocalDate | null {
  const m = DATE_RE.exec(value);
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    return null;
  }
  return { year, month, day };
}

export function formatLocalDate(d: LocalDate): string {
  return `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
}

/** The UTC instant of a wall-clock time on a date in a time zone. */
export function zonedTime(date: LocalDate, minutesAfterMidnight: number, timeZone: string): Date {
  const h = Math.floor(minutesAfterMidnight / 60);
  const min = minutesAfterMidnight % 60;
  return new Date(new TZDate(date.year, date.month - 1, date.day, h, min, timeZone).getTime());
}

/** Day of week (0 = Sunday) of a calendar date. */
export function weekday(date: LocalDate): number {
  return new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
}

/** The calendar date "today" in a time zone. */
export function todayIn(timeZone: string, now: Date = new Date()): LocalDate {
  const z = new TZDate(now.getTime(), timeZone);
  return { year: z.getFullYear(), month: z.getMonth() + 1, day: z.getDate() };
}

/** The studio-local calendar date and minutes-after-midnight of an instant. */
export function localParts(instant: Date, timeZone: string): { date: LocalDate; minutes: number } {
  const z = new TZDate(instant.getTime(), timeZone);
  return {
    date: { year: z.getFullYear(), month: z.getMonth() + 1, day: z.getDate() },
    minutes: z.getHours() * 60 + z.getMinutes(),
  };
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const d = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

export function compareDates(a: LocalDate, b: LocalDate): number {
  return formatLocalDate(a).localeCompare(formatLocalDate(b));
}

export function formatClock(minutesAfterMidnight: number): string {
  const h = Math.floor(minutesAfterMidnight / 60);
  const m = minutesAfterMidnight % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
