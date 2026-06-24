import { beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import app from "./index";
import { sqlite } from "./db";
import { matchDashboardMemberForCommit } from "./dashboard-stats";
import { getGroupDashboard } from "./dashboard";

const JSON_HEADERS = { "content-type": "application/json" };

beforeEach(() => {
  for (const table of [
    "commit_activities",
    "pushed_commits",
    "file_nodes",
    "repositories",
    "projects",
    "group_members",
    "groups",
    "course_calendar_items",
    "assignments",
    "course_members",
    "courses",
    "professor_github_accounts",
    "professors",
    "users",
  ]) {
    sqlite.run(`DELETE FROM ${table}`);
  }
});

async function postJson<T>(path: string, body: unknown, expectedStatus = 200): Promise<T> {
  const response = await app.request(path, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(body) });
  expect(response.status).toBe(expectedStatus);
  return response.json() as Promise<T>;
}

async function patchJson<T>(path: string, body: unknown, expectedStatus = 200): Promise<T> {
  const response = await app.request(path, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify(body) });
  expect(response.status).toBe(expectedStatus);
  return response.json() as Promise<T>;
}

type UserResponse = { id: string; deviceHash: string; displayName: string; email?: string | null; githubUsername?: string | null; avatarColor?: string | null; password?: never };
type ProfessorResponse = { id: string; userId: string; pageSlug: string; pageTitle: string; user: UserResponse };
type CourseResponse = { id: string; professorId: string; joinCode: string };
type AssignmentResponse = { id: string; courseId: string; professorId: string };
type GroupResponse = { id: string; courseId: string; assignmentId: string; professorId: string; joinCode: string; githubRepoUrl: string | null };
type MemberResponse = { id?: string; userId: string; groupId?: string; courseId?: string; displayName?: string; email?: string | null; avatarColor?: string | null; githubUsername?: string | null; movedFromGroupId?: string | null };
type ProjectResponse = { id: string; groupId: string; assignedStudentId: string | null };
type ImportedStudentResponse = UserResponse & { temporaryPassword?: string };
type GithubConnectionResponse = { connected: boolean; githubUsername: string | null; scope: string | null };


