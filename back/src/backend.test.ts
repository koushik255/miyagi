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
  for (const table of ["student_github_accounts", "group_work_item_events", "group_work_items"]) {
    if (sqlite.query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)) {
      sqlite.run(`DELETE FROM ${table}`);
    }
  }
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

type UserResponse = { id: string; deviceHash: string; displayName: string; email?: string | null; githubUserId?: string | null; githubUsername?: string | null; avatarColor?: string | null; password?: never };
type ProfessorResponse = { id: string; userId: string; pageSlug: string; pageTitle: string; user: UserResponse };
type CourseResponse = { id: string; professorId: string; joinCode: string };
type AssignmentResponse = { id: string; courseId: string; professorId: string };
type GroupResponse = { id: string; courseId: string; assignmentId: string; professorId: string; joinCode: string; githubRepoUrl: string | null; githubOwner: string | null; githubRepo: string | null; githubAccessUserId?: string | null };
type MemberResponse = { id?: string; userId: string; groupId?: string; courseId?: string; displayName?: string; email?: string | null; avatarColor?: string | null; githubUsername?: string | null; movedFromGroupId?: string | null };
type ProjectResponse = { id: string; groupId: string; assignedStudentId: string | null };
type WorkItemStatus = "assigned" | "in_progress" | "completed";
type WorkItemEventResponse = {
  actorUserId: string;
  actorDisplayName: string;
  action: "created" | "status_changed" | "updated";
  fromStatus: WorkItemStatus | null;
  toStatus: WorkItemStatus | null;
  comment: string | null;
  occurredAt: string;
};
type WorkItemResponse = {
  id: string;
  groupId: string;
  assignmentId: string | null;
  title: string;
  description: string;
  assignedUserId: string | null;
  createdByUserId: string | null;
  status: WorkItemStatus;
  completionComment: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  events: WorkItemEventResponse[];
};
type GithubConnectionResponse = { connected: boolean; githubUsername: string | null; scope: string | null };
type GithubRepositoryChoice = { id: number; name: string; fullName: string; owner: string; private: boolean; htmlUrl: string; cloneUrl: string; description: string | null; updatedAt: string | null; pushedAt: string | null };
type StudentGithubRepositoryCreateResponse = { group: GroupResponse; invited: string[]; skipped: Array<{ userId: string; displayName: string; reason: string }> };
type GroupGithubRepositoryAccessReason = null | "no_repository" | "no_repository_token" | "missing_github_username" | "not_collaborator" | "check_failed";
type GroupGithubAccessMemberResponse = MemberResponse & { hasRepositoryAccess: boolean | null; repositoryAccessReason: GroupGithubRepositoryAccessReason };
type GroupGithubAccessResponse = { group: GroupResponse; members: GroupGithubAccessMemberResponse[] };

type GithubOAuthEnvSnapshot = {
  clientId: string | undefined;
  clientSecret: string | undefined;
  studentRedirectUri: string | undefined;
  stateSecret: string | undefined;
  studentScopes: string | undefined;
  legacyStudentScopes: string | undefined;
};

