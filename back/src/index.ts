import { resolve } from "node:path";
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { cors } from "hono/cors";
import { initDatabase } from "./db-init";
import { AppError } from "./errors";
import { registerAssignmentRoutes } from "./routes/assignments";
import { registerCourseRoutes } from "./routes/courses";
import { registerGroupRoutes } from "./routes/groups";
import { registerProjectRoutes } from "./routes/projects";
import { registerWorkItemRoutes } from "./routes/work-items";
import { registerUserRoutes } from "./routes/users";

initDatabase();

const app = new Hono();
const frontendDist = resolve(process.env.FRONTEND_DIST_PATH ?? "../dist");

app.use("*", cors());
app.onError((error, c) => {
  if (error instanceof AppError) return c.json({ error: error.message }, error.status as never);
  return c.json({ error: error.message || "Request failed" }, 400);
});
app.get("/api/health", (c) => c.json({ ok: true }));

registerUserRoutes(app);
registerCourseRoutes(app);
registerAssignmentRoutes(app);
registerGroupRoutes(app);
registerProjectRoutes(app);
registerWorkItemRoutes(app);

app.use("/*", serveStatic({ root: frontendDist }));
app.get("*", async (c) => {
  const accept = c.req.header("accept") ?? "";
  if (!accept.includes("text/html")) return c.notFound();

  const index = Bun.file(resolve(frontendDist, "index.html"));
  if (!(await index.exists())) return c.text("Backend is running. Build the frontend with `npm run build` to serve the site.", 200);
  return c.html(await index.text());
});

export default app;
