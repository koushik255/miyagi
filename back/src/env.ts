import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";

const rootEnvPath = resolve(import.meta.dir, "../../.env");

if (existsSync(rootEnvPath)) {
  const values = parseEnv(readFileSync(rootEnvPath, "utf8"));
  for (const [key, value] of Object.entries(values)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
