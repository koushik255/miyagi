export type Role = 'professor' | 'student'
export type User = { id: string; displayName: string; deviceHash?: string; githubUsername?: string | null }
export type Professor = { id: string; userId: string }
export type Course = { id: string; name: string; joinCode: string; professorId: string; joinedAt?: string; role?: string }
export type Assignment = { id: string; courseId: string; name: string; description: string; dueDate?: string | null; professorId: string; repositoryMode?: 'github'; createdAt: string; updatedAt: string }
export type CourseCalendarItem = { id: string; courseId: string; professorId: string; assignmentId?: string | null; title: string; description: string; dueAt: string; kind: 'event' | 'deadline'; createdAt: string; updatedAt: string }
export type Group = { id: string; name: string; courseId: string | null; assignmentId: string | null; joinCode: string; workspacePath?: string | null; cloneUrl?: string | null; repositoryProvider?: 'github'; githubRepoUrl?: string | null }
export type WorkspaceFile = { path: string; name: string }
export type HistoryEntry = { hash: string; author: string; pushedBy?: string | null; when: string; message: string }
export type GroupDiff =
  | { mode: 'commit'; commit: string; patch: string }
  | { mode: 'range'; base: string; head: string; patch: string }
  | { mode: 'working-tree'; patch: string }
export type Member = { memberId: string; userId: string; username?: string; displayName: string; role: string; joinedAt: string; githubUsername?: string | null }
export type Period = 'weekly' | 'monthly' | 'semester'
export type ContributionBucket = {
  label: string
  shortLabel: string
  start: string
  end: string
  commits: number
  additions: number
  deletions: number
  changedFiles: number
}
export type StudentActivity = {
  userId: string
  username?: string | null
  githubUsername?: string | null
  displayName: string
  commits: number
  additions: number
  deletions: number
  changedFiles: number
  timeline: ContributionBucket[]
}
export type ActivityCommit = { hash: string; message: string; authorName: string; githubUsername?: string | null; matchedStudent?: { userId: string; username?: string | null; displayName: string; githubUsername?: string | null } | null; groupName?: string; when: string | null; additions: number; deletions: number; changedFiles: number; htmlUrl?: string | null }
export type ActivityDashboard = {
  period: Period
  totals: { groups?: number; students: number; commits: number; additions: number; deletions: number; changedFiles: number }
  timeline: ContributionBucket[]
  timelineCadence: 'Daily' | 'Weekly'
  byStudent: StudentActivity[]
  topStudents: StudentActivity[]
  lowActivityStudents: StudentActivity[]
  highestPerformer: StudentActivity | null
  lowestCommitter: StudentActivity | null
  recentActivity: ActivityCommit[]
  commits: ActivityCommit[]
}

export type Session =
  | { role: 'student'; user: User }
  | { role: 'professor'; professor: Professor; displayName: string }