function restoreEnvValue(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function configureStudentGithubOAuthEnv(): GithubOAuthEnvSnapshot {
  const previousEnv = {
    clientId: process.env.GITHUB_OAUTH_CLIENT_ID,
    clientSecret: process.env.GITHUB_OAUTH_CLIENT_SECRET,
    studentRedirectUri: process.env.GITHUB_STUDENT_OAUTH_REDIRECT_URI,
    stateSecret: process.env.GITHUB_OAUTH_STATE_SECRET,
    studentScopes: process.env.GITHUB_STUDENT_OAUTH_SCOPES,
    legacyStudentScopes: process.env.GITHUB_OAUTH_STUDENT_SCOPES,
  };
  process.env.GITHUB_OAUTH_CLIENT_ID = "client-id";
  process.env.GITHUB_OAUTH_CLIENT_SECRET = "client-secret";
  process.env.GITHUB_STUDENT_OAUTH_REDIRECT_URI = "http://localhost:3000/auth/student/github/callback";
  process.env.GITHUB_OAUTH_STATE_SECRET = "state-secret";
  delete process.env.GITHUB_STUDENT_OAUTH_SCOPES;
  delete process.env.GITHUB_OAUTH_STUDENT_SCOPES;
  return previousEnv;
}

function restoreGithubOAuthEnv(previousEnv: GithubOAuthEnvSnapshot) {
  restoreEnvValue("GITHUB_OAUTH_CLIENT_ID", previousEnv.clientId);
  restoreEnvValue("GITHUB_OAUTH_CLIENT_SECRET", previousEnv.clientSecret);
  restoreEnvValue("GITHUB_STUDENT_OAUTH_REDIRECT_URI", previousEnv.studentRedirectUri);
  restoreEnvValue("GITHUB_OAUTH_STATE_SECRET", previousEnv.stateSecret);
  restoreEnvValue("GITHUB_STUDENT_OAUTH_SCOPES", previousEnv.studentScopes);
  restoreEnvValue("GITHUB_OAUTH_STUDENT_SCOPES", previousEnv.legacyStudentScopes);
}

function fetchRequestUrl(input: string | URL | Request) {
  return input instanceof Request ? input.url : String(input);
}

function fetchRequestHeaders(input: string | URL | Request, init?: RequestInit) {
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  if (init?.headers) {
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  }
  return headers;
}

function userCount() {
  const row = sqlite.query("SELECT count(*) AS count FROM users").get();
  if (!row || typeof row !== "object" || !("count" in row) || typeof row.count !== "number") {
    throw new Error("Could not read user count");
  }
  return row.count;
}

async function connectStudentViaGithubOAuth(input: { userId?: string; returnTo?: string } = {}): Promise<UserResponse> {
  const params = new URLSearchParams({ returnTo: input.returnTo ?? "/account" });
  if (input.userId) params.set("userId", input.userId);

  const startResponse = await app.request(`/auth/student/github/start?${params.toString()}`);
  expect(startResponse.status).toBe(302);
  const authorizeUrl = new URL(startResponse.headers.get("location")!);
  expect(authorizeUrl.searchParams.get("scope")).toBe("read:user repo");
  const state = authorizeUrl.searchParams.get("state");
  expect(state).toBeTruthy();

  const callbackResponse = await app.request(`/auth/student/github/callback?code=student-code&state=${encodeURIComponent(state!)}`);
  expect(callbackResponse.status).toBe(302);
  const loginToken = new URL(callbackResponse.headers.get("location")!, "http://localhost").searchParams.get("github_login_token");
  expect(loginToken).toBeTruthy();

  const sessionResponse = await app.request(`/auth/student/github/session?token=${encodeURIComponent(loginToken!)}`);
  expect(sessionResponse.status).toBe(200);
  return sessionResponse.json() as Promise<UserResponse>;
}


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

  test("students can sign in and link accounts through GitHub OAuth", async () => {
    const existingStudent = await postJson<UserResponse>("/auth/student/register", { username: "existing", password: "password123", displayName: "Existing Student" });
    const previousEnv = {
      clientId: process.env.GITHUB_OAUTH_CLIENT_ID,
      clientSecret: process.env.GITHUB_OAUTH_CLIENT_SECRET,
      studentRedirectUri: process.env.GITHUB_STUDENT_OAUTH_REDIRECT_URI,
      stateSecret: process.env.GITHUB_OAUTH_STATE_SECRET,
      studentScopes: process.env.GITHUB_STUDENT_OAUTH_SCOPES,
      legacyStudentScopes: process.env.GITHUB_OAUTH_STUDENT_SCOPES,
    };
    const originalFetch = globalThis.fetch;
    let nextGithubProfile = { id: 67890, login: "student-octocat", name: "Student Octocat" };

    try {
      delete process.env.GITHUB_OAUTH_CLIENT_ID;
      delete process.env.GITHUB_OAUTH_CLIENT_SECRET;
      delete process.env.GITHUB_STUDENT_OAUTH_REDIRECT_URI;
      delete process.env.GITHUB_OAUTH_STATE_SECRET;
      delete process.env.GITHUB_STUDENT_OAUTH_SCOPES;
      delete process.env.GITHUB_OAUTH_STUDENT_SCOPES;
      const missingConfigResponse = await app.request("/auth/student/github/start?returnTo=/");
      expect(missingConfigResponse.status).toBe(302);
      expect(missingConfigResponse.headers.get("location")).toBe("/?github_oauth=missing_config");

      process.env.GITHUB_OAUTH_CLIENT_ID = "client-id";
      process.env.GITHUB_OAUTH_CLIENT_SECRET = "client-secret";
      process.env.GITHUB_STUDENT_OAUTH_REDIRECT_URI = "http://localhost:3000/auth/student/github/callback";
      process.env.GITHUB_OAUTH_STATE_SECRET = "state-secret";

      const startResponse = await app.request("/auth/student/github/start?returnTo=/");
      expect(startResponse.status).toBe(302);
      const location = startResponse.headers.get("location");
      expect(location).toContain("https://github.com/login/oauth/authorize");
      expect(new URL(location!).searchParams.get("scope")).toBe("read:user repo");
      const state = new URL(location!).searchParams.get("state");
      expect(state).toBeTruthy();

      globalThis.fetch = (async (input: string | URL | Request) => {
        const url = String(input);
        if (url === "https://github.com/login/oauth/access_token") {
          return Response.json({ access_token: "student-token", token_type: "bearer", scope: "read:user repo" });
        }
        if (url === "https://api.github.com/user") {
          return Response.json(nextGithubProfile);
        }
        return new Response("unexpected", { status: 500 });
      }) as typeof fetch;

      const callbackResponse = await app.request(`/auth/student/github/callback?code=abc123&state=${encodeURIComponent(state!)}`);
      expect(callbackResponse.status).toBe(302);
      const callbackLocation = callbackResponse.headers.get("location");
      expect(callbackLocation).toContain("github_oauth=student_connected");
      const loginToken = new URL(callbackLocation!, "http://localhost").searchParams.get("github_login_token");
      expect(loginToken).toBeTruthy();

      const sessionResponse = await app.request(`/auth/student/github/session?token=${encodeURIComponent(loginToken!)}`);
      expect(sessionResponse.status).toBe(200);
      const githubStudent = await sessionResponse.json() as UserResponse;
      expect(githubStudent.displayName).toBe("Student Octocat");
      expect(githubStudent.githubUserId).toBe("67890");
      expect(githubStudent.githubUsername).toBe("student-octocat");
      expect(githubStudent.password).toBeUndefined();

      nextGithubProfile = { id: 11111, login: "linked-octocat", name: "Linked Octocat" };
      const linkStartResponse = await app.request(`/auth/student/github/start?userId=${existingStudent.id}&returnTo=/account`);
      expect(linkStartResponse.status).toBe(302);
      const linkState = new URL(linkStartResponse.headers.get("location")!).searchParams.get("state");
      expect(linkState).toBeTruthy();

      const linkCallbackResponse = await app.request(`/auth/student/github/callback?code=link123&state=${encodeURIComponent(linkState!)}`);
      expect(linkCallbackResponse.status).toBe(302);
      const linkLoginToken = new URL(linkCallbackResponse.headers.get("location")!, "http://localhost").searchParams.get("github_login_token");
      expect(linkLoginToken).toBeTruthy();

      const linkedSessionResponse = await app.request(`/auth/student/github/session?token=${encodeURIComponent(linkLoginToken!)}`);
      expect(linkedSessionResponse.status).toBe(200);
      const linkedStudent = await linkedSessionResponse.json() as UserResponse;
      expect(linkedStudent.id).toBe(existingStudent.id);
      expect(linkedStudent.githubUserId).toBe("11111");
      expect(linkedStudent.githubUsername).toBe("linked-octocat");
    } finally {
      globalThis.fetch = originalFetch;
      if (previousEnv.clientId === undefined) delete process.env.GITHUB_OAUTH_CLIENT_ID;
      else process.env.GITHUB_OAUTH_CLIENT_ID = previousEnv.clientId;
      if (previousEnv.clientSecret === undefined) delete process.env.GITHUB_OAUTH_CLIENT_SECRET;
      else process.env.GITHUB_OAUTH_CLIENT_SECRET = previousEnv.clientSecret;
      if (previousEnv.studentRedirectUri === undefined) delete process.env.GITHUB_STUDENT_OAUTH_REDIRECT_URI;
      else process.env.GITHUB_STUDENT_OAUTH_REDIRECT_URI = previousEnv.studentRedirectUri;
      if (previousEnv.stateSecret === undefined) delete process.env.GITHUB_OAUTH_STATE_SECRET;
      else process.env.GITHUB_OAUTH_STATE_SECRET = previousEnv.stateSecret;
      if (previousEnv.studentScopes === undefined) delete process.env.GITHUB_STUDENT_OAUTH_SCOPES;
      else process.env.GITHUB_STUDENT_OAUTH_SCOPES = previousEnv.studentScopes;
      if (previousEnv.legacyStudentScopes === undefined) delete process.env.GITHUB_OAUTH_STUDENT_SCOPES;
      else process.env.GITHUB_OAUTH_STUDENT_SCOPES = previousEnv.legacyStudentScopes;
    }
  });

  test("student GitHub OAuth links username-matching student instead of creating a duplicate", async () => {
    const existingStudent = await postJson<UserResponse>("/auth/student/register", { username: "matching-octocat", password: "password123", displayName: "Matching Student" });
    const previousEnv = configureStudentGithubOAuthEnv();
    const originalFetch = globalThis.fetch;
    const existingUserCount = userCount();

    try {
      globalThis.fetch = (async (input: string | URL | Request) => {
        const url = fetchRequestUrl(input);
        if (url === "https://github.com/login/oauth/access_token") {
          return Response.json({ access_token: "matching-token", token_type: "bearer", scope: "read:user repo" });
        }
        if (url === "https://api.github.com/user") {
          return Response.json({ id: 555001, login: "matching-octocat", name: "GitHub Matching Octocat", email: "matching-octocat@example.edu" });
        }
        return new Response(`unexpected GitHub request: ${url}`, { status: 500 });
      }) as typeof fetch;

      const linkedStudent = await connectStudentViaGithubOAuth({ returnTo: "/account" });
      expect(linkedStudent.id).toBe(existingStudent.id);
      expect(linkedStudent.displayName).toBe("Matching Student");
      expect(linkedStudent.githubUserId).toBe("555001");
      expect(linkedStudent.githubUsername).toBe("matching-octocat");
      expect(userCount()).toBe(existingUserCount);

      const passwordLogin = await postJson<UserResponse>("/auth/student/login", { username: "matching-octocat", password: "password123" });
      expect(passwordLogin.id).toBe(existingStudent.id);
      expect(passwordLogin.githubUsername).toBe("matching-octocat");
    } finally {
      globalThis.fetch = originalFetch;
      restoreGithubOAuthEnv(previousEnv);
    }
  });

  test("student GitHub OAuth stores the repo token used for repository listing", async () => {
    const previousEnv = configureStudentGithubOAuthEnv();
    const originalFetch = globalThis.fetch;
    const repositoryRequests: Array<{ authorization: string | null; affiliation: string | null; perPage: string | null }> = [];

    try {
      globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const url = fetchRequestUrl(input);
        if (url === "https://github.com/login/oauth/access_token") {
          return Response.json({ access_token: "student-repo-token", token_type: "bearer", scope: "read:user repo" });
        }
        if (url === "https://api.github.com/user") {
          return Response.json({ id: 24680, login: "student-octocat", name: "Student Octocat" });
        }

        const parsed = new URL(url);
        if (parsed.origin === "https://api.github.com" && parsed.pathname === "/user/repos") {
          repositoryRequests.push({
            authorization: fetchRequestHeaders(input, init).get("authorization"),
            affiliation: parsed.searchParams.get("affiliation"),
            perPage: parsed.searchParams.get("per_page"),
          });
          return Response.json([
            {
              id: 1001,
              name: "assignment-one",
              full_name: "student-octocat/assignment-one",
              owner: { login: "student-octocat" },
              private: true,
              html_url: "https://github.com/student-octocat/assignment-one",
              clone_url: "https://github.com/student-octocat/assignment-one.git",
            },
            {
              id: 1002,
              name: "team-project",
              full_name: "course-org/team-project",
              owner: { login: "course-org" },
              private: false,
              html_url: "https://github.com/course-org/team-project",
              clone_url: "https://github.com/course-org/team-project.git",
            },
          ]);
        }

        return new Response(`unexpected GitHub request: ${url}`, { status: 500 });
      }) as typeof fetch;

      const student = await connectStudentViaGithubOAuth({ returnTo: "/repositories" });
      expect(student.githubUsername).toBe("student-octocat");

      const repositoriesResponse = await app.request(`/users/${student.id}/github/repositories`);
      expect(repositoriesResponse.status).toBe(200);
      const repositories = await repositoriesResponse.json() as GithubRepositoryChoice[];
      const repositoryChoices = repositories.map((repository) => ({
        id: repository.id,
        name: repository.name,
        fullName: repository.fullName,
        owner: repository.owner,
        private: repository.private,
        htmlUrl: repository.htmlUrl,
        cloneUrl: repository.cloneUrl,
      })).sort((left, right) => left.id - right.id);
      expect(repositoryChoices).toEqual([
        {
          id: 1001,
          name: "assignment-one",
          fullName: "student-octocat/assignment-one",
          owner: "student-octocat",
          private: true,
          htmlUrl: "https://github.com/student-octocat/assignment-one",
          cloneUrl: "https://github.com/student-octocat/assignment-one.git",
        },
        {
          id: 1002,
          name: "team-project",
          fullName: "course-org/team-project",
          owner: "course-org",
          private: false,
          htmlUrl: "https://github.com/course-org/team-project",
          cloneUrl: "https://github.com/course-org/team-project.git",
        },
      ]);
      expect(repositoryRequests).toEqual([
        { authorization: "Bearer student-repo-token", affiliation: "owner,collaborator,organization_member", perPage: "100" },
      ]);
    } finally {
      globalThis.fetch = originalFetch;
      restoreGithubOAuthEnv(previousEnv);
    }
  });

  test("group member can connect an accessible GitHub repository with their student token", async () => {
    const professor = await postJson<ProfessorResponse>("/auth/professor/register", { username: "student-repo-prof", password: "password123", displayName: "Professor" });
    const course = await postJson<CourseResponse>("/courses", { professorId: professor.id, name: "CS 450" });
    const assignment = await postJson<AssignmentResponse>("/assignments", { professorId: professor.id, courseId: course.id, name: "Capstone" });
    const group = await postJson<GroupResponse>("/groups", { professorId: professor.id, assignmentId: assignment.id, name: "Team Student Repo" });
    const student = await postJson<UserResponse>("/auth/student/register", { username: "student-repo-member", password: "password123", displayName: "Student Member" });
    await postJson<MemberResponse>("/courses/join", { userId: student.id, joinCode: course.joinCode });
    await postJson<MemberResponse>("/groups/join", { userId: student.id, joinCode: group.joinCode });

    const previousEnv = configureStudentGithubOAuthEnv();
    const originalFetch = globalThis.fetch;
    const validationRequests: Array<{ path: string; authorization: string | null }> = [];

    try {
      globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const url = fetchRequestUrl(input);
        if (url === "https://github.com/login/oauth/access_token") {
          return Response.json({ access_token: "student-connect-token", token_type: "bearer", scope: "read:user repo" });
        }
        if (url === "https://api.github.com/user") {
          return Response.json({ id: 13579, login: "student-octocat", name: "Student Octocat" });
        }

        const parsed = new URL(url);
        if (parsed.origin === "https://api.github.com" && parsed.pathname === "/repos/student-octocat/assignment-one") {
          validationRequests.push({ path: parsed.pathname, authorization: fetchRequestHeaders(input, init).get("authorization") });
          return Response.json({
            id: 1001,
            name: "assignment-one",
            full_name: "student-octocat/assignment-one",
            owner: { login: "student-octocat" },
            private: true,
            html_url: "https://github.com/student-octocat/assignment-one",
            clone_url: "https://github.com/student-octocat/assignment-one.git",
          });
        }

        return new Response(`unexpected GitHub request: ${url}`, { status: 500 });
      }) as typeof fetch;

      const linkedStudent = await connectStudentViaGithubOAuth({ userId: student.id, returnTo: "/account" });
      expect(linkedStudent.id).toBe(student.id);

      const updated = await patchJson<GroupResponse>(`/groups/${group.id}/github/student`, {
        userId: student.id,
        githubRepoUrl: "https://github.com/student-octocat/assignment-one",
      });
      expect(updated.githubRepoUrl).toBe("https://github.com/student-octocat/assignment-one");
      expect(updated.githubOwner).toBe("student-octocat");
      expect(updated.githubRepo).toBe("assignment-one");
      expect(updated.githubAccessUserId).toBe(student.id);

      const persistedResponse = await app.request(`/groups/${group.id}`);
      expect(persistedResponse.status).toBe(200);
      const persisted = await persistedResponse.json() as GroupResponse;
      expect(persisted.githubRepoUrl).toBe("https://github.com/student-octocat/assignment-one");
      expect(persisted.githubOwner).toBe("student-octocat");
      expect(persisted.githubRepo).toBe("assignment-one");
      expect(persisted.githubAccessUserId).toBe(student.id);
      expect(validationRequests).toEqual([
        { path: "/repos/student-octocat/assignment-one", authorization: "Bearer student-connect-token" },
      ]);
    } finally {
      globalThis.fetch = originalFetch;
      restoreGithubOAuthEnv(previousEnv);
    }
  });

  test("group repository access status checks collaborators and missing GitHub usernames", async () => {
    const professor = await postJson<ProfessorResponse>("/auth/professor/register", { username: "access-status-prof", password: "password123", displayName: "Professor" });
    const course = await postJson<CourseResponse>("/courses", { professorId: professor.id, name: "CS 455" });
    const assignment = await postJson<AssignmentResponse>("/assignments", { professorId: professor.id, courseId: course.id, name: "Access Audit" });
    const group = await postJson<GroupResponse>("/groups", { professorId: professor.id, assignmentId: assignment.id, name: "Team Access Status" });
    const owner = await postJson<UserResponse>("/auth/student/register", { username: "access-owner", password: "password123", displayName: "Access Owner" });
    const collaborator = await postJson<UserResponse>("/auth/student/register", { username: "access-collaborator", password: "password123", displayName: "Access Collaborator" });
    const missingGithub = await postJson<UserResponse>("/auth/student/register", { username: "access-missing", password: "password123", displayName: "Missing GitHub" });
    const denied = await postJson<UserResponse>("/auth/student/register", { username: "access-denied", password: "password123", displayName: "Access Denied" });
    for (const student of [owner, collaborator, missingGithub, denied]) {
      await postJson<MemberResponse>("/courses/join", { userId: student.id, joinCode: course.joinCode });
      await postJson<MemberResponse>("/groups/join", { userId: student.id, joinCode: group.joinCode });
    }
    await patchJson<UserResponse>(`/users/${collaborator.id}/github`, { githubUsername: "partner-github" });
    await patchJson<UserResponse>(`/users/${denied.id}/github`, { githubUsername: "blocked-github" });

    const previousEnv = configureStudentGithubOAuthEnv();
    const originalFetch = globalThis.fetch;
    const collaboratorRequests: Array<{ path: string; authorization: string | null }> = [];

    try {
      globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const url = fetchRequestUrl(input);
        if (url === "https://github.com/login/oauth/access_token") {
          return Response.json({ access_token: "access-status-token", token_type: "bearer", scope: "read:user repo" });
        }
        if (url === "https://api.github.com/user") {
          return Response.json({ id: 445566, login: "repo-owner", name: "Repository Owner" });
        }

        const parsed = new URL(url);
        if (parsed.origin === "https://api.github.com" && parsed.pathname === "/repos/repo-owner/team-status") {
          return Response.json({
            id: 3001,
            name: "team-status",
            full_name: "repo-owner/team-status",
            owner: { login: "repo-owner" },
            private: true,
            html_url: "https://github.com/repo-owner/team-status",
            clone_url: "https://github.com/repo-owner/team-status.git",
          });
        }

        if (parsed.origin === "https://api.github.com" && parsed.pathname.startsWith("/repos/repo-owner/team-status/collaborators/")) {
          collaboratorRequests.push({ path: parsed.pathname, authorization: fetchRequestHeaders(input, init).get("authorization") });
          const username = decodeURIComponent(parsed.pathname.split("/").at(-1) ?? "");
          if (username === "repo-owner" || username === "partner-github") return new Response(null, { status: 204 });
          if (username === "blocked-github") return Response.json({ message: "Not Found" }, { status: 404 });
        }

        return new Response(`unexpected GitHub request: ${url}`, { status: 500 });
      }) as typeof fetch;

      const linkedOwner = await connectStudentViaGithubOAuth({ userId: owner.id, returnTo: "/account" });
      expect(linkedOwner.githubUsername).toBe("repo-owner");
      const connectedGroup = await patchJson<GroupResponse>(`/groups/${group.id}/github/student`, {
        userId: owner.id,
        githubRepoUrl: "https://github.com/repo-owner/team-status",
      });
      expect(connectedGroup.githubAccessUserId).toBe(owner.id);

      const statusResponse = await app.request(`/groups/${group.id}/github/access`);
      expect(statusResponse.status).toBe(200);
      const status = await statusResponse.json() as GroupGithubAccessResponse;
      expect(status.group.id).toBe(group.id);
      expect(status.group.githubRepoUrl).toBe("https://github.com/repo-owner/team-status");
      expect(status.group.githubAccessUserId).toBe(owner.id);

      const membersById = Object.fromEntries(status.members.map((member) => [member.userId, member]));
      expect(membersById[owner.id]).toMatchObject({ userId: owner.id, displayName: "Access Owner", githubUsername: "repo-owner", hasRepositoryAccess: true, repositoryAccessReason: null });
      expect(membersById[collaborator.id]).toMatchObject({ userId: collaborator.id, displayName: "Access Collaborator", githubUsername: "partner-github", hasRepositoryAccess: true, repositoryAccessReason: null });
      expect(membersById[missingGithub.id]).toMatchObject({ userId: missingGithub.id, displayName: "Missing GitHub", githubUsername: null, hasRepositoryAccess: false, repositoryAccessReason: "missing_github_username" });
      expect(membersById[denied.id]).toMatchObject({ userId: denied.id, displayName: "Access Denied", githubUsername: "blocked-github", hasRepositoryAccess: false, repositoryAccessReason: "not_collaborator" });
      expect(collaboratorRequests).toEqual([
        { path: "/repos/repo-owner/team-status/collaborators/repo-owner", authorization: "Bearer access-status-token" },
        { path: "/repos/repo-owner/team-status/collaborators/partner-github", authorization: "Bearer access-status-token" },
        { path: "/repos/repo-owner/team-status/collaborators/blocked-github", authorization: "Bearer access-status-token" },
      ]);
    } finally {
      globalThis.fetch = originalFetch;
      restoreGithubOAuthEnv(previousEnv);
    }
  });

  test("student GitHub repository connection rejects non-members", async () => {
    const professor = await postJson<ProfessorResponse>("/auth/professor/register", { username: "student-repo-owner", password: "password123", displayName: "Professor" });
    const course = await postJson<CourseResponse>("/courses", { professorId: professor.id, name: "CS 451" });
    const assignment = await postJson<AssignmentResponse>("/assignments", { professorId: professor.id, courseId: course.id, name: "Project" });
    const group = await postJson<GroupResponse>("/groups", { professorId: professor.id, assignmentId: assignment.id, name: "Team Closed" });
    const nonMember = await postJson<UserResponse>("/auth/student/register", { username: "not-in-group", password: "password123", displayName: "Not In Group" });
    await postJson<MemberResponse>("/courses/join", { userId: nonMember.id, joinCode: course.joinCode });

    const previousEnv = configureStudentGithubOAuthEnv();
    const originalFetch = globalThis.fetch;
    const validationRequests: string[] = [];

    try {
      globalThis.fetch = (async (input: string | URL | Request) => {
        const url = fetchRequestUrl(input);
        if (url === "https://github.com/login/oauth/access_token") {
          return Response.json({ access_token: "non-member-token", token_type: "bearer", scope: "read:user repo" });
        }
        if (url === "https://api.github.com/user") {
          return Response.json({ id: 97531, login: "outside-octocat", name: "Outside Octocat" });
        }

        const parsed = new URL(url);
        if (parsed.origin === "https://api.github.com" && parsed.pathname.startsWith("/repos/")) {
          validationRequests.push(parsed.pathname);
          return Response.json({ id: 1003, name: "assignment-one", full_name: "outside-octocat/assignment-one", owner: { login: "outside-octocat" }, private: true, html_url: "https://github.com/outside-octocat/assignment-one", clone_url: "https://github.com/outside-octocat/assignment-one.git" });
        }

        return new Response(`unexpected GitHub request: ${url}`, { status: 500 });
      }) as typeof fetch;

      await connectStudentViaGithubOAuth({ userId: nonMember.id, returnTo: "/account" });
      await patchJson<{ error: string }>(`/groups/${group.id}/github/student`, {
        userId: nonMember.id,
        githubRepoUrl: "https://github.com/outside-octocat/assignment-one",
      }, 403);

      const persistedResponse = await app.request(`/groups/${group.id}`);
      expect(persistedResponse.status).toBe(200);
      const persisted = await persistedResponse.json() as GroupResponse;
      expect(persisted.githubRepoUrl).toBeNull();
      expect(persisted.githubAccessUserId ?? null).toBeNull();
      expect(validationRequests).toEqual(["/repos/outside-octocat/assignment-one"]);
    } finally {
      globalThis.fetch = originalFetch;
      restoreGithubOAuthEnv(previousEnv);
    }
  });

  test("student GitHub repository connection rejects repos their token cannot access", async () => {
    const professor = await postJson<ProfessorResponse>("/auth/professor/register", { username: "student-repo-inaccessible-prof", password: "password123", displayName: "Professor" });
    const course = await postJson<CourseResponse>("/courses", { professorId: professor.id, name: "CS 452" });
    const assignment = await postJson<AssignmentResponse>("/assignments", { professorId: professor.id, courseId: course.id, name: "Project" });
    const group = await postJson<GroupResponse>("/groups", { professorId: professor.id, assignmentId: assignment.id, name: "Team Private" });
    const student = await postJson<UserResponse>("/auth/student/register", { username: "inaccessible-repo-student", password: "password123", displayName: "Repo Student" });
    await postJson<MemberResponse>("/courses/join", { userId: student.id, joinCode: course.joinCode });
    await postJson<MemberResponse>("/groups/join", { userId: student.id, joinCode: group.joinCode });

    const previousEnv = configureStudentGithubOAuthEnv();
    const originalFetch = globalThis.fetch;
    const validationRequests: Array<{ path: string; authorization: string | null }> = [];

    try {
      globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const url = fetchRequestUrl(input);
        if (url === "https://github.com/login/oauth/access_token") {
          return Response.json({ access_token: "student-denied-token", token_type: "bearer", scope: "read:user repo" });
        }
        if (url === "https://api.github.com/user") {
          return Response.json({ id: 86420, login: "student-octocat", name: "Student Octocat" });
        }

        const parsed = new URL(url);
        if (parsed.origin === "https://api.github.com" && parsed.pathname === "/repos/student-octocat/private-assignment") {
          validationRequests.push({ path: parsed.pathname, authorization: fetchRequestHeaders(input, init).get("authorization") });
          return Response.json({ message: "Not Found" }, { status: 404 });
        }

        return new Response(`unexpected GitHub request: ${url}`, { status: 500 });
      }) as typeof fetch;

      await connectStudentViaGithubOAuth({ userId: student.id, returnTo: "/account" });
      await patchJson<{ error: string }>(`/groups/${group.id}/github/student`, {
        userId: student.id,
        githubRepoUrl: "https://github.com/student-octocat/private-assignment",
      }, 403);

      const persistedResponse = await app.request(`/groups/${group.id}`);
      expect(persistedResponse.status).toBe(200);
      const persisted = await persistedResponse.json() as GroupResponse;
      expect(persisted.githubRepoUrl).toBeNull();
      expect(persisted.githubAccessUserId ?? null).toBeNull();
      expect(validationRequests).toEqual([
        { path: "/repos/student-octocat/private-assignment", authorization: "Bearer student-denied-token" },
      ]);
    } finally {
      globalThis.fetch = originalFetch;
      restoreGithubOAuthEnv(previousEnv);
    }
  });

  test("student can create a GitHub repository and invite group collaborators", async () => {
    const professor = await postJson<ProfessorResponse>("/auth/professor/register", { username: "student-create-prof", password: "password123", displayName: "Professor" });
    const course = await postJson<CourseResponse>("/courses", { professorId: professor.id, name: "CS 453" });
    const assignment = await postJson<AssignmentResponse>("/assignments", { professorId: professor.id, courseId: course.id, name: "Group Project" });
    const group = await postJson<GroupResponse>("/groups", { professorId: professor.id, assignmentId: assignment.id, name: "Team Create Repo" });
    const creator = await postJson<UserResponse>("/auth/student/register", { username: "repo-creator", password: "password123", displayName: "Repo Creator" });
    const invitedMember = await postJson<UserResponse>("/auth/student/register", { username: "repo-invitee", password: "password123", displayName: "Repo Invitee" });
    const skippedMember = await postJson<UserResponse>("/auth/student/register", { username: "repo-skipped", password: "password123", displayName: "Repo Skipped" });
    for (const student of [creator, invitedMember, skippedMember]) {
      await postJson<MemberResponse>("/courses/join", { userId: student.id, joinCode: course.joinCode });
      await postJson<MemberResponse>("/groups/join", { userId: student.id, joinCode: group.joinCode });
    }
    await patchJson<UserResponse>(`/users/${invitedMember.id}/github`, { githubUsername: "pair-octocat" });

    const previousEnv = configureStudentGithubOAuthEnv();
    const originalFetch = globalThis.fetch;
    const createRequests: Array<{ path: string; method: string | undefined; authorization: string | null; body: Record<string, unknown> }> = [];
    const collaboratorRequests: Array<{ path: string; method: string | undefined; authorization: string | null; body: Record<string, unknown> }> = [];

    try {
      globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const url = fetchRequestUrl(input);
        if (url === "https://github.com/login/oauth/access_token") {
          return Response.json({ access_token: "creator-repo-token", token_type: "bearer", scope: "read:user repo" });
        }
        if (url === "https://api.github.com/user") {
          return Response.json({ id: 112233, login: "creator-octocat", name: "Creator Octocat" });
        }

        const parsed = new URL(url);
        if (parsed.origin === "https://api.github.com" && parsed.pathname === "/user/repos") {
          createRequests.push({
            path: parsed.pathname,
            method: init?.method,
            authorization: fetchRequestHeaders(input, init).get("authorization"),
            body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
          });
          return Response.json({
            id: 2001,
            name: "team-assignment",
            full_name: "creator-octocat/team-assignment",
            owner: { login: "creator-octocat" },
            private: false,
            html_url: "https://github.com/creator-octocat/team-assignment",
            clone_url: "https://github.com/creator-octocat/team-assignment.git",
          });
        }

        if (parsed.origin === "https://api.github.com" && parsed.pathname === "/repos/creator-octocat/team-assignment/collaborators/pair-octocat") {
          collaboratorRequests.push({
            path: parsed.pathname,
            method: init?.method,
            authorization: fetchRequestHeaders(input, init).get("authorization"),
            body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
          });
          return new Response(null, { status: 204 });
        }

        return new Response(`unexpected GitHub request: ${url}`, { status: 500 });
      }) as typeof fetch;

      await connectStudentViaGithubOAuth({ userId: creator.id, returnTo: "/account" });
      const createResponse = await postJson<StudentGithubRepositoryCreateResponse>(`/groups/${group.id}/github/student/create`, {
        userId: creator.id,
        name: "team-assignment",
        private: false,
      });

      expect(createResponse.group.githubRepoUrl).toBe("https://github.com/creator-octocat/team-assignment");
      expect(createResponse.group.githubOwner).toBe("creator-octocat");
      expect(createResponse.group.githubRepo).toBe("team-assignment");
      expect(createResponse.group.githubAccessUserId).toBe(creator.id);
      expect(createResponse.invited).toEqual(["pair-octocat"]);
      expect(createResponse.skipped).toEqual([
        { userId: skippedMember.id, displayName: "Repo Skipped", reason: "missing_github_username" },
      ]);
      expect(createRequests.map((request) => ({
        path: request.path,
        method: request.method,
        authorization: request.authorization,
        name: request.body.name,
        private: request.body.private,
      }))).toEqual([
        { path: "/user/repos", method: "POST", authorization: "Bearer creator-repo-token", name: "team-assignment", private: false },
      ]);
      expect(collaboratorRequests).toEqual([
        {
          path: "/repos/creator-octocat/team-assignment/collaborators/pair-octocat",
          method: "PUT",
          authorization: "Bearer creator-repo-token",
          body: { permission: "push" },
        },
      ]);

      const persistedResponse = await app.request(`/groups/${group.id}`);
      expect(persistedResponse.status).toBe(200);
      const persisted = await persistedResponse.json() as GroupResponse;
      expect(persisted.githubRepoUrl).toBe("https://github.com/creator-octocat/team-assignment");
      expect(persisted.githubOwner).toBe("creator-octocat");
      expect(persisted.githubRepo).toBe("team-assignment");
      expect(persisted.githubAccessUserId).toBe(creator.id);
    } finally {
      globalThis.fetch = originalFetch;
      restoreGithubOAuthEnv(previousEnv);
    }
  });

  test("student GitHub repository creation rejects non-members before creating a repo", async () => {
    const professor = await postJson<ProfessorResponse>("/auth/professor/register", { username: "student-create-guard-prof", password: "password123", displayName: "Professor" });
    const course = await postJson<CourseResponse>("/courses", { professorId: professor.id, name: "CS 454" });
    const assignment = await postJson<AssignmentResponse>("/assignments", { professorId: professor.id, courseId: course.id, name: "Guarded Project" });
    const group = await postJson<GroupResponse>("/groups", { professorId: professor.id, assignmentId: assignment.id, name: "Team Guarded" });
    const nonMember = await postJson<UserResponse>("/auth/student/register", { username: "repo-outsider", password: "password123", displayName: "Repo Outsider" });
    await postJson<MemberResponse>("/courses/join", { userId: nonMember.id, joinCode: course.joinCode });

    const previousEnv = configureStudentGithubOAuthEnv();
    const originalFetch = globalThis.fetch;
    const createRequests: string[] = [];

    try {
      globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const url = fetchRequestUrl(input);
        if (url === "https://github.com/login/oauth/access_token") {
          return Response.json({ access_token: "outsider-repo-token", token_type: "bearer", scope: "read:user repo" });
        }
        if (url === "https://api.github.com/user") {
          return Response.json({ id: 445566, login: "outsider-octocat", name: "Outsider Octocat" });
        }

        const parsed = new URL(url);
        if (parsed.origin === "https://api.github.com" && parsed.pathname === "/user/repos" && init?.method === "POST") {
          createRequests.push(parsed.pathname);
          return Response.json({
            id: 2002,
            name: "should-not-exist",
            full_name: "outsider-octocat/should-not-exist",
            owner: { login: "outsider-octocat" },
            private: true,
            html_url: "https://github.com/outsider-octocat/should-not-exist",
            clone_url: "https://github.com/outsider-octocat/should-not-exist.git",
          });
        }

        return new Response(`unexpected GitHub request: ${url}`, { status: 500 });
      }) as typeof fetch;

      await connectStudentViaGithubOAuth({ userId: nonMember.id, returnTo: "/account" });
      const response = await app.request(`/groups/${group.id}/github/student/create`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ userId: nonMember.id, name: "should-not-exist" }),
      });
      expect(response.status).toBe(403);
      const body = await response.json() as { error: string };
      expect(body.error).toBe("Student must belong to the group before creating a repository");
      expect(createRequests).toEqual([]);

      const persistedResponse = await app.request(`/groups/${group.id}`);
      expect(persistedResponse.status).toBe(200);
      const persisted = await persistedResponse.json() as GroupResponse;
      expect(persisted.githubRepoUrl).toBeNull();
      expect(persisted.githubAccessUserId ?? null).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
      restoreGithubOAuthEnv(previousEnv);
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


  test("multiple professors get isolated pages and course enrollment stays self-serve", async () => {
    const first = await postJson<ProfessorResponse>("/auth/professor/register", { username: "first-prof", password: "password123", displayName: "Dr First" });
    const second = await postJson<ProfessorResponse>("/auth/professor/register", { username: "second-prof", password: "password123", displayName: "Dr Second" });
    expect(first.pageSlug).toBe("dr-first");
    expect(second.pageSlug).toBe("dr-second");

    const firstCourse = await postJson<CourseResponse>("/courses", { professorId: first.id, name: "CS 201" });
    const secondCourse = await postJson<CourseResponse>("/courses", { professorId: second.id, name: "CS 301" });
    const student = await postJson<UserResponse>("/auth/student/register", { username: "ada@example.edu", password: "secret123", displayName: "Ada Lovelace" });
    await postJson<MemberResponse>("/courses/join", { joinCode: firstCourse.joinCode, userId: student.id });

    const removedImportResponse = await app.request(`/courses/${firstCourse.id}/import-students`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ professorId: first.id, csv: "name,username,email\nAda Lovelace,ada,ada@example.edu" }),
    });
    expect(removedImportResponse.status).toBe(404);

    const firstMembersResponse = await app.request(`/courses/${firstCourse.id}/members`);
    expect(firstMembersResponse.status).toBe(200);
    const firstMembers = await firstMembersResponse.json() as MemberResponse[];
    expect(firstMembers.map((member) => member.userId)).toEqual([student.id]);

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

  test("student work items track member-assigned progress for professor review", async () => {
    const professor = await postJson<ProfessorResponse>("/auth/professor/register", { username: "work-prof", password: "password123", displayName: "Professor" });
    const course = await postJson<CourseResponse>("/courses", { professorId: professor.id, name: "CS 460" });
    const assignment = await postJson<AssignmentResponse>("/assignments", { professorId: professor.id, courseId: course.id, name: "Group Milestone" });
    const group = await postJson<GroupResponse>("/groups", { professorId: professor.id, assignmentId: assignment.id, name: "Team Work Items" });
    const creator = await postJson<UserResponse>("/auth/student/register", { username: "work-creator", password: "password123", displayName: "Work Creator" });
    const assignee = await postJson<UserResponse>("/auth/student/register", { username: "work-assignee", password: "password123", displayName: "Work Assignee" });
    for (const student of [creator, assignee]) {
      await postJson<MemberResponse>("/courses/join", { userId: student.id, joinCode: course.joinCode });
      await postJson<MemberResponse>("/groups/join", { userId: student.id, joinCode: group.joinCode });
    }

    const created = await postJson<WorkItemResponse>(`/groups/${group.id}/work-items`, {
      userId: creator.id,
      title: "Build upload parser",
      description: "Accept professor CSV exports",
      assignedUserId: assignee.id,
    });
    expect(created.groupId).toBe(group.id);
    expect(created.assignmentId).toBe(assignment.id);
    expect(created.title).toBe("Build upload parser");
    expect(created.description).toBe("Accept professor CSV exports");
    expect(created.assignedUserId).toBe(assignee.id);
    expect(created.createdByUserId).toBe(creator.id);
    expect(created.status).toBe("assigned");
    expect(created.completionComment).toBeNull();
    expect(created.startedAt).toBeNull();
    expect(created.completedAt).toBeNull();
    expect(Date.parse(created.createdAt)).not.toBeNaN();
    expect(Date.parse(created.updatedAt)).not.toBeNaN();

    const inProgress = await patchJson<WorkItemResponse>(`/work-items/${created.id}`, {
      userId: assignee.id,
      status: "in_progress",
    });
    expect(inProgress.status).toBe("in_progress");
    expect(inProgress.startedAt).toBeTruthy();
    expect(Date.parse(inProgress.startedAt!)).not.toBeNaN();
    expect(inProgress.completedAt).toBeNull();
    expect(inProgress.completionComment).toBeNull();

    const completed = await patchJson<WorkItemResponse>(`/work-items/${created.id}`, {
      userId: assignee.id,
      status: "completed",
      completionComment: "Parser handles the professor export fixture.",
    });
    expect(completed.status).toBe("completed");
    expect(completed.startedAt).toBe(inProgress.startedAt);
    expect(completed.completedAt).toBeTruthy();
    expect(Date.parse(completed.completedAt!)).not.toBeNaN();
    expect(completed.completionComment).toBe("Parser handles the professor export fixture.");

    const professorListResponse = await app.request(`/groups/${group.id}/work-items?professorId=${professor.id}`);
    expect(professorListResponse.status).toBe(200);
    const professorList = await professorListResponse.json() as WorkItemResponse[];
    expect(professorList).toHaveLength(1);
    expect(professorList[0]).toMatchObject({
      id: created.id,
      groupId: group.id,
      assignmentId: assignment.id,
      title: "Build upload parser",
      description: "Accept professor CSV exports",
      assignedUserId: assignee.id,
      createdByUserId: creator.id,
      status: "completed",
      completionComment: "Parser handles the professor export fixture.",
      startedAt: inProgress.startedAt,
      completedAt: completed.completedAt,
    });
    const expectedEventTrail = [
      { actorUserId: creator.id, actorDisplayName: "Work Creator", action: "created", fromStatus: null, toStatus: "assigned", comment: null },
      { actorUserId: assignee.id, actorDisplayName: "Work Assignee", action: "status_changed", fromStatus: "assigned", toStatus: "in_progress", comment: null },
      { actorUserId: assignee.id, actorDisplayName: "Work Assignee", action: "status_changed", fromStatus: "in_progress", toStatus: "completed", comment: "Parser handles the professor export fixture." },
    ];
    const professorEventTrail = professorList[0].events.map((event) => ({
      actorUserId: event.actorUserId,
      actorDisplayName: event.actorDisplayName,
      action: event.action,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      comment: event.comment,
    }));
    expect(professorEventTrail).toEqual(expectedEventTrail);
    for (const event of professorList[0].events) {
      expect(Date.parse(event.occurredAt)).not.toBeNaN();
    }

    const studentListResponse = await app.request(`/groups/${group.id}/work-items?userId=${assignee.id}`);
    expect(studentListResponse.status).toBe(200);
    const studentList = await studentListResponse.json() as WorkItemResponse[];
    expect(studentList).toHaveLength(1);
    expect(studentList[0].events.map((event) => event.occurredAt)).toEqual(professorList[0].events.map((event) => event.occurredAt));
    expect(studentList[0].events.map((event) => ({
      actorUserId: event.actorUserId,
      actorDisplayName: event.actorDisplayName,
      action: event.action,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      comment: event.comment,
    }))).toEqual(expectedEventTrail);
  });

  test("work item membership rules reject outsiders and non-member assignees", async () => {
    const professor = await postJson<ProfessorResponse>("/auth/professor/register", { username: "work-guard-prof", password: "password123", displayName: "Professor" });
    const course = await postJson<CourseResponse>("/courses", { professorId: professor.id, name: "CS 461" });
    const assignment = await postJson<AssignmentResponse>("/assignments", { professorId: professor.id, courseId: course.id, name: "Guarded Milestone" });
    const group = await postJson<GroupResponse>("/groups", { professorId: professor.id, assignmentId: assignment.id, name: "Team Guarded Work" });
    const member = await postJson<UserResponse>("/auth/student/register", { username: "work-member", password: "password123", displayName: "Work Member" });
    const outsider = await postJson<UserResponse>("/auth/student/register", { username: "work-outsider", password: "password123", displayName: "Work Outsider" });
    await postJson<MemberResponse>("/courses/join", { userId: member.id, joinCode: course.joinCode });
    await postJson<MemberResponse>("/groups/join", { userId: member.id, joinCode: group.joinCode });
    await postJson<MemberResponse>("/courses/join", { userId: outsider.id, joinCode: course.joinCode });

    await postJson<{ error: string }>(`/groups/${group.id}/work-items`, {
      userId: outsider.id,
      title: "Should not be created",
    }, 403);
    await postJson<{ error: string }>(`/groups/${group.id}/work-items`, {
      userId: member.id,
      title: "Invalid assignee",
      assignedUserId: outsider.id,
    }, 403);

    const workItem = await postJson<WorkItemResponse>(`/groups/${group.id}/work-items`, {
      userId: member.id,
      title: "Write integration notes",
      assignedUserId: member.id,
    });

    await patchJson<{ error: string }>(`/work-items/${workItem.id}`, {
      userId: outsider.id,
      status: "in_progress",
    }, 403);
    await patchJson<{ error: string }>(`/work-items/${workItem.id}`, {
      userId: member.id,
      assignedUserId: outsider.id,
    }, 403);

    const professorListResponse = await app.request(`/groups/${group.id}/work-items?professorId=${professor.id}`);
    expect(professorListResponse.status).toBe(200);
    const professorList = await professorListResponse.json() as WorkItemResponse[];
    expect(professorList).toHaveLength(1);
    expect(professorList[0]).toMatchObject({
      id: workItem.id,
      assignedUserId: member.id,
      status: "assigned",
      completionComment: null,
      startedAt: null,
      completedAt: null,
    });
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
