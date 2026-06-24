import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { matchDashboardMemberForCommit } from "./dashboard-stats";
import { db } from "./db";
import { runGit } from "./git-command";
import { Professor } from "./professor";
import { listDashboardMembers } from "./group-member-read-model";
import { getGroupCommitActivity } from "./history";
import { groups } from "./schema";

type GitHubCommitListItem = {
  sha: string;
  html_url: string;
  author: { login: string } | null;
  commit: { author?: { date?: string | null } | null };
};

type GitHubMirrorConfig = {
  groupId: string;
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
const FIXTURE_FILE = "miyagi-github-fixture.json";

function defaultDataRoot() {
  if (process.platform === "darwin") return join(homedir(), "Library", "Application Support", "Miyagi");
  if (process.platform === "win32") return join(process.env.APPDATA ?? homedir(), "Miyagi");
  return join(process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"), "miyagi");
}

async function githubFetch<T>(path: string, accessToken?: string | null): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const token = accessToken ?? process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`https://api.github.com${path}`, { headers });
  if (!response.ok) throw new Error(`GitHub API failed: ${response.status} ${await response.text()}`);
  return response.json() as Promise<T>;
}

function mirrorPathForGroup(groupId: string) {
  return join(GITHUB_MIRRORS_ROOT, `${groupId}.git`);
}

function cachePath(repoPath: string) {
  return join(repoPath, CACHE_FILE);
}

function fixturePath(repoPath: string) {
  return join(repoPath, FIXTURE_FILE);
}

function isFixtureMirror(repoPath: string | null | undefined) {
  return Boolean(repoPath && existsSync(fixturePath(repoPath)));
}

function refreshGithubCommitCache(config: GitHubMirrorConfig, repoPath: string) {
  return githubFetch<GitHubCommitListItem[]>(`/repos/${config.githubOwner}/${config.githubRepo}/commits?per_page=100`, config.accessToken)
    .then((commits) => {
      const nextEntries = Object.fromEntries(
        commits.map((commit) => [
          commit.sha,
          {
            githubUsername: commit.author?.login ?? null,
            htmlUrl: commit.html_url ?? null,
            committedAt: commit.commit.author?.date ?? null,
          } satisfies GitHubCommitCacheEntry,
        ]),
      );
      writeFileSync(cachePath(repoPath), JSON.stringify(nextEntries));
    });
}

export function readGithubCommitCache(repoPath: string): Record<string, GitHubCommitCacheEntry> {
  try {
    return JSON.parse(readFileSync(cachePath(repoPath), "utf8")) as Record<string, GitHubCommitCacheEntry>;
  } catch {
    return {};
  }
}


function githubAuthArgs(accessToken?: string | null): string[] {
  return accessToken ? ["-c", `http.extraHeader=Authorization: Bearer ${accessToken}`] : [];
}
export async function syncGithubMirror(config: GitHubMirrorConfig): Promise<string> {
  mkdirSync(GITHUB_MIRRORS_ROOT, { recursive: true });
  const mirrorPath = mirrorPathForGroup(config.groupId);

  if (isFixtureMirror(config.repoPath)) {
    return config.repoPath!;
  }

  if (config.repoPath && config.repoPath !== mirrorPath && existsSync(config.repoPath)) {
    rmSync(config.repoPath, { recursive: true, force: true });
  }

  const authArgs = githubAuthArgs(config.accessToken);
  if (!existsSync(mirrorPath)) {
    runGit([...authArgs, "clone", "--mirror", config.githubRepoUrl, mirrorPath]);
    runGit(["--git-dir", mirrorPath, "config", "remote.origin.url", config.githubRepoUrl]);
  } else {
    const originUrl = runGit(["--git-dir", mirrorPath, "config", "--get", "remote.origin.url"]);
    if (originUrl !== config.githubRepoUrl) {
      rmSync(mirrorPath, { recursive: true, force: true });
      runGit([...authArgs, "clone", "--mirror", config.githubRepoUrl, mirrorPath]);
      runGit(["--git-dir", mirrorPath, "config", "remote.origin.url", config.githubRepoUrl]);
    } else {
      runGit([...authArgs, "--git-dir", mirrorPath, "fetch", "--prune", "origin"]);
    }
  }

  await refreshGithubCommitCache(config, mirrorPath);
  return mirrorPath;
}

export async function syncGroupGithubMirror(groupId: string) {
  const group = db.select().from(groups).where(eq(groups.id, groupId)).get();
  if (!group) throw new Error("Group not found");
  if (group.repositoryProvider !== "github" || !group.githubRepoUrl || !group.githubOwner || !group.githubRepo) {
    throw new Error("Group is not connected to a GitHub repository");
  }

  const githubAccount = Professor.githubConnection(group.professorId);

  const repoPath = await syncGithubMirror({
    groupId: group.id,
    githubRepoUrl: group.githubRepoUrl,
    githubOwner: group.githubOwner,
    githubRepo: group.githubRepo,
    repoPath: group.repoPath,
    accessToken: githubAccount?.accessToken ?? null,
  });

  return db.update(groups).set({ repoPath, cloneUrl: group.githubRepoUrl }).where(eq(groups.id, group.id)).returning().get();
}

export async function getGroupGithubActivity(groupId: string) {
  const group = db.select().from(groups).where(eq(groups.id, groupId)).get();
  if (!group) throw new Error("Group not found");
  if (group.repositoryProvider !== "github" || !group.githubRepoUrl || !group.githubOwner || !group.githubRepo) {
    throw new Error("Group is not connected to a GitHub repository");
  }
  if (!group.repoPath) throw new Error("GitHub mirror is not initialized");

  const members = listDashboardMembers(groupId);
  const commitCache = readGithubCommitCache(group.repoPath);

  const commits = getGroupCommitActivity(group).map((commit) => {
    const cached = commitCache[commit.hash];
    const githubUsername = cached?.githubUsername ?? null;
    const matchedMember = matchDashboardMemberForCommit({
      githubUsername,
      authorName: commit.authorName,
      authorEmail: commit.authorEmail,
    }, members);

    return {
      hash: commit.hash,
      htmlUrl: cached?.htmlUrl ?? null,
      message: commit.message,
      authorName: commit.authorName,
      githubUsername,
      matchedStudent: matchedMember
        ? {
            userId: matchedMember.userId,
            username: matchedMember.username,
            displayName: matchedMember.displayName,
            email: matchedMember.email,
            avatarColor: matchedMember.avatarColor,
            githubUsername: matchedMember.userGithubUsername ?? matchedMember.groupGithubUsername,
          }
        : null,
      committedAt: cached?.committedAt ?? commit.committedAt,
      additions: commit.additions,
      deletions: commit.deletions,
      changedFiles: commit.changedFiles,
    };
  });

  return { group, members, commits };
}
