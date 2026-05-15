import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import { db, nowIso } from "./db";
import { groupMembers, groups, users } from "./schema";

const GROUP_WORKSPACES_ROOT = process.env.GROUP_WORKSPACES_ROOT ?? "/home/koushikk/miyagi/group_workspaces";
export const GROUP_REPOS_ROOT = process.env.GROUP_REPOS_ROOT ?? "/home/koushikk/miyagi/group_repos";
const GIT_HTTP_BASE_URL = (process.env.GIT_HTTP_BASE_URL ?? "http://localhost:3000/git").replace(/\/$/, "");

export type Group = typeof groups.$inferSelect;
export type NewGroup = typeof groups.$inferInsert;
export type GroupMember = typeof groupMembers.$inferSelect;
export type NewGroupMember = typeof groupMembers.$inferInsert;

export const Group = {
  create(professorId: string, name: string): Group {
    const directoryName = this.toWorkspaceDirectoryName(name);
    const repoPath = this.createRepo(directoryName);
    const workspacePath = this.createWorkspace(directoryName, repoPath);
    const group: NewGroup = {
      id: crypto.randomUUID(),
      name,
      joinCode: this.generateJoinCode(),
      workspacePath,
      repoPath,
      cloneUrl: `${GIT_HTTP_BASE_URL}/${directoryName}.git`,
      professorId,
      createdAt: nowIso(),
    };

    return db.insert(groups).values(group).returning().get();
  },

  assignStudent(joinCode: string, userId: string): GroupMember {
    const group = this.findByJoinCode(joinCode);
    if (!group) throw new Error("Group not found for join code");

    const member: NewGroupMember = {
      id: crypto.randomUUID(),
      userId,
      groupId: group.id,
      role: "student",
      joinedAt: nowIso(),
    };

    return db.insert(groupMembers).values(member).onConflictDoNothing().returning().get() ?? this.findMember(userId, group.id)!;
  },

  findByJoinCode(joinCode: string): Group | undefined {
    return db.select().from(groups).where(eq(groups.joinCode, joinCode)).get();
  },

  findByRepoName(repoName: string): Group | undefined {
    const repoPath = join(GROUP_REPOS_ROOT, repoName);
    return db.select().from(groups).where(eq(groups.repoPath, repoPath)).get();
  },

  listByProfessor(professorId: string): Group[] {
    return db.select().from(groups).where(eq(groups.professorId, professorId)).all();
  },

  listMembers(groupId: string) {
    return db
      .select({
        memberId: groupMembers.id,
        userId: users.id,
        displayName: users.displayName,
        role: groupMembers.role,
        joinedAt: groupMembers.joinedAt,
      })
      .from(groupMembers)
      .innerJoin(users, eq(groupMembers.userId, users.id))
      .where(eq(groupMembers.groupId, groupId))
      .all();
  },

  listByUser(userId: string) {
    return db
      .select({
        id: groups.id,
        name: groups.name,
        joinCode: groups.joinCode,
        workspacePath: groups.workspacePath,
        repoPath: groups.repoPath,
        cloneUrl: groups.cloneUrl,
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

  createRepo(directoryName: string): string {
    mkdirSync(GROUP_REPOS_ROOT, { recursive: true });
    const repoPath = join(GROUP_REPOS_ROOT, `${directoryName}.git`);
    if (!existsSync(repoPath)) this.runGit(["init", "--bare", repoPath]);
    return repoPath;
  },

  createWorkspace(directoryName: string, repoPath: string): string {
    mkdirSync(GROUP_WORKSPACES_ROOT, { recursive: true });
    const workspacePath = join(GROUP_WORKSPACES_ROOT, directoryName);
    if (!existsSync(workspacePath)) this.runGit(["clone", repoPath, workspacePath]);
    else mkdirSync(workspacePath, { recursive: true });
    return workspacePath;
  },

  toWorkspaceDirectoryName(name: string): string {
    const cleaned = name.trim().replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
    return cleaned || "untitled_group";
  },

  runGit(args: string[]): void {
    const result = Bun.spawnSync(["git", ...args], { stdout: "pipe", stderr: "pipe" });
    if (result.success) return;

    const stderr = new TextDecoder().decode(result.stderr).trim();
    throw new Error(stderr || `git ${args.join(" ")} failed`);
  },

  generateJoinCode(): string {
    return Math.random().toString(36).slice(2, 8).toUpperCase();
  },
};
