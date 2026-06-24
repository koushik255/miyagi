import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { eq } from "drizzle-orm";
import app from "../src/index";
import { db } from "../src/db";
import { groups } from "../src/schema";

const JSON_HEADERS = { "content-type": "application/json" };
const decoder = new TextDecoder();
const GITHUB_FIXTURE_FILE = "miyagi-github-fixture.json";

type ProfessorResponse = { id: string; pageSlug: string };
type CourseResponse = { id: string; name: string; joinCode: string };
type AssignmentResponse = { id: string; name: string };
type UserResponse = { id: string; deviceHash: string; displayName: string; email?: string | null; githubUsername?: string | null };
type GroupImportResponse = {
  importedGroups: number;
  groups: Array<{
    group: { id: string; name: string; githubRepoUrl: string | null };
    importedMembers: Array<{ userId: string; githubUsername: string | null }>;
  }>;
};

type FixtureCommit = {
  message: string;
  filePath: string;
  body: string;
  authorName: string;
  authorEmail: string;
  githubUsername: string;
  daysAgo: number;
};

type CommitCacheEntry = {
  githubUsername: string;
  htmlUrl: string;
  committedAt: string;
};

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await app.request(path, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`${path} failed: ${response.status} ${await response.text()}`);
  return response.json() as Promise<T>;
}

function runGit(cwd: string, args: string[], env: Record<string, string> = {}) {
  const result = Bun.spawnSync(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
    env: {
      ...process.env,
      ...env,
      GIT_TERMINAL_PROMPT: "0",
      GCM_INTERACTIVE: "never",
    },
  });
  if (result.success) return decoder.decode(result.stdout).trim();
  throw new Error(decoder.decode(result.stderr).trim() || `git ${args.join(" ")} failed`);
}

function writeFixtureFile(root: string, path: string, content: string) {
  const fullPath = join(root, path);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content);
}

function commitFixtureChange(worktreePath: string, commit: FixtureCommit) {
  const committedAt = new Date(Date.now() - commit.daysAgo * 24 * 60 * 60 * 1000).toISOString();
  writeFixtureFile(worktreePath, commit.filePath, commit.body);
  runGit(worktreePath, ["add", commit.filePath]);
  runGit(worktreePath, [
    "-c",
    `user.name=${commit.authorName}`,
    "-c",
    `user.email=${commit.authorEmail}`,
    "commit",
    "-m",
    commit.message,
  ], {
    GIT_AUTHOR_DATE: committedAt,
    GIT_COMMITTER_DATE: committedAt,
  });
  const hash = runGit(worktreePath, ["rev-parse", "HEAD"]);
  return { hash, committedAt };
}

function createFakeGithubMirror(input: { groupId: string; repoUrl: string; commits: FixtureCommit[] }) {
  const fixtureRoot = resolve(process.env.MIYAGI_FIXTURE_ROOT ?? "./fixture-data/github-demo");
  const worktreePath = join(fixtureRoot, "team-alpha-worktree");
  const mirrorPath = join(fixtureRoot, `${input.groupId}.git`);

  rmSync(worktreePath, { recursive: true, force: true });
  rmSync(mirrorPath, { recursive: true, force: true });
  mkdirSync(worktreePath, { recursive: true });

  runGit(worktreePath, ["init"]);
  runGit(worktreePath, ["checkout", "-b", "main"]);

  const cache: Record<string, CommitCacheEntry> = {};
  for (const commit of input.commits) {
    const { hash, committedAt } = commitFixtureChange(worktreePath, commit);
    cache[hash] = {
      githubUsername: commit.githubUsername,
      htmlUrl: `${input.repoUrl.replace(/\.git$/, "")}/commit/${hash}`,
      committedAt,
    };
  }

  mkdirSync(fixtureRoot, { recursive: true });
  runGit(fixtureRoot, ["clone", "--bare", worktreePath, mirrorPath]);
  writeFileSync(join(mirrorPath, "miyagi-github-cache.json"), JSON.stringify(cache, null, 2));
  writeFileSync(join(mirrorPath, GITHUB_FIXTURE_FILE), JSON.stringify({ repoUrl: input.repoUrl }, null, 2));

  return mirrorPath;
}

const professorInput = {
  username: "fixture-professor",
  password: "password123",
  displayName: "Fixture Professor",
};

const students = [
  { username: "khed3455@example.com", password: "password123", displayName: "Khed Student", github: "koushik255" },
  { username: "partner@example.com", password: "password123", displayName: "Partner Student", github: "partnergit" },
  { username: "noah.patel@example.com", password: "password123", displayName: "Noah Patel", github: "noahpatel" },
  { username: "mia.chen@example.com", password: "password123", displayName: "Mia Chen", github: "miachen" },
  { username: "solo.student@example.com", password: "password123", displayName: "Solo Student", github: "sologit" },
];

