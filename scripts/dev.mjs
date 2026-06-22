import { spawn } from "node:child_process";
import { join } from "node:path";

const dryRun = process.env.MIYAGI_DEV_DRY_RUN === "1" || process.argv.includes("--dry-run");

const viteCommand = "vite --host 127.0.0.1";
const electronCommand = "wait-on http://127.0.0.1:5173 && cross-env VITE_DEV_SERVER_URL=http://127.0.0.1:5173 electron .";
const concurrentlyBin = join(
  process.cwd(),
  "node_modules",
  ".bin",
  process.platform === "win32" ? "concurrently.cmd" : "concurrently",
);

console.log("Frontend default backend: http://localhost:3000");

if (dryRun) {
  process.exit(0);
}

const child = spawn(concurrentlyBin, ["-k", viteCommand, electronCommand], {
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
