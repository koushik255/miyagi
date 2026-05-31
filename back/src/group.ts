import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { and, eq } from "drizzle-orm";
import { Assignment } from "./assignment";
import { Course } from "./course";
import { db, nowIso } from "./db";
import { groupMembers, groups, users } from "./schema";

const MIYAGI_DATA_ROOT = process.env.MIYAGI_DATA_ROOT ?? "/home/kous/extra";
const GROUP_WORKSPACES_ROOT = process.env.GROUP_WORKSPACES_ROOT ?? join(MIYAGI_DATA_ROOT, "group_workspaces");
export const GROUP_REPOS_ROOT = process.env.GROUP_REPOS_ROOT ?? join(MIYAGI_DATA_ROOT, "group_repos");
export const GIT_HTTP_BASE_URL = (process.env.GIT_HTTP_BASE_URL ?? "http://localhost:3000/git").replace(/\/$/, "");

export type Group = typeof groups.$inferSelect;
export type NewGroup = typeof groups.$inferInsert;
export type GroupMember = typeof groupMembers.$inferSelect;
export type NewGroupMember = typeof groupMembers.$inferInsert;

export const Group = {
  create(professorId: string, name: string, assignmentId: string): Group {
    const assignment = Assignment.findById(assignmentId);
    if (!assignment) throw new Error("Assignment not found");
    if (assignment.professorId !== professorId) throw new Error("Assignment does not belong to professor");

    const course = Course.findById(assignment.courseId);
    if (!course) throw new Error("Course not found");

    if (assignment.repositoryMode === "github") {
      const group: NewGroup = {
        id: crypto.randomUUID(),
        courseId: course.id,
        assignmentId: assignment.id,
        name,
        joinCode: this.generateJoinCode(),
        workspacePath: null,
        repoPath: null,
        cloneUrl: null,
        repositoryProvider: "github",
        githubRepoUrl: null,
        githubOwner: null,
        githubRepo: null,
        professorId,
        createdAt: nowIso(),
      };
      return db.insert(groups).values(group).returning().get();
    }

    const directoryName = this.toWorkspaceDirectoryName(name);
    const courseDirectoryName = this.toWorkspaceDirectoryName(course.name);
    const assignmentDirectoryName = this.toWorkspaceDirectoryName(assignment.name);
    const repoPath = this.createRepo(directoryName, courseDirectoryName, assignmentDirectoryName);
    const workspacePath = this.createWorkspace(directoryName, repoPath, courseDirectoryName, assignmentDirectoryName);
    this.installPostReceiveHook(repoPath, workspacePath);
    const group: NewGroup = {
      id: crypto.randomUUID(),
      courseId: course.id,
      assignmentId: assignment.id,
      name,
      joinCode: this.generateJoinCode(),
      workspacePath,
      repoPath,
      cloneUrl: `${GIT_HTTP_BASE_URL}/${courseDirectoryName}/${assignmentDirectoryName}/${directoryName}.git`,
      professorId,
      createdAt: nowIso(),
    };

    return db.insert(groups).values(group).returning().get();
  },

  assignStudent(joinCode: string, userId: string): GroupMember {
    const group = this.findByJoinCode(joinCode);
    if (!group) throw new Error("Group not found for join code");
    if (group.courseId && !Course.findMember(userId, group.courseId)) {
      throw new Error("Student must join the course before joining this group");
    }

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
    const group = db.select().from(groups).where(eq(groups.id, groupId)).get();
    if (!group) throw new Error("Group not found");
    if (group.professorId !== professorId) throw new Error("Group does not belong to professor");
    if (!group.courseId) throw new Error("Group is not attached to a course");
    if (!Course.findMember(userId, group.courseId)) {
      throw new Error("Student must join the course before joining this group");
    }

    const member: NewGroupMember = {
      id: crypto.randomUUID(),
      userId,
      groupId: group.id,
      role: "student",
      githubUsername: githubUsername ?? null,
      joinedAt: nowIso(),
    };

    const inserted = db.insert(groupMembers).values(member).onConflictDoNothing().returning().get();
    if (inserted) return inserted;
    if (githubUsername) {
      return db
        .update(groupMembers)
        .set({ githubUsername })
        .where(and(eq(groupMembers.userId, userId), eq(groupMembers.groupId, group.id)))
        .returning()
        .get();
    }
    return this.findMember(userId, group.id)!;
  },

  findOrCreateForAssignment(input: { professorId: string; assignmentId: string; name: string; githubRepoUrl?: string }): Group {
    const assignment = Assignment.findById(input.assignmentId);
    if (!assignment) throw new Error("Assignment not found");
    if (assignment.professorId !== input.professorId) throw new Error("Assignment does not belong to professor");

    const existing = db
      .select()
      .from(groups)
      .where(and(eq(groups.assignmentId, input.assignmentId), eq(groups.name, input.name)))
      .get();
    if (existing) return this.updateGithubRepository(existing.id, input.githubRepoUrl) ?? this.withCurrentCloneUrl(existing);

    if (assignment.repositoryMode === "github") {
      const parsed = this.parseGithubUrl(input.githubRepoUrl);
      const group: NewGroup = {
        id: crypto.randomUUID(),
        courseId: assignment.courseId,
        assignmentId: assignment.id,
        name: input.name,
        joinCode: this.generateJoinCode(),
        workspacePath: null,
        repoPath: null,
        cloneUrl: input.githubRepoUrl ?? null,
        repositoryProvider: "github",
        githubRepoUrl: input.githubRepoUrl ?? null,
        githubOwner: parsed?.owner ?? null,
        githubRepo: parsed?.repo ?? null,
        professorId: input.professorId,
        createdAt: nowIso(),
      };
      return db.insert(groups).values(group).returning().get();
    }

    return this.create(input.professorId, input.name, input.assignmentId);
  },

  updateGithubRepository(groupId: string, githubRepoUrl?: string): Group | undefined {
    if (!githubRepoUrl) return undefined;
    const parsed = this.parseGithubUrl(githubRepoUrl);
    return db
      .update(groups)
      .set({ repositoryProvider: "github", githubRepoUrl, githubOwner: parsed?.owner ?? null, githubRepo: parsed?.repo ?? null, cloneUrl: githubRepoUrl })
      .where(eq(groups.id, groupId))
      .returning()
      .get();
  },

  parseGithubUrl(url?: string): { owner: string; repo: string } | undefined {
    if (!url) return undefined;
    const match = url.match(/github\.com[:/]([^/]+)\/([^/.#?]+)(?:\.git)?/i);
    if (!match) throw new Error(`Invalid GitHub URL: ${url}`);
    return { owner: match[1], repo: match[2] };
  },

  findByJoinCode(joinCode: string): Group | undefined {
    return db.select().from(groups).where(eq(groups.joinCode, joinCode)).get();
  },

  findByRepoPath(repoRelativePath: string): Group | undefined {
    const repoPath = join(GROUP_REPOS_ROOT, repoRelativePath);
    return db.select().from(groups).where(eq(groups.repoPath, repoPath)).get();
  },

  findByRepoName(repoName: string): Group | undefined {
    return this.findByRepoPath(repoName);
  },

  listByProfessor(professorId: string): Group[] {
    return db.select().from(groups).where(eq(groups.professorId, professorId)).all().map((group) => this.withCurrentCloneUrl(group));
  },

  installWorkspaceHooksForAllGroups(): void {
    for (const group of db.select().from(groups).all()) {
      if (!group.repoPath || !group.workspacePath) continue;
      if (!existsSync(group.repoPath) || !existsSync(group.workspacePath)) continue;
      this.installPostReceiveHook(group.repoPath, group.workspacePath);
    }
  },

  listByCourse(courseId: string): Group[] {
    return db.select().from(groups).where(eq(groups.courseId, courseId)).all().map((group) => this.withCurrentCloneUrl(group));
  },

  listByAssignment(assignmentId: string): Group[] {
    return db.select().from(groups).where(eq(groups.assignmentId, assignmentId)).all().map((group) => this.withCurrentCloneUrl(group));
  },

  listMembers(groupId: string) {
    return db
      .select({
        memberId: groupMembers.id,
        userId: users.id,
        displayName: users.displayName,
        role: groupMembers.role,
        githubUsername: groupMembers.githubUsername,
        joinedAt: groupMembers.joinedAt,
      })
      .from(groupMembers)
      .innerJoin(users, eq(groupMembers.userId, users.id))
      .where(eq(groupMembers.groupId, groupId))
      .all();
  },

  withCurrentCloneUrl<T extends Group>(group: T): T {
    if (!group.repoPath) return this.withRebasedStoredCloneUrl(group);

    const repoRelativePath = relative(GROUP_REPOS_ROOT, group.repoPath);
    if (!repoRelativePath || repoRelativePath.startsWith("..")) return this.withRebasedStoredCloneUrl(group);

    return {
      ...group,
      cloneUrl: `${GIT_HTTP_BASE_URL}/${repoRelativePath.split(sep).join("/")}`,
    };
  },

  withRebasedStoredCloneUrl<T extends Group>(group: T): T {
    if (!group.cloneUrl) return group;

    const localGitBase = /^https?:\/\/(?:localhost|127\.0\.0\.1):\d+\/git/;
    if (!localGitBase.test(group.cloneUrl)) return group;

    return {
      ...group,
      cloneUrl: group.cloneUrl.replace(localGitBase, GIT_HTTP_BASE_URL),
    };
  },

  listByUser(userId: string) {
    return db
      .select({
        id: groups.id,
        name: groups.name,
        courseId: groups.courseId,
        assignmentId: groups.assignmentId,
        joinCode: groups.joinCode,
        workspacePath: groups.workspacePath,
        repoPath: groups.repoPath,
        cloneUrl: groups.cloneUrl,
        repositoryProvider: groups.repositoryProvider,
        githubRepoUrl: groups.githubRepoUrl,
        githubOwner: groups.githubOwner,
        githubRepo: groups.githubRepo,
        professorId: groups.professorId,
        createdAt: groups.createdAt,
        role: groupMembers.role,
        joinedAt: groupMembers.joinedAt,
      })
      .from(groupMembers)
      .innerJoin(groups, eq(groupMembers.groupId, groups.id))
      .where(eq(groupMembers.userId, userId))
      .all()
      .map((group) => this.withCurrentCloneUrl(group));
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

  createRepo(directoryName: string, courseDirectoryName: string, assignmentDirectoryName: string): string {
    const repoRoot = join(GROUP_REPOS_ROOT, courseDirectoryName, assignmentDirectoryName);
    mkdirSync(repoRoot, { recursive: true });
    const repoPath = join(repoRoot, `${directoryName}.git`);
    if (!existsSync(repoPath)) this.runGit(["init", "--bare", repoPath]);
    return repoPath;
  },

  createWorkspace(directoryName: string, repoPath: string, courseDirectoryName: string, assignmentDirectoryName: string): string {
    const workspaceRoot = join(GROUP_WORKSPACES_ROOT, courseDirectoryName, assignmentDirectoryName);
    mkdirSync(workspaceRoot, { recursive: true });
    const workspacePath = join(workspaceRoot, directoryName);
    if (!existsSync(workspacePath)) this.runGit(["clone", repoPath, workspacePath]);
    else mkdirSync(workspacePath, { recursive: true });
    return workspacePath;
  },

  installPostReceiveHook(repoPath: string, workspacePath: string): void {
    const hookPath = join(repoPath, "hooks", "post-receive");
    const hook = `#!/usr/bin/env bash
set -euo pipefail

REPO_PATH=${this.shellQuote(repoPath)}
WORKSPACE_PATH=${this.shellQuote(workspacePath)}

while read -r _oldrev newrev refname; do
  case "$refname" in
    refs/heads/*)
      branch="\${refname#refs/heads/}"
      git --git-dir="$REPO_PATH" --work-tree="$WORKSPACE_PATH" checkout -f "$branch"
      git --git-dir="$REPO_PATH" --work-tree="$WORKSPACE_PATH" reset --hard "$newrev"
      ;;
  esac
done
`;

    writeFileSync(hookPath, hook);
    chmodSync(hookPath, 0o755);
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

  shellQuote(value: string): string {
    return `'${value.replaceAll("'", "'\\''")}'`;
  },

  generateJoinCode(): string {
    return Math.random().toString(36).slice(2, 8).toUpperCase();
  },
};
