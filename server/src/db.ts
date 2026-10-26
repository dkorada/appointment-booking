import "dotenv/config";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "./generated/prisma/client.js";

/**
 * Locally DATABASE_URL points at a SQLite file (file:./dev.db).
 * In production TURSO_DATABASE_URL + TURSO_AUTH_TOKEN point at a hosted
 * libSQL (SQLite-compatible) database. The same driver adapter serves both.
 */
export function createPrisma(url = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL || "file:./dev.db") {
  const adapter = new PrismaLibSql({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  return new PrismaClient({ adapter });
}

export type Db = PrismaClient;
