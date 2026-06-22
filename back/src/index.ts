import { Hono } from "hono";
import { cors } from "hono/cors";
import { initDatabase } from "./db-init";
import { AppError } from "./errors";
import { registerAssignmentRoutes } from "./routes/assignments";
import { registerCourseRoutes } from "./routes/courses";
import { registerGroupRoutes } from "./routes/groups";
import { registerProjectRoutes } from "./routes/projects";
import { registerUserRoutes } from "./routes/users";

initDatabase();

const app = new Hono();

app.use("*", cors());
app.onError((error, c) => {
  if (error instanceof AppError) return c.json({ error: error.message }, error.status as never);
  return c.json({ error: error.message || "Request failed" }, 400);
});
app.get("/", (c) => c.text("Backend is running"));

registerUserRoutes(app);
registerCourseRoutes(app);
registerAssignmentRoutes(app);
registerGroupRoutes(app);
registerProjectRoutes(app);

export default app;
