import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";

const testRoot = mkdtempSync(join(tmpdir(), "miyagi-backend-test-"));
process.env.DB_PATH = join(testRoot, "app.test.sqlite");
process.env.GITHUB_MIRRORS_ROOT = join(testRoot, "mirrors");
process.env.GITHUB_OAUTH_CLIENT_ID = "test-client";
process.env.GITHUB_OAUTH_CLIENT_SECRET = "test-secret";
process.env.GITHUB_OAUTH_STATE_SECRET = "test-state-secret";
process.env.GITHUB_OAUTH_REDIRECT_URI = "http://localhost/auth/github/callback";

const [{ default: app }, { sqlite }, { parseGithubRepoUrl }, { User }, { Professor }, { signToken }] = await Promise.all([
  import("./index"),
  import("./db"),
  import("./github"),
  import("./user"),
  import("./professor"),
  import("./auth"),
]);

const professorUser = Effect.runSync(User.createWithGithub({ id: "auth-professor", login: "auth-professor", name: "Auth Professor" }));
const professor = Effect.runSync(Professor.createForUser(professorUser.id));
const otherProfessorUser = Effect.runSync(User.createWithGithub({ id: "other-professor", login: "other-professor", name: "Other Professor" }));
const otherProfessor = Effect.runSync(Professor.createForUser(otherProfessorUser.id));
const student = Effect.runSync(User.createWithGithub({ id: "auth-student", login: "auth-student", name: "Auth Student" }));
const sessionCookie = (identity: { role: "student" | "professor"; userId: string; professorId?: string }) => `miyagi_session=${signToken({
  ...identity,
  expiresAt: Date.now() + 60_000,
  nonce: crypto.randomUUID(),
})}`;
const professorCookie = sessionCookie({ role: "professor", userId: professorUser.id, professorId: professor.id });

afterAll(() => {
  sqlite.close();
  rmSync(testRoot, { recursive: true, force: true });
});

describe("backend foundation", () => {
  test("serves the health endpoint", async () => {
    const response = await app.request("/api/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  test("rejects unauthenticated application requests", async () => {
    const response = await app.request("/courses", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(response.status).toBe(401);
  });

  test("validates request bodies after authenticating", async () => {
    const response = await app.request("/courses", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: professorCookie },
      body: JSON.stringify({}),
    });
    expect(response.status).toBe(400);
    expect((await response.json() as { error: string }).error).toContain("name");
  });

  test("parses GitHub repository URLs", () => {
    expect(Effect.runSync(parseGithubRepoUrl("https://github.com/openai/openai-node"))).toEqual({ owner: "openai", repo: "openai-node" });
    expect(Effect.runSync(parseGithubRepoUrl("git@github.com:openai/openai-node.git"))).toEqual({ owner: "openai", repo: "openai-node" });
    expect(Effect.runSync(Effect.flip(parseGithubRepoUrl("https://example.com/repo"))).message).toContain("Invalid GitHub URL");
  });

  test("derives identity from the signed session instead of request data", async () => {
    const response = await app.request("/courses", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: professorCookie },
      body: JSON.stringify({ professorId: otherProfessor.id, name: "Effect 101" }),
    });
    expect(response.status).toBe(200);
    expect((await response.json() as { professorId: string }).professorId).toBe(professor.id);

    const forbiddenResponse = await app.request(`/courses/professor/${otherProfessor.id}`, { headers: { cookie: professorCookie } });
    expect(forbiddenResponse.status).toBe(403);
  });

  test("exchanges a login token for an HttpOnly session cookie", async () => {
    const token = signToken({ role: "student", userId: student.id, expiresAt: Date.now() + 60_000, nonce: crypto.randomUUID() });
    const response = await app.request(`https://miyagi.example/auth/student/github/session?token=${encodeURIComponent(token)}`);
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(response.status).toBe(200);
    expect(cookie).toContain("miyagi_session=");
    expect(cookie.toLowerCase()).toContain("httponly");
    expect(cookie.toLowerCase()).toContain("samesite=lax");
    expect(cookie.toLowerCase()).toContain("secure");

    const browserCookie = cookie.split(";")[0];
    const sessionResponse = await app.request("/auth/session", { headers: { cookie: browserCookie } });
    expect(sessionResponse.status).toBe(200);
    expect((await sessionResponse.json() as { role: string }).role).toBe("student");

    const logoutResponse = await app.request("/auth/logout", { method: "POST", headers: { cookie: browserCookie } });
    expect(logoutResponse.headers.get("set-cookie")?.toLowerCase()).toContain("max-age=0");
  });

  test("rejects tampered and wrong-role sessions", async () => {
    const tampered = `${professorCookie.slice(0, -1)}x`;
    expect((await app.request(`/courses/professor/${professor.id}`, { headers: { cookie: tampered } })).status).toBe(401);
    const studentCookie = sessionCookie({ role: "student", userId: student.id });
    expect((await app.request("/courses", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: studentCookie },
      body: JSON.stringify({ name: "Not allowed" }),
    })).status).toBe(401);
  });

  test("allows credentialed CORS only from configured frontend origins", async () => {
    const allowed = await app.request("/courses", {
      method: "OPTIONS",
      headers: { origin: "http://127.0.0.1:5173", "access-control-request-method": "POST" },
    });
    expect(allowed.headers.get("access-control-allow-origin")).toBe("http://127.0.0.1:5173");
    expect(allowed.headers.get("access-control-allow-credentials")).toBe("true");

    const rejected = await app.request("/courses", {
      method: "OPTIONS",
      headers: { origin: "https://attacker.example", "access-control-request-method": "POST" },
    });
    expect(rejected.headers.get("access-control-allow-origin")).toBeNull();
  });

  test("uses one GitHub callback for both account roles", async () => {
    for (const role of ["student", "professor"]) {
      const response = await app.request(`http://localhost/auth/${role}/github/start?returnTo=/`);
      const authorizeUrl = new URL(response.headers.get("location")!);
      expect(authorizeUrl.origin).toBe("https://github.com");
      expect(authorizeUrl.searchParams.get("redirect_uri")).toBe("http://localhost/auth/github/callback");
    }
    for (const callback of ["/auth/github/callback", "/auth/professor/github/callback", "/auth/student/github/callback"]) {
      const response = await app.request(callback);
      expect(response.headers.get("location")).toBe("/?github_oauth=missing_state");
    }
  });

  test("creates only the current product tables", () => {
    const tables = (sqlite.query("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[])
      .map(({ name }) => name);
    expect(tables).toContain("assignment_repositories");
    expect(tables).not.toContain("groups");
    expect(tables).not.toContain("projects");
    expect(tables).not.toContain("work_items");
  });
});
