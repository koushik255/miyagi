import { and, eq } from "drizzle-orm";
import { db, nowIso } from "./db";
import { notFound } from "./errors";
import { requireCourseMember } from "./guards";
import { generateJoinCode, isUniqueConstraintError } from "./join-code";
import { courseMembers, courses, professors, users } from "./schema";

export type Course = typeof courses.$inferSelect;
export type NewCourse = typeof courses.$inferInsert;
export type CourseMember = typeof courseMembers.$inferSelect;
export type NewCourseMember = typeof courseMembers.$inferInsert;

export const Course = {
  create(professorId: string, name: string): Course {
    const professor = db.select().from(professors).where(eq(professors.id, professorId)).get();
    if (!professor) notFound("Professor session not found. Please sign out and sign in again.");

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const course: NewCourse = {
        id: crypto.randomUUID(),
        name,
        joinCode: generateJoinCode(),
        professorId,
        createdAt: nowIso(),
      };

      try {
        return db.insert(courses).values(course).returning().get();
      } catch (error) {
        if (!isUniqueConstraintError(error)) throw error;
      }
    }

    throw new Error("Could not generate a unique course join code");
  },

  assignStudent(joinCode: string, userId: string): CourseMember {
    const course = this.findByJoinCode(joinCode);
    if (!course) notFound("Course not found for join code");
    return this.assignStudentByCourseId(course.id, userId);
  },

  assignStudentByCourseId(courseId: string, userId: string): CourseMember {
    const member: NewCourseMember = {
      id: crypto.randomUUID(),
      userId,
      courseId,
      role: "student",
      joinedAt: nowIso(),
    };

    return db.insert(courseMembers).values(member).onConflictDoNothing().returning().get() ?? this.findMember(userId, courseId)!;
  },

  findById(courseId: string): Course | undefined {
    return db.select().from(courses).where(eq(courses.id, courseId)).get();
  },

  findByJoinCode(joinCode: string): Course | undefined {
    return db.select().from(courses).where(eq(courses.joinCode, joinCode)).get();
  },

  listByProfessor(professorId: string): Course[] {
    return db.select().from(courses).where(eq(courses.professorId, professorId)).all();
  },

  listByUser(userId: string) {
    return db
      .select({
        id: courses.id,
        name: courses.name,
        professorId: courses.professorId,
        createdAt: courses.createdAt,
        role: courseMembers.role,
        joinedAt: courseMembers.joinedAt,
      })
      .from(courseMembers)
      .innerJoin(courses, eq(courseMembers.courseId, courses.id))
      .where(eq(courseMembers.userId, userId))
      .all();
  },

  listMembers(courseId: string) {
    return db
      .select({
        memberId: courseMembers.id,
        userId: users.id,
        username: users.deviceHash,
        displayName: users.displayName,
        email: users.email,
        avatarColor: users.avatarColor,
        role: courseMembers.role,
        joinedAt: courseMembers.joinedAt,
      })
      .from(courseMembers)
      .innerJoin(users, eq(courseMembers.userId, users.id))
      .where(eq(courseMembers.courseId, courseId))
      .all();
  },

  findMember(userId: string, courseId: string): CourseMember | undefined {
    return db
      .select()
      .from(courseMembers)
      .where(and(eq(courseMembers.userId, userId), eq(courseMembers.courseId, courseId)))
      .get();
  },

  requireMember(userId: string, courseId: string): CourseMember {
    return requireCourseMember(userId, courseId);
  },
};
