import { and, eq } from "drizzle-orm";
import { Effect } from "effect";
import { AssignmentRepository } from "./assignment-repository";
import { assignments, courseCalendarItems, courseMembershipSuggestions, courseMembers, courses, db, nowIso, professors, users } from "./db";
import { badRequest, forbidden, notFound, trySync } from "./errors";
import type { AuthSession } from "./auth";

export type Course = typeof courses.$inferSelect;
export type CourseMember = typeof courseMembers.$inferSelect;
export type Assignment = typeof assignments.$inferSelect;
export type CourseCalendarItem = typeof courseCalendarItems.$inferSelect;
export type CourseMembershipSuggestion = typeof courseMembershipSuggestions.$inferSelect;

const JOIN_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateJoinCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (byte) => JOIN_CODE_ALPHABET[byte % JOIN_CODE_ALPHABET.length]).join("");
}

function requireCourseOwnedByProfessor(courseId: string, professorId: string) {
  return Effect.gen(function* () {
    const course = yield* trySync(() => db.select().from(courses).where(eq(courses.id, courseId)).get());
    if (!course) return yield* notFound("Course not found");
    if (course.professorId !== professorId) return yield* forbidden("Course does not belong to professor");
    return course;
  });
}

export const Course = {
  requireOwned(courseId: string, professorId: string) {
    return requireCourseOwnedByProfessor(courseId, professorId);
  },

  requireAccessible(courseId: string, session: AuthSession) {
    return Effect.gen(function* () {
      const course = yield* Course.findById(courseId);
      if (!course) return yield* notFound("Course not found");
      if (session.role === "professor") {
        if (course.professorId !== session.professorId) return yield* forbidden("Course does not belong to professor");
      } else if (!(yield* Course.findMember(session.userId, course.id))) {
        return yield* forbidden("Student is not a member of this course");
      }
      return course;
    });
  },

  create(professorId: string, name: string) {
    return Effect.gen(function* () {
      const professor = yield* trySync(() => db.select().from(professors).where(eq(professors.id, professorId)).get());
      if (!professor) return yield* notFound("Professor session not found. Please sign out and sign in again.");
      return yield* trySync(() => {
        for (let attempt = 0; attempt < 5; attempt += 1) {
          try {
            return db.insert(courses).values({ id: crypto.randomUUID(), name, joinCode: generateJoinCode(), professorId, createdAt: nowIso() }).returning().get();
          } catch (error) {
            if (!(error instanceof Error) || !/unique constraint/i.test(error.message)) throw error;
          }
        }
        throw new Error("Could not generate a unique course join code");
      }, "Could not create course");
    });
  },

  assignStudent(joinCode: string, userId: string) {
    return Effect.gen(function* () {
      const course = yield* Course.findByJoinCode(joinCode);
      if (!course) return yield* notFound("Course not found for join code");
      return yield* Course.assignStudentByCourseId(course.id, userId);
    });
  },

  assignStudentByCourseId(courseId: string, userId: string) {
    return trySync(() => db.insert(courseMembers).values({
      id: crypto.randomUUID(), userId, courseId, role: "student", joinedAt: nowIso(),
    }).onConflictDoNothing().returning().get()
      ?? db.select().from(courseMembers).where(and(eq(courseMembers.userId, userId), eq(courseMembers.courseId, courseId))).get()!, "Could not join course");
  },

  findByJoinCode(joinCode: string) {
    return trySync(() => db.select().from(courses).where(eq(courses.joinCode, joinCode)).get());
  },

  findById(courseId: string) {
    return trySync(() => db.select().from(courses).where(eq(courses.id, courseId)).get());
  },

  listByProfessor(professorId: string) {
    return trySync(() => db.select().from(courses).where(eq(courses.professorId, professorId)).all());
  },

  listByUser(userId: string) {
    return trySync(() => db.select({
      id: courses.id, name: courses.name, professorId: courses.professorId, createdAt: courses.createdAt,
      role: courseMembers.role, joinedAt: courseMembers.joinedAt,
    }).from(courseMembers).innerJoin(courses, eq(courseMembers.courseId, courses.id))
      .where(eq(courseMembers.userId, userId)).all());
  },

  listMembers(courseId: string) {
    return Effect.gen(function* () {
      const directMembers = yield* trySync(() => db.select({
        memberId: courseMembers.id, userId: users.id, username: users.deviceHash,
        displayName: users.displayName, email: users.email, avatarColor: users.avatarColor,
        role: courseMembers.role, joinedAt: courseMembers.joinedAt, lastSeenAt: users.lastSeenAt,
        githubUsername: users.githubUsername,
      }).from(courseMembers).innerJoin(users, eq(courseMembers.userId, users.id))
        .where(eq(courseMembers.courseId, courseId)).all());
      const byUserId = new Map(directMembers.map((member) => [member.userId, member]));
      for (const { user, repository } of yield* AssignmentRepository.listObservedUsersByCourse(courseId)) {
        if (!byUserId.has(user.id)) byUserId.set(user.id, {
          memberId: `repository:${repository.id}:${user.id}`, userId: user.id, username: user.deviceHash,
          displayName: user.displayName, email: user.email, avatarColor: user.avatarColor, role: "repository",
          joinedAt: repository.updatedAt, lastSeenAt: user.lastSeenAt, githubUsername: user.githubUsername,
        });
      }
      return [...byUserId.values()];
    });
  },

  findMember(userId: string, courseId: string) {
    return trySync(() => db.select().from(courseMembers)
      .where(and(eq(courseMembers.userId, userId), eq(courseMembers.courseId, courseId))).get());
  },
};

