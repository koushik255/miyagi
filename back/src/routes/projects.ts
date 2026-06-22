import type { Hono } from "hono";
import { Project } from "../project";

export function registerProjectRoutes(app: Hono) {
  app.post("/projects", async (c) => {
    const body = await c.req.json<{
      groupId: string;
      assignedByProfessorId: string;
      name: string;
      description?: string;
      assignedStudentId?: string;
      rootPathHint?: string;
      dueDate?: string;
    }>();

    return c.json(Project.assign(body));
  });
}
