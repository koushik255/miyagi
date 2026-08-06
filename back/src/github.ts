import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { AssignmentRepository, type AssignmentRepository as AssignmentRepositoryRecord } from "./assignment-repository";
import { AppError, appError, badRequest, tryPromise, trySync } from "./errors";
import { Professor } from "./professor";

const decoder = new TextDecoder();
const GIT_ENV = { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" };
const GIT_BASE_ARGS = ["-c", "credential.helper=", "-c", "core.askPass="];
const COMMIT_SEPARATOR = "\u001e";
const FIELD_SEPARATOR = "\u001f";

type GitHubCommitListItem = {
  sha: string;
  html_url: string;
  author: { login: string } | null;
  commit: { author?: { date?: string | null } | null };
};

type GitHubRepositoryItem = { full_name: string; private: boolean; html_url: string };
type GitHubContributorItem = { login?: string; type?: string; name?: string; email?: string };
type GitHubMirrorConfig = {
  mirrorId: string;
  githubRepoUrl: string;
  githubOwner: string;
  githubRepo: string;
  repoPath?: string | null;
  accessToken?: string | null;
};
type GitHubCommitCacheEntry = {
  githubUsername: string | null;
  htmlUrl: string | null;
  committedAt: string | null;
};

const GITHUB_MIRRORS_ROOT = process.env.GITHUB_MIRRORS_ROOT
  ?? join(process.env.MIYAGI_DATA_ROOT ?? defaultDataRoot(), "github_mirrors");
const CACHE_FILE = "miyagi-github-cache.json";

export function parseGithubRepoUrl(url?: string) {
  if (!url?.trim()) return badRequest("GitHub repository URL is required");
  const match = url.trim().match(/github\.com[:/]([^/]+)\/([^/.#?]+)(?:\.git)?/i);
  return match ? Effect.succeed({ owner: match[1], repo: match[2] }) : badRequest(`Invalid GitHub URL: ${url}`);
}

function defaultDataRoot() {
  if (process.platform === "darwin") return join(homedir(), "Library", "Application Support", "Miyagi");
  if (process.platform === "win32") return join(process.env.APPDATA ?? homedir(), "Miyagi");
  return join(process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"), "miyagi");
}

function githubFetch<T>(path: string, accessToken?: string | null, noContentValue?: T) {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const token = accessToken ?? process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  return tryPromise((signal) => fetch(`https://api.github.com${path}`, { headers, signal }), "Could not reach GitHub").pipe(
    Effect.flatMap((response) => response.ok
      ? response.status === 204 && noContentValue !== undefined
        ? Effect.succeed(noContentValue)
        : tryPromise(() => response.json() as Promise<T>, "GitHub returned invalid JSON")
      : tryPromise(() => response.text(), "Could not read the GitHub error response").pipe(
        Effect.flatMap((body) => Effect.fail(appError(502, `GitHub API failed: ${response.status} ${body}`))),
      )),
  );
}

export function getGithubRepository(owner: string, repo: string, accessToken?: string | null) {
  return githubFetch<GitHubRepositoryItem>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, accessToken).pipe(
    Effect.map((result) => ({ fullName: result.full_name, htmlUrl: result.html_url, private: result.private })),
  );
}

export function getGithubRepositoryContributorCount(owner: string, repo: string, accessToken?: string | null, limit = 15) {
  const requested = limit + 1;
  return githubFetch<GitHubContributorItem[]>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contributors?anon=1&per_page=${requested}`,
    accessToken,
    [],
  ).pipe(Effect.map((contributors) => Math.min(contributors.length, requested)));
}

const mirrorPath = (repositoryId: string) => join(GITHUB_MIRRORS_ROOT, `${repositoryId}.git`);
const cachePath = (repoPath: string) => join(repoPath, CACHE_FILE);

function refreshGithubCommitCache(config: GitHubMirrorConfig, repoPath: string) {
  return Effect.gen(function* () {
    const commits = yield* githubFetch<GitHubCommitListItem[]>(
      `/repos/${encodeURIComponent(config.githubOwner)}/${encodeURIComponent(config.githubRepo)}/commits?per_page=100`,
      config.accessToken,
    );
    const entries = Object.fromEntries(commits.map((commit) => [commit.sha, {
      githubUsername: commit.author?.login ?? null,
      htmlUrl: commit.html_url ?? null,
      committedAt: commit.commit.author?.date ?? null,
    } satisfies GitHubCommitCacheEntry]));
    yield* trySync(() => writeFileSync(cachePath(repoPath), JSON.stringify(entries)), "Could not write GitHub commit cache");
  });
}

export function readGithubCommitCache(repoPath: string) {
  return Effect.sync((): Record<string, GitHubCommitCacheEntry> => {
    try {
      return JSON.parse(readFileSync(cachePath(repoPath), "utf8")) as Record<string, GitHubCommitCacheEntry>;
    } catch {
      return {};
    }
  });
}

function gitError(stderr: string) {
  const message = stderr || "Git command failed";
  if (["could not read Username", "Authentication failed", "Repository not found", "terminal prompts disabled"].some((text) => message.includes(text))) {
    return appError(502, `${message}\nGitHub authentication is required or the repository is not accessible.`);
  }
  return appError(502, message);
}

function runGit(args: string[]) {
  return Effect.try({
    try: () => {
      const result = Bun.spawnSync(["git", ...GIT_BASE_ARGS, ...args], {
        stdout: "pipe", stderr: "pipe", stdin: "ignore", env: GIT_ENV,
      });
      if (result.success) return decoder.decode(result.stdout).trim();
      throw gitError(decoder.decode(result.stderr).trim());
    },
    catch: (cause) => cause instanceof AppError ? cause : appError(502, "Git command failed", cause),
  });
}

function runGitDir(repoPath: string, args: string[]) {
  return Effect.try({
    try: () => {
      const result = Bun.spawnSync(["git", ...GIT_BASE_ARGS, "--git-dir", repoPath, ...args], {
        stdout: "pipe", stderr: "pipe", stdin: "ignore", env: GIT_ENV,
      });
      if (result.success) return decoder.decode(result.stdout);
      throw gitError(decoder.decode(result.stderr).trim());
    },
    catch: (cause) => cause instanceof AppError ? cause : appError(502, "Git command failed", cause),
  });
}

function getRepositoryCommitActivity(repository: Pick<AssignmentRepositoryRecord, "repoPath">) {
  if (!repository.repoPath) return Effect.succeed([]);
  return runGitDir(repository.repoPath, [
    "log", "HEAD", "--no-merges", "--date=iso-strict",
    `--pretty=format:${COMMIT_SEPARATOR}%H${FIELD_SEPARATOR}%an${FIELD_SEPARATOR}%ae${FIELD_SEPARATOR}%aI${FIELD_SEPARATOR}%s`,
    "--numstat",
  ]).pipe(Effect.map((text) => {
    if (!text.trim()) return [];
    return text.split(COMMIT_SEPARATOR).map((block) => block.trim()).filter(Boolean).map((block) => {
      const lines = block.split("\n").filter(Boolean);
      const [hash, authorName, authorEmail, committedAt, ...messageParts] = (lines.shift() ?? "").split(FIELD_SEPARATOR);
      let additions = 0;
      let deletions = 0;
      let changedFiles = 0;
      for (const line of lines) {
        const [added, removed] = line.split("\t");
        if (!added || !removed) continue;
        changedFiles += 1;
        if (added !== "-") additions += Number(added) || 0;
        if (removed !== "-") deletions += Number(removed) || 0;
      }
      return { hash, authorName, authorEmail, committedAt, message: messageParts.join(FIELD_SEPARATOR), additions, deletions, changedFiles };
    });
  }));
}

const githubAuthArgs = (accessToken?: string | null) => accessToken
  ? ["-c", `http.extraHeader=Authorization: Bearer ${accessToken}`]
  : [];

function syncGithubMirror(config: GitHubMirrorConfig) {
  const target = mirrorPath(config.mirrorId);
  const program = Effect.gen(function* () {
    yield* trySync(() => mkdirSync(GITHUB_MIRRORS_ROOT, { recursive: true }), "Could not create mirror directory");
    if (config.repoPath && config.repoPath !== target && existsSync(config.repoPath)) {
      yield* trySync(() => rmSync(config.repoPath!, { recursive: true, force: true }), "Could not replace old mirror");
    }

    const authArgs = githubAuthArgs(config.accessToken);
    if (!existsSync(target)) {
      yield* runGit([...authArgs, "clone", "--mirror", config.githubRepoUrl, target]);
      yield* runGit(["--git-dir", target, "config", "remote.origin.url", config.githubRepoUrl]);
    } else {
      const originUrl = yield* runGit(["--git-dir", target, "config", "--get", "remote.origin.url"]);
      if (originUrl !== config.githubRepoUrl) {
        yield* trySync(() => rmSync(target, { recursive: true, force: true }), "Could not replace repository mirror");
        yield* runGit([...authArgs, "clone", "--mirror", config.githubRepoUrl, target]);
        yield* runGit(["--git-dir", target, "config", "remote.origin.url", config.githubRepoUrl]);
      } else {
        yield* runGit([...authArgs, "--git-dir", target, "fetch", "--prune", "origin"]);
      }
    }
    yield* refreshGithubCommitCache(config, target);
    return target;
  });

  return program.pipe(Effect.tapError(() => !config.repoPath && existsSync(target)
    ? trySync(() => rmSync(target, { recursive: true, force: true })).pipe(Effect.ignore)
    : Effect.void));
}

export function syncAssignmentRepositoryGithubMirror(repositoryId: string) {
  return Effect.gen(function* () {
    const repository = yield* AssignmentRepository.requireById(repositoryId);
    const professorGithubAccount = yield* Professor.githubConnection(repository.professorId);
    const config: GitHubMirrorConfig = {
      mirrorId: repository.id,
      githubRepoUrl: repository.githubRepoUrl,
      githubOwner: repository.githubOwner,
      githubRepo: repository.githubRepo,
      repoPath: repository.repoPath,
      accessToken: professorGithubAccount?.accessToken ?? null,
    };
    const repoPath = yield* syncGithubMirror(config).pipe(Effect.catchAll((error) => config.accessToken
      ? syncGithubMirror({ ...config, accessToken: null })
      : Effect.fail(error)));
    return yield* AssignmentRepository.updateRepoPath(repository.id, repoPath);
  });
}

export function getAssignmentRepositoryGithubActivity(repositoryId: string) {
  return Effect.gen(function* () {
    const repository = yield* AssignmentRepository.requireById(repositoryId);
    if (!repository.repoPath) return yield* badRequest("GitHub mirror is not initialized");
    const [commitCache, rawCommits] = yield* Effect.all([
      readGithubCommitCache(repository.repoPath),
      getRepositoryCommitActivity(repository),
    ]);
    const commits = rawCommits.map((commit) => {
      const cached = commitCache[commit.hash];
      const githubUsername = cached?.githubUsername ?? null;
      return {
        hash: commit.hash,
        htmlUrl: cached?.htmlUrl ?? null,
        message: commit.message,
        authorName: commit.authorName,
        githubUsername,
        matchedStudent: githubUsername ? {
          userId: githubUsername, username: githubUsername, displayName: githubUsername,
          email: null, avatarColor: null, githubUsername,
        } : {
          userId: commit.authorEmail || commit.authorName, username: commit.authorName, displayName: commit.authorName,
          email: commit.authorEmail || null, avatarColor: null, githubUsername: null,
        },
        committedAt: cached?.committedAt ?? commit.committedAt,
        additions: commit.additions,
        deletions: commit.deletions,
        changedFiles: commit.changedFiles,
      };
    });
    const members = new Map<string, {
      userId: string; username: string; displayName: string; avatarColor: null; githubUsername: string | null;
    }>();
    for (const commit of commits) members.set(commit.matchedStudent.userId, {
      userId: commit.matchedStudent.userId,
      username: commit.matchedStudent.username,
      displayName: commit.matchedStudent.displayName,
      avatarColor: null,
      githubUsername: commit.matchedStudent.githubUsername,
    });
    return { repository, members: [...members.values()], commits };
  });
}
