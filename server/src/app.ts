import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import { ApiError, cancelBooking, createBooking, getAvailability } from "./bookings.js";
import { studio } from "./config.js";
import type { Db } from "./db.js";
import type { Prisma } from "./generated/prisma/client.js";
import { formatClock, formatLocalDate, parseLocalDate, todayIn } from "./lib/time.js";

const publicBooking = {
  id: true,
  reference: true,
  startAt: true,
  endAt: true,
  customerName: true,
  email: true,
  status: true,
  service: { select: { name: true, durationMin: true, priceCents: true, category: true } },
} satisfies Prisma.BookingSelect;

export function createApp(db: Db) {
  const app = express();
  app.disable("x-powered-by");
  app.use(cors());
  app.use(express.json({ limit: "20kb" }));

  const api = express.Router();

  api.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  api.get("/config", (_req, res) => {
    res.json({
      name: studio.name,
      timeZone: studio.timeZone,
      hours: {
        open: formatClock(studio.openMin),
        close: formatClock(studio.closeMin),
        lunchStart: formatClock(studio.lunchStartMin),
        lunchEnd: formatClock(studio.lunchEndMin),
      },
      closedWeekdays: studio.closedWeekdays,
      maxDaysAhead: studio.maxDaysAhead,
      today: formatLocalDate(todayIn(studio.timeZone)),
    });
  });

  api.get("/services", async (_req, res) => {
    const services = await db.service.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } });
    res.json(services);
  });

  api.get("/availability", async (req, res) => {
    const serviceId = String(req.query.serviceId ?? "");
    const date = parseLocalDate(String(req.query.date ?? ""));
    if (!serviceId || !date) {
      throw new ApiError(400, "BAD_QUERY", "serviceId and date (YYYY-MM-DD) are required");
    }
    const day = await getAvailability(db, serviceId, date);
    res.json({ date: formatLocalDate(date), timeZone: studio.timeZone, ...day });
  });

  api.post("/bookings", async (req, res) => {
    const booking = await createBooking(db, req.body);
    res.status(201).json(booking);
  });

  api.get("/bookings/:reference", async (req, res) => {
    const booking = await db.booking.findUnique({
      where: { reference: req.params.reference.toUpperCase() },
      select: publicBooking,
    });
    if (!booking) throw new ApiError(404, "BOOKING_NOT_FOUND", "We couldn't find a booking with that reference");
    res.json(booking);
  });

  // Admin (no auth in this demo).
  api.get("/admin/bookings", async (req, res) => {
    const status = String(req.query.status ?? "ALL");
    const range = String(req.query.range ?? "upcoming");
    const q = String(req.query.q ?? "").trim();
    const now = new Date();

    const where: Prisma.BookingWhereInput = {};
    if (status === "CONFIRMED" || status === "CANCELLED") where.status = status;
    if (range === "upcoming") where.endAt = { gte: now };
    if (range === "past") where.endAt = { lt: now };
    if (q) {
      where.OR = [
        { reference: { contains: q.toUpperCase() } },
        { customerName: { contains: q } },
        { email: { contains: q.toLowerCase() } },
        { phone: { contains: q } },
      ];
    }

    const [bookings, upcoming, cancelled, outboxCount] = await Promise.all([
      db.booking.findMany({
        where,
        include: { service: { select: { name: true, durationMin: true, priceCents: true, category: true } } },
        orderBy: { startAt: range === "past" ? "desc" : "asc" },
        take: 200,
      }),
      db.booking.findMany({
        where: { status: "CONFIRMED", endAt: { gte: now } },
        select: { startAt: true, service: { select: { priceCents: true } } },
      }),
      db.booking.count({ where: { status: "CANCELLED" } }),
      db.outboxEmail.count(),
    ]);

    const today = formatLocalDate(todayIn(studio.timeZone, now));
    const isToday = (d: Date) => formatLocalDate(todayIn(studio.timeZone, d)) === today;
    res.json({
      bookings,
      stats: {
        upcoming: upcoming.length,
        today: upcoming.filter((b) => isToday(b.startAt)).length,
        upcomingRevenueCents: upcoming.reduce((sum, b) => sum + b.service.priceCents, 0),
        cancelled,
        emailsSent: outboxCount,
      },
    });
  });

  api.post("/admin/bookings/:id/cancel", async (req, res) => {
    const booking = await cancelBooking(db, req.params.id);
    res.json(booking);
  });

  api.get("/admin/outbox", async (_req, res) => {
    const emails = await db.outboxEmail.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { booking: { select: { reference: true } } },
    });
    res.json(emails);
  });

  // Locally the API lives at /api; inside the Netlify Function it may also be
  // addressed by the function's own path.
  const prefixes = ["/api", "/.netlify/functions/api"];
  app.use(prefixes, api);

  app.use(prefixes, (_req, res) => {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Not found" } });
  });

  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err instanceof ApiError) {
      res.status(err.status).json({ error: { code: err.code, message: err.message, fieldErrors: err.fieldErrors } });
      return;
    }
    if (err?.type === "entity.parse.failed") {
      res.status(400).json({ error: { code: "BAD_JSON", message: "Request body must be valid JSON" } });
      return;
    }
    console.error(err);
    res.status(500).json({ error: { code: "INTERNAL", message: "Something went wrong" } });
  };
  app.use(onError);

  return app;
}
