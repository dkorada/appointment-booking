import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

/** Creates a fresh SQLite test database from the Prisma schema. */
export default function setup() {
  for (const f of ["test.db", "test.db-journal"]) rmSync(f, { force: true });
  execSync("npx prisma db push", {
    stdio: "ignore",
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
  });
}
