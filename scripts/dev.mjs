import { spawn } from "node:child_process";
import { join } from "node:path";

const TUNNEL_API_BASE = process.env.MIYAGI_TUNNEL_API_BASE ?? "https://miyagi.koushikkoushik.com";

const args = new Set(process.argv.slice(2));
const external =
  args.has("-e") ||
  args.has("--out") ||
  args.has("--outer") ||
  args.has("--external") ||
  args.has("--tunnel") ||
  process.env.npm_config_e === "true" ||
  process.env.npm_config_out === "true" ||
  process.env.npm_config_outer === "true" ||
  process.env.npm_config_external === "true" ||
  process.env.npm_config_tunnel === "true";

const env = {
  ...process.env,
  ...(external ? { VITE_MIYAGI_API_BASE: TUNNEL_API_BASE } : {}),
};

const viteCommand = "vite --host 127.0.0.1";
const electronCommand = "wait-on http://127.0.0.1:5173 && cross-env VITE_DEV_SERVER_URL=http://127.0.0.1:5173 electron .";
const concurrentlyBin = join(
  process.cwd(),
  "node_modules",
  ".bin",
  process.platform === "win32" ? "concurrently.cmd" : "concurrently",
);

if (external) {
  console.log(`Frontend default backend: ${TUNNEL_API_BASE}`);
} else {
  console.log("Frontend default backend: http://localhost:3000");
}

if (process.env.MIYAGI_DEV_DRY_RUN === "1" || args.has("--dry-run")) {
  process.exit(0);
}

const child = spawn(concurrentlyBin, ["-k", viteCommand, electronCommand], {
  env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
