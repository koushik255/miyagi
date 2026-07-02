import type { Hono } from "hono";
import { WorkItem } from "../work-item";

export function registerWorkItemRoutes(app: Hono) {
  app.get("/groups/:groupId/work-items", (c) => c.json(WorkItem.listByGroup({
    groupId: c.req.param("groupId"),
    userId: c.req.query("userId"),
    professorId: c.req.query("professorId"),
  })));

  app.post("/groups/:groupId/work-items", async (c) => {
    const body = await c.req.json<{ userId: string; title: string; description?: string; assignedUserId?: string | null }>();
    return c.json(WorkItem.create({
      groupId: c.req.param("groupId"),
      userId: body.userId,
      title: body.title,
      description: body.description,
      assignedUserId: body.assignedUserId,
    }));
  });

  app.patch("/work-items/:workItemId", async (c) => {
    const body = await c.req.json<{ userId: string; title?: string; description?: string; assignedUserId?: string | null; status?: string; completionComment?: string | null }>();
    return c.json(WorkItem.update({
      workItemId: c.req.param("workItemId"),
      userId: body.userId,
      title: body.title,
      description: body.description,
      assignedUserId: body.assignedUserId,
      status: body.status,
      completionComment: body.completionComment,
    }));
  });
}
