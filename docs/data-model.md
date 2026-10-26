# Glow Studio – data model (proposal)

All timestamps are stored in UTC. Slots are generated in the studio's time zone
(`STUDIO_TZ`, default `America/New_York`), so "9:00–18:00" means studio-local time.

```prisma
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model Service {
  id          String    @id @default(cuid())
  slug        String    @unique          // "signature-haircut"
  name        String                     // "Signature Haircut"
  description String
  durationMin Int                        // 30, 45, 60, 90 (multiple of 15)
  priceCents  Int                        // 4500 = $45.00
  category    String                     // "Hair" | "Skin" | "Nails"
  active      Boolean   @default(true)
  sortOrder   Int       @default(0)
  bookings    Booking[]
}

model Booking {
  id           String        @id @default(cuid())
  reference    String        @unique     // human-friendly, e.g. "GLW-7K3P9Q"
  serviceId    String
  service      Service       @relation(fields: [serviceId], references: [id])
  startAt      DateTime
  endAt        DateTime
  customerName String
  phone        String
  email        String
  notes        String?
  status       String        @default("CONFIRMED") // CONFIRMED | CANCELLED
  cancelledAt  DateTime?
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt
  blocks       BookedBlock[]
  emails       OutboxEmail[]

  @@index([startAt])
  @@index([status, startAt])
}

// One row per 15-minute block a confirmed booking occupies.
// The UNIQUE constraint on startAt is the database-level guarantee against
// double-booking: two concurrent requests for overlapping times cannot both
// insert the same block, so one transaction fails and the API returns 409.
// Rows are deleted when a booking is cancelled, freeing the time again.
model BookedBlock {
  id        String   @id @default(cuid())
  startAt   DateTime @unique
  bookingId String
  booking   Booking  @relation(fields: [bookingId], references: [id], onDelete: Cascade)
}

// Mock email "outbox": every notification is logged to the console and saved here.
model OutboxEmail {
  id        String   @id @default(cuid())
  bookingId String?
  booking   Booking? @relation(fields: [bookingId], references: [id], onDelete: SetNull)
  type      String                       // BOOKING_CONFIRMED | BOOKING_CANCELLED
  to        String
  subject   String
  bodyText  String
  createdAt DateTime @default(now())
}
```

## Booking rules

- Open Monday–Saturday, 09:00–18:00, closed for lunch 13:00–14:00, closed Sunday.
- Start times are offered every 30 minutes. A slot is shown only if the whole
  service fits before lunch or before closing (a 60-min facial can't start at 12:30 or 17:30).
- Slots in the past (and anything starting within the next 30 minutes) are hidden.
- Bookings up to 60 days ahead.
- Server re-validates everything on submit: service exists, slot is a valid
  generated slot, not in the past, and free. Check + insert happen in one
  transaction, backed by the `BookedBlock` unique constraint.
- Single-chair studio for v1 (one booking at a time). Adding staff later means
  adding a `Staff` model and making the block key `(staffId, startAt)`.

## Seed data

Six services (Signature Haircut 30m, Blow-dry & Style 45m, Hydrating Facial 60m,
Gel Manicure 45m, Brow Shaping 30m, Colour & Gloss 90m) and about a dozen sample
bookings spread over the next week, including one cancelled booking, plus their outbox emails.
