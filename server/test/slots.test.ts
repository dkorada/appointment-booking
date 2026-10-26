import { describe, expect, it } from "vitest";
import { studio } from "../src/config.js";
import { blocksFor, generateSlots, type Interval } from "../src/lib/slots.js";
import { zonedTime, type LocalDate } from "../src/lib/time.js";

const TZ = "America/New_York";
const config = { ...studio, timeZone: TZ };

// Wednesday 4 Nov 2026 (after the US DST change, so New York is UTC-5).
const WED: LocalDate = { year: 2026, month: 11, day: 4 };
const at = (date: LocalDate, hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return zonedTime(date, h * 60 + m, TZ);
};
// "Now" is the evening before, so nothing on WED is in the past.
const EVENING_BEFORE = at({ year: 2026, month: 11, day: 3 }, "20:00");

const labels = (durationMin: number, busy: Interval[] = [], now = EVENING_BEFORE, date = WED) =>
  generateSlots({ date, durationMin, busy, now, config }).slots.map((s) => s.label);

describe("generateSlots", () => {
  it("offers 30-minute slots across working hours, skipping lunch", () => {
    expect(labels(30)).toEqual([
      "09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30",
      "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00", "17:30",
    ]);
  });

  it("only offers start times where the whole service fits before lunch or closing", () => {
    const sixty = labels(60);
    expect(sixty).not.toContain("12:30"); // would run into lunch
    expect(sixty).not.toContain("17:30"); // would run past 18:00
    expect(sixty).toContain("12:00");
    expect(sixty).toContain("17:00");

    const ninety = labels(90);
    expect(ninety.at(0)).toBe("09:00");
    expect(ninety).not.toContain("12:00");
    expect(ninety).toContain("11:30");
    expect(ninety.at(-1)).toBe("16:30");
  });

  it("never offers a slot during the lunch break", () => {
    for (const d of [30, 45, 60, 90]) {
      expect(labels(d).filter((l) => l >= "13:00" && l < "14:00")).toEqual([]);
    }
  });

  it("returns timestamps as UTC instants for the studio time zone", () => {
    const [first] = generateSlots({ date: WED, durationMin: 30, busy: [], now: EVENING_BEFORE, config }).slots;
    expect(first.startAt).toBe("2026-11-04T14:00:00.000Z"); // 09:00 EST
    expect(first.endAt).toBe("2026-11-04T14:30:00.000Z");
  });

  it("handles daylight-saving dates correctly", () => {
    // 15 Oct 2026: New York is on EDT (UTC-4).
    const oct: LocalDate = { year: 2026, month: 10, day: 15 };
    const [first] = generateSlots({
      date: oct,
      durationMin: 30,
      busy: [],
      now: at({ year: 2026, month: 10, day: 14 }, "08:00"),
      config,
    }).slots;
    expect(first.startAt).toBe("2026-10-15T13:00:00.000Z");
  });

  it("excludes slots that overlap an existing booking", () => {
    const busy = [{ start: at(WED, "10:00"), end: at(WED, "11:00") }];
    const thirty = labels(30, busy);
    expect(thirty).not.toContain("10:00");
    expect(thirty).not.toContain("10:30");
    expect(thirty).toContain("09:30"); // ends exactly when the booking starts
    expect(thirty).toContain("11:00"); // starts exactly when the booking ends

    const sixty = labels(60, busy);
    expect(sixty).not.toContain("09:30"); // 09:30-10:30 overlaps
    expect(sixty).toContain("09:00");
  });

  it("excludes slots blocked by an odd-length booking", () => {
    // A 45-minute booking 09:00-09:45 blocks 09:30 too.
    const busy = [{ start: at(WED, "09:00"), end: at(WED, "09:45") }];
    expect(labels(30, busy).slice(0, 2)).toEqual(["10:00", "10:30"]);
  });

  it("hides past slots and anything starting within the lead time", () => {
    const now = at(WED, "11:10"); // + 30 min lead = 11:40
    const today = labels(30, [], now);
    expect(today[0]).toBe("12:00");
    expect(today).not.toContain("11:30");
  });

  it("returns nothing for a date in the past", () => {
    const result = generateSlots({ date: WED, durationMin: 30, busy: [], now: at(WED, "07:00"), config });
    expect(result.slots.length).toBeGreaterThan(0);

    const yesterday = generateSlots({
      date: { year: 2026, month: 11, day: 3 },
      durationMin: 30,
      busy: [],
      now: at(WED, "07:00"),
      config,
    });
    expect(yesterday).toEqual({ closedReason: "PAST_DATE", slots: [] });
  });

  it("returns nothing late in the day once every slot has passed", () => {
    expect(labels(30, [], at(WED, "17:45"))).toEqual([]);
  });

  it("is closed on Sundays", () => {
    const sunday = generateSlots({
      date: { year: 2026, month: 11, day: 8 },
      durationMin: 30,
      busy: [],
      now: EVENING_BEFORE,
      config,
    });
    expect(sunday).toEqual({ closedReason: "CLOSED_DAY", slots: [] });
  });

  it("refuses dates beyond the booking window", () => {
    const far = generateSlots({
      date: { year: 2027, month: 3, day: 1 },
      durationMin: 30,
      busy: [],
      now: EVENING_BEFORE,
      config,
    });
    expect(far.closedReason).toBe("TOO_FAR_AHEAD");
  });
});

describe("blocksFor", () => {
  it("splits an appointment into 15-minute blocks", () => {
    const blocks = blocksFor(at(WED, "10:00"), at(WED, "10:45"), 15);
    expect(blocks.map((b) => b.toISOString())).toEqual([
      "2026-11-04T15:00:00.000Z",
      "2026-11-04T15:15:00.000Z",
      "2026-11-04T15:30:00.000Z",
    ]);
  });
});
