import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import serverless from "serverless-http";
import { createApp } from "../../server/src/app.js";
import { createPrisma } from "../../server/src/db.js";
import { applyMigrations } from "../../server/src/migrate.js";
import { seedDemoData } from "../../server/src/seed.js";

// The whole Express API runs inside this one Netlify Function.
// Netlify rewrites /api/* here (see netlify.toml).

const root = process.env.LAMBDA_TASK_ROOT ?? process.cwd();
const migrationsDir = path.join(root, "server/prisma/migrations");

async function connect() {
  if (process.env.TURSO_DATABASE_URL) return createPrisma(process.env.TURSO_DATABASE_URL);

  // Fallback when no hosted database is configured: a throwaway SQLite file in
  // the function's temp dir, created and seeded on cold start. Good enough for
  // a quick preview, but data resets whenever the function instance recycles.
  const file = path.join(tmpdir(), "glow-demo.db");
  const fresh = !existsSync(file);
  const url = `file:${file}`;
  await applyMigrations(url, undefined, migrationsDir);
  const db = createPrisma(url);
  if (fresh) await seedDemoData(db);
  return db;
}

const ready = connect().then((db) => serverless(createApp(db)));

export const handler = async (event: object, context: object) => (await ready)(event, context);
