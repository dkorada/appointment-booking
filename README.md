# Glow Studio · Appointment Booking

A small, production-style booking app for a hair & beauty studio. Customers pick a
service, a date and a free time slot, enter their details and get a confirmation with a
booking reference. Staff get an admin dashboard to see and cancel bookings, plus an
outbox of every (mock) email the system has sent.

> Demo project with sample data. No real appointments are made and no real emails are sent.

![Glow Studio booking flow](docs/screenshots/booking.png)
<!-- Screenshot placeholder: add docs/screenshots/booking.png, confirmation.png and admin.png -->

## Features

- **Service → date → time → details** booking flow with a live summary panel
- **Smart time slots** generated from working hours (Mon–Sat 9:00–18:00, lunch 13:00–14:00).
  A slot is only offered if the whole service fits, it doesn't overlap an existing booking,
  and it isn't in the past (or starting within 30 minutes)
- **Double-booking protection on the server**, enforced by the database itself, so it holds
  even when two people book the same slot at the same instant (see below)
- **Validation on both sides** with one shared [zod](https://zod.dev) schema
  ([shared/booking.ts](shared/booking.ts)): name, phone, email, notes
- **Confirmation page** with a human-friendly reference (`GLW-7K3P9Q`), copy button and
  "Add to calendar" (.ics)
- **Mock email notifications**: printed to the server console and stored in an `OutboxEmail` table
- **Admin dashboard** (no login, for the demo): stats, upcoming/past filter, status filter,
  search, cancel with confirmation, and an email outbox viewer
- Responsive, accessible UI (keyboard friendly, labelled inputs, reduced-motion support)

## Tech stack

| Layer    | Tech                                                           |
| -------- | -------------------------------------------------------------- |
| Frontend | React 19, Vite, TypeScript, React Router, lucide icons, plain CSS |
| Backend  | Node.js, Express 5, TypeScript, zod                            |
| Database | SQLite via Prisma 7 (libSQL driver adapter; Turso in production) |
| Tests    | Vitest + Supertest                                             |
| Hosting  | Netlify (static site + one Netlify Function for the API)       |

## Getting started

Requirements: **Node.js 20.19+** (24 recommended) and npm 10+.

```bash
git clone https://github.com/dkorada/appointment-booking.git
cd appointment-booking
cp server/.env.example server/.env
npm run setup     # install, create the SQLite database, load sample data
npm run dev       # API on :4000, web app on http://localhost:5173
```

Open <http://localhost:5173> to book, and <http://localhost:5173/admin> for the dashboard.
Booking confirmations and cancellations print a mock email in the terminal.

### Useful scripts

| Command                          | What it does                                          |
| -------------------------------- | ----------------------------------------------------- |
| `npm run dev`                    | Run API and web app together with hot reload          |
| `npm test`                       | Run the unit and API tests                            |
| `npm run typecheck`              | Type-check server and client                          |
| `npm run build`                  | Generate the Prisma client and build the web app      |
| `npm run db:seed -w server`      | Replace all data with fresh sample data               |
| `npm run db:reset -w server`     | Drop the local database, re-run migrations and seed   |

### Configuration (`server/.env`)

| Variable             | Default            | Purpose                                       |
| -------------------- | ------------------ | --------------------------------------------- |
| `DATABASE_URL`       | `file:./dev.db`    | Local SQLite file                             |
| `STUDIO_TZ`          | `America/New_York` | Studio time zone; slots are in studio time    |
| `API_PORT`           | `4000`             | Port for the local API                        |
| `TURSO_DATABASE_URL` | (unset)            | Hosted libSQL database (production)           |
| `TURSO_AUTH_TOKEN`   | (unset)            | Token for the hosted database                 |

Opening hours, lunch break, slot grid and booking window live in
[server/src/config.ts](server/src/config.ts).

## How it works

### Data model

```
Service ──< Booking ──< BookedBlock   (one row per 15-minute block, startAt UNIQUE)
                   └──< OutboxEmail   (mock emails)
```

Full schema: [server/prisma/schema.prisma](server/prisma/schema.prisma) · design notes:
[docs/data-model.md](docs/data-model.md).

### Slot generation

[server/src/lib/slots.ts](server/src/lib/slots.ts) is a pure function: given a date, a
service duration, existing bookings and "now", it walks the day in 30-minute steps inside
each working period (opening → lunch, lunch → closing) and keeps a start time only if the
whole appointment fits in that period, doesn't overlap a booking and isn't too soon. All
times are computed in the studio's time zone and returned as UTC instants, so daylight
saving changes are handled correctly.

### Double-booking prevention

1. When a booking is submitted the server regenerates the free slots from the database
   and rejects the request (`409 SLOT_TAKEN`) unless the requested start is one of them.
2. The booking is inserted together with one `BookedBlock` row for every 15 minutes it
   covers. `BookedBlock.startAt` has a **UNIQUE index**, so if two requests pass step 1 at
   the same moment, only one insert can succeed; the other gets a unique-constraint error
   and is turned into a friendly 409.
3. Cancelling a booking deletes its blocks, which frees the time again.

The tests in [server/test/bookings.test.ts](server/test/bookings.test.ts) fire 8
simultaneous requests for the same slot and assert exactly one wins.

### API

| Method | Path                               | Description                         |
| ------ | ---------------------------------- | ----------------------------------- |
| GET    | `/api/services`                    | Active services                     |
| GET    | `/api/config`                      | Studio hours, time zone, booking window |
| GET    | `/api/availability?serviceId&date` | Free slots for a service on a date  |
| POST   | `/api/bookings`                    | Create a booking (400 / 409 on error) |
| GET    | `/api/bookings/:reference`         | Booking for the confirmation page   |
| GET    | `/api/admin/bookings`              | List with `range`, `status`, `q` filters + stats |
| POST   | `/api/admin/bookings/:id/cancel`   | Cancel a booking                    |
| GET    | `/api/admin/outbox`                | Mock emails                         |

Errors use one shape: `{ "error": { "code", "message", "fieldErrors"? } }`.

## Tests

```bash
npm test
```

- **Slot generation** ([server/test/slots.test.ts](server/test/slots.test.ts)): working hours,
  lunch break, services that don't fit, overlaps, odd-length bookings, past times and lead
  time, closed days, booking window, time zones and DST.
- **Booking & double-booking** ([server/test/bookings.test.ts](server/test/bookings.test.ts)):
  exact and partial overlaps, back-to-back bookings, concurrent requests, the database-level
  guarantee, cancellation freeing a slot, server-side validation, and the HTTP API.

Tests run against a throwaway SQLite database (`server/test.db`).

## Deploying to Netlify

Netlify serves the React build as static files and runs the Express API as a single
Netlify Function ([netlify/functions/api.ts](netlify/functions/api.ts)); `netlify.toml`
rewrites `/api/*` to it.

Netlify Functions have no persistent disk, so a SQLite file can't live there. Production
uses **[Turso](https://turso.tech)**, which is hosted SQLite (libSQL): same schema, same
Prisma client, just a different URL.

1. Create a Turso database and token:
   ```bash
   turso db create glow-studio
   turso db show glow-studio --url
   turso db tokens create glow-studio
   ```
2. Put both values in `server/.env` as `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN`, then
   create the tables and load sample data:
   ```bash
   npm run db:remote -w server -- --seed
   ```
3. Create the Netlify site (`netlify init` or "Import from Git" in the Netlify UI), and set
   `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` and `STUDIO_TZ` as environment variables.
4. Deploy (`netlify deploy --prod` or push to the connected branch).

If no Turso variables are set, the function falls back to a temporary SQLite file that is
created and seeded on cold start. That's fine for a quick preview, but data resets
whenever Netlify recycles the function.

## Project structure

```
appointment-booking/
├─ client/                 React + Vite app
│  └─ src/
│     ├─ pages/            BookingPage, ConfirmationPage, AdminPage
│     ├─ components/       Layout, Calendar
│     └─ api.ts            Typed API client
├─ server/                 Express API
│  ├─ prisma/              schema, migrations, seed entry point
│  ├─ src/
│  │  ├─ app.ts            routes
│  │  ├─ bookings.ts       create / cancel / availability (business rules)
│  │  ├─ lib/slots.ts      slot generation (pure)
│  │  ├─ lib/email.ts      mock email + outbox
│  │  └─ seed.ts           sample data
│  └─ test/                Vitest suites
├─ shared/booking.ts       validation shared by client and server
├─ netlify/functions/      serverless entry for the API
└─ netlify.toml
```

## Possible next steps

- Staff members and per-staff calendars (`BookedBlock` key becomes `staffId + startAt`)
- Admin authentication
- Real email delivery (e.g. Resend or Postmark) by draining the outbox table
- Customer self-service reschedule / cancel links
