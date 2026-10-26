import { studio } from "./config.js";
import type { Db } from "./db.js";
import { sendBookingEmail } from "./lib/email.js";
import { generateReference } from "./lib/format.js";
import { blocksFor } from "./lib/slots.js";
import { addDays, todayIn, weekday, zonedTime, type LocalDate } from "./lib/time.js";

// Sample data for the demo. Booking dates are relative to today.

const services = [
  {
    slug: "signature-haircut",
    name: "Signature Haircut",
    category: "Hair",
    durationMin: 30,
    priceCents: 4500,
    description: "Consultation, wash, precision cut and finish styled to suit you.",
  },
  {
    slug: "blow-dry-style",
    name: "Blow-dry & Style",
    category: "Hair",
    durationMin: 45,
    priceCents: 5500,
    description: "Smooth, bouncy or beachy. A salon blow-dry that lasts for days.",
  },
  {
    slug: "colour-gloss",
    name: "Colour & Gloss",
    category: "Hair",
    durationMin: 90,
    priceCents: 12000,
    description: "All-over colour or root refresh, finished with a mirror-shine gloss.",
  },
  {
    slug: "hydrating-facial",
    name: "Hydrating Facial",
    category: "Skin",
    durationMin: 60,
    priceCents: 8500,
    description: "Deep cleanse, gentle exfoliation and a hyaluronic mask for a dewy glow.",
  },
  {
    slug: "brow-shaping",
    name: "Brow Shaping",
    category: "Skin",
    durationMin: 30,
    priceCents: 2500,
    description: "Wax, tweeze and tint to frame your face perfectly.",
  },
  {
    slug: "gel-manicure",
    name: "Gel Manicure",
    category: "Nails",
    durationMin: 45,
    priceCents: 4000,
    description: "Cuticle care, shaping and a chip-free gel finish in your favourite shade.",
  },
];

const customers = [
  { customerName: "Ava Thompson", phone: "+1 (212) 555-0193", email: "ava.thompson@example.com" },
  { customerName: "Liam Patel", phone: "+1 (917) 555-0127", email: "liam.patel@example.com" },
  { customerName: "Sofia Martinez", phone: "+1 (646) 555-0174", email: "sofia.m@example.com" },
  { customerName: "Noah Kim", phone: "+1 (347) 555-0110", email: "noah.kim@example.com" },
  { customerName: "Emma O'Brien", phone: "+1 (718) 555-0166", email: "emma.obrien@example.com" },
  { customerName: "Mia Rossi", phone: "+1 (212) 555-0155", email: "mia.rossi@example.com" },
  { customerName: "Ethan Walker", phone: "+1 (929) 555-0138", email: "ethan.walker@example.com" },
  { customerName: "Chloe Nguyen", phone: "+1 (646) 555-0181", email: "chloe.nguyen@example.com" },
];

// [days from today (open days only), "HH:MM", service slug, customer index, notes?, cancelled?]
type Plan = [number, string, string, number, string?, boolean?];
const plan: Plan[] = [
  [-3, "10:00", "hydrating-facial", 0, "Sensitive skin, fragrance-free products please."],
  [-2, "15:00", "signature-haircut", 1],
  [-1, "11:30", "gel-manicure", 5],
  [1, "09:00", "signature-haircut", 1, "Just a trim, keep the length."],
  [1, "10:00", "hydrating-facial", 0, "Sensitive skin, fragrance-free products please."],
  [1, "14:00", "colour-gloss", 2, "Warm caramel balayage, bringing reference photos."],
  [2, "11:00", "gel-manicure", 5, "Dusty rose shade."],
  [2, "16:00", "brow-shaping", 7],
  [3, "09:30", "blow-dry-style", 4, "Wedding guest, would love soft waves."],
  [3, "12:00", "signature-haircut", 3],
  [4, "14:30", "hydrating-facial", 6],
  [4, "17:00", "brow-shaping", 2],
  [5, "10:30", "colour-gloss", 7, undefined, true],
  [6, "15:00", "blow-dry-style", 0],
];

/** Moves n open (non-closed) days from today, forwards or backwards. */
function openDay(n: number): LocalDate {
  let d = todayIn(studio.timeZone);
  const step = n < 0 ? -1 : 1;
  for (let left = Math.abs(n); left > 0; ) {
    d = addDays(d, step);
    if (!studio.closedWeekdays.includes(weekday(d))) left--;
  }
  return d;
}

/** Replaces all data with the demo services, bookings and outbox emails. */
export async function seedDemoData(db: Db) {
  await db.outboxEmail.deleteMany();
  await db.bookedBlock.deleteMany();
  await db.booking.deleteMany();
  await db.service.deleteMany();

  const bySlug = new Map<string, { id: string; durationMin: number }>();
  for (const [i, s] of services.entries()) {
    const created = await db.service.create({ data: { ...s, sortOrder: i } });
    bySlug.set(s.slug, created);
  }

  const now = new Date();
  for (const [dayOffset, time, slug, customerIdx, notes, cancelled] of plan) {
    const service = bySlug.get(slug)!;
    const [h, m] = time.split(":").map(Number);
    const startAt = zonedTime(openDay(dayOffset), h * 60 + m, studio.timeZone);
    const endAt = new Date(startAt.getTime() + service.durationMin * 60_000);
    const isPast = endAt < now;

    const booking = await db.booking.create({
      data: {
        reference: generateReference(),
        serviceId: service.id,
        startAt,
        endAt,
        ...customers[customerIdx],
        notes: notes ?? null,
        status: cancelled ? "CANCELLED" : "CONFIRMED",
        cancelledAt: cancelled ? now : null,
        createdAt: new Date(startAt.getTime() - 5 * 24 * 3600_000),
        // Only confirmed bookings hold time blocks.
        blocks: cancelled ? undefined : { create: blocksFor(startAt, endAt, studio.blockMin).map((b) => ({ startAt: b })) },
      },
      include: { service: true },
    });
    if (!isPast) await sendBookingEmail(db, "BOOKING_CONFIRMED", booking, { log: false });
    if (cancelled) await sendBookingEmail(db, "BOOKING_CANCELLED", booking, { log: false });
  }

  const counts = {
    services: await db.service.count(),
    bookings: await db.booking.count(),
    outbox: await db.outboxEmail.count(),
  };
  return counts;
}
