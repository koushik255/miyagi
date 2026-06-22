import { eq } from "drizzle-orm";
import { db } from "./db";
import { type ActivityCommit, buildStats, sortCommits, type DashboardMember } from "./dashboard-stats";
import type { DashboardPeriod } from "./dashboard-time";
import { getGroupGithubActivity } from "./github";
import { listDashboardMembers } from "./group-member-read-model";
import { getGroupHistory } from "./history";
import { groups } from "./schema";

async function groupCommits(group: typeof groups.$inferSelect): Promise<ActivityCommit[]> {
  if (group.repositoryProvider === "github") {
    const activity = await getGroupGithubActivity(group.id);
    return activity.commits.map((commit) => ({ ...commit, when: commit.committedAt, groupId: group.id, groupName: group.name }));
  }

  if (!group.repoPath) return [];
  return getGroupHistory(group).map((commit) => ({
    hash: commit.hash,
    message: commit.message,
    authorName: commit.author,
    groupId: group.id,
    groupName: group.name,
    when: commit.when,
    additions: 0,
    deletions: 0,
    changedFiles: 0,
    matchedStudent: null,
    htmlUrl: null,
  }));
}

export async function getGroupDashboard(groupId: string, period: DashboardPeriod = "semester") {
  const group = db.select().from(groups).where(eq(groups.id, groupId)).get();
  if (!group) throw new Error("Group not found");

  const members = listDashboardMembers(groupId).map((member) => ({
    userId: member.userId,
    username: member.username,
    displayName: member.displayName,
    email: member.email,
    githubUsername: member.userGithubUsername ?? member.groupGithubUsername,
  }));

  const stats = buildStats(await groupCommits(group), members, period);
  const commits = sortCommits(stats.commits);

  return {
    period,
    group,
    members,
    totals: {
      students: members.length,
      commits: commits.length,
      additions: commits.reduce((sum, commit) => sum + commit.additions, 0),
      deletions: commits.reduce((sum, commit) => sum + commit.deletions, 0),
      changedFiles: commits.reduce((sum, commit) => sum + commit.changedFiles, 0),
    },
    recentActivity: commits.slice(0, 10),
    ...stats,
    commits,
  };
}

export async function getAssignmentDashboard(assignmentId: string, period: DashboardPeriod = "semester") {
  const assignmentGroups = db.select().from(groups).where(eq(groups.assignmentId, assignmentId)).all();
  const groupDashboards = await Promise.all(
    assignmentGroups.map(async (group) => {
      try {
        return await getGroupDashboard(group.id, period);
      } catch (error) {
        return {
          period,
          group,
          members: [],
          totals: {
            students: 0,
            commits: 0,
            additions: 0,
            deletions: 0,
            changedFiles: 0,
          },
          timeline: [],
          timelineCadence: "Weekly",
          recentActivity: [],
          commits: [],
          byStudent: [],
          topStudents: [],
          lowActivityStudents: [],
          highestPerformer: null,
          lowestCommitter: null,
          activeStudents: 0,
          error: error instanceof Error ? error.message : "Could not load dashboard",
        };
      }
    }),
  );

  const commits = sortCommits(groupDashboards.flatMap((dashboard) => dashboard.commits));
  const memberMap = new Map<string, DashboardMember>();
  for (const dashboard of groupDashboards) {
    for (const member of dashboard.members) memberMap.set(member.userId, member);
  }

  const stats = buildStats(commits, [...memberMap.values()], period);

  return {
    period,
    totals: {
      groups: assignmentGroups.length,
      students: memberMap.size,
      commits: stats.commits.length,
      additions: stats.commits.reduce((sum, commit) => sum + commit.additions, 0),
      deletions: stats.commits.reduce((sum, commit) => sum + commit.deletions, 0),
      changedFiles: stats.commits.reduce((sum, commit) => sum + commit.changedFiles, 0),
    },
    recentActivity: sortCommits(stats.commits).slice(0, 12),
    groups: groupDashboards,
    ...stats,
  };
}
