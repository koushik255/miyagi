import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { matchDashboardMemberForCommit } from "./dashboard-stats";
import { db } from "./db";
import { runGit } from "./git-command";
import { Professor } from "./professor";
import { User } from "./user";
import { listDashboardMembers, listGroupMembers } from "./group-member-read-model";
import { getGroupCommitActivity } from "./history";
import { groups } from "./schema";

type GitHubCommitListItem = {
  sha: string;
  html_url: string;
  author: { login: string } | null;
  commit: { author?: { date?: string | null } | null };
};

type GitHubRepositoryItem = {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
  clone_url: string;
  description?: string | null;
  updated_at?: string | null;
  pushed_at?: string | null;
  owner: { login: string };
};

export type GithubRepositorySummary = {
  id: number;
  name: string;
  fullName: string;
  owner: string;
  htmlUrl: string;
  cloneUrl: string;
  private: boolean;
  description: string | null;
  updatedAt: string | null;
  pushedAt: string | null;
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

function defaultDataRoot() {
  if (process.platform === "darwin") return join(homedir(), "Library", "Application Support", "Miyagi");
  if (process.platform === "win32") return join(process.env.APPDATA ?? homedir(), "Miyagi");
  return join(process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"), "miyagi");
}

async function githubRequest<T>(path: string, input: { accessToken?: string | null; method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const token = input.accessToken ?? process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  if (input.body !== undefined) headers["content-type"] = "application/json";

  const response = await fetch(`https://api.github.com${path}`, {
    method: input.method ?? "GET",
    headers,
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
  });
  if (!response.ok) throw new Error(`GitHub API failed: ${response.status} ${await response.text()}`);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

async function githubFetch<T>(path: string, accessToken?: string | null): Promise<T> {
  return githubRequest<T>(path, { accessToken });
}

function githubRepositorySummary(repo: GitHubRepositoryItem): GithubRepositorySummary {
  return {
    id: repo.id,
    name: repo.name,
    fullName: repo.full_name,
    owner: repo.owner.login,
    htmlUrl: repo.html_url,
    cloneUrl: repo.clone_url,
    private: repo.private,
    description: repo.description ?? null,
    updatedAt: repo.updated_at ?? null,
    pushedAt: repo.pushed_at ?? null,
  };
}

export async function listGithubRepositories(accessToken: string): Promise<GithubRepositorySummary[]> {
  const repositories: GithubRepositorySummary[] = [];
  for (let page = 1; page <= 5; page += 1) {
    const pageRepositories = await githubFetch<GitHubRepositoryItem[]>(
      `/user/repos?affiliation=owner,collaborator,organization_member&sort=updated&per_page=100&page=${page}`,
      accessToken,
    );
    repositories.push(...pageRepositories.map(githubRepositorySummary));
    if (pageRepositories.length < 100) break;
  }
  return repositories;
}

export async function getGithubRepository(owner: string, repo: string, accessToken: string): Promise<GithubRepositorySummary> {
  return githubRepositorySummary(await githubFetch<GitHubRepositoryItem>(`/repos/${owner}/${repo}`, accessToken));
}

export async function createGithubRepository(accessToken: string, input: { name: string; private?: boolean; description?: string | null }): Promise<GithubRepositorySummary> {
  return githubRepositorySummary(await githubRequest<GitHubRepositoryItem>("/user/repos", {
    accessToken,
    method: "POST",
    body: {
      name: input.name,
      private: input.private ?? true,
      description: input.description ?? undefined,
      auto_init: true,
    },
  }));
}

export async function addGithubCollaborator(accessToken: string, owner: string, repo: string, username: string): Promise<void> {
  await githubRequest<void>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/collaborators/${encodeURIComponent(username)}`, {
    accessToken,
    method: "PUT",
    body: { permission: "push" },
  });
}

async function checkGithubCollaborator(accessToken: string, owner: string, repo: string, username: string): Promise<boolean> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${accessToken}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/collaborators/${encodeURIComponent(username)}`, { headers });
  if (response.status === 204) return true;
  if (response.status === 404) return false;
  throw new Error(`GitHub collaborator check failed: ${response.status} ${await response.text()}`);
}

function mirrorPathForGroup(groupId: string) {
  return join(GITHUB_MIRRORS_ROOT, `${groupId}.git`);
}

function cachePath(repoPath: string) {
  return join(repoPath, CACHE_FILE);
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

  const professorGithubAccount = Professor.githubConnection(group.professorId);
  const studentGithubAccount = group.githubAccessUserId ? User.githubConnection(group.githubAccessUserId) : undefined;

  const repoPath = await syncGithubMirror({
    groupId: group.id,
    githubRepoUrl: group.githubRepoUrl,
    githubOwner: group.githubOwner,
    githubRepo: group.githubRepo,
    repoPath: group.repoPath,
    accessToken: studentGithubAccount?.accessToken ?? professorGithubAccount?.accessToken ?? null,
  });

  return db.update(groups).set({ repoPath, cloneUrl: group.githubRepoUrl }).where(eq(groups.id, group.id)).returning().get();
}

export async function getGroupGithubRepositoryAccess(groupId: string) {
  const group = db.select().from(groups).where(eq(groups.id, groupId)).get();
  if (!group) throw new Error("Group not found");
  const members = listGroupMembers(group.id);
  if (group.repositoryProvider !== "github" || !group.githubRepoUrl || !group.githubOwner || !group.githubRepo) {
    return { group, members: members.map((member) => ({ ...member, hasRepositoryAccess: null, repositoryAccessReason: "no_repository" })) };
  }

  const professorGithubAccount = Professor.githubConnection(group.professorId);
  const studentGithubAccount = group.githubAccessUserId ? User.githubConnection(group.githubAccessUserId) : undefined;
  const accessToken = studentGithubAccount?.accessToken ?? professorGithubAccount?.accessToken ?? null;
  if (!accessToken) {
    return { group, members: members.map((member) => ({ ...member, hasRepositoryAccess: null, repositoryAccessReason: "no_repository_token" })) };
  }

  const statuses = [];
  for (const member of members) {
    if (!member.githubUsername) {
      statuses.push({ ...member, hasRepositoryAccess: false, repositoryAccessReason: "missing_github_username" });
      continue;
    }
    try {
      const hasRepositoryAccess = await checkGithubCollaborator(accessToken, group.githubOwner, group.githubRepo, member.githubUsername);
      statuses.push({ ...member, hasRepositoryAccess, repositoryAccessReason: hasRepositoryAccess ? null : "not_collaborator" });
    } catch {
      statuses.push({ ...member, hasRepositoryAccess: null, repositoryAccessReason: "check_failed" });
    }
  }

  return { group, members: statuses };
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
