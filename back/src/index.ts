import { resolve } from "node:path";
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { cors } from "hono/cors";
import { Effect } from "effect";
import { initDatabase } from "./db";
import { registerAppRoutes } from "./routes/app";
import { registerUserRoutes } from "./routes/users";
import { runJson, runResponse, tryPromise } from "./errors";
import { authSecret } from "./auth";

authSecret();
Effect.runSync(initDatabase);

const app = new Hono();
const frontendDist = resolve(process.env.FRONTEND_DIST_PATH ?? "../dist");
const allowedOrigins = new Set([
  process.env.FRONTEND_ORIGIN,
  "http://127.0.0.1:5173",
  "http://localhost:5173",
].filter((origin): origin is string => Boolean(origin)));

app.use("*", cors({
  origin: (origin) => allowedOrigins.has(origin) ? origin : "",
  credentials: true,
}));
app.onError((error, c) => {
  console.error(error);
  return c.json({ error: "Internal server error" }, 500);
});
app.get("/api/health", (c) => runJson(c, Effect.succeed({ ok: true })));

registerUserRoutes(app);
registerAppRoutes(app);

app.use("/*", serveStatic({ root: frontendDist }));
app.get("*", (c) => runResponse(c, Effect.gen(function* () {
  const accept = c.req.header("accept") ?? "";
  if (!accept.includes("text/html")) {
    return yield* tryPromise(() => Promise.resolve(c.notFound()), "Could not create not-found response");
  }

  const index = Bun.file(resolve(frontendDist, "index.html"));
  if (!(yield* tryPromise(() => index.exists(), "Could not read the frontend build"))) {
    return c.text("Backend is running. Build the frontend with `npm run build` to serve the site.", 200);
  }
  return c.html(yield* tryPromise(() => index.text(), "Could not read the frontend build"));
})));

export default app;