describe("backend routes", () => {
  test("student registration uses the chosen password and never returns password data", async () => {
    const user = await postJson<UserResponse>("/auth/student/register", { username: "ada", password: "secret123", displayName: "Ada" });
    expect(user.password).toBeUndefined();
    expect(user.displayName).toBe("Ada");

    const login = await postJson<UserResponse>("/auth/student/login", { username: "ADA", password: "secret123" });
    expect(login.id).toBe(user.id);

    await postJson<{ error: string }>("/auth/student/login", { username: "ada", password: "wrong123" }, 401);
  });

  test("professor registration logs in through professor credentials", async () => {
    const professor = await postJson<ProfessorResponse>("/auth/professor/register", { username: "koushik", password: "password123", displayName: "Koushik" });

    const login = await postJson<ProfessorResponse>("/auth/professor/login", { username: "KOUSHIK", password: "password123" });
    expect(login.id).toBe(professor.id);
    expect(login.user.id).toBe(professor.userId);

    await postJson<{ error: string }>("/auth/student/login", { username: "koushik", password: "password123" }, 401);
  });

  test("professors can connect and disconnect GitHub OAuth", async () => {
    const professor = await postJson<ProfessorResponse>("/auth/professor/register", { username: "oauth-prof", password: "password123", displayName: "OAuth Professor" });
    const previousEnv = {
      clientId: process.env.GITHUB_OAUTH_CLIENT_ID,
      clientSecret: process.env.GITHUB_OAUTH_CLIENT_SECRET,
      redirectUri: process.env.GITHUB_OAUTH_REDIRECT_URI,
      stateSecret: process.env.GITHUB_OAUTH_STATE_SECRET,
    };
    const originalFetch = globalThis.fetch;

    try {
      delete process.env.GITHUB_OAUTH_CLIENT_ID;
      delete process.env.GITHUB_OAUTH_CLIENT_SECRET;
      delete process.env.GITHUB_OAUTH_REDIRECT_URI;
      delete process.env.GITHUB_OAUTH_STATE_SECRET;
      const missingConfigResponse = await app.request(`/auth/professor/github/start?professorId=${professor.id}&returnTo=/settings`);
      expect(missingConfigResponse.status).toBe(302);
      expect(missingConfigResponse.headers.get("location")).toBe("/settings?github_oauth=missing_config");

      process.env.GITHUB_OAUTH_CLIENT_ID = "client-id";
      process.env.GITHUB_OAUTH_CLIENT_SECRET = "client-secret";
      process.env.GITHUB_OAUTH_REDIRECT_URI = "http://localhost:3000/auth/professor/github/callback";
      process.env.GITHUB_OAUTH_STATE_SECRET = "state-secret";

      const startResponse = await app.request(`/auth/professor/github/start?professorId=${professor.id}&returnTo=/settings`);
      expect(startResponse.status).toBe(302);
      const location = startResponse.headers.get("location");
      expect(location).toContain("https://github.com/login/oauth/authorize");
      const state = new URL(location!).searchParams.get("state");
      expect(state).toBeTruthy();

      globalThis.fetch = (async (input: string | URL | Request) => {
        const url = String(input);
        if (url === "https://github.com/login/oauth/access_token") {
          return Response.json({ access_token: "prof-token", token_type: "bearer", scope: "read:user repo" });
        }
        if (url === "https://api.github.com/user") {
          return Response.json({ id: 12345, login: "prof-octocat" });
        }
        return new Response("unexpected", { status: 500 });
      }) as typeof fetch;

      const callbackResponse = await app.request(`/auth/professor/github/callback?code=abc123&state=${encodeURIComponent(state!)}`);
      expect(callbackResponse.status).toBe(302);
      expect(callbackResponse.headers.get("location")).toBe("/settings?github_oauth=connected");

      const statusResponse = await app.request(`/professors/${professor.id}/github`);
      expect(statusResponse.status).toBe(200);
      const status = await statusResponse.json() as GithubConnectionResponse;
      expect(status).toEqual({ connected: true, githubUsername: "prof-octocat", scope: "read:user repo" });

      const login = await postJson<ProfessorResponse>("/auth/professor/login", { username: "oauth-prof", password: "password123" });
      expect(login.user.githubUsername).toBe("prof-octocat");

      const secondProfessor = await postJson<ProfessorResponse>("/auth/professor/register", { username: "second-oauth-prof", password: "password123", displayName: "Second OAuth Professor" });
      const secondStartResponse = await app.request(`/auth/professor/github/start?professorId=${secondProfessor.id}&returnTo=/settings`);
      expect(secondStartResponse.status).toBe(302);
      const secondState = new URL(secondStartResponse.headers.get("location")!).searchParams.get("state");
      expect(secondState).toBeTruthy();
      const duplicateCallbackResponse = await app.request(`/auth/professor/github/callback?code=abc123&state=${encodeURIComponent(secondState!)}`);
      expect(duplicateCallbackResponse.status).toBe(302);
      expect(duplicateCallbackResponse.headers.get("location")).toBe("/settings?github_oauth=failed");
      const secondStatusResponse = await app.request(`/professors/${secondProfessor.id}/github`);
      expect(secondStatusResponse.status).toBe(200);
      const secondStatus = await secondStatusResponse.json() as GithubConnectionResponse;
      expect(secondStatus.connected).toBe(false);

      const disconnectResponse = await app.request(`/professors/${professor.id}/github`, { method: "DELETE" });
      expect(disconnectResponse.status).toBe(200);
      const disconnected = await disconnectResponse.json() as GithubConnectionResponse;
      expect(disconnected.connected).toBe(false);
      expect(disconnected.githubUsername).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
      if (previousEnv.clientId === undefined) delete process.env.GITHUB_OAUTH_CLIENT_ID;
      else process.env.GITHUB_OAUTH_CLIENT_ID = previousEnv.clientId;
      if (previousEnv.clientSecret === undefined) delete process.env.GITHUB_OAUTH_CLIENT_SECRET;
      else process.env.GITHUB_OAUTH_CLIENT_SECRET = previousEnv.clientSecret;
      if (previousEnv.redirectUri === undefined) delete process.env.GITHUB_OAUTH_REDIRECT_URI;
      else process.env.GITHUB_OAUTH_REDIRECT_URI = previousEnv.redirectUri;
      if (previousEnv.stateSecret === undefined) delete process.env.GITHUB_OAUTH_STATE_SECRET;
      else process.env.GITHUB_OAUTH_STATE_SECRET = previousEnv.stateSecret;
    }
  });

  test("dashboard commit matching accepts generated usernames and GitHub bases", () => {
    const member = {
      userId: "student-1",
      username: "AlexCarter1341",
      displayName: "Alex Carter",
      githubUsername: null,
      email: "alex.carter@example.edu",
      userGithubUsername: null,
      groupGithubUsername: null,
    };

    expect(matchDashboardMemberForCommit({ githubUsername: "AlexCarter" }, [member])?.userId).toBe("student-1");
    expect(matchDashboardMemberForCommit({ githubUsername: "AlexCarter1341" }, [member])?.userId).toBe("student-1");
    expect(matchDashboardMemberForCommit({ authorEmail: "ALEX.CARTER@example.edu" }, [member])?.userId).toBe("student-1");
  });

  test("local repository dashboard links commits to generated student usernames", async () => {
    const repoPath = mkdtempSync(join(tmpdir(), "miyagi-dashboard-repo-"));
    const commitDate = new Date().toISOString();
    const runGit = (...args: string[]) => {
      const result = spawnSync("git", args, { cwd: repoPath, env: { ...process.env, GIT_AUTHOR_DATE: commitDate, GIT_COMMITTER_DATE: commitDate } });
      expect(result.status).toBe(0);
    };

    try {
      runGit("init");
      runGit("config", "user.name", "Alex Carter");
      runGit("config", "user.email", "alex.carter@example.edu");
      writeFileSync(join(repoPath, "work.txt"), "hello\n");
      runGit("add", "work.txt");
      runGit("commit", "-m", "Initial work");

      const professor = await postJson<ProfessorResponse>("/auth/professor/register", { username: "dash-prof", password: "password123", displayName: "Professor" });
      const course = await postJson<CourseResponse>("/courses", { professorId: professor.id, name: "CS 101" });
      const assignment = await postJson<AssignmentResponse>("/assignments", { professorId: professor.id, courseId: course.id, name: "Project 1" });
      const group = await postJson<GroupResponse>("/groups", { professorId: professor.id, assignmentId: assignment.id, name: "Team One" });
      const student = await postJson<UserResponse>("/auth/student/register", { username: "AlexCarter1341", password: "password123", displayName: "Alex Carter" });

      await postJson<MemberResponse>("/courses/join", { userId: student.id, joinCode: course.joinCode });
      await postJson<MemberResponse>("/groups/join", { userId: student.id, joinCode: group.joinCode });
      sqlite.run("UPDATE groups SET repo_path = ?, repository_provider = ? WHERE id = ?", join(repoPath, ".git"), "local", group.id);

      const dashboard = await getGroupDashboard(group.id, "semester");
      expect(dashboard.totals.commits).toBe(1);
      expect(dashboard.byStudent[0]?.commits).toBe(1);
      expect(dashboard.commits[0]?.matchedStudent?.userId).toBe(student.id);
    } finally {
      rmSync(repoPath, { recursive: true, force: true });
    }
  });

  test("users can manage profile fields and change passwords", async () => {
    const user = await postJson<UserResponse>("/auth/student/register", { username: "grace", password: "secret123", displayName: "Grace" });
    expect(user.avatarColor).toMatch(/^#[0-9a-f]{6}$/);

    const profile = await patchJson<UserResponse>(`/users/${user.id}/account`, { displayName: "Grace Hopper", githubUsername: "ghopper", avatarColor: "#22c55e" });
    expect(profile.displayName).toBe("Grace Hopper");
    expect(profile.githubUsername).toBe("ghopper");
    expect(profile.avatarColor).toBe("#22c55e");
    expect(profile.password).toBeUndefined();

    await patchJson<{ ok: true }>(`/users/${user.id}/password`, { currentPassword: "secret123", newPassword: "better123" });
    await postJson<UserResponse>("/auth/student/login", { username: "grace", password: "better123" });
    await postJson<{ error: string }>("/auth/student/login", { username: "grace", password: "secret123" }, 401);
  });

  test("course, assignment, group, membership, and project routes share service boundaries", async () => {
    const professor = await postJson<ProfessorResponse>("/auth/professor/register", { username: "prof", password: "password123", displayName: "Professor" });
    const course = await postJson<CourseResponse>("/courses", { professorId: professor.id, name: "CS 101" });
    const student = await postJson<UserResponse>("/auth/student/register", { username: "student", password: "password123", displayName: "Student" });

    const courseMember = await postJson<MemberResponse>("/courses/join", { userId: student.id, joinCode: course.joinCode });
    expect(courseMember.courseId).toBe(course.id);

    const assignment = await postJson<AssignmentResponse>("/assignments", { professorId: professor.id, courseId: course.id, name: "Project 1" });
    const group = await postJson<GroupResponse>("/groups", { professorId: professor.id, assignmentId: assignment.id, name: "Team One" });
    const groupMember = await postJson<MemberResponse>("/groups/join", { userId: student.id, joinCode: group.joinCode });
    expect(groupMember.groupId).toBe(group.id);

    const groupsForAssignmentResponse = await app.request(`/assignments/${assignment.id}/groups`);
    expect(groupsForAssignmentResponse.status).toBe(200);
    const groupsForAssignment = await groupsForAssignmentResponse.json() as GroupResponse[];
    expect(groupsForAssignment.map((entry) => entry.id)).toContain(group.id);

    const groupsForUserResponse = await app.request(`/groups/user/${student.id}`);
    expect(groupsForUserResponse.status).toBe(200);
    const groupsForUser = await groupsForUserResponse.json() as Array<GroupResponse & { role: string }>;
    expect(groupsForUser[0]?.role).toBe("student");
    expect(groupsForUser[0]).not.toHaveProperty("joinCode");

    const coursesForUserResponse = await app.request(`/courses/user/${student.id}`);
    expect(coursesForUserResponse.status).toBe(200);
    const coursesForUser = await coursesForUserResponse.json() as Array<CourseResponse & { role: string }>;
    expect(coursesForUser[0]).not.toHaveProperty("joinCode");

    const project = await postJson<ProjectResponse>("/projects", {
      groupId: group.id,
      assignedByProfessorId: professor.id,
      assignedStudentId: student.id,
      name: "Implementation",
    });
    expect(project.assignedStudentId).toBe(student.id);

    const secondGroup = await postJson<GroupResponse>("/groups", { professorId: professor.id, assignmentId: assignment.id, name: "Team Two" });
    const movedMember = await postJson<MemberResponse>(`/groups/${secondGroup.id}/members`, { professorId: professor.id, userId: student.id });
    expect(movedMember.groupId).toBe(secondGroup.id);
    expect(movedMember.movedFromGroupId).toBe(group.id);

    const firstGroupMembersResponse = await app.request(`/groups/${group.id}/members`);
    expect(firstGroupMembersResponse.status).toBe(200);
    const firstGroupMembers = await firstGroupMembersResponse.json() as MemberResponse[];
    expect(firstGroupMembers.map((member) => member.userId)).not.toContain(student.id);

    const secondGroupMembersResponse = await app.request(`/groups/${secondGroup.id}/members`);
    expect(secondGroupMembersResponse.status).toBe(200);
    const secondGroupMembers = await secondGroupMembersResponse.json() as MemberResponse[];
    expect(secondGroupMembers[0]?.movedFromGroupId).toBe(group.id);
  });


  test("multiple professors get isolated pages and scoped student imports", async () => {
    const first = await postJson<ProfessorResponse>("/auth/professor/register", { username: "first-prof", password: "password123", displayName: "Dr First" });
    const second = await postJson<ProfessorResponse>("/auth/professor/register", { username: "second-prof", password: "password123", displayName: "Dr Second" });
    expect(first.pageSlug).toBe("dr-first");
    expect(second.pageSlug).toBe("dr-second");

    const firstCourse = await postJson<CourseResponse>("/courses", { professorId: first.id, name: "CS 201" });
    const secondCourse = await postJson<CourseResponse>("/courses", { professorId: second.id, name: "CS 301" });

    const importResult = await postJson<{ importedStudents: number; students: ImportedStudentResponse[] }>(`/courses/${firstCourse.id}/import-students`, {
      professorId: first.id,
      csv: "name,username,email\nAda Lovelace,ada,ada@example.edu",
    });
    expect(importResult.students[0].password).toBeUndefined();
    expect(importResult.students[0].deviceHash).toMatch(/^AdaLovelace\d{4}$/);
    expect(importResult.students[0].temporaryPassword).toBe(importResult.students[0].deviceHash);
    await postJson<UserResponse>("/auth/student/login", { username: importResult.students[0].deviceHash, password: importResult.students[0].temporaryPassword });
    await postJson<{ error: string }>(`/courses/${firstCourse.id}/import-students`, {
      professorId: second.id,
      csv: "name,username\\nWrong Professor,wrong",
    }, 403);

    const firstPageResponse = await app.request(`/professor-pages/${first.pageSlug}`);
    expect(firstPageResponse.status).toBe(200);
    const firstPage = await firstPageResponse.json() as { professor: ProfessorResponse; courses: CourseResponse[] };
    expect(firstPage.courses.map((course) => course.id)).toEqual([firstCourse.id]);

    const secondPageResponse = await app.request(`/professor-pages/${second.pageSlug}`);
    const secondPage = await secondPageResponse.json() as { professor: ProfessorResponse; courses: CourseResponse[] };
    expect(secondPage.courses.map((course) => course.id)).toEqual([secondCourse.id]);
  });

  test("assignment group import accepts piped email and GitHub rows", async () => {
    const professor = await postJson<ProfessorResponse>("/auth/professor/register", { username: "csv-prof", password: "password123", displayName: "Professor" });
    const course = await postJson<CourseResponse>("/courses", { professorId: professor.id, name: "CS 401" });
    const assignment = await postJson<AssignmentResponse>("/assignments", { professorId: professor.id, courseId: course.id, name: "Project 1" });
    const firstStudent = await postJson<UserResponse>("/auth/student/register", { username: "khed3455@example.com", password: "password123", displayName: "Khed" });
    const secondStudent = await postJson<UserResponse>("/auth/student/register", { username: "partner@example.com", password: "password123", displayName: "Partner" });

    expect(firstStudent.email).toBe("khed3455@example.com");
    expect(secondStudent.email).toBe("partner@example.com");

    const result = await postJson<{ importedGroups: number; groups: Array<{ group: GroupResponse; importedMembers: MemberResponse[] }> }>(
      `/assignments/${assignment.id}/import-groups`,
      {
        professorId: professor.id,
        csv: "|{khed3455@example.com:khedgit}{partner@example.com:partnergit}|https://github.com/example-org/project-team-1|",
      },
    );

    expect(result.importedGroups).toBe(1);
    expect(result.groups[0].group.name).toBe("project-team-1");
    expect(result.groups[0].group.githubRepoUrl).toBe("https://github.com/example-org/project-team-1");
    expect(result.groups[0].importedMembers.map((member) => member.githubUsername)).toEqual(["khedgit", "partnergit"]);

    const firstLogin = await postJson<UserResponse>("/auth/student/login", { username: "khed3455@example.com", password: "password123" });
    const secondLogin = await postJson<UserResponse>("/auth/student/login", { username: "partner@example.com", password: "password123" });
    expect(firstLogin.githubUsername).toBe("khedgit");
    expect(secondLogin.githubUsername).toBe("partnergit");

    const courseMembers = await app.request(`/courses/${course.id}/members`);
    expect(courseMembers.status).toBe(200);
    const enrolled = await courseMembers.json() as MemberResponse[];
    expect(enrolled.map((member) => member.userId).sort()).toEqual([firstStudent.id, secondStudent.id].sort());
    expect(enrolled.map((member) => member.email).sort()).toEqual(["khed3455@example.com", "partner@example.com"]);

    const groupMembers = await app.request(`/groups/${result.groups[0].group.id}/members`);
    expect(groupMembers.status).toBe(200);
    const assigned = await groupMembers.json() as MemberResponse[];
    expect(assigned.map((member) => member.email).sort()).toEqual(["khed3455@example.com", "partner@example.com"]);
  });
  test("ownership and membership failures return route-level statuses", async () => {
    const owner = await postJson<ProfessorResponse>("/auth/professor/register", { username: "owner", password: "password123" });
    const intruder = await postJson<ProfessorResponse>("/auth/professor/register", { username: "intruder", password: "password123" });
    const course = await postJson<CourseResponse>("/courses", { professorId: owner.id, name: "CS 102" });
    const assignment = await postJson<AssignmentResponse>("/assignments", { professorId: owner.id, courseId: course.id, name: "Project 2" });
    const group = await postJson<GroupResponse>("/groups", { professorId: owner.id, assignmentId: assignment.id, name: "Team Two" });
    const outsider = await postJson<UserResponse>("/auth/student/register", { username: "outsider", password: "password123" });

    await postJson<{ error: string }>("/assignments", { professorId: intruder.id, courseId: course.id, name: "Bad" }, 403);
    await postJson<{ error: string }>("/projects", { groupId: group.id, assignedByProfessorId: owner.id, assignedStudentId: outsider.id, name: "Bad" }, 403);
    await patchJson<{ error: string }>(`/groups/${group.id}/github`, { professorId: intruder.id, githubRepoUrl: "https://github.com/a/b" }, 403);
  });
});
