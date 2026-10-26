import { z } from "zod";

// Validation rules shared by the booking form (client) and the API (server),
// so both sides always agree on what a valid booking looks like.

const PHONE_CHARS = /^\+?[0-9\s().-]+$/;
const NAME_CHARS = /^\p{L}[\p{L}\s'.-]*$/u;

export const customerSchema = z.object({
  customerName: z
    .string()
    .trim()
    .min(2, "Please enter your full name")
    .max(80, "Name must be 80 characters or fewer")
    .regex(NAME_CHARS, "Name can only contain letters, spaces, apostrophes and hyphens"),
  phone: z
    .string()
    .trim()
    .min(1, "Enter your phone number")
    .regex(PHONE_CHARS, "Enter a valid phone number")
    .refine((v) => {
      const digits = v.replace(/\D/g, "").length;
      return digits >= 7 && digits <= 15;
    }, "Phone number should have 7 to 15 digits"),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Enter your email address")
    .max(120, "Email must be 120 characters or fewer")
    .pipe(z.email("Enter a valid email address")),
  notes: z
    .string()
    .trim()
    .max(500, "Notes must be 500 characters or fewer")
    .optional()
    .transform((v) => (v ? v : undefined)),
});

export const createBookingSchema = customerSchema.extend({
  serviceId: z.string().min(1, "Choose a service"),
  startAt: z.iso.datetime({ message: "Choose a time slot" }),
});

export type CreateBookingInput = z.input<typeof createBookingSchema>;
export type CreateBookingData = z.output<typeof createBookingSchema>;
export type BookingField = keyof CreateBookingInput;
export type FieldErrors = Partial<Record<BookingField, string>>;

/** Flattens a zod error into one message per field. */
export function toFieldErrors(error: z.ZodError): FieldErrors {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!out[key]) out[key] = issue.message;
  }
  return out as FieldErrors;
}
