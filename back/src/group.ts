import { and, eq, inArray } from "drizzle-orm";
import { db, nowIso } from "./db";
import { forbidden, notFound } from "./errors";
import { parseGithubRepoUrl } from "./github-url";
import { listGroupMembers } from "./group-member-read-model";
import { requireAssignmentOwnedByProfessor, requireCourseMember, requireGroupOwnedByProfessor } from "./guards";
import { generateJoinCode, isUniqueConstraintError } from "./join-code";
import { groupMembers, groups } from "./schema";

export type Group = typeof groups.$inferSelect;
export type NewGroup = typeof groups.$inferInsert;
export type GroupMember = typeof groupMembers.$inferSelect;
export type NewGroupMember = typeof groupMembers.$inferInsert;

export const Group = {
  create(professorId: string, name: string, assignmentId: string): Group {
    const assignment = requireAssignmentOwnedByProfessor(assignmentId, professorId);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const group: NewGroup = {
        id: crypto.randomUUID(),
        courseId: assignment.courseId,
        assignmentId: assignment.id,
        name,
        joinCode: generateJoinCode(),
        workspacePath: null,
        repoPath: null,
        cloneUrl: null,
        repositoryProvider: "github",
        githubRepoUrl: null,
        githubOwner: null,
        githubRepo: null,
        githubAccessUserId: null,
        professorId,
        createdAt: nowIso(),
      };

      try {
        return db.insert(groups).values(group).returning().get();
      } catch (error) {
        if (!isUniqueConstraintError(error)) throw error;
      }
    }

    throw new Error("Could not generate a unique group join code");
  },

  assignStudent(joinCode: string, userId: string): GroupMember {
    const group = this.findByJoinCode(joinCode);
    if (!group) notFound("Group not found for join code");
    if (group.courseId) requireCourseMember(userId, group.courseId);

    const member: NewGroupMember = {
      id: crypto.randomUUID(),
      userId,
      groupId: group.id,
      role: "student",
      joinedAt: nowIso(),
    };

    return db.insert(groupMembers).values(member).onConflictDoNothing().returning().get() ?? this.findMember(userId, group.id)!;
  },

  assignCourseStudent(groupId: string, userId: string, professorId: string, githubUsername?: string): GroupMember {
    const group = requireGroupOwnedByProfessor(groupId, professorId);
    if (!group.courseId) throw new Error("Group is not attached to a course");
    requireCourseMember(userId, group.courseId);

    const assignmentGroupIds = group.assignmentId
      ? db.select({ id: groups.id }).from(groups).where(eq(groups.assignmentId, group.assignmentId)).all().map((entry) => entry.id)
      : [group.id];
    const previousGroupIds = assignmentGroupIds.filter((id) => id !== group.id);
    const previousMemberships = previousGroupIds.length > 0
      ? db
          .select({ groupId: groupMembers.groupId })
          .from(groupMembers)
          .where(and(eq(groupMembers.userId, userId), inArray(groupMembers.groupId, previousGroupIds)))
          .all()
      : [];
    const movedFromGroupId = previousMemberships[0]?.groupId ?? null;
    if (previousGroupIds.length > 0) {
      db.delete(groupMembers)
        .where(and(eq(groupMembers.userId, userId), inArray(groupMembers.groupId, previousGroupIds)))
        .run();
    }

    const member: NewGroupMember = {
      id: crypto.randomUUID(),
      userId,
      groupId: group.id,
      role: "student",
      githubUsername: githubUsername ?? null,
      movedFromGroupId,
      joinedAt: nowIso(),
    };

    const inserted = db.insert(groupMembers).values(member).onConflictDoNothing().returning().get();
    if (inserted) return inserted;
    const update: Partial<NewGroupMember> = {};
    if (githubUsername) update.githubUsername = githubUsername;
    if (movedFromGroupId) update.movedFromGroupId = movedFromGroupId;
    if (Object.keys(update).length > 0) {
      return db
        .update(groupMembers)
        .set(update)
        .where(and(eq(groupMembers.userId, userId), eq(groupMembers.groupId, group.id)))
        .returning()
        .get();
    }
    return this.findMember(userId, group.id)!;
  },

  findOrCreateForAssignment(input: { professorId: string; assignmentId: string; name: string; githubRepoUrl?: string }): Group {
    const assignment = requireAssignmentOwnedByProfessor(input.assignmentId, input.professorId);

    const existing = db
      .select()
      .from(groups)
      .where(and(eq(groups.assignmentId, input.assignmentId), eq(groups.name, input.name)))
      .get();
    if (existing) return this.updateGithubRepository(existing.id, input.githubRepoUrl) ?? existing;

    const parsed = parseGithubRepoUrl(input.githubRepoUrl);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const group: NewGroup = {
        id: crypto.randomUUID(),
        courseId: assignment.courseId,
        assignmentId: assignment.id,
        name: input.name,
        joinCode: generateJoinCode(),
        workspacePath: null,
        repoPath: null,
        cloneUrl: input.githubRepoUrl ?? null,
        repositoryProvider: "github",
        githubRepoUrl: input.githubRepoUrl ?? null,
        githubOwner: parsed?.owner ?? null,
        githubRepo: parsed?.repo ?? null,
        githubAccessUserId: null,
        professorId: input.professorId,
        createdAt: nowIso(),
      };

      try {
        return db.insert(groups).values(group).returning().get();
      } catch (error) {
        if (!isUniqueConstraintError(error)) throw error;
      }
    }

    throw new Error("Could not generate a unique group join code");
  },

  updateGithubRepository(groupId: string, githubRepoUrl?: string, githubAccessUserId: string | null = null): Group | undefined {
    if (!githubRepoUrl) return undefined;
    const parsed = parseGithubRepoUrl(githubRepoUrl);
    return db
      .update(groups)
      .set({
        repositoryProvider: "github",
        githubRepoUrl,
        githubOwner: parsed?.owner ?? null,
        githubRepo: parsed?.repo ?? null,
        githubAccessUserId,
        cloneUrl: githubRepoUrl,
        repoPath: null,
      })
      .where(eq(groups.id, groupId))
      .returning()
      .get();
  },

  connectStudentGithubRepository(input: { groupId: string; userId: string; githubRepoUrl: string }): Group {
    const group = this.findById(input.groupId);
    if (!group) notFound("Group not found");
    if (!this.findMember(input.userId, group.id)) forbidden("Student must belong to the group before connecting a repository");
    const updated = this.updateGithubRepository(group.id, input.githubRepoUrl, input.userId);
    if (!updated) throw new Error("Could not connect GitHub repository");
    return updated;
  },

  findById(groupId: string): Group | undefined {
    return db.select().from(groups).where(eq(groups.id, groupId)).get();
  },

  findByJoinCode(joinCode: string): Group | undefined {
    return db.select().from(groups).where(eq(groups.joinCode, joinCode)).get();
  },

  listByProfessor(professorId: string): Group[] {
    return db.select().from(groups).where(eq(groups.professorId, professorId)).all();
  },

  listByCourse(courseId: string): Group[] {
    return db.select().from(groups).where(eq(groups.courseId, courseId)).all();
  },

  listByAssignment(assignmentId: string): Group[] {
    return db.select().from(groups).where(eq(groups.assignmentId, assignmentId)).all();
  },

  listMembers(groupId: string) {
    return listGroupMembers(groupId);
  },

  listByUser(userId: string) {
    return db
      .select({
        id: groups.id,
        name: groups.name,
        courseId: groups.courseId,
        assignmentId: groups.assignmentId,
        workspacePath: groups.workspacePath,
        repoPath: groups.repoPath,
        cloneUrl: groups.cloneUrl,
        repositoryProvider: groups.repositoryProvider,
        githubRepoUrl: groups.githubRepoUrl,
        githubOwner: groups.githubOwner,
        githubRepo: groups.githubRepo,
        githubAccessUserId: groups.githubAccessUserId,
        professorId: groups.professorId,
        createdAt: groups.createdAt,
        role: groupMembers.role,
        joinedAt: groupMembers.joinedAt,
      })
      .from(groupMembers)
      .innerJoin(groups, eq(groupMembers.groupId, groups.id))
      .where(eq(groupMembers.userId, userId))
      .all();
  },

  findMember(userId: string, groupId: string): GroupMember | undefined {
    return db
      .select()
      .from(groupMembers)
      .where(and(eq(groupMembers.userId, userId), eq(groupMembers.groupId, groupId)))
      .get();
  },

  removeMember(groupId: string, userId: string): void {
    db.delete(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
      .run();
  },
};
