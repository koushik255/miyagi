import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema";

const DB_PATH = process.env.DB_PATH ?? "./app.sqlite";

export const sqlite = new Database(DB_PATH);
sqlite.run("PRAGMA foreign_keys = ON");

export const db = drizzle(sqlite, { schema });

export function nowIso() {
  return new Date().toISOString();
}
