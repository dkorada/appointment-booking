import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";

interface Props {
  /** Studio-local "today" as YYYY-MM-DD. */
  today: string;
  maxDaysAhead: number;
  closedWeekdays: number[];
  value: string | null;
  onChange: (ymd: string) => void;
}

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const toYmd = (d: Date) => d.toISOString().slice(0, 10);
const fromYmd = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

export function isOpenDay(ymd: string, today: string, maxDaysAhead: number, closedWeekdays: number[]) {
  const last = toYmd(addDays(fromYmd(today), maxDaysAhead));
  return ymd >= today && ymd <= last && !closedWeekdays.includes(fromYmd(ymd).getUTCDay());
}

/** Month-view date picker working purely in calendar dates (UTC maths, no local zone drift). */
export function Calendar({ today, maxDaysAhead, closedWeekdays, value, onChange }: Props) {
  const start = fromYmd(today);
  const [month, setMonth] = useState(() => {
    const base = value ? fromYmd(value) : start;
    return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), 1));
  });

  const lastBookable = addDays(start, maxDaysAhead);
  const canPrev = month > new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const canNext = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1)) <= lastBookable;

  const cells = useMemo(() => {
    const first = month;
    const lead = first.getUTCDay();
    const daysInMonth = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    const out: Array<string | null> = Array(lead).fill(null);
    for (let d = 1; d <= daysInMonth; d++) out.push(toYmd(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), d))));
    return out;
  }, [month]);

  const shift = (n: number) => setMonth(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + n, 1)));
  const title = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(month);

  return (
    <div className="calendar">
      <div className="calendar-head">
        <button type="button" className="icon-btn" onClick={() => shift(-1)} disabled={!canPrev} aria-label="Previous month">
          <ChevronLeft size={18} />
        </button>
        <span className="calendar-title" aria-live="polite">
          {title}
        </span>
        <button type="button" className="icon-btn" onClick={() => shift(1)} disabled={!canNext} aria-label="Next month">
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="calendar-grid" role="grid">
        {WEEKDAYS.map((w) => (
          <span key={w} className="calendar-dow" aria-hidden>
            {w}
          </span>
        ))}
        {cells.map((ymd, i) =>
          ymd ? (
            <button
              key={ymd}
              type="button"
              className={[
                "calendar-day",
                ymd === value && "is-selected",
                ymd === today && "is-today",
              ]
                .filter(Boolean)
                .join(" ")}
              disabled={!isOpenDay(ymd, today, maxDaysAhead, closedWeekdays)}
              onClick={() => onChange(ymd)}
              aria-pressed={ymd === value}
              aria-label={new Intl.DateTimeFormat("en-US", { dateStyle: "full", timeZone: "UTC" }).format(fromYmd(ymd))}
            >
              {Number(ymd.slice(8))}
            </button>
          ) : (
            <span key={`pad-${i}`} />
          ),
        )}
      </div>
    </div>
  );
}

/** First bookable date on or after today. */
export function firstOpenDay(today: string, maxDaysAhead: number, closedWeekdays: number[]) {
  for (let i = 0; i <= maxDaysAhead; i++) {
    const ymd = toYmd(addDays(fromYmd(today), i));
    if (isOpenDay(ymd, today, maxDaysAhead, closedWeekdays)) return ymd;
  }
  return today;
}

export const nextDay = (ymd: string) => toYmd(addDays(fromYmd(ymd), 1));
