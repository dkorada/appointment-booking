import { studio } from "../config.js";
import type { Db } from "../db.js";
import type { EmailType } from "../generated/prisma/enums.js";
import { formatPrice, formatWhen } from "./format.js";

interface BookingForEmail {
  id: string;
  reference: string;
  customerName: string;
  email: string;
  startAt: Date;
  notes: string | null;
  service: { name: string; durationMin: number; priceCents: number };
}

const STUDIO_FOOTER = [
  "Glow Studio",
  "214 Mercer Street, New York, NY 10012",
  "(212) 555-0148 · hello@glowstudio.example",
].join("\n");

function compose(type: EmailType, b: BookingForEmail) {
  const when = formatWhen(b.startAt, studio.timeZone);
  const firstName = b.customerName.split(" ")[0];
  if (type === "BOOKING_CONFIRMED") {
    return {
      subject: `You're booked! ${b.service.name} on ${when} (${b.reference})`,
      bodyText: [
        `Hi ${firstName},`,
        "",
        "Thanks for booking with Glow Studio. Here are your appointment details:",
        "",
        `  Reference: ${b.reference}`,
        `  Service:   ${b.service.name} (${b.service.durationMin} min)`,
        `  When:      ${when}`,
        `  Price:     ${formatPrice(b.service.priceCents)}`,
        ...(b.notes ? [`  Notes:     ${b.notes}`] : []),
        "",
        "Please arrive 5 minutes early. Need to change something? Reply to this email",
        "or call us and quote your reference.",
        "",
        STUDIO_FOOTER,
      ].join("\n"),
    };
  }
  return {
    subject: `Your appointment ${b.reference} has been cancelled`,
    bodyText: [
      `Hi ${firstName},`,
      "",
      `Your ${b.service.name} appointment on ${when} (ref ${b.reference}) has been cancelled.`,
      "We'd love to see you another time. You can book again at any time on our website.",
      "",
      STUDIO_FOOTER,
    ].join("\n"),
  };
}

/**
 * Mock email sender: prints the message to the server console and stores it
 * in the OutboxEmail table instead of contacting a real mail provider.
 */
export async function sendBookingEmail(
  db: Db,
  type: EmailType,
  booking: BookingForEmail,
  { log = process.env.NODE_ENV !== "test" } = {},
) {
  const { subject, bodyText } = compose(type, booking);
  const saved = await db.outboxEmail.create({
    data: { type, to: booking.email, subject, bodyText, bookingId: booking.id },
  });
  if (log) {
    const rule = "─".repeat(72);
    console.log(`\n${rule}\n📧 MOCK EMAIL (${type})\nTo:      ${booking.email}\nSubject: ${subject}\n${rule}\n${bodyText}\n${rule}\n`);
  }
  return saved;
}
