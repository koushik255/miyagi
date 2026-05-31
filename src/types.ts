export type Role = 'professor' | 'student'
export type User = { id: string; displayName: string; deviceHash?: string }
export type Professor = { id: string; userId: string }
export type Course = { id: string; name: string; joinCode: string; professorId: string; joinedAt?: string; role?: string }
export type Assignment = { id: string; courseId: string; name: string; description: string; dueDate?: string | null; professorId: string; repositoryMode?: 'local' | 'github'; createdAt: string; updatedAt: string }
export type Group = { id: string; name: string; courseId: string | null; assignmentId: string | null; joinCode: string; workspacePath?: string | null; cloneUrl?: string | null; repositoryProvider?: 'local' | 'github'; githubRepoUrl?: string | null }
export type WorkspaceFile = { path: string; name: string }
export type HistoryEntry = { hash: string; author: string; pushedBy?: string | null; when: string; message: string }
export type GroupDiff =
  | { mode: 'commit'; commit: string; patch: string }
  | { mode: 'range'; base: string; head: string; patch: string }
  | { mode: 'working-tree'; patch: string }
export type Member = { memberId: string; userId: string; displayName: string; role: string; joinedAt: string; githubUsername?: string | null }
export type Period = 'weekly' | 'monthly' | 'semester'
export type StudentActivity = { userId: string; displayName: string; commits: number; additions: number; deletions: number; changedFiles: number }
export type ActivityCommit = { hash: string; message: string; authorName: string; githubUsername?: string | null; matchedStudent?: { userId: string; displayName: string } | null; groupName?: string; when: string | null; additions: number; deletions: number; changedFiles: number; htmlUrl?: string | null }
export type ActivityDashboard = {
  period: Period
  totals: { groups?: number; students: number; commits: number; additions: number; deletions: number; changedFiles: number }
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
