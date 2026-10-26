// Migrates (and optionally seeds) the hosted Turso database.
//   npm run db:remote            apply pending migrations
//   npm run db:remote -- --seed  also replace all data with the demo data
import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPrisma } from "../src/db.js";
import { applyMigrations } from "../src/migrate.js";
import { seedDemoData } from "../src/seed.js";

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!url) {
  console.error("Set TURSO_DATABASE_URL (and TURSO_AUTH_TOKEN) in server/.env first.");
  process.exit(1);
}

const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../prisma/migrations");
const applied = await applyMigrations(url, authToken, migrationsDir);
console.log(applied.length ? `Applied migrations: ${applied.join(", ")}` : "Database schema is up to date.");

if (process.argv.includes("--seed")) {
  const db = createPrisma(url);
  const c = await seedDemoData(db);
  await db.$disconnect();
  console.log(`Seeded ${c.services} services, ${c.bookings} bookings, ${c.outbox} outbox emails.`);
}
