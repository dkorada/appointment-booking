import { createClient } from "@libsql/client";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Applies the Prisma migration SQL files to a libSQL database (a Turso URL or
 * a local file). Prisma's own `migrate deploy` only speaks to local SQLite
 * files, so hosted databases are migrated with this small runner instead.
 * Applied migrations are recorded in `_glow_migrations`.
 */
export async function applyMigrations(url: string, authToken: string | undefined, migrationsDir: string) {
  const client = createClient({ url, authToken });
  try {
    await client.execute(
      'CREATE TABLE IF NOT EXISTS "_glow_migrations" ("name" TEXT PRIMARY KEY, "appliedAt" TEXT NOT NULL)',
    );
    const rows = await client.execute('SELECT "name" FROM "_glow_migrations"');
    const applied = new Set(rows.rows.map((r) => String(r.name)));

    const pending = readdirSync(migrationsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && /^\d+_/.test(d.name) && !applied.has(d.name))
      .map((d) => d.name)
      .sort();

    for (const name of pending) {
      const sql = readFileSync(path.join(migrationsDir, name, "migration.sql"), "utf8");
      await client.executeMultiple(sql);
      await client.execute({
        sql: 'INSERT INTO "_glow_migrations" ("name", "appliedAt") VALUES (?, ?)',
        args: [name, new Date().toISOString()],
      });
    }
    return pending;
  } finally {
    client.close();
  }
}
