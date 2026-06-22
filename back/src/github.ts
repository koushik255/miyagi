import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { runGit } from "./git-command";
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
};

type GitHubCommitCacheEntry = {
  githubUsername: string | null;
  htmlUrl: string | null;
  committedAt: string | null;
};

const GITHUB_MIRRORS_ROOT = process.env.GITHUB_MIRRORS_ROOT
  ?? join(process.env.MIYAGI_DATA_ROOT ?? defaultDataRoot(), "github_mirrors");
const CACHE_FILE = "miyagi-github-cache.json";

function defaultDataRoot() {
  if (process.platform === "darwin") return join(homedir(), "Library", "Application Support", "Miyagi");
  if (process.platform === "win32") return join(process.env.APPDATA ?? homedir(), "Miyagi");
  return join(process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"), "miyagi");
}

async function githubFetch<T>(path: string): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

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

function refreshGithubCommitCache(config: GitHubMirrorConfig, repoPath: string) {
  return githubFetch<GitHubCommitListItem[]>(`/repos/${config.githubOwner}/${config.githubRepo}/commits?per_page=100`)
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

export async function syncGithubMirror(config: GitHubMirrorConfig): Promise<string> {
  mkdirSync(GITHUB_MIRRORS_ROOT, { recursive: true });
  const mirrorPath = mirrorPathForGroup(config.groupId);

  if (config.repoPath && config.repoPath !== mirrorPath && existsSync(config.repoPath)) {
    rmSync(config.repoPath, { recursive: true, force: true });
  }

  if (!existsSync(mirrorPath)) {
    runGit(["clone", "--mirror", config.githubRepoUrl, mirrorPath]);
  } else {
    const originUrl = runGit(["--git-dir", mirrorPath, "config", "--get", "remote.origin.url"]);
    if (originUrl !== config.githubRepoUrl) {
      rmSync(mirrorPath, { recursive: true, force: true });
      runGit(["clone", "--mirror", config.githubRepoUrl, mirrorPath]);
    } else {
      runGit(["--git-dir", mirrorPath, "fetch", "--prune", "origin"]);
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

  const repoPath = await syncGithubMirror({
    groupId: group.id,
    githubRepoUrl: group.githubRepoUrl,
    githubOwner: group.githubOwner,
    githubRepo: group.githubRepo,
    repoPath: group.repoPath,
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
    const matchedMember = githubUsername
      ? members.find((member) => (member.userGithubUsername ?? member.groupGithubUsername)?.toLowerCase() === githubUsername.toLowerCase()) ?? null
      : null;

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
