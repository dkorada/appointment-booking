import type { StudioConfig } from "../config.js";
import { addDays, compareDates, formatClock, todayIn, weekday, zonedTime, type LocalDate } from "./time.js";

export interface Interval {
  start: Date;
  end: Date;
}

export interface Slot {
  /** ISO timestamp (UTC) of the slot start. */
  startAt: string;
  endAt: string;
  /** Studio-local wall-clock label, e.g. "09:30". */
  label: string;
}

export type ClosedReason = "CLOSED_DAY" | "PAST_DATE" | "TOO_FAR_AHEAD";

export interface DaySlots {
  closedReason?: ClosedReason;
  slots: Slot[];
}

export interface SlotQuery {
  date: LocalDate;
  durationMin: number;
  /** Confirmed bookings on this day. */
  busy: Interval[];
  now: Date;
  config: StudioConfig;
}

export const overlaps = (a: Interval, b: Interval) => a.start < b.end && b.start < a.end;

/**
 * Generates the bookable start times for a service on a date.
 *
 * A slot is offered when the whole appointment fits inside one working period
 * (opening to lunch, or lunch to closing), does not overlap an existing
 * booking, and starts at least `minLeadMin` minutes from now.
 */
export function generateSlots({ date, durationMin, busy, now, config }: SlotQuery): DaySlots {
  const today = todayIn(config.timeZone, now);
  if (compareDates(date, today) < 0) return { closedReason: "PAST_DATE", slots: [] };
  if (compareDates(date, addDays(today, config.maxDaysAhead)) > 0) {
    return { closedReason: "TOO_FAR_AHEAD", slots: [] };
  }
  if (config.closedWeekdays.includes(weekday(date))) return { closedReason: "CLOSED_DAY", slots: [] };

  const periods: Array<[number, number]> = [
    [config.openMin, config.lunchStartMin],
    [config.lunchEndMin, config.closeMin],
  ];
  const earliest = new Date(now.getTime() + config.minLeadMin * 60_000);
  const slots: Slot[] = [];

  for (const [periodStart, periodEnd] of periods) {
    for (let m = periodStart; m + durationMin <= periodEnd; m += config.slotStepMin) {
      const candidate = {
        start: zonedTime(date, m, config.timeZone),
        end: zonedTime(date, m + durationMin, config.timeZone),
      };
      if (candidate.start < earliest) continue;
      if (busy.some((b) => overlaps(candidate, b))) continue;
      slots.push({
        startAt: candidate.start.toISOString(),
        endAt: candidate.end.toISOString(),
        label: formatClock(m),
      });
    }
  }
  return { slots };
}

/** Splits an appointment into the fixed-size blocks it occupies. */
export function blocksFor(start: Date, end: Date, blockMin: number): Date[] {
  const step = blockMin * 60_000;
  const blocks: Date[] = [];
  for (let t = start.getTime(); t < end.getTime(); t += step) blocks.push(new Date(t));
  return blocks;
}
