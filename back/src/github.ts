import { eq } from "drizzle-orm";
import { db } from "./db";
import { groupMembers, groups, users } from "./schema";

type GitHubCommitListItem = {
  sha: string;
  html_url: string;
  author?: { login: string } | null;
  commit: { author?: { name?: string; date?: string }; message: string };
};

type GitHubCommitDetail = {
  sha: string;
  stats?: { additions: number; deletions: number; total: number };
  files?: unknown[];
};

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

export async function getGroupGithubActivity(groupId: string) {
  const group = db.select().from(groups).where(eq(groups.id, groupId)).get();
  if (!group) throw new Error("Group not found");
  if (group.repositoryProvider !== "github" || !group.githubOwner || !group.githubRepo) {
    throw new Error("Group is not connected to a GitHub repository");
  }

  const members = db
    .select({ userId: users.id, displayName: users.displayName, email: users.email, githubUsername: groupMembers.githubUsername })
    .from(groupMembers)
    .innerJoin(users, eq(groupMembers.userId, users.id))
    .where(eq(groupMembers.groupId, groupId))
    .all();

  const commits = await githubFetch<GitHubCommitListItem[]>(`/repos/${group.githubOwner}/${group.githubRepo}/commits?per_page=50`);
  const detailed = await Promise.all(
    commits.map(async (commit) => {
      const detail = await githubFetch<GitHubCommitDetail>(`/repos/${group.githubOwner}/${group.githubRepo}/commits/${commit.sha}`);
      const githubUsername = commit.author?.login ?? null;
      const matchedStudent = githubUsername
        ? members.find((member) => member.githubUsername?.toLowerCase() === githubUsername.toLowerCase()) ?? null
        : null;

      return {
        hash: commit.sha,
        htmlUrl: commit.html_url,
        message: commit.commit.message,
        authorName: commit.commit.author?.name ?? githubUsername ?? "Unknown",
        githubUsername,
        matchedStudent,
        committedAt: commit.commit.author?.date ?? null,
        additions: detail.stats?.additions ?? 0,
        deletions: detail.stats?.deletions ?? 0,
        changedFiles: detail.files?.length ?? 0,
      };
    }),
  );

  return { group, members, commits: detailed };
}
