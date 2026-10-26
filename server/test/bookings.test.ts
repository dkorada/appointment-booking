import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { ApiError, cancelBooking, createBooking, getAvailability } from "../src/bookings.js";
import { studio } from "../src/config.js";
import { createPrisma } from "../src/db.js";
import { zonedTime, type LocalDate } from "../src/lib/time.js";

const db = createPrisma("file:./test.db");
const TZ = studio.timeZone;

// Wednesday 4 Nov 2026, viewed from the evening before.
const WED: LocalDate = { year: 2026, month: 11, day: 4 };
const at = (hhmm: string, date = WED) => {
  const [h, m] = hhmm.split(":").map(Number);
  return zonedTime(date, h * 60 + m, TZ);
};
const NOW = at("20:00", { year: 2026, month: 11, day: 3 });

let haircut: { id: string }; // 30 min
let facial: { id: string }; // 60 min

const customer = {
  customerName: "Test Customer",
  phone: "+1 212 555 0100",
  email: "Test@Example.com",
  notes: "",
};

const book = (serviceId: string, hhmm: string, extra: Record<string, unknown> = {}) =>
  createBooking(db, { ...customer, serviceId, startAt: at(hhmm).toISOString(), ...extra }, NOW);

async function expectApiError(promise: Promise<unknown>, status: number, code: string) {
  const err = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ApiError);
  expect(err).toMatchObject({ status, code });
}

beforeAll(async () => {
  haircut = await db.service.create({
    data: { slug: "haircut", name: "Haircut", description: "", durationMin: 30, priceCents: 4500, category: "Hair" },
  });
  facial = await db.service.create({
    data: { slug: "facial", name: "Facial", description: "", durationMin: 60, priceCents: 8500, category: "Skin" },
  });
});

beforeEach(async () => {
  await db.outboxEmail.deleteMany();
  await db.bookedBlock.deleteMany();
  await db.booking.deleteMany();
});

afterAll(() => db.$disconnect());

describe("createBooking", () => {
  it("creates a booking with a reference, normalised fields and a confirmation email", async () => {
    const booking = await book(facial.id, "10:00");
    expect(booking.reference).toMatch(/^GLW-[A-Z2-9]{6}$/);
    expect(booking.email).toBe("test@example.com");
    expect(booking.notes).toBeNull();
    expect(booking.endAt.toISOString()).toBe(at("11:00").toISOString());
    expect(await db.bookedBlock.count({ where: { bookingId: booking.id } })).toBe(4);

    const emails = await db.outboxEmail.findMany();
    expect(emails).toHaveLength(1);
    expect(emails[0]).toMatchObject({ type: "BOOKING_CONFIRMED", to: "test@example.com", bookingId: booking.id });
    expect(emails[0].subject).toContain(booking.reference);
  });

  it("removes the booked time from availability", async () => {
    await book(facial.id, "10:00");
    const day = await getAvailability(db, haircut.id, WED, NOW);
    const labels = day.slots.map((s) => s.label);
    expect(labels).not.toContain("10:00");
    expect(labels).not.toContain("10:30");
    expect(labels).toContain("11:00");
  });
});