export const Assignment = {
  requireAccessible(assignmentId: string, session: AuthSession) {
    return Effect.gen(function* () {
      const assignment = yield* Assignment.findById(assignmentId);
      if (!assignment) return yield* notFound("Assignment not found");
      yield* Course.requireAccessible(assignment.courseId, session);
      return assignment;
    });
  },

  create(input: { professorId: string; courseId: string; name: string; description?: string; dueDate?: string; repositoryMode?: "github" }) {
    return Effect.gen(function* () {
      yield* requireCourseOwnedByProfessor(input.courseId, input.professorId);
      const timestamp = nowIso();
      return yield* trySync(() => db.insert(assignments).values({
        id: crypto.randomUUID(), courseId: input.courseId, name: input.name,
        description: input.description ?? "", dueDate: input.dueDate || null,
        professorId: input.professorId, repositoryMode: input.repositoryMode ?? "github",
        createdAt: timestamp, updatedAt: timestamp,
      }).returning().get(), "Could not create assignment");
    });
  },

  findById(assignmentId: string) {
    return trySync(() => db.select().from(assignments).where(eq(assignments.id, assignmentId)).get());
  },

  listByCourse(courseId: string) {
    return trySync(() => db.select().from(assignments).where(eq(assignments.courseId, courseId)).all());
  },
};

export const CourseCalendarItem = {
  listByCourse(courseId: string) {
    return trySync(() => db.select().from(courseCalendarItems).where(eq(courseCalendarItems.courseId, courseId)).all());
  },

  create(input: { courseId: string; professorId: string; assignmentId?: string | null; title: string; description?: string; dueAt: string; kind: "event" | "deadline" }) {
    return Effect.gen(function* () {
      yield* requireCourseOwnedByProfessor(input.courseId, input.professorId);
      let assignmentId: string | null = null;
      if (input.kind === "deadline" && input.assignmentId) {
        const assignment = yield* Assignment.findById(input.assignmentId);
        if (!assignment) return yield* notFound("Assignment not found");
        if (assignment.courseId !== input.courseId) return yield* badRequest("Assignment does not belong to this course");
        assignmentId = assignment.id;
      }
      const timestamp = nowIso();
      return yield* trySync(() => db.insert(courseCalendarItems).values({
        id: crypto.randomUUID(), courseId: input.courseId, professorId: input.professorId,
        assignmentId, title: input.title, description: input.description ?? "", dueAt: input.dueAt,
        kind: input.kind, createdAt: timestamp, updatedAt: timestamp,
      }).returning().get(), "Could not create calendar item");
    });
  },

  remove(courseId: string, itemId: string, professorId: string) {
    return Effect.gen(function* () {
      yield* requireCourseOwnedByProfessor(courseId, professorId);
      const item = yield* trySync(() => db.select().from(courseCalendarItems)
        .where(and(eq(courseCalendarItems.id, itemId), eq(courseCalendarItems.courseId, courseId))).get());
      if (!item) return yield* notFound("Calendar item not found");
      yield* trySync(() => db.delete(courseCalendarItems)
        .where(and(eq(courseCalendarItems.id, itemId), eq(courseCalendarItems.courseId, courseId))).run());
      return { ok: true } as const;
    });
  },
};

export const CourseMembershipSuggestion = {
  listPending(userId: string) {
    return Effect.gen(function* () {
      const user = yield* trySync(() => db.select().from(users).where(eq(users.id, userId)).get());
      if (!user) return yield* notFound("Student not found");
      for (const repository of yield* AssignmentRepository.listByUser(userId)) {
        if (yield* Course.findMember(userId, repository.courseId)) continue;
        yield* trySync(() => db.insert(courseMembershipSuggestions).values({
          id: crypto.randomUUID(), userId, courseId: repository.courseId, repositoryId: repository.id,
          githubUsername: user.githubUsername!, status: "pending", discoveredAt: nowIso(),
        }).onConflictDoNothing().run());
      }
      return yield* trySync(() => db.select({
        id: courseMembershipSuggestions.id, courseId: courses.id, courseName: courses.name,
        repositoryId: courseMembershipSuggestions.repositoryId, githubUsername: courseMembershipSuggestions.githubUsername,
        discoveredAt: courseMembershipSuggestions.discoveredAt,
      }).from(courseMembershipSuggestions).innerJoin(courses, eq(courseMembershipSuggestions.courseId, courses.id))
        .where(and(eq(courseMembershipSuggestions.userId, userId), eq(courseMembershipSuggestions.status, "pending"))).all());
    });
  },

  accept(suggestionId: string, userId: string) {
    return Effect.gen(function* () {
      const suggestion = yield* CourseMembershipSuggestion.requirePending(suggestionId, userId);
      const member = yield* Course.assignStudentByCourseId(suggestion.courseId, userId);
      yield* trySync(() => db.update(courseMembershipSuggestions).set({ status: "accepted", respondedAt: nowIso() })
        .where(eq(courseMembershipSuggestions.id, suggestionId)).run());
      return member;
    });
  },

  reject(suggestionId: string, userId: string) {
    return Effect.gen(function* () {
      yield* CourseMembershipSuggestion.requirePending(suggestionId, userId);
      yield* trySync(() => db.update(courseMembershipSuggestions).set({ status: "rejected", respondedAt: nowIso() })
        .where(eq(courseMembershipSuggestions.id, suggestionId)).run());
      return { ok: true } as const;
    });
  },

  requirePending(suggestionId: string, userId: string) {
    return Effect.gen(function* () {
      const suggestion = yield* trySync(() => db.select().from(courseMembershipSuggestions).where(and(
        eq(courseMembershipSuggestions.id, suggestionId), eq(courseMembershipSuggestions.userId, userId),
        eq(courseMembershipSuggestions.status, "pending"),
      )).get());
      if (!suggestion) return yield* notFound("Course suggestion not found");
      return suggestion;
    });
  },
};
