import { and, eq } from "drizzle-orm";
import { Assignment } from "./assignment";
import { db, nowIso } from "./db";
import { badRequest, notFound } from "./errors";
import { requireCourseOwnedByProfessor } from "./guards";
import { courseCalendarItems } from "./schema";

export type CourseCalendarItem = typeof courseCalendarItems.$inferSelect;
export type NewCourseCalendarItem = typeof courseCalendarItems.$inferInsert;

export const CourseCalendarItem = {
  listByCourse(courseId: string): CourseCalendarItem[] {
    return db.select().from(courseCalendarItems).where(eq(courseCalendarItems.courseId, courseId)).all();
  },

  create(input: {
    courseId: string;
    professorId: string;
    assignmentId?: string | null;
    title: string;
    description?: string;
    dueAt: string;
    kind: "event" | "deadline";
  }): CourseCalendarItem {
    requireCourseOwnedByProfessor(input.courseId, input.professorId);
    if (input.kind !== "event" && input.kind !== "deadline") badRequest("Invalid calendar item kind");

    const timestamp = nowIso();
    const item: NewCourseCalendarItem = {
      id: crypto.randomUUID(),
      courseId: input.courseId,
      professorId: input.professorId,
      assignmentId: this.normalizeAssignmentId(input.courseId, input.kind, input.assignmentId),
      title: input.title,
      description: input.description ?? "",
      dueAt: input.dueAt,
      kind: input.kind,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    return db.insert(courseCalendarItems).values(item).returning().get();
  },

  update(input: {
    courseId: string;
    itemId: string;
    professorId: string;
    assignmentId?: string | null;
    title: string;
    description?: string;
    dueAt: string;
    kind: "event" | "deadline";
  }): CourseCalendarItem {
    requireCourseOwnedByProfessor(input.courseId, input.professorId);
    if (input.kind !== "event" && input.kind !== "deadline") badRequest("Invalid calendar item kind");
    if (!this.findById(input.courseId, input.itemId)) notFound("Calendar item not found");

    return db
      .update(courseCalendarItems)
      .set({
        professorId: input.professorId,
        assignmentId: this.normalizeAssignmentId(input.courseId, input.kind, input.assignmentId),
        title: input.title,
        description: input.description ?? "",
        dueAt: input.dueAt,
        kind: input.kind,
        updatedAt: nowIso(),
      })
      .where(and(eq(courseCalendarItems.id, input.itemId), eq(courseCalendarItems.courseId, input.courseId)))
      .returning()
      .get();
  },

  remove(courseId: string, itemId: string, professorId: string): { ok: true } {
    requireCourseOwnedByProfessor(courseId, professorId);
    if (!this.findById(courseId, itemId)) notFound("Calendar item not found");

    db.delete(courseCalendarItems)
      .where(and(eq(courseCalendarItems.id, itemId), eq(courseCalendarItems.courseId, courseId)))
      .run();

    return { ok: true };
  },

  findById(courseId: string, itemId: string): CourseCalendarItem | undefined {
    return db
      .select()
      .from(courseCalendarItems)
      .where(and(eq(courseCalendarItems.id, itemId), eq(courseCalendarItems.courseId, courseId)))
      .get();
  },

  normalizeAssignmentId(courseId: string, kind: "event" | "deadline", assignmentId?: string | null) {
    if (kind !== "deadline" || !assignmentId) return null;
    const assignment = Assignment.findById(assignmentId);
    if (!assignment) notFound("Assignment not found");
    if (assignment.courseId !== courseId) badRequest("Assignment does not belong to this course");
    return assignment.id;
  },
};