describe("double-booking prevention", () => {
  it("rejects a second booking for the exact same slot", async () => {
    await book(haircut.id, "09:00");
    await expectApiError(book(haircut.id, "09:00", { email: "other@example.com" }), 409, "SLOT_TAKEN");
    expect(await db.booking.count()).toBe(1);
  });

  it("rejects a booking that partially overlaps a longer one", async () => {
    await book(facial.id, "10:00"); // 10:00-11:00
    await expectApiError(book(haircut.id, "10:30"), 409, "SLOT_TAKEN");
  });

  it("rejects a longer booking that would run into an existing one", async () => {
    await book(haircut.id, "10:30"); // 10:30-11:00
    await expectApiError(book(facial.id, "10:00"), 409, "SLOT_TAKEN"); // 10:00-11:00
  });

  it("allows back-to-back bookings", async () => {
    await book(haircut.id, "09:00");
    await expect(book(haircut.id, "09:30")).resolves.toBeTruthy();
  });

  it("lets exactly one of many simultaneous requests win", async () => {
    const attempts = Array.from({ length: 8 }, (_, i) => book(haircut.id, "15:00", { email: `racer${i}@example.com` }));
    const results = await Promise.allSettled(attempts);
    const ok = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];

    expect(ok).toHaveLength(1);
    for (const r of rejected) expect(r.reason).toMatchObject({ status: 409, code: "SLOT_TAKEN" });
    expect(await db.booking.count()).toBe(1);
  });

  it("enforces the rule in the database even if the app check is bypassed", async () => {
    const first = await book(haircut.id, "16:00");
    await expect(
      db.bookedBlock.create({ data: { startAt: at("16:15"), bookingId: first.id } }),
    ).rejects.toThrow();
  });

  it("frees the slot again when a booking is cancelled", async () => {
    const first = await book(haircut.id, "11:00");
    await cancelBooking(db, first.id);
    const second = await book(haircut.id, "11:00", { email: "next@example.com" });
    expect(second.status).toBe("CONFIRMED");
  });
});

describe("server-side slot validation", () => {
  it("rejects a time during lunch", async () => {
    await expectApiError(book(haircut.id, "13:00"), 400, "SLOT_UNAVAILABLE");
  });

  it("rejects a service that would run into lunch", async () => {
    await expectApiError(book(facial.id, "12:30"), 400, "SLOT_UNAVAILABLE");
  });

  it("rejects a time outside the slot grid or opening hours", async () => {
    await expectApiError(book(haircut.id, "09:10"), 400, "SLOT_UNAVAILABLE");
    await expectApiError(book(haircut.id, "08:30"), 400, "SLOT_UNAVAILABLE");
    await expectApiError(book(haircut.id, "17:45"), 400, "SLOT_UNAVAILABLE");
  });

  it("rejects a time in the past", async () => {
    await expectApiError(
      createBooking(db, { ...customer, serviceId: haircut.id, startAt: at("09:00").toISOString() }, at("12:00")),
      400,
      "SLOT_UNAVAILABLE",
    );
  });

  it("returns field errors for invalid customer details", async () => {
    const err = await book(haircut.id, "09:00", { customerName: "", phone: "abc", email: "nope" }).catch((e) => e);
    expect(err).toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
    expect(Object.keys(err.fieldErrors).sort()).toEqual(["customerName", "email", "phone"]);
  });
});

describe("cancelBooking", () => {
  it("marks the booking cancelled and logs a cancellation email", async () => {
    const booking = await book(haircut.id, "14:00");
    const cancelled = await cancelBooking(db, booking.id);
    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.cancelledAt).toBeInstanceOf(Date);
    expect(await db.bookedBlock.count()).toBe(0);
    const types = (await db.outboxEmail.findMany({ orderBy: { createdAt: "asc" } })).map((e) => e.type);
    expect(types).toEqual(["BOOKING_CONFIRMED", "BOOKING_CANCELLED"]);
  });

  it("refuses to cancel twice", async () => {
    const booking = await book(haircut.id, "14:30");
    await cancelBooking(db, booking.id);
    await expectApiError(cancelBooking(db, booking.id), 409, "ALREADY_CANCELLED");
  });
});

describe("HTTP API", () => {
  const app = createApp(db);

  it("POST /api/bookings returns 400 with field errors for bad input", async () => {
    const res = await request(app).post("/api/bookings").send({ serviceId: haircut.id });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.fieldErrors).toHaveProperty("email");
    expect(res.body.error.fieldErrors).toHaveProperty("startAt");
  });

  it("GET /api/availability validates its query", async () => {
    const res = await request(app).get("/api/availability").query({ serviceId: haircut.id, date: "2026-02-30" });
    expect(res.status).toBe(400);
  });

  it("GET /api/services lists active services", async () => {
    const res = await request(app).get("/api/services");
    expect(res.status).toBe(200);
    expect(res.body.map((s: { slug: string }) => s.slug)).toEqual(expect.arrayContaining(["haircut", "facial"]));
  });
});