const professor = await post<ProfessorResponse>("/auth/professor/register", professorInput);
const course = await post<CourseResponse>("/courses", { professorId: professor.id, name: "Miyagi GitHub Fixture 101" });
const assignment = await post<AssignmentResponse>("/assignments", {
  professorId: professor.id,
  courseId: course.id,
  name: "Simulated GitHub Group Project",
  description: "Fixture assignment with fake GitHub commit attribution.",
});

const createdStudents: UserResponse[] = [];
for (const studentInput of students) {
  const user = await post<UserResponse>("/auth/student/register", studentInput);
  await post("/courses/join", { userId: user.id, joinCode: course.joinCode });
  createdStudents.push(user);
}

const repoUrl = "https://github.com/miyagi-fixtures/team-alpha";
const groupCsv = `|Team Alpha|{khed3455@example.com:koushik255}{partner@example.com:partnergit}{noah.patel@example.com:noahpatel}|${repoUrl}|`;
const importResult = await post<GroupImportResponse>(`/assignments/${assignment.id}/import-groups`, {
  professorId: professor.id,
  csv: groupCsv,
});
const teamAlpha = importResult.groups[0]?.group;
if (!teamAlpha) throw new Error("Fixture group was not imported");

const mirrorPath = createFakeGithubMirror({
  groupId: teamAlpha.id,
  repoUrl,
  commits: [
    {
      message: "Add Khed parser notes",
      filePath: "src/parser-notes.md",
      body: "# Parser notes\n\nKhed added the parser checklist.\n",
      authorName: "Khed Student",
      authorEmail: "khed3455@example.com",
      githubUsername: "koushik255",
      daysAgo: 5,
    },
    {
      message: "Add partner API checklist",
      filePath: "src/api-checklist.md",
      body: "# API checklist\n\nPartner added endpoint coverage notes.\n",
      authorName: "Partner Student",
      authorEmail: "partner@example.com",
      githubUsername: "partnergit",
      daysAgo: 4,
    },
    {
      message: "Add Noah UI smoke test notes",
      filePath: "src/ui-smoke.md",
      body: "# UI smoke test\n\nNoah documented dashboard checks.\n",
      authorName: "Noah Patel",
      authorEmail: "noah.patel@example.com",
      githubUsername: "noahpatel",
      daysAgo: 3,
    },
    {
      message: "Expand partner API checklist",
      filePath: "src/api-checklist.md",
      body: "# API checklist\n\nPartner added endpoint coverage notes.\n\n- Verify dashboard matching.\n- Verify commit totals.\n",
      authorName: "Partner Student",
      authorEmail: "partner@example.com",
      githubUsername: "partnergit",
      daysAgo: 2,
    },
    {
      message: "Refine Khed parser notes",
      filePath: "src/parser-notes.md",
      body: "# Parser notes\n\nKhed added the parser checklist.\n\n- Keep CSV fixtures deterministic.\n",
      authorName: "Khed Student",
      authorEmail: "khed3455@example.com",
      githubUsername: "koushik255",
      daysAgo: 1,
    },
  ],
});

db.update(groups).set({ repoPath: mirrorPath, cloneUrl: repoUrl }).where(eq(groups.id, teamAlpha.id)).run();

const dashboardResponse = await app.request(`/groups/${teamAlpha.id}/dashboard?period=monthly`);
if (!dashboardResponse.ok) throw new Error(`Dashboard verification failed: ${dashboardResponse.status} ${await dashboardResponse.text()}`);
const dashboard = await dashboardResponse.json() as { totals: { commits: number }; byStudent: Array<{ displayName: string; githubUsername: string | null; commits: number }> };
if (dashboard.totals.commits !== 5) throw new Error(`Expected 5 fixture commits, got ${dashboard.totals.commits}`);

console.log("Seeded Miyagi GitHub fixture");
console.log("");
console.log("Professor login");
console.log(`  username: ${professorInput.username}`);
console.log(`  password: ${professorInput.password}`);
console.log(`  page: /professor-pages/${professor.pageSlug}`);
console.log("");
console.log("Course");
console.log(`  name: ${course.name}`);
console.log(`  join code: ${course.joinCode}`);
console.log(`  assignment: ${assignment.name}`);
console.log("");
console.log("Team Alpha GitHub fixture");
console.log(`  group id: ${teamAlpha.id}`);
console.log(`  repo url shown in Miyagi: ${repoUrl}`);
console.log(`  local bare repo: ${mirrorPath}`);
console.log("  fake GitHub cache: miyagi-github-cache.json");
console.log("");
console.log("Matched dashboard commits");
for (const student of dashboard.byStudent) {
  console.log(`  ${student.githubUsername ?? student.displayName}: ${student.commits}`);
}
console.log("");
console.log("Student logins");
for (const student of students) {
  console.log(`  ${student.username} / ${student.password} / GitHub ${student.github}`);
}
