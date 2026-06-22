import type { Hono } from "hono";
import { Assignment } from "../assignment";
import { importAssignmentGroups } from "../csv-import";
import { getAssignmentDashboard } from "../dashboard";
import type { DashboardPeriod } from "../dashboard-time";
import { Group } from "../group";

export function registerAssignmentRoutes(app: Hono) {
  app.get("/assignments/:assignmentId/groups", (c) => c.json(Group.listByAssignment(c.req.param("assignmentId"))));

  app.get("/assignments/:assignmentId/dashboard", async (c) => {
    const period = (c.req.query("period") as DashboardPeriod) || "semester";
    return c.json(await getAssignmentDashboard(c.req.param("assignmentId"), period));
  });

  app.post("/assignments/:assignmentId/import-groups", async (c) => {
    const body = await c.req.json<{ professorId: string; csv: string }>();
    return c.json(importAssignmentGroups({ professorId: body.professorId, assignmentId: c.req.param("assignmentId"), csv: body.csv }));
  });

  app.post("/assignments", async (c) => {
    const body = await c.req.json<{
      professorId: string;
      courseId: string;
      name: string;
      description?: string;
      dueDate?: string;
      repositoryMode?: "github";
    }>();
    return c.json(Assignment.create(body));
  });
}
