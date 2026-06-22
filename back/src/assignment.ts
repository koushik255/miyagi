import { and, eq } from "drizzle-orm";
import { db, nowIso } from "./db";
import { requireCourseOwnedByProfessor } from "./guards";
import { assignments } from "./schema";

export type Assignment = typeof assignments.$inferSelect;
export type NewAssignment = typeof assignments.$inferInsert;

export const Assignment = {
  create(input: { professorId: string; courseId: string; name: string; description?: string; dueDate?: string; repositoryMode?: "github" }): Assignment {
    requireCourseOwnedByProfessor(input.courseId, input.professorId);

    const timestamp = nowIso();
    const assignment: NewAssignment = {
      id: crypto.randomUUID(),
      courseId: input.courseId,
      name: input.name,
      description: input.description ?? "",
      dueDate: input.dueDate || null,
      professorId: input.professorId,
      repositoryMode: input.repositoryMode ?? "github",
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
