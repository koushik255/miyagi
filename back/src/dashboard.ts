import { Effect } from "effect";
import { AssignmentRepository } from "./assignment-repository";
import { getAssignmentRepositoryGithubActivity, syncAssignmentRepositoryGithubMirror } from "./github";

// There is no background poller. This only prevents duplicate fetches when several
// dashboard requests arrive close together; the next request after this window fetches GitHub.
const MIRROR_REFRESH_WINDOW_MS = 2 * 60_000;

export type DashboardPeriod = "weekly" | "monthly" | "semester";
type Granularity = "day" | "week";
type ContributionBucket = {
  label: string;
  shortLabel: string;
  start: string;
  end: string;
  commits: number;
  additions: number;
  deletions: number;
  changedFiles: number;
};
type ActivityCommit = {
  hash: string;
  message: string;
  authorName: string;
  githubUsername?: string | null;
  groupId?: string;
  groupName?: string;
  when: string | null;
  additions: number;
  deletions: number;
  changedFiles: number;
  htmlUrl?: string | null;
  matchedStudent?: DashboardMember | null;
};
type DashboardMember = {
  userId: string;
  username: string;
  githubUsername?: string | null;
  displayName: string;
  avatarColor: string | null;
  email?: string | null;
};

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function startOfWeek(date: Date) {
  const next = startOfDay(date);
  next.setDate(next.getDate() - next.getDay());
  return next;
}

function endOfWeek(date: Date) {
  const next = addDays(startOfWeek(date), 6);
  next.setHours(23, 59, 59, 999);
  return next;
}

function periodConfig(period: DashboardPeriod) {
  const now = new Date();
  if (period === "weekly") return { start: addDays(startOfDay(now), -6), end: now, granularity: "day" as const, cadence: "Daily" };
  if (period === "monthly") return { start: addDays(startOfDay(now), -29), end: now, granularity: "day" as const, cadence: "Daily" };
  return { start: addDays(startOfWeek(now), -7 * 15), end: endOfWeek(now), granularity: "week" as const, cadence: "Weekly" };
}

function bucketForDate(date: Date, granularity: Granularity) {
  return granularity === "day" ? startOfDay(date) : startOfWeek(date);
}

function bucketEnd(start: Date, granularity: Granularity) {
  const end = granularity === "day" ? startOfDay(start) : endOfWeek(start);
  if (granularity === "day") end.setHours(23, 59, 59, 999);
  return end;
}

function buildTimeline(commits: ActivityCommit[], period: DashboardPeriod) {
  const { start, end, granularity, cadence } = periodConfig(period);
  const filteredCommits = commits.filter((commit) => commit.when && new Date(commit.when) >= start);
  const buckets = new Map<string, ContributionBucket>();
  const timeline: ContributionBucket[] = [];

  for (let cursor = bucketForDate(start, granularity); cursor <= end; cursor = addDays(cursor, granularity === "day" ? 1 : 7)) {
    const bucketStart = new Date(cursor);
    const bucket: ContributionBucket = {
      label: granularity === "day"
        ? bucketStart.toLocaleDateString(undefined, { month: "short", day: "numeric" })
        : `Week of ${bucketStart.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`,
      shortLabel: granularity === "day"
        ? bucketStart.toLocaleDateString(undefined, { weekday: "short" })
        : bucketStart.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      start: bucketStart.toISOString(),
      end: bucketEnd(bucketStart, granularity).toISOString(),
      commits: 0,
      additions: 0,
      deletions: 0,
      changedFiles: 0,
    };
    buckets.set(bucket.start, bucket);
    timeline.push(bucket);
  }

  for (const commit of filteredCommits) {
    if (!commit.when) continue;
    const bucket = buckets.get(bucketForDate(new Date(commit.when), granularity).toISOString());
    if (!bucket) continue;
    bucket.commits += 1;
    bucket.additions += commit.additions;
    bucket.deletions += commit.deletions;
    bucket.changedFiles += commit.changedFiles;
  }
  return { timeline, cadence, filteredCommits };
}

