import type { Hono } from "hono";
import { Assignment } from "../assignment";
import { Course } from "../course";
import { CourseCalendarItem } from "../course-calendar-item";
import { importCourseStudents } from "../csv-import";
import { Group } from "../group";

export function registerCourseRoutes(app: Hono) {
  app.post("/courses", async (c) => {
    const body = await c.req.json<{ professorId: string; name: string }>();
    return c.json(Course.create(body.professorId, body.name));
  });

  app.post("/courses/join", async (c) => {
    const body = await c.req.json<{ joinCode: string; userId: string }>();
    return c.json(Course.assignStudent(body.joinCode, body.userId));
  });

  app.get("/courses/professor/:professorId", (c) => c.json(Course.listByProfessor(c.req.param("professorId"))));
  app.get("/courses/user/:userId", (c) => c.json(Course.listByUser(c.req.param("userId"))));
  app.get("/courses/:courseId/members", (c) => c.json(Course.listMembers(c.req.param("courseId"))));

  app.post("/courses/:courseId/import-students", async (c) => {
    const body = await c.req.json<{ professorId: string; csv: string }>();
    return c.json(importCourseStudents({ professorId: body.professorId, courseId: c.req.param("courseId"), csv: body.csv }));
  });

  app.get("/courses/:courseId/assignments", (c) => c.json(Assignment.listByCourse(c.req.param("courseId"))));
  app.get("/courses/:courseId/groups", (c) => c.json(Group.listByCourse(c.req.param("courseId"))));
  app.get("/courses/:courseId/calendar-items", (c) => c.json(CourseCalendarItem.listByCourse(c.req.param("courseId"))));

  app.post("/courses/:courseId/calendar-items", async (c) => {
    const body = await c.req.json<{
      professorId: string;
      assignmentId?: string | null;
      title: string;
      description?: string;
      dueAt: string;
      kind: "event" | "deadline";
    }>();
    return c.json(CourseCalendarItem.create({ ...body, courseId: c.req.param("courseId") }));
  });

  app.patch("/courses/:courseId/calendar-items/:itemId", async (c) => {
    const body = await c.req.json<{
      professorId: string;
      assignmentId?: string | null;
      title: string;
      description?: string;
      dueAt: string;
      kind: "event" | "deadline";
    }>();
    return c.json(CourseCalendarItem.update({ ...body, courseId: c.req.param("courseId"), itemId: c.req.param("itemId") }));
  });

  app.delete("/courses/:courseId/calendar-items/:itemId", async (c) => {
    const body = await c.req.json<{ professorId: string }>();
    return c.json(CourseCalendarItem.remove(c.req.param("courseId"), c.req.param("itemId"), body.professorId));
  });
}
