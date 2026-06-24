import { eq } from "drizzle-orm";
import { db } from "./db";
import { type ActivityCommit, buildStats, matchDashboardMemberForCommit, sortCommits, type DashboardMember } from "./dashboard-stats";
import type { DashboardPeriod } from "./dashboard-time";
import { getGroupGithubActivity } from "./github";
import { listDashboardMembers } from "./group-member-read-model";
import { getGroupCommitActivity } from "./history";
import { groups } from "./schema";

async function groupCommits(group: typeof groups.$inferSelect, members: ReturnType<typeof listDashboardMembers>): Promise<ActivityCommit[]> {
  if (group.repositoryProvider === "github") {
    const activity = await getGroupGithubActivity(group.id);
    return activity.commits.map((commit) => ({ ...commit, when: commit.committedAt, groupId: group.id, groupName: group.name }));
  }

  if (!group.repoPath) return [];
  return getGroupCommitActivity(group).map((commit) => {
    const matchedMember = matchDashboardMemberForCommit({
      authorName: commit.authorName,
      authorEmail: commit.authorEmail,
    }, members);

    return {
      hash: commit.hash,
      message: commit.message,
      authorName: commit.authorName,
      groupId: group.id,
      groupName: group.name,
      when: commit.committedAt,
      additions: commit.additions,
      deletions: commit.deletions,
      changedFiles: commit.changedFiles,
      matchedStudent: matchedMember
        ? {
            userId: matchedMember.userId,
            username: matchedMember.username,
            displayName: matchedMember.displayName,
            email: matchedMember.email ?? null,
            avatarColor: matchedMember.avatarColor,
            githubUsername: matchedMember.userGithubUsername ?? matchedMember.groupGithubUsername ?? matchedMember.githubUsername,
          }
        : null,
      htmlUrl: null,
    };
  });
}

export async function getGroupDashboard(groupId: string, period: DashboardPeriod = "semester") {
  const group = db.select().from(groups).where(eq(groups.id, groupId)).get();
  if (!group) throw new Error("Group not found");

  const dashboardMembers = listDashboardMembers(groupId);
  const members = dashboardMembers.map((member) => ({
    userId: member.userId,
    username: member.username,
    displayName: member.displayName,
    avatarColor: member.avatarColor,
    email: member.email,
    githubUsername: member.userGithubUsername ?? member.groupGithubUsername,
  }));

  const stats = buildStats(await groupCommits(group, dashboardMembers), members, period);
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