function buildStats(commits: ActivityCommit[], members: DashboardMember[], period: DashboardPeriod) {
  const { timeline, cadence, filteredCommits } = buildTimeline(commits, period);
  const byStudent = members.map((member) => {
    const studentCommits = filteredCommits.filter((commit) => commit.matchedStudent?.userId === member.userId);
    return {
      ...member,
      commits: studentCommits.length,
      additions: studentCommits.reduce((sum, commit) => sum + commit.additions, 0),
      deletions: studentCommits.reduce((sum, commit) => sum + commit.deletions, 0),
      changedFiles: studentCommits.reduce((sum, commit) => sum + commit.changedFiles, 0),
      timeline: buildTimeline(studentCommits, period).timeline,
    };
  });
  const ranked = [...byStudent].sort((a, b) => b.commits - a.commits || b.additions + b.deletions - (a.additions + a.deletions));
  const lowActivity = [...ranked].sort((a, b) => a.commits - b.commits || a.additions + a.deletions - (b.additions + b.deletions));
  return {
    timeline,
    timelineCadence: cadence,
    commits: filteredCommits,
    byStudent: ranked,
    topStudents: ranked.slice(0, 5),
    lowActivityStudents: lowActivity.slice(0, 5),
    highestPerformer: ranked[0] ?? null,
    lowestCommitter: lowActivity[0] ?? null,
    activeStudents: ranked.filter((student) => student.commits > 0).length,
  };
}

function sortCommits<T extends { when: string | null }>(commits: T[]) {
  return [...commits].sort((a, b) => new Date(b.when ?? 0).getTime() - new Date(a.when ?? 0).getTime());
}

export function getAssignmentRepositoryDashboard(repositoryId: string, period: DashboardPeriod = "semester") {
  return Effect.gen(function* () {
    let repository = yield* AssignmentRepository.requireById(repositoryId);
    const lastSyncAt = Date.parse(repository.updatedAt);
    const needsSync = !repository.repoPath || !Number.isFinite(lastSyncAt) || Date.now() - lastSyncAt > MIRROR_REFRESH_WINDOW_MS;
    if (needsSync) repository = yield* syncAssignmentRepositoryGithubMirror(repository.id);

    const activity = yield* getAssignmentRepositoryGithubActivity(repository.id);
    const commits = activity.commits.map((commit) => ({
      ...commit,
      when: commit.committedAt,
      groupId: repository.id,
      groupName: repository.name,
    }));
    const stats = buildStats(commits, activity.members, period);
    const sortedCommits = sortCommits(stats.commits);

    return {
      period,
      repository,
      members: activity.members,
      totals: {
        students: activity.members.length,
        commits: sortedCommits.length,
        additions: sortedCommits.reduce((sum, commit) => sum + commit.additions, 0),
        deletions: sortedCommits.reduce((sum, commit) => sum + commit.deletions, 0),
        changedFiles: sortedCommits.reduce((sum, commit) => sum + commit.changedFiles, 0),
      },
      recentActivity: sortedCommits.slice(0, 10),
      lastCommitAt: sortCommits(commits)[0]?.when ?? null,
      ...stats,
      commits: sortedCommits,
    };
  });
}

export function getAssignmentDashboard(assignmentId: string, period: DashboardPeriod = "semester", userId?: string) {
  return Effect.gen(function* () {
    const visibleRepositories = yield* AssignmentRepository.listByAssignment(assignmentId, userId);
    const repositoryDashboards = yield* Effect.forEach(visibleRepositories, (repository) => (
      getAssignmentRepositoryDashboard(repository.id, period).pipe(
        Effect.catchAll((error) => Effect.succeed(emptyRepositoryDashboard(repository, period, error))),
      )
    ), { concurrency: 4 });

    const commits = sortCommits(repositoryDashboards.flatMap((dashboard) => dashboard.commits));
    const memberMap = new Map<string, DashboardMember>();
    for (const dashboard of repositoryDashboards) {
      for (const member of dashboard.members) memberMap.set(member.userId, member);
    }
    const stats = buildStats(commits, [...memberMap.values()], period);

    return {
      period,
      totals: {
        repositories: visibleRepositories.length,
        students: memberMap.size,
        commits: stats.commits.length,
        additions: stats.commits.reduce((sum, commit) => sum + commit.additions, 0),
        deletions: stats.commits.reduce((sum, commit) => sum + commit.deletions, 0),
        changedFiles: stats.commits.reduce((sum, commit) => sum + commit.changedFiles, 0),
      },
      recentActivity: sortCommits(stats.commits).slice(0, 12),
      lastCommitAt: commits[0]?.when ?? null,
      repositories: repositoryDashboards,
      ...stats,
    };
  });
}

function emptyRepositoryDashboard(repository: AssignmentRepository, period: DashboardPeriod, error: unknown) {
  return {
    period,
    repository,
    members: [] as DashboardMember[],
    totals: { students: 0, commits: 0, additions: 0, deletions: 0, changedFiles: 0 },
    timeline: [],
    timelineCadence: "Weekly",
    recentActivity: [],
    lastCommitAt: null,
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
