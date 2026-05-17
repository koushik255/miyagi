import { and, eq } from "drizzle-orm";
import { Course } from "./course";
import { db, nowIso } from "./db";
import { assignments } from "./schema";

export type Assignment = typeof assignments.$inferSelect;
export type NewAssignment = typeof assignments.$inferInsert;

export const Assignment = {
  create(input: { professorId: string; courseId: string; name: string; description?: string; dueDate?: string }): Assignment {
    const course = Course.findById(input.courseId);
    if (!course) throw new Error("Course not found");
    if (course.professorId !== input.professorId) throw new Error("Course does not belong to professor");

    const timestamp = nowIso();
    const assignment: NewAssignment = {
      id: crypto.randomUUID(),
      courseId: input.courseId,
      name: input.name,
      description: input.description ?? "",
      dueDate: input.dueDate || null,
      professorId: input.professorId,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    return db.insert(assignments).values(assignment).returning().get();
  },

  findById(assignmentId: string): Assignment | undefined {
    return db.select().from(assignments).where(eq(assignments.id, assignmentId)).get();
  },

  listByCourse(courseId: string): Assignment[] {
    return db.select().from(assignments).where(eq(assignments.courseId, courseId)).all();
  },

  listByProfessorCourse(professorId: string, courseId: string): Assignment[] {
    return db
      .select()
      .from(assignments)
      .where(and(eq(assignments.professorId, professorId), eq(assignments.courseId, courseId)))
      .all();
  },
};
