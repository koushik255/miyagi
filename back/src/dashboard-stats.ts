import { addDays, bucketEnd, bucketForDate, type ContributionBucket, type DashboardPeriod, periodConfig, formatLongLabel, formatShortLabel } from "./dashboard-time";

export type ActivityCommit = {
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
  matchedStudent?: {
    userId: string;
    username: string;
    displayName: string;
    email: string | null;
    githubUsername: string | null;
  } | null;
};

export type DashboardMember = {
  userId: string;
  username: string;
  githubUsername: string | null;
  displayName: string;
};

export function buildTimeline(commits: ActivityCommit[], period: DashboardPeriod) {
  const { start, end, granularity, cadence } = periodConfig(period);
  const filteredCommits = commits.filter((commit) => commit.when && new Date(commit.when) >= start);
  const buckets = new Map<string, ContributionBucket>();
  const timeline: ContributionBucket[] = [];

  for (let cursor = bucketForDate(start, granularity); cursor <= end; cursor = addDays(cursor, granularity === "day" ? 1 : 7)) {
    const bucketStart = new Date(cursor);
    const bucketFinish = bucketEnd(bucketStart, granularity);
    const key = bucketStart.toISOString();
    const bucket: ContributionBucket = {
      label: formatLongLabel(bucketStart, granularity),
      shortLabel: formatShortLabel(bucketStart, granularity),
      start: bucketStart.toISOString(),
      end: bucketFinish.toISOString(),
      commits: 0,
      additions: 0,
      deletions: 0,
      changedFiles: 0,
    };
    buckets.set(key, bucket);
    timeline.push(bucket);
  }

  for (const commit of filteredCommits) {
    if (!commit.when) continue;
    const bucketStart = bucketForDate(new Date(commit.when), granularity).toISOString();
    const bucket = buckets.get(bucketStart);
    if (!bucket) continue;
    bucket.commits += 1;
    bucket.additions += commit.additions;
    bucket.deletions += commit.deletions;
    bucket.changedFiles += commit.changedFiles;
  }

  return { timeline, cadence, filteredCommits };
}

export function buildStats(commits: ActivityCommit[], members: DashboardMember[], period: DashboardPeriod) {
  const { timeline, cadence, filteredCommits } = buildTimeline(commits, period);
  const byStudent = members.map((member) => {
    const studentCommits = filteredCommits.filter((commit) => commit.matchedStudent?.userId === member.userId);
    const { timeline: studentTimeline } = buildTimeline(studentCommits, period);
    return {
      userId: member.userId,
      username: member.username ?? null,
      githubUsername: member.githubUsername ?? null,
      displayName: member.displayName,
      commits: studentCommits.length,
      additions: studentCommits.reduce((sum, commit) => sum + commit.additions, 0),
      deletions: studentCommits.reduce((sum, commit) => sum + commit.deletions, 0),
      changedFiles: studentCommits.reduce((sum, commit) => sum + commit.changedFiles, 0),
      timeline: studentTimeline,
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

export function sortCommits<T extends { when: string | null }>(commits: T[]) {
  return [...commits].sort((a, b) => new Date(b.when ?? 0).getTime() - new Date(a.when ?? 0).getTime());
}
