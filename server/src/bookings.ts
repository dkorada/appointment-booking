import { createBookingSchema, toFieldErrors, type FieldErrors } from "../../shared/booking.js";
import { studio, type StudioConfig } from "./config.js";
import type { Db } from "./db.js";
import { sendBookingEmail } from "./lib/email.js";
import { generateReference } from "./lib/format.js";
import { blocksFor, generateSlots, type DaySlots, type Interval } from "./lib/slots.js";
import { addDays, localParts, zonedTime, type LocalDate } from "./lib/time.js";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fieldErrors?: FieldErrors,
  ) {
    super(message);
  }
}

const SLOT_TAKEN = () =>
  new ApiError(409, "SLOT_TAKEN", "Sorry, that time was just booked by someone else. Please pick another slot.");

/** Confirmed bookings that overlap a studio-local calendar day. */
export async function busyIntervals(db: Db, date: LocalDate, config: StudioConfig = studio): Promise<Interval[]> {
  const dayStart = zonedTime(date, 0, config.timeZone);
  const dayEnd = zonedTime(addDays(date, 1), 0, config.timeZone);
  const rows = await db.booking.findMany({
    where: { status: "CONFIRMED", startAt: { lt: dayEnd }, endAt: { gt: dayStart } },
    select: { startAt: true, endAt: true },
  });
  return rows.map((r) => ({ start: r.startAt, end: r.endAt }));
}

export async function getAvailability(
  db: Db,
  serviceId: string,
  date: LocalDate,
  now = new Date(),
  config: StudioConfig = studio,
): Promise<DaySlots> {
  const service = await db.service.findUnique({ where: { id: serviceId } });
  if (!service || !service.active) throw new ApiError(404, "SERVICE_NOT_FOUND", "Service not found");
  const busy = await busyIntervals(db, date, config);
  return generateSlots({ date, durationMin: service.durationMin, busy, now, config });
}

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; message?: string };
  return e?.code === "P2002" || /UNIQUE constraint failed/i.test(e?.message ?? "");
}

/**
 * Creates a booking after re-checking everything server-side.
 *
 * Double-booking is prevented twice over: the requested start must be one of
 * the free slots generated from current bookings, and the insert claims every
 * 15-minute BookedBlock the appointment covers. BookedBlock.startAt is UNIQUE,
 * so if two requests race past the first check, only one insert can succeed.
 */
export async function createBooking(db: Db, body: unknown, now = new Date(), config: StudioConfig = studio) {
  const parsed = createBookingSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(400, "VALIDATION_ERROR", "Please check the highlighted fields", toFieldErrors(parsed.error));
  }
  const input = parsed.data;

  const service = await db.service.findUnique({ where: { id: input.serviceId } });
  if (!service || !service.active) {
    throw new ApiError(400, "VALIDATION_ERROR", "Please choose a service", { serviceId: "Unknown service" });
  }

  const startAt = new Date(input.startAt);
  const endAt = new Date(startAt.getTime() + service.durationMin * 60_000);
  const { date } = localParts(startAt, config.timeZone);
  const startIso = startAt.toISOString();
  const offered = (day: DaySlots) => day.slots.some((s) => s.startAt === startIso);

  const busy = await busyIntervals(db, date, config);
  if (!offered(generateSlots({ date, durationMin: service.durationMin, busy, now, config }))) {
    // Distinguish "someone else has it" from "this was never a valid slot".
    if (offered(generateSlots({ date, durationMin: service.durationMin, busy: [], now, config }))) throw SLOT_TAKEN();
    throw new ApiError(400, "SLOT_UNAVAILABLE", "That time is outside opening hours or in the past.", {
      startAt: "Choose an available time slot",
    });
  }

  const blocks = blocksFor(startAt, endAt, config.blockMin);
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const booking = await db.booking.create({
        data: {
          reference: generateReference(),
          serviceId: service.id,
          startAt,
          endAt,
          customerName: input.customerName,
          phone: input.phone,
          email: input.email,
          notes: input.notes ?? null,
          blocks: { create: blocks.map((b) => ({ startAt: b })) },
        },
        include: { service: true },
      });
      await sendBookingEmail(db, "BOOKING_CONFIRMED", booking);
      return booking;
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      const clash = await db.bookedBlock.count({ where: { startAt: { in: blocks } } });
      if (clash > 0) throw SLOT_TAKEN();
      // Otherwise the random reference collided; try again with a new one.
    }
  }
  throw new ApiError(500, "REFERENCE_EXHAUSTED", "Could not create booking, please try again");
}

export async function cancelBooking(db: Db, id: string) {
  const existing = await db.booking.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, "BOOKING_NOT_FOUND", "Booking not found");
  if (existing.status === "CANCELLED") throw new ApiError(409, "ALREADY_CANCELLED", "Booking is already cancelled");

  const [booking] = await db.$transaction([
    db.booking.update({
      where: { id },
      data: { status: "CANCELLED", cancelledAt: new Date() },
      include: { service: true },
    }),
    // Releasing the blocks makes the time bookable again.
    db.bookedBlock.deleteMany({ where: { bookingId: id } }),
  ]);
  await sendBookingEmail(db, "BOOKING_CANCELLED", booking);
  return booking;
}
