import { eq } from "drizzle-orm";
import { getGroupGithubActivity } from "./github";
import { getGroupHistory } from "./history";
import { db } from "./db";
import { groupMembers, groups, users } from "./schema";

type ActivityCommit = {
  hash: string;
  message: string;
  authorName: string;
  githubUsername?: string | null;
  matchedStudent?: { userId: string; displayName: string; email?: string | null } | null;
  groupId: string;
  groupName: string;
  when: string | null;
  additions: number;
  deletions: number;
  changedFiles: number;
  htmlUrl?: string | null;
};

const MS_DAY = 24 * 60 * 60 * 1000;

function periodStart(period: "weekly" | "monthly" | "semester") {
  const now = Date.now();
  if (period === "weekly") return new Date(now - 7 * MS_DAY);
  if (period === "monthly") return new Date(now - 30 * MS_DAY);
  return new Date(0);
}

function buildStats(commits: ActivityCommit[], members: { userId: string; displayName: string }[]) {
  const byStudent = members.map((member) => {
    const studentCommits = commits.filter((commit) => commit.matchedStudent?.userId === member.userId);
    return {
      userId: member.userId,
      displayName: member.displayName,
      commits: studentCommits.length,
      additions: studentCommits.reduce((sum, commit) => sum + commit.additions, 0),
      deletions: studentCommits.reduce((sum, commit) => sum + commit.deletions, 0),
      changedFiles: studentCommits.reduce((sum, commit) => sum + commit.changedFiles, 0),
    };
  });

  const ranked = [...byStudent].sort((a, b) => b.commits - a.commits || b.additions + b.deletions - (a.additions + a.deletions));
  const activeStudents = byStudent.filter((student) => student.commits > 0).length;

  return {
    byStudent,
    topStudents: ranked.slice(0, 5),
    lowActivityStudents: [...byStudent].sort((a, b) => a.commits - b.commits).slice(0, 5),
    highestPerformer: ranked[0] ?? null,
    lowestCommitter: [...byStudent].sort((a, b) => a.commits - b.commits)[0] ?? null,
    activeStudents,
  };
}

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

export async function getGroupDashboard(groupId: string, period: "weekly" | "monthly" | "semester" = "semester") {
  const group = db.select().from(groups).where(eq(groups.id, groupId)).get();
  if (!group) throw new Error("Group not found");

  const members = db
    .select({ userId: users.id, displayName: users.displayName, email: users.email, githubUsername: groupMembers.githubUsername })
    .from(groupMembers)
    .innerJoin(users, eq(groupMembers.userId, users.id))
    .where(eq(groupMembers.groupId, groupId))
    .all();
  const start = periodStart(period);
  const commits = (await groupCommits(group)).filter((commit) => commit.when && new Date(commit.when) >= start);
  const stats = buildStats(commits, members);

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
    commits,
    ...stats,
  };
}

export async function getAssignmentDashboard(assignmentId: string, period: "weekly" | "monthly" | "semester" = "semester") {
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
  const commits = groupDashboards.flatMap((dashboard) => dashboard.commits);
  const memberMap = new Map<string, { userId: string; displayName: string }>();
  for (const dashboard of groupDashboards) {
    for (const member of dashboard.members) memberMap.set(member.userId, member);
  }
  const stats = buildStats(commits, [...memberMap.values()]);

  return {
    period,
    totals: {
      groups: assignmentGroups.length,
      students: memberMap.size,
      commits: commits.length,
      additions: commits.reduce((sum, commit) => sum + commit.additions, 0),
      deletions: commits.reduce((sum, commit) => sum + commit.deletions, 0),
      changedFiles: commits.reduce((sum, commit) => sum + commit.changedFiles, 0),
    },
    recentActivity: commits.slice(0, 12),
    groups: groupDashboards,
    ...stats,
  };
}
