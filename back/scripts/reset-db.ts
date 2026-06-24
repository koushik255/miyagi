import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const dbPath = resolve(process.env.DB_PATH ?? "./app.sqlite");
for (const path of [dbPath, `${dbPath}-shm`, `${dbPath}-wal`]) {
  if (existsSync(path)) rmSync(path, { force: true });
}

await import("../src/index");
console.log(`Reset database at ${dbPath}`);
