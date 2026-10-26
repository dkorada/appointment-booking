import "dotenv/config";

export interface StudioConfig {
  name: string;
  timeZone: string;
  /** Minutes after midnight, studio-local time. */
  openMin: number;
  closeMin: number;
  lunchStartMin: number;
  lunchEndMin: number;
  /** 0 = Sunday ... 6 = Saturday */
  closedWeekdays: number[];
  /** Start times are offered on this grid. */
  slotStepMin: number;
  /** Bookings occupy blocks of this size (BookedBlock rows). */
  blockMin: number;
  /** Slots starting sooner than this are not offered. */
  minLeadMin: number;
  maxDaysAhead: number;
}

export const studio: StudioConfig = {
  name: "Glow Studio",
  timeZone: process.env.STUDIO_TZ || "America/New_York",
  openMin: 9 * 60,
  closeMin: 18 * 60,
  lunchStartMin: 13 * 60,
  lunchEndMin: 14 * 60,
  closedWeekdays: [0],
  slotStepMin: 30,
  blockMin: 15,
  minLeadMin: 30,
  maxDaysAhead: 60,
};
